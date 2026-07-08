import { DurableObject } from "cloudflare:workers";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { applyPatch } from "../lib/diff";
import { deriveTitleAndPreview, isEmptyDoc } from "../lib/note-preview";

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

// Convert Yjs XML nodes to TipTap JSON format
function yNodeToTiptap(ynode: Y.XmlElement | Y.XmlText | Y.AbstractType<any>): any {
    if (ynode instanceof Y.XmlText) {
        return ynode.toDelta().map((op: any) => {
            if (typeof op.insert !== "string") return null;
            const node: any = { type: "text", text: op.insert };
            if (op.attributes && Object.keys(op.attributes).length > 0) {
                node.marks = Object.entries(op.attributes).map(([type, attrs]) => {
                    const mark: any = { type };
                    if (attrs && typeof attrs === "object" && Object.keys(attrs as object).length > 0) mark.attrs = attrs;
                    return mark;
                });
            }
            return node;
        }).filter(Boolean);
    }

    if (ynode instanceof Y.XmlElement) {
        const attrs = ynode.getAttributes();
        // NOTE: Y.XmlElement is NOT iterable — Array.from(ynode) yields
        // undefineds and silently serializes every node as empty. toArray()
        // is the real child accessor.
        const children = ynode.toArray().flatMap(child => {
            const result = yNodeToTiptap(child);
            return Array.isArray(result) ? result : [result];
        }).filter(Boolean);

        const node: any = { type: ynode.nodeName };
        if (Object.keys(attrs).length > 0) node.attrs = attrs;
        if (children.length > 0) node.content = children;
        return node;
    }

    return null;
}

export class UserNotesDurableObject extends DurableObject {
    private sql: SqlStorage;
    private docs = new Map<string, Y.Doc>();
    private saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private bucket: R2Bucket;

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        this.sql = ctx.storage.sql;
        this.bucket = env.MEDIA_BUCKET;
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

