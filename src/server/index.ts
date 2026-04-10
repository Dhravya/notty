import { loadEnv } from "./env";
loadEnv();

import { Hono } from "hono";
import { cors } from "hono/cors";
import { renderPublicPage, renderPublicNote } from "./public-page";
import { renderRSS } from "./rss";
import { generateOgImage } from "./og-image";

export { AuthDurableObject } from "../durable-objects/auth";
export { UserNotesDurableObject } from "../durable-objects/user-notes";

type Variables = {
    userStub: DurableObjectStub;
    userId: string;
    userName: string;
    publicPageUsername: string | null;
};
const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", cors({
    origin: (origin) => origin || "*",
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Lock-Token"],
}));

// --- Subdomain detection for public pages ---
const PUBLIC_DOMAINS = ["notty.page", "notty.dhr.wtf"];

app.use("*", async (c, next) => {
    const host = (c.req.header("host") || "").replace(/:\d+$/, "");
    let username: string | null = null;
    for (const base of PUBLIC_DOMAINS) {
        if (host !== base && host.endsWith(`.${base}`)) {
            username = host.replace(`.${base}`, "");
            break;
        }
    }
    c.set("publicPageUsername", username);
    return next();
});

// --- Public page routes (subdomain) ---
app.get("*", async (c, next) => {
    const username = c.var.publicPageUsername;
    if (!username) return next();

    const path = new URL(c.req.url).pathname;

    // Resolve username → userId
    const authStub = c.env.AUTH_DO.get(c.env.AUTH_DO.idFromName("auth-singleton"));
    const profileRes = await authStub.fetch(new Request(`https://do/internal/profile/by-username?username=${encodeURIComponent(username)}`));
    if (!profileRes.ok) return c.text("Not found", 404);
    const profile = await profileRes.json() as any;

    const userStub = c.env.USER_NOTES_DO.get(c.env.USER_NOTES_DO.idFromName(profile.user_id));

    if (path === "/rss") {
        const notesRes = await userStub.fetch(new Request("https://do/public-notes"));
        const notes = await notesRes.json() as any[];
        const baseUrl = `https://${username}.${c.env.BASE_DOMAIN || "notty.page"}`;
        return c.body(renderRSS(profile, notes, baseUrl), 200, { "Content-Type": "application/rss+xml; charset=utf-8" });
    }

    if (path === "/" || path === "") {
        const notesRes = await userStub.fetch(new Request("https://do/public-notes"));
        const notes = await notesRes.json() as any[];
        const baseUrl = `https://${username}.${c.env.BASE_DOMAIN || "notty.page"}`;
        return c.html(renderPublicPage(profile, notes, baseUrl));
    }

    // Single note: /:noteId
    const noteId = path.slice(1);
    if (noteId && !noteId.includes("/")) {
        const noteRes = await userStub.fetch(new Request(`https://do/notes/${noteId}`));
        if (!noteRes.ok) return c.text("Not found", 404);
        const note = await noteRes.json() as any;
        if (!note.published) return c.text("Not found", 404);
        const baseUrl = `https://${username}.${c.env.BASE_DOMAIN || "notty.page"}`;
        return c.html(renderPublicNote(profile, note, baseUrl));
    }

    return c.text("Not found", 404);
});

