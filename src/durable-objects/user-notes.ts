import { DurableObject } from "cloudflare:workers";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

export class UserNotesDurableObject extends DurableObject {
    private sql: SqlStorage;
    private docs = new Map<string, Y.Doc>();
    private saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        this.sql = ctx.storage.sql;
        this.ctx.blockConcurrencyWhile(async () => {
            this.sql.exec(`
                CREATE TABLE IF NOT EXISTS notes (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL DEFAULT 'Untitled',
                    content TEXT NOT NULL DEFAULT '',
                    yjs_state BLOB,
                    folder_id TEXT,
                    sync_mode TEXT NOT NULL DEFAULT 'cloud',
                    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
                )
            `);
            this.sql.exec(`
                CREATE TABLE IF NOT EXISTS folders (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    color TEXT NOT NULL DEFAULT '#8A8473',
                    description TEXT NOT NULL DEFAULT '',
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at INTEGER DEFAULT (unixepoch()),
                    updated_at INTEGER DEFAULT (unixepoch())
                )
            `);
            // Migrations for existing tables — only suppress "duplicate column" errors
            const migrate = (sql: string) => {
                try { this.sql.exec(sql); } catch (e: any) {
                    if (!e.message?.includes("duplicate column")) throw e;
                }
            };
            migrate("ALTER TABLE notes ADD COLUMN yjs_state BLOB");
            migrate("ALTER TABLE notes ADD COLUMN folder_id TEXT");
            migrate("ALTER TABLE notes ADD COLUMN sync_mode TEXT NOT NULL DEFAULT 'cloud'");
            migrate("ALTER TABLE notes ADD COLUMN locked INTEGER NOT NULL DEFAULT 0");
            migrate("ALTER TABLE notes ADD COLUMN published INTEGER NOT NULL DEFAULT 0");
            migrate("ALTER TABLE notes ADD COLUMN published_at INTEGER");
            migrate("ALTER TABLE folders ADD COLUMN description TEXT NOT NULL DEFAULT ''");

            this.sql.exec(`
                CREATE TABLE IF NOT EXISTS media (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL DEFAULT 'image',
                    filename TEXT NOT NULL,
                    r2_key TEXT NOT NULL,
                    mime_type TEXT NOT NULL,
                    size INTEGER NOT NULL DEFAULT 0,
                    width INTEGER,
                    height INTEGER,
                    published INTEGER NOT NULL DEFAULT 0,
                    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
                )
            `);
        });
    }

    private getYDoc(noteId: string): Y.Doc {
        let doc = this.docs.get(noteId);
        if (doc) return doc;

        doc = new Y.Doc();
        const rows = this.sql.exec("SELECT yjs_state FROM notes WHERE id = ?", noteId).toArray();
        if (rows[0]?.yjs_state) {
            Y.applyUpdate(doc, new Uint8Array(rows[0].yjs_state as ArrayBuffer));
        }

        doc.on("update", () => {
            const existing = this.saveTimers.get(noteId);
            if (existing) clearTimeout(existing);
            this.saveTimers.set(noteId, setTimeout(() => {
                try {
                    const state = Y.encodeStateAsUpdate(doc!);
                    this.sql.exec(
                        "UPDATE notes SET yjs_state = ?, updated_at = unixepoch() WHERE id = ?",
                        state, noteId
                    );
                } catch (e) {
                    console.error(`Failed to persist Yjs state for note ${noteId}:`, e);
                }
                this.saveTimers.delete(noteId);
            }, 2000));
        });

        this.docs.set(noteId, doc);
        return doc;
    }

    private flushPendingSave(noteId: string) {
        const timer = this.saveTimers.get(noteId);
        if (!timer) return;
        clearTimeout(timer);
        this.saveTimers.delete(noteId);
        const doc = this.docs.get(noteId);
        if (!doc) return;
        const state = Y.encodeStateAsUpdate(doc);
        this.sql.exec("UPDATE notes SET yjs_state = ?, updated_at = unixepoch() WHERE id = ?", state, noteId);
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const path = url.pathname;

        if (request.headers.get("Upgrade") === "websocket") {
            const noteId = url.searchParams.get("noteId");
            if (!noteId) return new Response("noteId required", { status: 400 });

            const permission = url.searchParams.get("permission") || "owner";
            const userId = url.searchParams.get("userId") || "unknown";
            const userName = url.searchParams.get("userName") || "Anonymous";

            const pair = new WebSocketPair();
            const [client, server] = Object.values(pair);
            // Tag with noteId and permission for enforcement in webSocketMessage
            this.ctx.acceptWebSocket(server, [noteId, `perm:${permission}`, `user:${userId}`]);

            const doc = this.getYDoc(noteId);
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, MSG_SYNC);
            syncProtocol.writeSyncStep1(encoder, doc);
            server.send(encoding.toUint8Array(encoder));

            return new Response(null, { status: 101, webSocket: client });
        }

        // Folder routes
        if (request.method === "GET" && path === "/folders") {
            return Response.json(
                this.sql.exec("SELECT id, name, color, description, sort_order, created_at, updated_at FROM folders ORDER BY sort_order").toArray()
            );
        }
        if (request.method === "POST" && path === "/folders") {
            const body = (await request.json()) as { id: string; name: string; color?: string; description?: string; sort_order?: number };
            this.sql.exec(
                `INSERT INTO folders (id, name, color, description, sort_order, updated_at) VALUES (?, ?, ?, ?, ?, unixepoch())
                 ON CONFLICT(id) DO UPDATE SET name = excluded.name, color = excluded.color, description = excluded.description, sort_order = excluded.sort_order, updated_at = unixepoch()`,
                body.id, body.name, body.color || "#8A8473", body.description || "", body.sort_order ?? 0
            );
            return Response.json({ ok: true });
        }
        if (request.method === "DELETE" && path.startsWith("/folders/")) {
            const id = path.slice("/folders/".length);
            this.sql.exec("UPDATE notes SET folder_id = NULL WHERE folder_id = ?", id);
            this.sql.exec("DELETE FROM folders WHERE id = ?", id);
            return Response.json({ ok: true });
        }

        // Note routes
        if (request.method === "GET" && path === "/notes") {
            return Response.json(this.getAllNotes());
        }
        if (request.method === "GET" && path.startsWith("/notes/") && !path.includes("/", "/notes/".length)) {
            const id = path.slice("/notes/".length);
            const note = this.getNote(id);
            if (!note) return new Response("Not found", { status: 404 });
            return Response.json(note);
        }
        if (request.method === "POST" && path === "/notes") {
            const body = (await request.json()) as { id?: string; title?: string; content?: string; folder_id?: string | null; sync_mode?: string };
            const id = body.id || crypto.randomUUID();
            const existing = this.getNote(id);

            if (existing) {
                this.sql.exec(
                    `UPDATE notes SET title = ?, content = ?, folder_id = ?, sync_mode = ?, updated_at = unixepoch() WHERE id = ?`,
                    body.title || "Untitled", body.content || "",
                    body.folder_id !== undefined ? body.folder_id : existing.folder_id,
                    body.sync_mode !== undefined ? body.sync_mode : existing.sync_mode,
                    id
                );
            } else {
                this.sql.exec(
                    `INSERT INTO notes (id, title, content, folder_id, sync_mode, updated_at) VALUES (?, ?, ?, ?, ?, unixepoch())`,
                    id, body.title || "Untitled", body.content || "", body.folder_id ?? null, body.sync_mode || "cloud"
                );
            }
            const note = this.getNote(id);
            this.broadcastJson({ type: "note-updated", note });
            return Response.json(note);
        }
        if (request.method === "DELETE" && path.startsWith("/notes/") && !path.includes("/", "/notes/".length)) {
            const id = path.slice("/notes/".length);
            this.sql.exec("DELETE FROM notes WHERE id = ?", id);
            this.docs.delete(id);
            this.broadcastJson({ type: "note-deleted", id });
            return new Response("OK");
        }

        // PATCH endpoints for partial field updates
        if (request.method === "PATCH" && path.match(/^\/notes\/[^/]+\/folder$/)) {
            const id = path.split("/")[2];
            const { folder_id } = (await request.json()) as { folder_id: string | null };
            this.sql.exec("UPDATE notes SET folder_id = ?, updated_at = unixepoch() WHERE id = ?", folder_id, id);
            return Response.json({ ok: true });
        }
        if (request.method === "PATCH" && path.match(/^\/notes\/[^/]+\/sync-mode$/)) {
            const id = path.split("/")[2];
            const { sync_mode } = (await request.json()) as { sync_mode: string };
            this.sql.exec("UPDATE notes SET sync_mode = ?, updated_at = unixepoch() WHERE id = ?", sync_mode, id);
            return Response.json({ ok: true });
        }
        if (request.method === "PATCH" && path.match(/^\/notes\/[^/]+\/locked$/)) {
            const id = path.split("/")[2];
            const { locked } = (await request.json()) as { locked: boolean };
            this.sql.exec("UPDATE notes SET locked = ?, updated_at = unixepoch() WHERE id = ?", locked ? 1 : 0, id);
            return Response.json({ ok: true });
        }
        if (request.method === "PATCH" && path.match(/^\/notes\/[^/]+\/published$/)) {
            const id = path.split("/")[2];
            const { published } = (await request.json()) as { published: boolean };
            // Can't publish a locked note
            if (published) {
                const note = this.getNote(id);
                if (note?.locked) return new Response("Cannot publish a locked note", { status: 400 });
            }
            this.sql.exec(
                `UPDATE notes SET published = ?, published_at = CASE WHEN ? THEN unixepoch() ELSE published_at END, updated_at = unixepoch() WHERE id = ?`,
                published ? 1 : 0, published ? 1 : 0, id
            );
            return Response.json({ ok: true });
        }

        // Note metadata (no content, safe for lock checks)
        if (request.method === "GET" && path.match(/^\/notes\/[^/]+\/meta$/)) {
            const id = path.split("/")[2];
            const rows = this.sql.exec(
                "SELECT id, title, locked, published, folder_id, sync_mode, created_at, updated_at FROM notes WHERE id = ?", id
            ).toArray();
            if (!rows[0]) return new Response("Not found", { status: 404 });
            return Response.json(rows[0]);
        }

        // Check if a note exists (for ownership resolution)
        if (request.method === "HEAD" && path.match(/^\/notes\/[^/]+$/)) {
            const id = path.slice("/notes/".length);
            const rows = this.sql.exec("SELECT 1 FROM notes WHERE id = ?", id).toArray();
            return new Response(null, { status: rows.length > 0 ? 200 : 404 });
        }

        // Public notes (no auth required — used by public page renderer)
        if (request.method === "GET" && path === "/public-notes") {
            const rows = this.sql.exec(
                `SELECT n.id, n.title, n.content, n.published_at, n.created_at, f.name as folder_name
                 FROM notes n LEFT JOIN folders f ON n.folder_id = f.id
                 WHERE n.published = 1 ORDER BY n.published_at DESC`
            ).toArray();
            return Response.json(rows);
        }

        // --- Media routes ---
        if (request.method === "GET" && path === "/media") {
            const rows = this.sql.exec(
                "SELECT id, type, filename, r2_key, mime_type, size, width, height, published, created_at, updated_at FROM media ORDER BY created_at DESC"
            ).toArray();
            return Response.json(rows);
        }
        if (request.method === "POST" && path === "/media") {
            const body = (await request.json()) as {
                id: string; type: string; filename: string; r2_key: string;
                mime_type: string; size: number; width?: number; height?: number;
            };
            this.sql.exec(
                `INSERT INTO media (id, type, filename, r2_key, mime_type, size, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                body.id, body.type, body.filename, body.r2_key, body.mime_type, body.size, body.width ?? null, body.height ?? null
            );
            const rows = this.sql.exec("SELECT * FROM media WHERE id = ?", body.id).toArray();
            this.broadcastJson({ type: "media-added", media: rows[0] });
            return Response.json(rows[0]);
        }
        if (request.method === "DELETE" && path.startsWith("/media/")) {
            const id = path.slice("/media/".length);
            const rows = this.sql.exec("SELECT r2_key FROM media WHERE id = ?", id).toArray();
            this.sql.exec("DELETE FROM media WHERE id = ?", id);
            this.broadcastJson({ type: "media-deleted", id });
            return Response.json({ ok: true, r2_key: rows[0]?.r2_key });
        }
        if (request.method === "PATCH" && path.match(/^\/media\/[^/]+\/published$/)) {
            const id = path.split("/")[2];
            const { published } = (await request.json()) as { published: boolean };
            this.sql.exec("UPDATE media SET published = ?, updated_at = unixepoch() WHERE id = ?", published ? 1 : 0, id);
            return Response.json({ ok: true });
        }
        if (request.method === "GET" && path === "/public-media") {
            const rows = this.sql.exec(
                "SELECT id, type, filename, r2_key, mime_type, size, width, height, created_at FROM media WHERE published = 1 ORDER BY created_at DESC"
            ).toArray();
            return Response.json(rows);
        }

        return new Response("Not found", { status: 404 });
    }

    private getWsPermission(ws: WebSocket): string {
        const tags = this.ctx.getTags(ws);
        const permTag = tags.find((t) => t.startsWith("perm:"));
        return permTag ? permTag.slice(5) : "owner";
    }

    webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
        const permission = this.getWsPermission(ws);

        if (typeof message === "string") {
            // View-only users can't save
            if (permission === "view") return;

            let msg: any;
            try { msg = JSON.parse(message); } catch { return; }

            if (msg.type === "save-note") {
                const { id, title, content } = msg;
                this.sql.exec(
                    `INSERT INTO notes (id, title, content, updated_at) VALUES (?, ?, ?, unixepoch())
                     ON CONFLICT(id) DO UPDATE SET title = excluded.title, content = excluded.content, updated_at = unixepoch()`,
                    id, title || "Untitled", content || ""
                );
                const note = this.getNote(id);
                this.broadcastJson({ type: "note-updated", note }, ws);
            }
            return;
        }

        const noteId = this.ctx.getTags(ws)[0];
        if (!noteId) return;

        const data = new Uint8Array(message);
        const decoder = decoding.createDecoder(data);
        const msgType = decoding.readVarUint(decoder);
        const doc = this.getYDoc(noteId);

        const broadcast = (payload: Uint8Array) => {
            for (const other of this.ctx.getWebSockets(noteId)) {
                if (other !== ws) {
                    try { other.send(payload); } catch { other.close(); }
                }
            }
        };

        if (msgType === MSG_SYNC) {
            // View-only users receive sync (get the doc) but can't push changes
            if (permission === "view") {
                // Still respond to sync step 1 (so they get the doc), but don't apply or broadcast
                const encoder = encoding.createEncoder();
                encoding.writeVarUint(encoder, MSG_SYNC);
                syncProtocol.readSyncMessage(decoder, encoder, doc, null);
                if (encoding.length(encoder) > 1) ws.send(encoding.toUint8Array(encoder));
                return;
            }
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, MSG_SYNC);
            syncProtocol.readSyncMessage(decoder, encoder, doc, null);
            if (encoding.length(encoder) > 1) ws.send(encoding.toUint8Array(encoder));
            broadcast(data);
        } else if (msgType === MSG_AWARENESS) {
            // Awareness always flows (presence is visible for all)
            broadcast(data);
        }
    }

    webSocketClose(ws: WebSocket) {
        const noteId = this.ctx.getTags(ws)[0];
        if (!noteId) return;
        // Flush pending save if this was the last connection for this note
        const remaining = this.ctx.getWebSockets(noteId).filter((s) => s !== ws);
        if (remaining.length === 0) this.flushPendingSave(noteId);
    }

    webSocketError(ws: WebSocket) {
        ws.close();
    }

    private getAllNotes() {
        return this.sql
            .exec("SELECT id, title, content, folder_id, sync_mode, locked, published, published_at, created_at, updated_at FROM notes ORDER BY updated_at DESC")
            .toArray();
    }

    private getNote(id: string) {
        const rows = this.sql
            .exec("SELECT id, title, content, folder_id, sync_mode, locked, published, published_at, created_at, updated_at FROM notes WHERE id = ?", id)
            .toArray();
        return rows[0] || null;
    }

    private broadcastJson(message: object, exclude?: WebSocket) {
        const data = JSON.stringify(message);
        for (const ws of this.ctx.getWebSockets()) {
            if (ws !== exclude) {
                try { ws.send(data); } catch { ws.close(); }
            }
        }
    }
}