            // Git-style versioning: checkpoints (full content) + patches (diffs)
            this.sql.exec(`
                CREATE TABLE IF NOT EXISTS note_versions (
                    id TEXT PRIMARY KEY,
                    note_id TEXT NOT NULL,
                    parent_id TEXT,
                    title TEXT NOT NULL,
                    is_checkpoint INTEGER NOT NULL DEFAULT 0,
                    data TEXT NOT NULL DEFAULT '',
                    created_by TEXT NOT NULL DEFAULT 'system',
                    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
                )
            `);
            this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_versions_note_time ON note_versions(note_id, created_at DESC)`);
            this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_versions_parent ON note_versions(parent_id)`);
            migrate("ALTER TABLE note_versions ADD COLUMN branch_id TEXT");
            migrate("ALTER TABLE note_versions ADD COLUMN kind TEXT NOT NULL DEFAULT 'manual'");
            migrate("ALTER TABLE note_versions ADD COLUMN summary TEXT");
            // 'sqlite' = legacy checkpoint/patch chain stored in `data`;
            // 'r2' = full snapshot in R2, `data` holds the object key
            migrate("ALTER TABLE note_versions ADD COLUMN storage TEXT NOT NULL DEFAULT 'sqlite'");
            migrate("ALTER TABLE note_versions ADD COLUMN content_hash TEXT");

            // Branches — like git refs, just named pointers to version heads
            this.sql.exec(`
                CREATE TABLE IF NOT EXISTS note_branches (
                    id TEXT PRIMARY KEY,
                    note_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    head_version_id TEXT,
                    is_default INTEGER NOT NULL DEFAULT 0,
                    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                    UNIQUE(note_id, name)
                )
            `);
            migrate("ALTER TABLE notes ADD COLUMN current_branch_id TEXT");
            migrate("ALTER TABLE notes ADD COLUMN deleted_at INTEGER");
            migrate("ALTER TABLE notes ADD COLUMN yjs_initialized_at INTEGER");
            migrate("ALTER TABLE notes ADD COLUMN last_indexed_hash TEXT");
            migrate("ALTER TABLE notes ADD COLUMN last_indexed_at INTEGER");
            migrate("ALTER TABLE notes ADD COLUMN pending_index INTEGER NOT NULL DEFAULT 0");

            this.sql.exec(`
                CREATE TABLE IF NOT EXISTS edit_sessions (
                    id TEXT PRIMARY KEY,
                    note_id TEXT NOT NULL,
                    branch_id TEXT,
                    base_content TEXT NOT NULL DEFAULT '',
                    base_version_id TEXT,
                    started_at INTEGER NOT NULL DEFAULT (unixepoch()),
                    last_edit_at INTEGER NOT NULL DEFAULT (unixepoch()),
                    finalized_at INTEGER
                )
            `);
            this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_edit_sessions_note ON edit_sessions(note_id, finalized_at)`);

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
                    caption TEXT,
                    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
                )
            `);
            migrate("ALTER TABLE media ADD COLUMN caption TEXT");

            // Generic key/value table for SMFS settings on this user. Today
            // we only store `sandbox_id`, but this is structured as a kv
            // table (rather than a column on a singleton row) so adding new
            // settings (e.g. agent prefs, last-seen versions) doesn't require
            // a schema migration each time.
            this.sql.exec(`
                CREATE TABLE IF NOT EXISTS smfs_config (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
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

        doc.on("update", (update: Uint8Array, origin: any) => {
            // Broadcast to all connected clients except the sender.
            // origin is the WebSocket that caused this update (null for DB loads).
            if (origin) {
                const encoder = encoding.createEncoder();
                encoding.writeVarUint(encoder, MSG_SYNC);
                syncProtocol.writeUpdate(encoder, update);
                const msg = encoding.toUint8Array(encoder);
                for (const other of this.ctx.getWebSockets(noteId)) {
                    if (other !== origin) {
                        try { other.send(msg); } catch { other.close(); }
                    }
                }
            }

            this.scheduleDocPersist(noteId, doc!, 2000);
        });

        this.docs.set(noteId, doc);
        return doc;
    }

    // Persist a live Yjs doc to the notes row: yjs_state always; content +
    // title when serialization yields a non-empty doc. Never replaces
    // non-empty column content with an empty doc — if serialization ever
    // regresses (or the doc is transiently blank), losing the row content is
    // the worst outcome. Shared by the debounced save and the last-close flush
    // so the content column can never lag behind yjs_state.
    private persistDocNow(noteId: string, doc: Y.Doc) {
        const state = Y.encodeStateAsUpdate(doc);
        let content = this.extractContentJson(noteId);
        if (content && isEmptyDoc(content)) {
            const existing = this.sql.exec("SELECT content FROM notes WHERE id = ?", noteId).toArray()[0] as any;
            if (existing?.content && !isEmptyDoc(existing.content)) content = null;
        }
        if (content) {
            const title = deriveTitleAndPreview(content).title || "Untitled";
            this.sql.exec(
                "UPDATE notes SET yjs_state = ?, content = ?, title = ?, yjs_initialized_at = COALESCE(yjs_initialized_at, unixepoch()), pending_index = 1, updated_at = unixepoch() WHERE id = ?",
                state, content, title, noteId
            );
        } else {
            this.sql.exec(
                "UPDATE notes SET yjs_state = ?, yjs_initialized_at = COALESCE(yjs_initialized_at, unixepoch()), updated_at = unixepoch() WHERE id = ?",
                state, noteId
            );
        }
    }

    private scheduleDocPersist(noteId: string, doc: Y.Doc, delayMs: number, attempt = 0) {
        const existing = this.saveTimers.get(noteId);
        if (existing) clearTimeout(existing);
        this.saveTimers.set(noteId, setTimeout(() => {
            this.saveTimers.delete(noteId);
            try {
                this.persistDocNow(noteId, doc);
            } catch (e) {
                console.error(`Failed to persist Yjs state for note ${noteId} (attempt ${attempt + 1}):`, e);
                // Don't drop the only copy of the user's edits on a transient
                // failure — re-arm with backoff. The in-memory doc is the sole
                // holder of this content until a persist succeeds.
                if (attempt < 5) this.scheduleDocPersist(noteId, doc, Math.min(2000 * 2 ** attempt, 30000), attempt + 1);
            }
        }, delayMs));
    }

    // Consecutive autosave-session versions inside this window are amended in
    // place instead of appended, so tab-switch/idle churn doesn't flood history.
    private readonly SESSION_AMEND_WINDOW_S = 15 * 60;
    private readonly MAX_VERSIONS_PER_NOTE = 1000;

    private versionKey(noteId: string, versionId: string): string {
        return `versions/${this.ctx.id.toString()}/${noteId}/${versionId}.json`;
    }

    // --- Branch helpers ---

    private ensureDefaultBranch(noteId: string): { id: string; name: string; head_version_id: string | null } {
        const existing = this.sql.exec(
            "SELECT id, name, head_version_id FROM note_branches WHERE note_id = ? AND is_default = 1", noteId
        ).toArray()[0] as any;
        if (existing) return existing;

        const id = crypto.randomUUID();
        this.sql.exec(
            "INSERT INTO note_branches (id, note_id, name, is_default) VALUES (?, ?, 'main', 1)", id, noteId
        );
        this.sql.exec(
            "UPDATE notes SET current_branch_id = ? WHERE id = ? AND current_branch_id IS NULL", id, noteId
        );
        return { id, name: "main", head_version_id: null };
    }

    private getCurrentBranch(noteId: string): { id: string; name: string; head_version_id: string | null } {
        const note = this.getNote(noteId);
        if (note?.current_branch_id) {
            const branch = this.sql.exec(
                "SELECT id, name, head_version_id FROM note_branches WHERE id = ?", note.current_branch_id
            ).toArray()[0] as any;
            if (branch) return branch;
        }
        return this.ensureDefaultBranch(noteId);
    }

    // --- Version creation (branch-aware) ---

    private async createVersion(noteId: string, title: string, content: string, createdBy = "system", kind = "manual", summary: string | null = null): Promise<string | null> {
        const branch = this.getCurrentBranch(noteId);
        const parentId = branch.head_version_id;
        const hash = this.contentHash(content);

        const head = parentId ? this.sql.exec(
            "SELECT id, kind, storage, data, content_hash, created_at FROM note_versions WHERE id = ?", parentId
        ).toArray()[0] as any : null;

        // Identical to head → nothing to record
        if (head?.content_hash && head.content_hash === hash) return null;

        // Defense-in-depth: never record an accidental wipe as a version. A
        // transient empty doc (load race, reconnect, stale beacon) snapshotted
        // over real content is what corrupts history into "deleted everything"
        // diffs. If the new content is blank but the previous version had text,
        // skip — the client-side guard should already prevent this, but old
        // clients and the unmount beacon can still slip an empty doc through.
        // Fail closed: if we can't read the previous version (R2 blip), don't
        // record the empty doc either.
        if (head && isEmptyDoc(content)) {
            let prevContent: string;
            try {
                prevContent = await this.reconstructVersion(head.id, noteId, { strict: true });
            } catch {
                return null;
            }
            if (!isEmptyDoc(prevContent)) return null;
        }

        // Coalesce autosave churn: a session version right after another
        // session version just moves that version forward instead of stacking
        // a new entry per tab-switch/idle. Never amend a version that another
        // branch also points at (branch create copies head_version_id) — that
        // would silently rewrite the other branch's snapshot in place.
        const now = Math.floor(Date.now() / 1000);
        const headSharedWithOtherBranch = head ? this.sql.exec(
            "SELECT 1 FROM note_branches WHERE head_version_id = ? AND id != ? LIMIT 1", head.id, branch.id
        ).toArray().length > 0 : false;
        if (
            kind === "session" && head?.kind === "session" && head.storage === "r2" &&
            !headSharedWithOtherBranch &&
            now - head.created_at < this.SESSION_AMEND_WINDOW_S
        ) {
            await this.bucket.put(head.data, content, { httpMetadata: { contentType: "application/json" } });
            this.sql.exec(
                "UPDATE note_versions SET title = ?, summary = ?, content_hash = ?, created_at = unixepoch() WHERE id = ?",
                title, summary, hash, head.id
            );
            return head.id;
        }

        const id = crypto.randomUUID();
        const key = this.versionKey(noteId, id);
        await this.bucket.put(key, content, { httpMetadata: { contentType: "application/json" } });
        this.sql.exec(
            "INSERT INTO note_versions (id, note_id, parent_id, branch_id, title, is_checkpoint, data, created_by, kind, summary, storage, content_hash) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 'r2', ?)",
            id, noteId, parentId, branch.id, title, key, createdBy, kind, summary, hash
        );

        this.sql.exec("UPDATE note_branches SET head_version_id = ? WHERE id = ?", id, branch.id);

        await this.pruneVersions(noteId);
        return id;
    }

    private async pruneVersions(noteId: string) {
        const stale = this.sql.exec(
            `SELECT id, data, storage FROM note_versions WHERE note_id = ? AND id NOT IN (
                SELECT id FROM note_versions WHERE note_id = ? ORDER BY created_at DESC LIMIT ${this.MAX_VERSIONS_PER_NOTE}
            )`, noteId, noteId
        ).toArray() as any[];
        if (stale.length === 0) return;
        for (let i = 0; i < stale.length; i += 500) {
            const batch = stale.slice(i, i + 500);
            this.sql.exec(
                `DELETE FROM note_versions WHERE id IN (${batch.map(() => "?").join(",")})`,
                ...batch.map((r) => r.id)
            );
            const keys = batch.filter((r) => r.storage === "r2").map((r) => r.data as string);
            if (keys.length > 0) {
                try { await this.bucket.delete(keys); } catch (e) {
                    console.error(`Failed to delete pruned version objects for note ${noteId}:`, e);
                }
            }
        }
    }

    // Delete all version data (rows + R2 objects) for a note. Used on permanent delete.
    private async deleteAllVersions(noteId: string) {
        const rows = this.sql.exec(
            "SELECT data FROM note_versions WHERE note_id = ? AND storage = 'r2'", noteId
        ).toArray() as any[];
        this.sql.exec("DELETE FROM note_versions WHERE note_id = ?", noteId);
        this.sql.exec("DELETE FROM note_branches WHERE note_id = ?", noteId);
        for (let i = 0; i < rows.length; i += 1000) {
            const keys = rows.slice(i, i + 1000).map((r) => r.data as string);
            try { await this.bucket.delete(keys); } catch (e) {
                console.error(`Failed to delete version objects for note ${noteId}:`, e);
            }
        }
    }

    private contentHash(content: string): string {
        let hash = 5381;
        for (let i = 0; i < content.length; i++) {
            hash = ((hash << 5) + hash) ^ content.charCodeAt(i);
        }
        return (hash >>> 0).toString(36);
    }

    private beginEditSession(noteId: string): { sessionId: string } {
        const note = this.getNote(noteId);
        const branch = this.getCurrentBranch(noteId);
        const sessionId = crypto.randomUUID();
        this.sql.exec(
            `INSERT INTO edit_sessions (id, note_id, branch_id, base_content, base_version_id)
             VALUES (?, ?, ?, ?, ?)`,
            sessionId, noteId, branch.id, (note?.content as string) || "", branch.head_version_id
        );
        return { sessionId };
    }

    private async finalizeEditSession(noteId: string, sessionId: string, reason = "finalize"): Promise<{ versionId?: string }> {
        const session = this.sql.exec(
            "SELECT id, base_content FROM edit_sessions WHERE id = ? AND note_id = ? AND finalized_at IS NULL",
            sessionId, noteId
        ).toArray()[0] as any;
        if (!session) return {};

        const note = this.getNote(noteId);
        const currentContent = (note?.content as string) || "";
        this.sql.exec("UPDATE edit_sessions SET finalized_at = unixepoch(), last_edit_at = unixepoch() WHERE id = ?", sessionId);
        if (!note || currentContent === (session.base_content || "")) return {};

        const versionId = await this.createVersion(
            noteId,
            deriveTitleAndPreview(currentContent).title || (note.title as string) || "Untitled",
            currentContent,
            "session",
            "session",
            `Editing session (${reason})`
        ) || undefined;
        this.sql.exec(
            "UPDATE notes SET pending_index = 1 WHERE id = ?",
            noteId
        );
        return { versionId };
    }

    // strict: throw on R2 read errors instead of degrading to "" — used where
    // the caller must distinguish "genuinely empty" from "couldn't read".
    private async reconstructVersion(versionId: string, noteId: string, opts?: { strict?: boolean }): Promise<string> {
        // New-style versions are full snapshots in R2
        const head = this.sql.exec(
            "SELECT storage, data FROM note_versions WHERE id = ?", versionId
        ).toArray()[0] as any;
        if (head?.storage === "r2") {
            try {
                const obj = await this.bucket.get(head.data);
                if (obj) return await obj.text();
            } catch (e) {
                console.error(`Failed to read version object ${head.data}:`, e);
                if (opts?.strict) throw e;
            }
            return "";
        }

        // Legacy versions: walk the checkpoint + patch chain in SQLite
        const chain: { id: string; data: string; is_checkpoint: number; parent_id: string | null }[] = [];
        let currentId: string | null = versionId;

        while (currentId) {
            const row = this.sql.exec(
                "SELECT id, data, is_checkpoint, parent_id, storage FROM note_versions WHERE id = ?", currentId
            ).toArray()[0] as any;
            if (!row || row.storage === "r2") break;
            chain.unshift(row);
            if (row.is_checkpoint) break;
            currentId = row.parent_id;
        }

        if (chain.length === 0) return '';
        if (!chain[0].is_checkpoint) {
            const note = this.getNote(noteId);
            return (note?.content as string) || '';
        }

        let content = chain[0].data;
        for (let i = 1; i < chain.length; i++) {
            content = applyPatch(content, chain[i].data);
        }
        return content;
    }

    // Evict Yjs doc, cancel save timer, and close all WS connections for a note.
    // This forces clients to reconnect and get fresh content from yjs_state/content.
    private resetNoteSync(noteId: string) {
        const doc = this.docs.get(noteId);
        if (doc) {
            this.docs.delete(noteId);
            const timer = this.saveTimers.get(noteId);
            if (timer) { clearTimeout(timer); this.saveTimers.delete(noteId); }
        }
        // Close all WebSocket connections for this note so clients can't
        // push stale Yjs state back into a freshly created doc
        for (const ws of this.ctx.getWebSockets(noteId)) {
            try { ws.close(4000, "content-reset"); } catch {}
        }
    }

    private flushPendingSave(noteId: string) {
        const timer = this.saveTimers.get(noteId);
        if (!timer) return;
        clearTimeout(timer);
        this.saveTimers.delete(noteId);
        const doc = this.docs.get(noteId);
        if (!doc) return;
        // Full persist (yjs_state + content + title), not just yjs_state —
        // otherwise the content column lags the final typing burst, and
        // anything that snapshots or backs up from the column (restore,
        // checkout, session finalize) captures stale content while
        // yjs_state gets nulled — permanently losing the burst.
        try {
            this.persistDocNow(noteId, doc);
        } catch (e) {
            console.error(`Failed to flush pending save for note ${noteId}:`, e);
        }
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
        if (request.method === "GET" && path === "/notes/list") {
            return Response.json(this.getNotesList());
        }
        if (request.method === "GET" && path === "/notes/trash") {
            return Response.json(this.getTrashNotes());
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
                const hasActiveYjs = this.ctx.getWebSockets(id).length > 0;
                if (hasActiveYjs) {
                    // Yjs WebSocket is the source of truth — only update metadata columns
                    this.sql.exec(
                        `UPDATE notes SET title = ?, content = ?, folder_id = ?, sync_mode = ?, pending_index = 1, updated_at = unixepoch() WHERE id = ?`,
                        body.title || "Untitled", body.content || "",
                        body.folder_id !== undefined ? body.folder_id : existing.folder_id,
                        body.sync_mode !== undefined ? body.sync_mode : existing.sync_mode,
                        id
                    );
                } else {
                    // No active Yjs session — null stale yjs_state so next client bootstraps from HTTP
                    this.sql.exec(
                        `UPDATE notes SET title = ?, content = ?, yjs_state = NULL, folder_id = ?, sync_mode = ?, pending_index = 1, updated_at = unixepoch() WHERE id = ?`,
                        body.title || "Untitled", body.content || "",
                        body.folder_id !== undefined ? body.folder_id : existing.folder_id,
                        body.sync_mode !== undefined ? body.sync_mode : existing.sync_mode,
                        id
                    );
                    // Also evict the cached in-memory doc — it still holds the
                    // OLD Yjs state, and the next WS connect would serve it and
                    // then persist it right back over this newer content.
                    this.resetNoteSync(id);
                }
            } else {
                this.sql.exec(
                    `INSERT INTO notes (id, title, content, folder_id, sync_mode, pending_index, updated_at) VALUES (?, ?, ?, ?, ?, 1, unixepoch())`,
                    id, body.title || "Untitled", body.content || "", body.folder_id ?? null, body.sync_mode || "cloud"
                );
            }
            const note = this.getNote(id);
            this.broadcastJson({ type: "note-updated", note });
            return Response.json(note);
        }
        if (request.method === "DELETE" && path.startsWith("/notes/") && !path.includes("/", "/notes/".length)) {
            const id = path.slice("/notes/".length);
            // Unpublish on trash — a trashed note must not stay readable at
            // its public URL. Flush pending edits first so restore-from-trash
            // recovers everything the user typed.
            this.flushPendingSave(id);
            this.sql.exec("UPDATE notes SET deleted_at = unixepoch(), published = 0 WHERE id = ?", id);
            this.resetNoteSync(id);
            this.broadcastJson({ type: "note-deleted", id });
            return new Response("OK");
        }

        // Trash (restore + permanent delete)
        if (request.method === "POST" && path.match(/^\/notes\/[^/]+\/restore$/)) {
            const id = path.split("/")[2];
            this.sql.exec("UPDATE notes SET deleted_at = NULL, updated_at = unixepoch() WHERE id = ?", id);
            const note = this.getNote(id);
            this.broadcastJson({ type: "note-updated", note });
            return Response.json(note);
        }
        if (request.method === "DELETE" && path.match(/^\/notes\/[^/]+\/permanent$/)) {
            const id = path.split("/")[2];
            this.sql.exec("DELETE FROM notes WHERE id = ?", id);
            // Full reset (not just docs.delete): kills the pending save timer
            // (which would otherwise resurrect a cached doc) and closes any
            // open sockets still accepting edits into the void.
            this.resetNoteSync(id);
            await this.deleteAllVersions(id);
            return Response.json({ ok: true });
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
                // Sync Yjs content AND title so the public page never renders a
                // stale "Untitled" — the debounced Yjs save may not have fired yet
                // when the user hits publish right after typing.
                const content = this.extractContentJson(id) || (note?.content as string) || "";
                // Refuse to publish a blank page. If neither the live Yjs doc nor
                // the content column has text, the note hasn't reached the server
                // (dead session, offline, sync failure) — publishing would ship an
                // empty public page. Tell the client instead.
                if (isEmptyDoc(content)) {
                    return new Response("Note content hasn't synced to the server yet", { status: 409 });
                }
                const title = deriveTitleAndPreview(content).title || (note?.title as string) || "Untitled";
                this.sql.exec("UPDATE notes SET content = ?, title = ? WHERE id = ?", content, title, id);
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
                "SELECT id, title, locked, published, folder_id, sync_mode, yjs_initialized_at, pending_index, created_at, updated_at FROM notes WHERE id = ?", id
            ).toArray();
            if (!rows[0]) return new Response("Not found", { status: 404 });
            return Response.json(rows[0]);
        }

        if (request.method === "POST" && path.match(/^\/notes\/[^/]+\/sessions$/)) {
            const noteId = path.split("/")[2];
            return Response.json(this.beginEditSession(noteId));
        }

        if (request.method === "POST" && path.match(/^\/notes\/[^/]+\/sessions\/[^/]+\/finalize$/)) {
            const parts = path.split("/");
            const noteId = parts[2];
            const sessionId = parts[4];
            const body = await request.json().catch(() => ({})) as { reason?: string };
            return Response.json(await this.finalizeEditSession(noteId, sessionId, body.reason || "finalize"));
        }

        if (request.method === "POST" && path.match(/^\/notes\/[^/]+\/memory-indexed$/)) {
            const noteId = path.split("/")[2];
            const note = this.getNote(noteId);
            if (!note) return new Response("Not found", { status: 404 });
            this.sql.exec(
                "UPDATE notes SET last_indexed_hash = ?, last_indexed_at = unixepoch(), pending_index = 0 WHERE id = ?",
                this.contentHash((note.content as string) || ""),
                noteId
            );
            return Response.json({ ok: true });
        }

        // Check if a note exists (for ownership resolution)
        if (request.method === "HEAD" && path.match(/^\/notes\/[^/]+$/)) {
            const id = path.slice("/notes/".length);
            const rows = this.sql.exec("SELECT 1 FROM notes WHERE id = ?", id).toArray();
            return new Response(null, { status: rows.length > 0 ? 200 : 404 });
        }

        // --- Branches ---
        if (request.method === "GET" && path.match(/^\/notes\/[^/]+\/branches$/)) {
            const noteId = path.split("/")[2];
            this.ensureDefaultBranch(noteId);
            const branches = this.sql.exec(
                "SELECT id, name, head_version_id, is_default, created_at FROM note_branches WHERE note_id = ? ORDER BY is_default DESC, created_at",
                noteId
            ).toArray();
            const current = this.getCurrentBranch(noteId);
            return Response.json(branches.map((b: any) => ({ ...b, is_current: b.id === current.id ? 1 : 0 })));
        }
        if (request.method === "POST" && path.match(/^\/notes\/[^/]+\/branches$/)) {
            const noteId = path.split("/")[2];
            const { name } = (await request.json()) as { name: string };
            if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
                return new Response("Invalid branch name", { status: 400 });
            }
            // Branch from current branch HEAD
            const current = this.getCurrentBranch(noteId);
            const id = crypto.randomUUID();
            try {
                this.sql.exec(
                    "INSERT INTO note_branches (id, note_id, name, head_version_id) VALUES (?, ?, ?, ?)",
                    id, noteId, name, current.head_version_id
                );
            } catch (e: any) {
                if (e.message?.includes("UNIQUE")) return new Response("Branch already exists", { status: 409 });
                throw e;
            }
            return Response.json({ id, name, head_version_id: current.head_version_id });
        }
        if (request.method === "POST" && path.match(/^\/notes\/[^/]+\/branches\/checkout$/)) {
            const noteId = path.split("/")[2];
            const { branch_id } = (await request.json()) as { branch_id: string };
            const branch = this.sql.exec(
                "SELECT id, name, head_version_id FROM note_branches WHERE id = ? AND note_id = ?", branch_id, noteId
            ).toArray()[0] as any;
            if (!branch) return new Response("Branch not found", { status: 404 });

            // Load branch HEAD content FIRST — strict, so an R2 blip aborts
            // the checkout instead of silently writing "" over the live note.
            let content = "";
            if (branch.head_version_id) {
                try {
                    content = await this.reconstructVersion(branch.head_version_id, noteId, { strict: true });
                } catch {
                    return new Response("Could not load branch content, try again", { status: 503 });
                }
            }

            // Version the current state before switching (so no work is lost).
            // Flush first so the content column includes the final typing burst.
            this.flushPendingSave(noteId);
            const currentNote = this.getNote(noteId);
            if (currentNote?.content) {
                await this.createVersion(noteId, (currentNote.title as string) || "Untitled", currentNote.content as string, "auto-backup", "backup", "Auto-backup before branch checkout");
            }

            // Switch current branch
            this.sql.exec("UPDATE notes SET current_branch_id = ?, updated_at = unixepoch() WHERE id = ?", branch_id, noteId);

            this.sql.exec(
                "UPDATE notes SET content = ?, yjs_state = NULL, updated_at = unixepoch() WHERE id = ?",
                content, noteId
            );
            this.resetNoteSync(noteId);

            return Response.json({ branch: branch.name, content });
        }
        if (request.method === "DELETE" && path.match(/^\/notes\/[^/]+\/branches\/[^/]+$/)) {
            const parts = path.split("/");
            const noteId = parts[2];
            const branchId = parts[4];
            // Can't delete default branch
            const branch = this.sql.exec(
                "SELECT is_default FROM note_branches WHERE id = ? AND note_id = ?", branchId, noteId
            ).toArray()[0] as any;
            if (!branch) return new Response("Branch not found", { status: 404 });
            if (branch.is_default) return new Response("Cannot delete default branch", { status: 400 });

            // If deleting the current branch, switch to default
            const note = this.getNote(noteId);
            if (note?.current_branch_id === branchId) {
                const def = this.ensureDefaultBranch(noteId);
                this.sql.exec("UPDATE notes SET current_branch_id = ? WHERE id = ?", def.id, noteId);
            }

            this.sql.exec("DELETE FROM note_branches WHERE id = ?", branchId);
            return Response.json({ ok: true });
        }

        // Merge: apply source branch content into current branch
        if (request.method === "POST" && path.match(/^\/notes\/[^/]+\/branches\/merge$/)) {
            const noteId = path.split("/")[2];
            const { source_branch_id } = (await request.json()) as { source_branch_id: string };
            const source = this.sql.exec(
                "SELECT id, name, head_version_id FROM note_branches WHERE id = ? AND note_id = ?", source_branch_id, noteId
            ).toArray()[0] as any;
            if (!source) return new Response("Source branch not found", { status: 404 });
            if (!source.head_version_id) return new Response("Source branch has no versions", { status: 400 });

            const current = this.getCurrentBranch(noteId);
            if (current.id === source.id) return new Response("Cannot merge branch into itself", { status: 400 });

            // Strict read — an R2 blip must abort the merge, not blank the note.
            let sourceContent: string;
            try {
                sourceContent = await this.reconstructVersion(source.head_version_id, noteId, { strict: true });
            } catch {
                return new Response("Could not load source branch content, try again", { status: 503 });
            }

            // Back up the current state first (checkout and restore do this;
            // merge previously overwrote the live note with no recovery path).
            this.flushPendingSave(noteId);
            const beforeMerge = this.getNote(noteId);
            if (beforeMerge?.content) {
                await this.createVersion(noteId, (beforeMerge.title as string) || "Untitled", beforeMerge.content as string, "auto-backup", "backup", "Auto-backup before merge");
            }

            // Create a merge version on the current branch
            await this.createVersion(noteId, `Merge ${source.name}`, sourceContent, "merge", "merge", `Merged ${source.name}`);

            this.sql.exec(
                "UPDATE notes SET content = ?, yjs_state = NULL, updated_at = unixepoch() WHERE id = ?",
                sourceContent, noteId
            );
            this.resetNoteSync(noteId);

            const note = this.getNote(noteId);
            return Response.json({ ok: true, note, source_branch: source.name });
        }

        // --- Tree (full graph for visualization) ---
        if (request.method === "GET" && path.match(/^\/notes\/[^/]+\/tree$/)) {
            const noteId = path.split("/")[2];
            this.ensureDefaultBranch(noteId);
            const branches = this.sql.exec(
                "SELECT id, name, head_version_id, is_default, created_at FROM note_branches WHERE note_id = ?", noteId
            ).toArray();
            const current = this.getCurrentBranch(noteId);
            const versions = this.sql.exec(
                `SELECT id, parent_id, branch_id, title, is_checkpoint, created_by, kind, summary, created_at FROM note_versions
                 WHERE note_id = ? ORDER BY created_at DESC LIMIT 1000`, noteId
            ).toArray();
            const note = this.getNote(noteId);
            return Response.json({
                branches: branches.map((b: any) => ({ ...b, is_current: b.id === current.id ? 1 : 0 })),
                versions,
                sync_mode: note?.sync_mode || "cloud",
            });
        }

        // Note history — git-style version list
        if (request.method === "GET" && path.match(/^\/notes\/[^/]+\/history$/)) {
            const noteId = path.split("/")[2];
            const rows = this.sql.exec(
                `SELECT id, note_id, title, is_checkpoint, branch_id, created_by, kind, summary, created_at FROM note_versions
                 WHERE note_id = ? ORDER BY created_at DESC LIMIT 1000`, noteId
            ).toArray();
            return Response.json(rows);
        }
        // Reconstruct a specific version's full content
        if (request.method === "GET" && path.match(/^\/notes\/[^/]+\/history\/[^/]+$/)) {
            const parts = path.split("/");
            const noteId = parts[2];
            const versionId = parts[4];
            const row = this.sql.exec(
                "SELECT id, note_id, title, is_checkpoint, created_by, kind, summary, created_at FROM note_versions WHERE id = ? AND note_id = ?",
                versionId, noteId
            ).toArray()[0];
            if (!row) return new Response("Version not found", { status: 404 });
            const content = await this.reconstructVersion(versionId, noteId);
            return Response.json({ ...row, content });
        }
        // Restore to a specific version
        if (request.method === "POST" && path.match(/^\/notes\/[^/]+\/history\/restore$/)) {
            const noteId = path.split("/")[2];
            const { version_id } = (await request.json()) as { version_id: string };
            const row = this.sql.exec(
                "SELECT id FROM note_versions WHERE id = ? AND note_id = ?", version_id, noteId
            ).toArray()[0];
            if (!row) return new Response("Version not found", { status: 404 });

            const restoredContent = await this.reconstructVersion(version_id, noteId);

            // Version the current state before restoring (so restore itself is reversible)
            const current = this.getNote(noteId);
            if (current?.content) {
                await this.createVersion(noteId, (current.title as string) || "Untitled", current.content as string, "auto-backup", "backup", "Auto-backup before restore");
            }

            // Apply the restored content
            const restoredTitle = (this.sql.exec(
                "SELECT title FROM note_versions WHERE id = ?", version_id
            ).toArray()[0] as any)?.title || "Untitled";

            this.sql.exec(
                "UPDATE notes SET title = ?, content = ?, yjs_state = NULL, updated_at = unixepoch() WHERE id = ?",
                restoredTitle, restoredContent, noteId
            );

            await this.createVersion(noteId, restoredTitle, restoredContent, "restore", "restore", "Restored version");
            this.resetNoteSync(noteId);

            const note = this.getNote(noteId);
            return Response.json(note);
        }

        // Public notes (no auth required — used by public page renderer)
        if (request.method === "GET" && path === "/public-notes") {
            const rows = this.sql.exec(
                `SELECT n.id, n.title, n.content, n.published_at, n.created_at, f.name as folder_name
                 FROM notes n LEFT JOIN folders f ON n.folder_id = f.id
                 WHERE n.published = 1 AND n.deleted_at IS NULL ORDER BY n.published_at DESC`
            ).toArray();
            // Derive the title from content when the stored column is stale —
            // the public page and RSS should never show "Untitled" for a note
            // that has real text.
            return Response.json(rows.map((row: any) => ({
                ...row,
                title: (row.title && row.title !== "Untitled") ? row.title : deriveTitleAndPreview(row.content).title || row.title || "Untitled",
            })));
        }

        // --- Media routes ---
        if (request.method === "GET" && path === "/media") {
            const rows = this.sql.exec(
                "SELECT id, type, filename, r2_key, mime_type, size, width, height, published, caption, created_at, updated_at FROM media ORDER BY created_at DESC"
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
        if (request.method === "PATCH" && path.match(/^\/media\/[^/]+\/caption$/)) {
            const id = path.split("/")[2];
            const { caption } = (await request.json()) as { caption: string };
            if (typeof caption !== "string" || caption.length > 2000) {
                return new Response("Invalid caption", { status: 400 });
            }
            this.sql.exec("UPDATE media SET caption = ?, updated_at = unixepoch() WHERE id = ?", caption, id);
            return Response.json({ ok: true });
        }
        if (request.method === "GET" && path === "/public-media") {
            const rows = this.sql.exec(
                "SELECT id, type, filename, r2_key, mime_type, size, width, height, caption, created_at FROM media WHERE published = 1 ORDER BY created_at DESC"
            ).toArray();
            return Response.json(rows);
        }

        // --- SMFS config routes ---
        if (request.method === "GET" && path.match(/^\/smfs\/config\/(.+)$/)) {
            const key = path.split("/")[3];
            const rows = this.sql.exec("SELECT value FROM smfs_config WHERE key = ?", key).toArray();
            if (!rows[0]) return new Response("Not found", { status: 404 });
            return Response.json({ value: rows[0].value });
        }
        if (request.method === "POST" && path === "/smfs/config") {
            const { key, value } = (await request.json()) as { key: string; value: string };
            this.sql.exec(
                "INSERT INTO smfs_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                key, value
            );
            return Response.json({ ok: true });
        }

        // SMFS notes for sync
        if (request.method === "GET" && path === "/smfs/notes-for-sync") {
            const rows = this.sql.exec(
                "SELECT id, title, content, updated_at FROM notes WHERE deleted_at IS NULL"
            ).toArray();
            return Response.json(rows);
        }
        if (request.method === "GET" && path.match(/^\/smfs\/note-for-sync\/(.+)$/)) {
            const id = path.split("/")[3];
            const rows = this.sql.exec(
                "SELECT id, title, content FROM notes WHERE id = ? AND deleted_at IS NULL", id
            ).toArray();
            if (!rows[0]) return new Response("Not found", { status: 404 });
            return Response.json(rows[0]);
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
                // The socket was authorized for exactly one note (its first
                // tag). Without this check, any edit-share visitor could
                // upsert ARBITRARY notes in the owner's DO by sending a
                // save-note with a different id.
                if (id !== this.ctx.getTags(ws)[0]) return;
                this.sql.exec(
                    `INSERT INTO notes (id, title, content, pending_index, updated_at) VALUES (?, ?, ?, 1, unixepoch())
                     ON CONFLICT(id) DO UPDATE SET title = excluded.title, content = excluded.content, pending_index = 1, updated_at = unixepoch()`,
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
                const encoder = encoding.createEncoder();
                encoding.writeVarUint(encoder, MSG_SYNC);
                syncProtocol.readSyncMessage(decoder, encoder, doc, null);
                if (encoding.length(encoder) > 1) ws.send(encoding.toUint8Array(encoder));
                return;
            }
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, MSG_SYNC);
            // Pass ws as origin so the doc update handler can broadcast
            // to all clients EXCEPT the sender
            syncProtocol.readSyncMessage(decoder, encoder, doc, ws);
            if (encoding.length(encoder) > 1) ws.send(encoding.toUint8Array(encoder));
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
            .exec("SELECT id, title, content, folder_id, sync_mode, locked, published, published_at, created_at, updated_at FROM notes WHERE deleted_at IS NULL ORDER BY updated_at DESC")
            .toArray();
    }

    private getNotesList() {
        // Reads `content` (cheap local SQLite read) to derive an authoritative
        // name + preview, but never ships the full JSON — keeps the payload tiny
        // while guaranteeing the list always has a real title and snippet.
        return this.sql
            .exec("SELECT id, title, content, folder_id, sync_mode, locked, published, published_at, created_at, updated_at FROM notes WHERE deleted_at IS NULL ORDER BY updated_at DESC")
            .toArray()
            .map((row: any) => {
                const { content, ...meta } = row;
                const { title, preview } = deriveTitleAndPreview(content as string);
                return { ...meta, title: title || meta.title || "Untitled", preview };
            });
    }

    private getTrashNotes() {
        return this.sql
            .exec("SELECT id, title, content, folder_id, sync_mode, locked, published, published_at, deleted_at, created_at, updated_at FROM notes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC")
            .toArray();
    }

    private getNote(id: string) {
        const rows = this.sql
            .exec("SELECT id, title, content, folder_id, sync_mode, locked, published, published_at, deleted_at, current_branch_id, created_at, updated_at FROM notes WHERE id = ?", id)
            .toArray();
        return rows[0] || null;
    }

    // Extract TipTap JSON from Yjs state so public pages can render it
    private extractContentJson(noteId: string): string | null {
        try {
            const doc = this.getYDoc(noteId);
            const fragment = doc.getXmlFragment("default");
            if (fragment.length === 0) return null;
            // toArray(), NOT Array.from() — Y.XmlFragment isn't iterable, and
            // Array.from used to produce [undefined, ...], which serialized
            // every note to {"type":"doc","content":[]} and then OVERWROTE the
            // real content column with it on the debounced save. This was the
            // "published note is completely blank / Untitled" bug.
            const json = { type: "doc", content: fragment.toArray().map(yNodeToTiptap).flat().filter(Boolean) };
            return JSON.stringify(json);
        } catch {
            return null;
        }
    }

    private broadcastJson(message: object, exclude?: WebSocket) {
        const data = JSON.stringify(message);
        for (const ws of this.ctx.getWebSockets()) {
            if (ws === exclude) continue;
            // note-updated/media events carry full note content and are meant
            // for the owner's other tabs. Shared-note visitors (perm:view/edit
            // on ONE note) must not receive the owner's other notes.
            const tags = this.ctx.getTags(ws);
            const perm = tags.find((t) => t.startsWith("perm:"));
            if (perm && perm !== "perm:owner") continue;
            try { ws.send(data); } catch { ws.close(); }
        }
    }
}