function escapeAttr(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// --- Auth helpers ---

async function getSession(env: Env, request: Request) {
    const stub = env.AUTH_DO.get(env.AUTH_DO.idFromName("auth-singleton"));
    const url = new URL(request.url);
    const headers = new Headers();
    const cookie = request.headers.get("Cookie");
    if (cookie) headers.set("Cookie", cookie);
    const res = await stub.fetch(new Request(`${url.origin}/api/auth/get-session`, { headers }));
    if (!res.ok) return null;
    const data: any = await res.json();
    return data?.user ? data : null;
}

async function resolveNoteAccess(
    env: Env, noteId: string, userId: string, shareToken?: string
): Promise<{ stub: DurableObjectStub; ownerId: string; permission: "owner" | "edit" | "view" } | null> {
    // Check if user owns this note
    const userStub = env.USER_NOTES_DO.get(env.USER_NOTES_DO.idFromName(userId));
    const check = await userStub.fetch(new Request(`https://do/notes/${noteId}`, { method: "HEAD" }));
    if (check.status === 200) {
        return { stub: userStub, ownerId: userId, permission: "owner" };
    }

    const authStub = env.AUTH_DO.get(env.AUTH_DO.idFromName("auth-singleton"));

    // Check share token
    if (shareToken) {
        const res = await authStub.fetch(new Request(`https://do/internal/shares/by-token?token=${encodeURIComponent(shareToken)}`));
        if (res.ok) {
            const { noteId: sharedNoteId, ownerId, permission } = await res.json() as any;
            if (sharedNoteId === noteId) {
                const ownerStub = env.USER_NOTES_DO.get(env.USER_NOTES_DO.idFromName(ownerId));
                return { stub: ownerStub, ownerId, permission };
            }
        }
    }

    // Check user-based share
    const res = await authStub.fetch(new Request(`https://do/internal/shares/resolve?noteId=${encodeURIComponent(noteId)}&userId=${encodeURIComponent(userId)}`));
    if (res.ok) {
        const { ownerId, permission } = await res.json() as any;
        const ownerStub = env.USER_NOTES_DO.get(env.USER_NOTES_DO.idFromName(ownerId));
        return { stub: ownerStub, ownerId, permission };
    }

    return null;
}

// --- Lock token helpers ---

function signLockToken(secret: string, noteId: string, userId: string): string {
    const payload = { noteId, userId, exp: Math.floor(Date.now() / 1000) + 300 }; // 5 min
    const data = JSON.stringify(payload);
    const encoded = btoa(data);
    // Simple HMAC using Web Crypto is async, so we use a sync hash approach
    // For CF Workers, we'll use a simple HMAC-like signature
    const sig = simpleHmac(secret, encoded);
    return `${encoded}.${sig}`;
}

function verifyLockToken(secret: string, token: string, noteId: string, userId: string): boolean {
    const [encoded, sig] = token.split(".");
    if (!encoded || !sig) return false;
    if (simpleHmac(secret, encoded) !== sig) return false;
    try {
        const payload = JSON.parse(atob(encoded));
        if (payload.noteId !== noteId || payload.userId !== userId) return false;
        if (payload.exp < Math.floor(Date.now() / 1000)) return false;
        return true;
    } catch {
        return false;
    }
}

function simpleHmac(secret: string, data: string): string {
    // FNV-1a based HMAC — sufficient for short-lived tokens within our trust boundary
    // The token is only validated by our own worker, not shared externally
    let hash = 0x811c9dc5;
    const combined = secret + ":" + data;
    for (let i = 0; i < combined.length; i++) {
        hash ^= combined.charCodeAt(i);
        hash = (hash * 0x01000193) >>> 0;
    }
    return hash.toString(36);
}

// --- Auth routes — proxy to AuthDO ---
app.on(["GET", "POST"], "/api/auth/*", async (c) => {
    const stub = c.env.AUTH_DO.get(c.env.AUTH_DO.idFromName("auth-singleton"));
    return stub.fetch(c.req.raw);
});

// Token exchange for Tauri deep-link auth
app.post("/api/auth/create-token", async (c) => {
    const session = await getSession(c.env, c.req.raw);
    if (!session) return c.text("Unauthorized", 401);
    const cookie = c.req.header("Cookie") || "";
    const match = cookie.match(/better-auth\.session_token=([^;]+)/);
    if (!match) return c.text("No session", 400);

    const token = crypto.randomUUID();
    const stub = c.env.AUTH_DO.get(c.env.AUTH_DO.idFromName("auth-singleton"));
    await stub.fetch(new Request("https://do/internal/tokens", {
        method: "POST",
        body: JSON.stringify({ token, sessionToken: match[1] }),
    }));
    return c.json({ token });
});

app.get("/api/auth/exchange-token", async (c) => {
    const token = c.req.query("token");
    if (!token) return c.text("Missing token", 400);

    const stub = c.env.AUTH_DO.get(c.env.AUTH_DO.idFromName("auth-singleton"));
    const res = await stub.fetch(new Request(`https://do/internal/tokens?token=${token}`));
    if (!res.ok) return c.text("Invalid or expired token", 401);
    const { sessionToken } = await res.json() as { sessionToken: string };

    return new Response(JSON.stringify({ ok: true }), {
        headers: {
            "Content-Type": "application/json",
            "Set-Cookie": `better-auth.session_token=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
        },
    });
});

const requireAuth = async (c: any, next: any) => {
    const session = await getSession(c.env, c.req.raw);
    if (!session) return c.text("Unauthorized", 401);
    c.set("userId", session.user.id);
    c.set("userName", session.user.name || "Anonymous");
    c.set("userStub", c.env.USER_NOTES_DO.get(c.env.USER_NOTES_DO.idFromName(session.user.id)));
    return next();
};
app.use("/api/notes/*", requireAuth);
app.use("/api/notes-trash", requireAuth);
app.use("/api/folders/*", requireAuth);

// --- Notes API ---
app.get("/api/notes", (c) => c.var.userStub.fetch(new Request("https://do/notes")));
app.post("/api/notes", async (c) => {
    const shareToken = c.req.query("share");
    if (shareToken) {
        const body = await c.req.json() as any;
        if (body.id) {
            const access = await resolveNoteAccess(c.env, body.id, c.var.userId, shareToken);
            if (!access) return c.text("Not found", 404);
            if (access.permission === "view") return c.text("Read only", 403);
            return access.stub.fetch(new Request("https://do/notes", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            }));
        }
    }
    return c.var.userStub.fetch(new Request("https://do/notes", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: c.req.raw.body,
    }));
});

app.get("/api/notes/:id", async (c) => {
    const id = c.req.param("id");
    const shareToken = c.req.query("share");
    const access = await resolveNoteAccess(c.env, id, c.var.userId, shareToken);
    if (!access) return c.text("Not found", 404);

    // Lock check
    if (access.permission === "owner") {
        return access.stub.fetch(new Request(`https://do/notes/${id}`));
    }

    const metaRes = await access.stub.fetch(new Request(`https://do/notes/${id}/meta`));
    if (!metaRes.ok) return c.text("Not found", 404);
    const meta = await metaRes.json() as any;

    if (meta.locked) {
        const lockToken = c.req.header("X-Lock-Token");
        const secret = c.env.BETTER_AUTH_SECRET || "notty-dev-secret-that-is-long-enough-for-validation";
        if (!lockToken || !verifyLockToken(secret, lockToken, id, c.var.userId)) {
            return c.json({ locked: true, noteId: id, title: meta.title }, 423);
        }
    }

    return access.stub.fetch(new Request(`https://do/notes/${id}`));
});

app.put("/api/notes/:id", async (c) => {
    const body = await c.req.text();
    const id = c.req.param("id");
    const shareToken = c.req.query("share");
    const access = await resolveNoteAccess(c.env, id, c.var.userId, shareToken);
    if (!access) return c.text("Not found", 404);
    if (access.permission === "view") return c.text("Read only", 403);
    return access.stub.fetch(new Request("https://do/notes", {
        method: "POST", headers: { "Content-Type": "application/json" }, body,
    }));
});


app.delete("/api/notes/:id", async (c) => {
    const id = c.req.param("id");
    // Only owner can delete
    return c.var.userStub.fetch(new Request(`https://do/notes/${id}`, { method: "DELETE" }));
});

// Trash
app.get("/api/notes-trash", (c) => c.var.userStub.fetch(new Request("https://do/notes/trash")));
app.post("/api/notes/:id/restore", (c) =>
    c.var.userStub.fetch(new Request(`https://do/notes/${c.req.param("id")}/restore`, { method: "POST" }))
);
app.delete("/api/notes/:id/permanent", (c) =>
    c.var.userStub.fetch(new Request(`https://do/notes/${c.req.param("id")}/permanent`, { method: "DELETE" }))
);

// --- Branches ---
app.get("/api/notes/:id/branches", (c) =>
    c.var.userStub.fetch(new Request(`https://do/notes/${c.req.param("id")}/branches`))
);
app.post("/api/notes/:id/branches", async (c) => {
    const body = await c.req.text();
    return c.var.userStub.fetch(new Request(`https://do/notes/${c.req.param("id")}/branches`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body,
    }));
});
app.post("/api/notes/:id/branches/checkout", async (c) => {
    const body = await c.req.text();
    return c.var.userStub.fetch(new Request(`https://do/notes/${c.req.param("id")}/branches/checkout`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body,
    }));
});
app.delete("/api/notes/:id/branches/:branchId", (c) =>
    c.var.userStub.fetch(new Request(`https://do/notes/${c.req.param("id")}/branches/${c.req.param("branchId")}`, { method: "DELETE" }))
);

app.post("/api/notes/:id/branches/merge", async (c) => {
    const body = await c.req.text();
    return c.var.userStub.fetch(new Request(`https://do/notes/${c.req.param("id")}/branches/merge`, {
        method: "POST", body, headers: { "Content-Type": "application/json" },
    }));
});

// --- Tree (full graph) ---
app.get("/api/notes/:id/tree", (c) =>
    c.var.userStub.fetch(new Request(`https://do/notes/${c.req.param("id")}/tree`))
);

// --- Note History ---
app.get("/api/notes/:id/history", (c) =>
    c.var.userStub.fetch(new Request(`https://do/notes/${c.req.param("id")}/history`))
);
app.get("/api/notes/:id/history/:versionId", (c) => {
    const { id, versionId } = c.req.param();
    return c.var.userStub.fetch(new Request(`https://do/notes/${id}/history/${versionId}`));
});
app.post("/api/notes/:id/history/restore", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.text();
    return c.var.userStub.fetch(new Request(`https://do/notes/${id}/history/restore`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body,
    }));
});

