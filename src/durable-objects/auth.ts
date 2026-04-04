import { DurableObject } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { importPKCS8, SignJWT } from "jose";
import * as schema from "./auth-schema";

export class AuthDurableObject extends DurableObject {
    private db: ReturnType<typeof drizzle>;
    private authInstance: Awaited<ReturnType<typeof betterAuth>> | null = null;
    private pendingTokens = new Map<string, { sessionToken: string; expires: number }>();

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);

        ctx.storage.sql.exec(`
            CREATE TABLE IF NOT EXISTS "user" (
                "id" TEXT PRIMARY KEY NOT NULL,
                "name" TEXT NOT NULL,
                "email" TEXT NOT NULL UNIQUE,
                "email_verified" INTEGER NOT NULL DEFAULT 0,
                "image" TEXT,
                "created_at" INTEGER NOT NULL,
                "updated_at" INTEGER NOT NULL,
                "is_anonymous" INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS "session" (
                "id" TEXT PRIMARY KEY NOT NULL,
                "expires_at" INTEGER NOT NULL,
                "token" TEXT NOT NULL UNIQUE,
                "ip_address" TEXT,
                "user_agent" TEXT,
                "user_id" TEXT NOT NULL REFERENCES "user"("id"),
                "created_at" INTEGER NOT NULL,
                "updated_at" INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS "account" (
                "id" TEXT PRIMARY KEY NOT NULL,
                "account_id" TEXT NOT NULL,
                "provider_id" TEXT NOT NULL,
                "user_id" TEXT NOT NULL REFERENCES "user"("id"),
                "access_token" TEXT,
                "refresh_token" TEXT,
                "id_token" TEXT,
                "access_token_expires_at" INTEGER,
                "refresh_token_expires_at" INTEGER,
                "scope" TEXT,
                "password" TEXT,
                "created_at" INTEGER NOT NULL,
                "updated_at" INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS "verification" (
                "id" TEXT PRIMARY KEY NOT NULL,
                "identifier" TEXT NOT NULL,
                "value" TEXT NOT NULL,
                "expires_at" INTEGER NOT NULL,
                "created_at" INTEGER,
                "updated_at" INTEGER
            );
            CREATE TABLE IF NOT EXISTS "passkey" (
                "id" TEXT PRIMARY KEY NOT NULL,
                "name" TEXT,
                "public_key" TEXT NOT NULL,
                "user_id" TEXT NOT NULL REFERENCES "user"("id"),
                "credential_id" TEXT NOT NULL,
                "counter" INTEGER NOT NULL,
                "device_type" TEXT NOT NULL,
                "backed_up" INTEGER NOT NULL,
                "transports" TEXT,
                "created_at" INTEGER,
                "aaguid" TEXT
            );
            CREATE TABLE IF NOT EXISTS "share" (
                "id" TEXT PRIMARY KEY NOT NULL,
                "note_id" TEXT NOT NULL,
                "owner_id" TEXT NOT NULL REFERENCES "user"("id"),
                "shared_with_id" TEXT REFERENCES "user"("id"),
                "shared_with_email" TEXT,
                "permission" TEXT NOT NULL DEFAULT 'view',
                "token" TEXT UNIQUE,
                "created_at" INTEGER NOT NULL DEFAULT (unixepoch()),
                "expires_at" INTEGER
            );
            CREATE TABLE IF NOT EXISTS "profile" (
                "user_id" TEXT PRIMARY KEY NOT NULL REFERENCES "user"("id"),
                "username" TEXT UNIQUE,
                "page_title" TEXT NOT NULL DEFAULT 'My Notes',
                "page_description" TEXT NOT NULL DEFAULT '',
                "font" TEXT NOT NULL DEFAULT 'serif',
                "color_mode" TEXT NOT NULL DEFAULT 'light',
                "updated_at" INTEGER NOT NULL DEFAULT (unixepoch())
            );
        `);
        // Migrations for profile columns
        const migrateSafe = (sql: string) => {
            try { ctx.storage.sql.exec(sql); } catch (e: any) {
                if (!e.message?.includes("duplicate column")) throw e;
            }
        };
        migrateSafe(`ALTER TABLE "profile" ADD COLUMN "font" TEXT NOT NULL DEFAULT 'serif'`);
        migrateSafe(`ALTER TABLE "profile" ADD COLUMN "color_mode" TEXT NOT NULL DEFAULT 'light'`);

        this.db = drizzle(ctx.storage, { schema });
    }

    private v(key: string): string | undefined {
        return process.env[key] || (this.env as any)[key];
    }

    private async getAuth() {
        if (this.authInstance) return this.authInstance;

        const socialProviders: Record<string, any> = {};
        if (this.v("GOOGLE_CLIENT_ID") && this.v("GOOGLE_CLIENT_SECRET")) {
            socialProviders.google = {
                clientId: this.v("GOOGLE_CLIENT_ID"),
                clientSecret: this.v("GOOGLE_CLIENT_SECRET"),
            };
        }
        if (this.v("GITHUB_CLIENT_ID") && this.v("GITHUB_CLIENT_SECRET")) {
            socialProviders.github = {
                clientId: this.v("GITHUB_CLIENT_ID"),
                clientSecret: this.v("GITHUB_CLIENT_SECRET"),
            };
        }
        if (this.v("APPLE_CLIENT_ID") && this.v("APPLE_PRIVATE_KEY") && this.v("APPLE_TEAM_ID") && this.v("APPLE_KEY_ID")) {
            const key = await importPKCS8(this.v("APPLE_PRIVATE_KEY")!, "ES256");
            const now = Math.floor(Date.now() / 1000);
            const clientSecret = await new SignJWT({})
                .setProtectedHeader({ alg: "ES256", kid: this.v("APPLE_KEY_ID")! })
                .setIssuer(this.v("APPLE_TEAM_ID")!)
                .setSubject(this.v("APPLE_CLIENT_ID")!)
                .setAudience("https://appleid.apple.com")
                .setIssuedAt(now)
                .setExpirationTime(now + 180 * 24 * 60 * 60)
                .sign(key);
            socialProviders.apple = {
                clientId: this.v("APPLE_CLIENT_ID"),
                clientSecret,
                appBundleIdentifier: this.v("APPLE_APP_BUNDLE_IDENTIFIER"),
            };
        }

        const baseURL = this.v("BETTER_AUTH_URL") || "http://localhost:8787";
        this.authInstance = betterAuth({
            database: drizzleAdapter(this.db, { provider: "sqlite", schema }),
            plugins: [anonymous(), passkey({ rpName: "Notty" })],
            socialProviders,
            secret: this.v("BETTER_AUTH_SECRET") || "notty-dev-secret-that-is-long-enough-for-validation",
            baseURL,
            trustedOrigins: [baseURL, "https://appleid.apple.com", "https://notty.dhr.wtf", "https://notty.page", "http://localhost:8787"],
        });
        return this.authInstance;
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        // Internal token store for Tauri deep-link auth
        if (url.pathname === "/internal/tokens") {
            if (request.method === "POST") {
                const { token, sessionToken } = await request.json() as { token: string; sessionToken: string };
                this.pendingTokens.set(token, { sessionToken, expires: Date.now() + 60_000 });
                return new Response("OK");
            }
            const token = url.searchParams.get("token");
            if (!token) return new Response("Missing token", { status: 400 });
            const entry = this.pendingTokens.get(token);
            this.pendingTokens.delete(token);
            if (!entry || entry.expires < Date.now()) return new Response("Expired", { status: 401 });
            return Response.json({ sessionToken: entry.sessionToken });
        }

        // Internal share endpoints
        if (url.pathname.startsWith("/internal/shares")) {
            return this.handleShares(request, url);
        }

        // Internal profile endpoints
        if (url.pathname.startsWith("/internal/profile")) {
            return this.handleProfile(request, url);
        }

        // Internal user lookup
        if (url.pathname === "/internal/user-by-email") {
            const email = url.searchParams.get("email");
            if (!email) return new Response("Missing email", { status: 400 });
            const rows = this.ctx.storage.sql.exec(
                `SELECT id, name, email FROM "user" WHERE email = ?`, email
            ).toArray();
            if (!rows[0]) return new Response("Not found", { status: 404 });
            return Response.json(rows[0]);
        }

        const auth = await this.getAuth();
        return auth.handler(request);
    }

    private handleShares(request: Request, url: URL): Response | Promise<Response> {
        const sql = this.ctx.storage.sql;
        const now = Math.floor(Date.now() / 1000);

        if (request.method === "POST" && url.pathname === "/internal/shares") {
            return (async () => {
                const { noteId, ownerId, email, userId, permission, token } = await request.json() as any;
                const id = crypto.randomUUID();
                sql.exec(
                    `INSERT INTO "share" (id, note_id, owner_id, shared_with_id, shared_with_email, permission, token, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())`,
                    id, noteId, ownerId, userId || null, email || null, permission || "view", token || null
                );
                return Response.json({ id, token });
            })();
        }

        if (request.method === "GET" && url.pathname === "/internal/shares/resolve") {
            const noteId = url.searchParams.get("noteId");
            const userId = url.searchParams.get("userId");
            if (!noteId || !userId) return new Response("Missing params", { status: 400 });
            const rows = sql.exec(
                `SELECT owner_id, permission FROM "share"
                 WHERE note_id = ? AND shared_with_id = ? AND (expires_at IS NULL OR expires_at > ?)`,
                noteId, userId, now
            ).toArray();
            if (!rows[0]) return new Response("Not found", { status: 404 });
            return Response.json({ ownerId: rows[0].owner_id, permission: rows[0].permission });
        }

        if (request.method === "GET" && url.pathname === "/internal/shares/by-token") {
            const token = url.searchParams.get("token");
            if (!token) return new Response("Missing token", { status: 400 });
            const rows = sql.exec(
                `SELECT note_id, owner_id, permission FROM "share"
                 WHERE token = ? AND (expires_at IS NULL OR expires_at > ?)`,
                token, now
            ).toArray();
            if (!rows[0]) return new Response("Not found", { status: 404 });
            return Response.json({ noteId: rows[0].note_id, ownerId: rows[0].owner_id, permission: rows[0].permission });
        }

        if (request.method === "GET" && url.pathname === "/internal/shares/for-note") {
            const noteId = url.searchParams.get("noteId");
            const ownerId = url.searchParams.get("ownerId");
            if (!noteId || !ownerId) return new Response("Missing params", { status: 400 });
            const rows = sql.exec(
                `SELECT s.id, s.shared_with_id, s.shared_with_email, s.permission, s.token, s.created_at,
                        u.name as shared_with_name
                 FROM "share" s LEFT JOIN "user" u ON s.shared_with_id = u.id
                 WHERE s.note_id = ? AND s.owner_id = ?`,
                noteId, ownerId
            ).toArray();
            return Response.json(rows);
        }

        if (request.method === "GET" && url.pathname === "/internal/shares/shared-with-me") {
            const userId = url.searchParams.get("userId");
            if (!userId) return new Response("Missing userId", { status: 400 });
            const rows = sql.exec(
                `SELECT s.note_id, s.owner_id, s.permission, s.created_at,
                        u.name as owner_name
                 FROM "share" s JOIN "user" u ON s.owner_id = u.id
                 WHERE s.shared_with_id = ? AND (s.expires_at IS NULL OR s.expires_at > ?)`,
                userId, now
            ).toArray();
            return Response.json(rows);
        }

        if (request.method === "DELETE" && url.pathname === "/internal/shares") {
            const id = url.searchParams.get("id");
            const ownerId = url.searchParams.get("ownerId");
            if (!id || !ownerId) return new Response("Missing params", { status: 400 });
            sql.exec(`DELETE FROM "share" WHERE id = ? AND owner_id = ?`, id, ownerId);
            return Response.json({ ok: true });
        }

        return new Response("Not found", { status: 404 });
    }

    private handleProfile(request: Request, url: URL): Response | Promise<Response> {
        const sql = this.ctx.storage.sql;

        if (request.method === "POST" && url.pathname === "/internal/profile") {
            return (async () => {
                const { userId, username, pageTitle, pageDescription, font, colorMode } = await request.json() as any;
                if (username) {
                    const RESERVED = ["www", "api", "auth", "app", "admin", "mail", "smtp", "ftp", "ns1", "ns2", "cdn", "static"];
                    const clean = username.toLowerCase().replace(/[^a-z0-9-]/g, "");
                    if (clean.length < 3 || clean.length > 30 || RESERVED.includes(clean)) {
                        return new Response("Invalid username", { status: 400 });
                    }
                    const existing = sql.exec(
                        `SELECT user_id FROM "profile" WHERE username = ? AND user_id != ?`, clean, userId
                    ).toArray();
                    if (existing.length > 0) return new Response("Username taken", { status: 409 });
                }
                sql.exec(
                    `INSERT INTO "profile" (user_id, username, page_title, page_description, font, color_mode, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, unixepoch())
                     ON CONFLICT(user_id) DO UPDATE SET
                        username = COALESCE(excluded.username, profile.username),
                        page_title = excluded.page_title,
                        page_description = excluded.page_description,
                        font = excluded.font,
                        color_mode = excluded.color_mode,
                        updated_at = unixepoch()`,
                    userId, username?.toLowerCase() || null, pageTitle || "My Notes", pageDescription || "",
                    font || "serif", colorMode || "light"
                );
                return Response.json({ ok: true });
            })();
        }

        if (request.method === "GET" && url.pathname === "/internal/profile") {
            const userId = url.searchParams.get("userId");
            if (!userId) return new Response("Missing userId", { status: 400 });
            const rows = sql.exec(
                `SELECT user_id, username, page_title, page_description, font, color_mode FROM "profile" WHERE user_id = ?`, userId
            ).toArray();
            if (!rows[0]) return new Response("Not found", { status: 404 });
            return Response.json(rows[0]);
        }

        if (request.method === "GET" && url.pathname === "/internal/profile/by-username") {
            const username = url.searchParams.get("username");
            if (!username) return new Response("Missing username", { status: 400 });
            const rows = sql.exec(
                `SELECT p.user_id, p.username, p.page_title, p.page_description, p.font, p.color_mode, u.name, u.image
                 FROM "profile" p JOIN "user" u ON p.user_id = u.id
                 WHERE p.username = ?`, username.toLowerCase()
            ).toArray();
            if (!rows[0]) return new Response("Not found", { status: 404 });
            return Response.json(rows[0]);
        }

        return new Response("Not found", { status: 404 });
    }
}