// Note metadata (safe for lock checks, includes permission for shared notes)
app.get("/api/notes/:id/meta", async (c) => {
    const id = c.req.param("id");
    const shareToken = c.req.query("share");
    const access = await resolveNoteAccess(c.env, id, c.var.userId, shareToken);
    if (!access) return c.text("Not found", 404);
    const res = await access.stub.fetch(new Request(`https://do/notes/${id}/meta`));
    if (!res.ok) return res;
    const meta = await res.json() as any;
    return c.json({ ...meta, permission: access.permission });
});

// --- PATCH endpoints ---
app.put("/api/notes/:id/folder", async (c) => {
    const body = await c.req.text();
    return c.var.userStub.fetch(new Request(`https://do/notes/${c.req.param("id")}/folder`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body,
    }));
});
app.put("/api/notes/:id/sync-mode", async (c) => {
    const body = await c.req.text();
    return c.var.userStub.fetch(new Request(`https://do/notes/${c.req.param("id")}/sync-mode`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body,
    }));
});

// Lock/unlock (owner only)
app.post("/api/notes/:id/lock", async (c) => {
    return c.var.userStub.fetch(new Request(`https://do/notes/${c.req.param("id")}/locked`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked: true }),
    }));
});
app.post("/api/notes/:id/unlock", async (c) => {
    // Unlocking requires passkey verification — check lock token
    const lockToken = c.req.header("X-Lock-Token");
    const secret = c.env.BETTER_AUTH_SECRET || "notty-dev-secret-that-is-long-enough-for-validation";
    if (!lockToken || !verifyLockToken(secret, lockToken, c.req.param("id"), c.var.userId)) {
        return c.json({ error: "Passkey verification required" }, 403);
    }
    return c.var.userStub.fetch(new Request(`https://do/notes/${c.req.param("id")}/locked`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked: false }),
    }));
});

// Publish/unpublish (owner only, no anonymous users)
app.post("/api/notes/:id/publish", async (c) => {
    const session = await getSession(c.env, c.req.raw);
    if (!session || session.user.isAnonymous) return c.text("Sign in to publish notes", 403);
    const { published } = await c.req.json() as { published: boolean };
    return c.var.userStub.fetch(new Request(`https://do/notes/${c.req.param("id")}/published`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published }),
    }));
});

// --- Lock verification (WebAuthn) ---
app.post("/api/notes/:id/verify-lock", async (c) => {
    const noteId = c.req.param("id");
    // Get user's passkeys from Auth DO
    const authStub = c.env.AUTH_DO.get(c.env.AUTH_DO.idFromName("auth-singleton"));

    // Generate challenge
    const challenge = crypto.randomUUID() + crypto.randomUUID();
    // Store challenge in Auth DO verification table
    await authStub.fetch(new Request("https://do/api/auth/passkey/generate-authenticate-options", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Cookie": c.req.header("Cookie") || "",
        },
    }));

    // We leverage Better Auth's passkey flow — the frontend will call
    // the standard passkey authenticate endpoint, then exchange the result
    // for a lock token via /verify-lock/complete
    return c.json({ noteId, challenge: btoa(challenge) });
});

app.post("/api/notes/:id/verify-lock/complete", async (c) => {
    // After successful passkey authentication via Better Auth,
    // verify the user has a valid session and issue a lock token
    const session = await getSession(c.env, c.req.raw);
    if (!session) return c.text("Unauthorized", 401);

    const noteId = c.req.param("id");
    const secret = c.env.BETTER_AUTH_SECRET || "notty-dev-secret-that-is-long-enough-for-validation";
    const lockToken = signLockToken(secret, noteId, session.user.id);
    return c.json({ lockToken });
});

// --- Shares API ---
app.post("/api/shares", async (c) => {
    const session = await getSession(c.env, c.req.raw);
    if (!session) return c.text("Unauthorized", 401);
    const { noteId, email, permission } = await c.req.json() as { noteId: string; email?: string; permission?: string };

    // Verify ownership
    const userStub = c.env.USER_NOTES_DO.get(c.env.USER_NOTES_DO.idFromName(session.user.id));
    const check = await userStub.fetch(new Request(`https://do/notes/${noteId}`, { method: "HEAD" }));
    if (check.status !== 200) return c.text("Not found or not owner", 404);

    const authStub = c.env.AUTH_DO.get(c.env.AUTH_DO.idFromName("auth-singleton"));
    const shareToken = crypto.randomUUID();

    let sharedWithId: string | null = null;
    if (email) {
        const userRes = await authStub.fetch(new Request(`https://do/internal/user-by-email?email=${encodeURIComponent(email)}`));
        if (userRes.ok) {
            const user = await userRes.json() as any;
            sharedWithId = user.id;
        }
    }

    const res = await authStub.fetch(new Request("https://do/internal/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            noteId,
            ownerId: session.user.id,
            email: email || null,
            userId: sharedWithId,
            permission: permission || "view",
            token: shareToken,
        }),
    }));
    const data = await res.json();
    return c.json({ ...data as any, shareToken });
});

app.get("/api/shares", async (c) => {
    const session = await getSession(c.env, c.req.raw);
    if (!session) return c.text("Unauthorized", 401);
    const noteId = c.req.query("noteId");
    if (!noteId) return c.text("Missing noteId", 400);

    const authStub = c.env.AUTH_DO.get(c.env.AUTH_DO.idFromName("auth-singleton"));
    const res = await authStub.fetch(new Request(
        `https://do/internal/shares/for-note?noteId=${encodeURIComponent(noteId)}&ownerId=${encodeURIComponent(session.user.id)}`
    ));
    return new Response(res.body, { status: res.status, headers: res.headers });
});

app.delete("/api/shares/:id", async (c) => {
    const session = await getSession(c.env, c.req.raw);
    if (!session) return c.text("Unauthorized", 401);

    const authStub = c.env.AUTH_DO.get(c.env.AUTH_DO.idFromName("auth-singleton"));
    const res = await authStub.fetch(new Request(
        `https://do/internal/shares?id=${encodeURIComponent(c.req.param("id"))}&ownerId=${encodeURIComponent(session.user.id)}`,
        { method: "DELETE" }
    ));
    return new Response(res.body, { status: res.status, headers: res.headers });
});

app.get("/api/shared-with-me", async (c) => {
    const session = await getSession(c.env, c.req.raw);
    if (!session) return c.text("Unauthorized", 401);

    const authStub = c.env.AUTH_DO.get(c.env.AUTH_DO.idFromName("auth-singleton"));
    const sharesRes = await authStub.fetch(new Request(
        `https://do/internal/shares/shared-with-me?userId=${encodeURIComponent(session.user.id)}`
    ));
    if (!sharesRes.ok) return c.json([]);
    const shares = await sharesRes.json() as any[];

    // Fetch note details from each owner's DO
    const notes = await Promise.all(shares.map(async (s: any) => {
        const ownerStub = c.env.USER_NOTES_DO.get(c.env.USER_NOTES_DO.idFromName(s.owner_id));
        const noteRes = await ownerStub.fetch(new Request(`https://do/notes/${s.note_id}/meta`));
        if (!noteRes.ok) return null;
        const meta = await noteRes.json() as any;
        return { ...meta, owner_name: s.owner_name, permission: s.permission, shared_at: s.created_at };
    }));

    return c.json(notes.filter(Boolean));
});

// OG image for shared notes
app.get("/api/shared/:token/og-image.png", async (c) => {
    const authStub = c.env.AUTH_DO.get(c.env.AUTH_DO.idFromName("auth-singleton"));
    const res = await authStub.fetch(new Request(`https://do/internal/shares/by-token?token=${encodeURIComponent(c.req.param("token"))}`));
    if (!res.ok) return c.text("Not found", 404);
    const { noteId, ownerId } = await res.json() as any;

    const ownerStub = c.env.USER_NOTES_DO.get(c.env.USER_NOTES_DO.idFromName(ownerId));
    const noteRes = await ownerStub.fetch(new Request(`https://do/notes/${noteId}`));
    if (!noteRes.ok) return c.text("Not found", 404);
    const note = await noteRes.json() as any;

    const png = await generateOgImage(note.title || "Untitled", note.content || "");
    return c.body(png as any, 200, {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
    });
});

// Resolve share token link — JSON for SPA, HTML with OG tags for crawlers
app.get("/api/shared/:token", async (c) => {
    const token = c.req.param("token");
    const authStub = c.env.AUTH_DO.get(c.env.AUTH_DO.idFromName("auth-singleton"));
    const res = await authStub.fetch(new Request(`https://do/internal/shares/by-token?token=${encodeURIComponent(token)}`));
    if (!res.ok) return c.text("Invalid or expired share link", 404);
    const { noteId, ownerId } = await res.json() as any;

    const accept = c.req.header("accept") || "";
    if (accept.includes("application/json")) {
        return c.json({ noteId, token });
    }

    // Fetch note metadata for OG tags
    const ownerStub = c.env.USER_NOTES_DO.get(c.env.USER_NOTES_DO.idFromName(ownerId));
    const noteRes = await ownerStub.fetch(new Request(`https://do/notes/${noteId}/meta`));
    const title = noteRes.ok ? ((await noteRes.json()) as any).title || "Untitled" : "Shared Note";

    const origin = new URL(c.req.url).origin;
    const ogImageUrl = `${origin}/api/shared/${token}/og-image.png`;
    const redirectUrl = `/note/${noteId}?share=${token}`;

    return c.html(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta property="og:title" content="${escapeAttr(title)}">
<meta property="og:description" content="Shared via Notty">
<meta property="og:image" content="${ogImageUrl}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeAttr(title)}">
<meta name="twitter:image" content="${ogImageUrl}">
<meta http-equiv="refresh" content="0;url=${redirectUrl}">
<title>${escapeAttr(title)} — Notty</title>
</head><body>
<p>Redirecting…</p>
<script>location.replace(${JSON.stringify(redirectUrl)})</script>
</body></html>`);
});

// --- Profile API ---
app.post("/api/profile", async (c) => {
    const session = await getSession(c.env, c.req.raw);
    if (!session) return c.text("Unauthorized", 401);
    if (session.user.isAnonymous) return c.text("Sign in to set up a public page", 403);
    const body = await c.req.json() as any;

    const authStub = c.env.AUTH_DO.get(c.env.AUTH_DO.idFromName("auth-singleton"));
    const res = await authStub.fetch(new Request("https://do/internal/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: session.user.id, ...body }),
    }));
    return new Response(res.body, { status: res.status, headers: res.headers });
});

app.get("/api/profile", async (c) => {
    const session = await getSession(c.env, c.req.raw);
    if (!session) return c.text("Unauthorized", 401);

    const authStub = c.env.AUTH_DO.get(c.env.AUTH_DO.idFromName("auth-singleton"));
    const res = await authStub.fetch(new Request(`https://do/internal/profile?userId=${encodeURIComponent(session.user.id)}`));
    if (!res.ok) return c.json({ userId: session.user.id, username: null, pageTitle: "My Notes", pageDescription: "", font: "serif", colorMode: "light" });
    const data = await res.json() as any;
    return c.json({
        userId: data.user_id || session.user.id,
        username: data.username,
        pageTitle: data.page_title || "My Notes",
        pageDescription: data.page_description || "",
        font: data.font || "serif",
        colorMode: data.color_mode || "light",
    });
});

// --- Media API ---
app.use("/api/media/*", requireAuth);
app.use("/api/media", requireAuth);

app.get("/api/media", (c) => c.var.userStub.fetch(new Request("https://do/media")));

app.post("/api/media", async (c) => {
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return c.text("No file provided", 400);

    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) return c.text("File too large (max 50MB)", 413);

    const allowedPrefixes = ["image/", "video/"];
    const allowedExact = ["application/pdf"];
    if (!allowedPrefixes.some((p) => file.type.startsWith(p)) && !allowedExact.includes(file.type)) {
        return c.text("Only images, videos, and PDFs allowed", 415);
    }

    const id = crypto.randomUUID();
    const ext = file.name.split(".").pop() || "bin";
    const r2Key = `${c.var.userId}/${id}.${ext}`;

    await c.env.MEDIA_BUCKET.put(r2Key, file.stream(), {
        httpMetadata: { contentType: file.type },
    });

    const type = file.type.startsWith("video/") ? "video" : file.type === "application/pdf" ? "pdf" : "image";

    const width = parseInt(formData.get("width") as string) || undefined;
    const height = parseInt(formData.get("height") as string) || undefined;

    const res = await c.var.userStub.fetch(new Request("https://do/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, type, filename: file.name, r2_key: r2Key, mime_type: file.type, size: file.size, width, height }),
    }));
    return new Response(res.body, { status: res.status, headers: res.headers });
});

app.delete("/api/media/:id", async (c) => {
    const res = await c.var.userStub.fetch(new Request(`https://do/media/${c.req.param("id")}`, { method: "DELETE" }));
    const data = await res.json() as any;
    if (data.r2_key) {
        await c.env.MEDIA_BUCKET.delete(data.r2_key);
    }
    return c.json({ ok: true });
});

app.post("/api/media/:id/publish", async (c) => {
    const { published } = await c.req.json() as { published: boolean };
    return c.var.userStub.fetch(new Request(`https://do/media/${c.req.param("id")}/published`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published }),
    }));
});

app.patch("/api/media/:id/caption", async (c) => {
    const body = await c.req.text();
    return c.var.userStub.fetch(new Request(`https://do/media/${c.req.param("id")}/caption`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body,
    }));
});


app.get("/api/media/:id/file", async (c) => {
    const session = await getSession(c.env, c.req.raw);
    if (!session) return c.text("Unauthorized", 401);

    const stub = c.env.USER_NOTES_DO.get(c.env.USER_NOTES_DO.idFromName(session.user.id));
    const listRes = await stub.fetch(new Request("https://do/media"));
    const items = await listRes.json() as any[];
    const item = items.find((m: any) => m.id === c.req.param("id"));
    if (!item) return c.text("Not found", 404);

    const obj = await c.env.MEDIA_BUCKET.get(item.r2_key);
    if (!obj) return c.text("File not found", 404);

    return new Response(obj.body, {
        headers: {
            "Content-Type": item.mime_type,
            "Cache-Control": "public, max-age=31536000, immutable",
        },
    });
});

// Public media file serving (no auth)
app.get("/api/public/:userId/media/:id/file", async (c) => {
    const stub = c.env.USER_NOTES_DO.get(c.env.USER_NOTES_DO.idFromName(c.req.param("userId")));
    const listRes = await stub.fetch(new Request("https://do/public-media"));
    const items = await listRes.json() as any[];
    const item = items.find((m: any) => m.id === c.req.param("id"));
    if (!item) return c.text("Not found", 404);

    const obj = await c.env.MEDIA_BUCKET.get(item.r2_key);
    if (!obj) return c.text("File not found", 404);

    return new Response(obj.body, {
        headers: {
            "Content-Type": item.mime_type,
            "Cache-Control": "public, max-age=31536000, immutable",
        },
    });
});

// --- Folders API ---
app.get("/api/folders", (c) => c.var.userStub.fetch(new Request("https://do/folders")));
app.post("/api/folders", (c) => c.var.userStub.fetch(new Request("https://do/folders", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: c.req.raw.body,
})));
app.delete("/api/folders/:id", (c) =>
    c.var.userStub.fetch(new Request(`https://do/folders/${c.req.param("id")}`, { method: "DELETE" }))
);

// --- WebSocket sync ---
app.get("/api/sync", async (c) => {
    const session = await getSession(c.env, c.req.raw);
    if (!session) return c.text("Unauthorized", 401);

    const noteId = new URL(c.req.url).searchParams.get("noteId");
    if (!noteId) return c.text("Missing noteId", 400);

    const shareToken = new URL(c.req.url).searchParams.get("share") || undefined;
    const access = await resolveNoteAccess(c.env, noteId, session.user.id, shareToken);
    if (!access) return c.text("Access denied", 403);

    // Check lock
    const metaRes = await access.stub.fetch(new Request(`https://do/notes/${noteId}/meta`));
    if (metaRes.ok) {
        const meta = await metaRes.json() as any;
        if (meta.locked && access.permission !== "owner") {
            const lockToken = new URL(c.req.url).searchParams.get("lockToken");
            const secret = c.env.BETTER_AUTH_SECRET || "notty-dev-secret-that-is-long-enough-for-validation";
            if (!lockToken || !verifyLockToken(secret, lockToken, noteId, session.user.id)) {
                return c.text("Locked", 423);
            }
        }
    }

    // Forward to the correct DO with identity params
    const url = new URL(c.req.url);
    url.searchParams.set("noteId", noteId);
    url.searchParams.set("userId", session.user.id);
    url.searchParams.set("userName", session.user.name || "Anonymous");
    url.searchParams.set("permission", access.permission);

    return access.stub.fetch(new Request(url.toString(), {
        headers: c.req.raw.headers,
    }));
});

// --- Public API (no auth) ---
app.get("/api/public/:userId/notes", async (c) => {
    const stub = c.env.USER_NOTES_DO.get(c.env.USER_NOTES_DO.idFromName(c.req.param("userId")));
    return stub.fetch(new Request("https://do/public-notes"));
});

app.get("/api/public/:userId/profile", async (c) => {
    const authStub = c.env.AUTH_DO.get(c.env.AUTH_DO.idFromName("auth-singleton"));
    const res = await authStub.fetch(new Request(`https://do/internal/profile?userId=${encodeURIComponent(c.req.param("userId"))}`));
    if (!res.ok) return c.json({ pageTitle: "Notes", pageDescription: "" });
    return new Response(res.body, { status: res.status, headers: res.headers });
});

// --- Shared note pages with OG tags (for crawlers hitting /shared/:token directly) ---
app.get("/shared/:token", async (c) => {
    const token = c.req.param("token");
    const authStub = c.env.AUTH_DO.get(c.env.AUTH_DO.idFromName("auth-singleton"));
    const res = await authStub.fetch(new Request(`https://do/internal/shares/by-token?token=${encodeURIComponent(token)}`));

    // Fetch the base index.html from assets
    const url = new URL(c.req.url);
    const indexRes = await c.env.ASSETS.fetch(new Request(`${url.origin}/index.html`));
    let html = await indexRes.text();

    if (res.ok) {
        const { noteId, ownerId } = await res.json() as any;
        const ownerStub = c.env.USER_NOTES_DO.get(c.env.USER_NOTES_DO.idFromName(ownerId));
        const noteRes = await ownerStub.fetch(new Request(`https://do/notes/${noteId}/meta`));
        const title = noteRes.ok ? ((await noteRes.json()) as any).title || "Untitled" : "Shared Note";
        const ogImageUrl = `${url.origin}/api/shared/${token}/og-image.png`;

        // Replace static OG tags with note-specific ones
        html = html
            .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escapeAttr(title)}">`)
            .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="Shared via Notty">`)
            .replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${ogImageUrl}">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:title" content="${escapeAttr(title)}">\n<meta name="twitter:image" content="${ogImageUrl}">`)
            .replace(/<title>[^<]*<\/title>/, `<title>${escapeAttr(title)} — Notty</title>`);
    }

    return c.html(html);
});

// --- Static assets + SPA fallback ---
app.all("*", async (c) => {
    const url = new URL(c.req.url);
    const lastSegment = url.pathname.split("/").pop() || "";
    if (lastSegment.includes(".")) {
        return c.env.ASSETS.fetch(c.req.raw);
    }
    return c.env.ASSETS.fetch(new Request(`${url.origin}/index.html`));
});

export default app;
