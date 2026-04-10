import { DurableObject } from "cloudflare:workers";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { createPatch, applyPatch } from "../lib/diff";

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
        const children = Array.from(ynode).flatMap(child => {
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
                    // Also sync content + title columns so HTTP reads stay fresh
                    const content = this.extractContentJson(noteId);
                    if (content) {
                        const parsed = JSON.parse(content);
                        const firstNode = parsed?.content?.[0];
                        const title = firstNode?.content?.map((n: any) => n.text || "").join("").trim() || "Untitled";
                        this.sql.exec(
                            "UPDATE notes SET yjs_state = ?, content = ?, title = ?, updated_at = unixepoch() WHERE id = ?",
                            state, content, title, noteId
                        );
                    } else {
                        this.sql.exec(
                            "UPDATE notes SET yjs_state = ?, updated_at = unixepoch() WHERE id = ?",
                            state, noteId
                        );
                    }
                } catch (e) {
                    console.error(`Failed to persist Yjs state for note ${noteId}:`, e);
                }
                this.saveTimers.delete(noteId);
            }, 2000));
        });

        this.docs.set(noteId, doc);
        return doc;
    }

    private readonly CHECKPOINT_INTERVAL = 20;

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

    private createVersion(noteId: string, title: string, content: string, createdBy = "system") {
        const branch = this.getCurrentBranch(noteId);
        const parentId = branch.head_version_id;

        const id = crypto.randomUUID();

        // Count versions on this branch since last checkpoint
        let sinceCheckpoint = 0;
        if (parentId) {
            const count = this.sql.exec(
                `SELECT COUNT(*) as c FROM note_versions
                 WHERE branch_id = ? AND created_at >= COALESCE(
                     (SELECT created_at FROM note_versions WHERE branch_id = ? AND is_checkpoint = 1 ORDER BY created_at DESC LIMIT 1),
                     0
                 )`, branch.id, branch.id
            ).toArray()[0] as { c: number };
            sinceCheckpoint = count?.c ?? 0;
        }

        const needsCheckpoint = !parentId || sinceCheckpoint >= this.CHECKPOINT_INTERVAL;

        if (needsCheckpoint) {
            this.sql.exec(
                "INSERT INTO note_versions (id, note_id, parent_id, branch_id, title, is_checkpoint, data, created_by) VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
                id, noteId, parentId, branch.id, title, content, createdBy
            );
        } else {
            const parentContent = this.reconstructVersion(parentId!, noteId);
            const patch = createPatch(parentContent, content);
            if (patch === '[]') return;
            this.sql.exec(
                "INSERT INTO note_versions (id, note_id, parent_id, branch_id, title, is_checkpoint, data, created_by) VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
                id, noteId, parentId, branch.id, title, patch, createdBy
            );
        }

        this.sql.exec("UPDATE note_branches SET head_version_id = ? WHERE id = ?", id, branch.id);

        this.sql.exec(`
            DELETE FROM note_versions WHERE note_id = ? AND id NOT IN (
                SELECT id FROM note_versions WHERE note_id = ? ORDER BY created_at DESC LIMIT 100
            )
        `, noteId, noteId);
    }

    private reconstructVersion(versionId: string, noteId: string): string {
        const chain: { id: string; data: string; is_checkpoint: number; parent_id: string | null }[] = [];
        let currentId: string | null = versionId;

        while (currentId) {
            const row = this.sql.exec(
                "SELECT id, data, is_checkpoint, parent_id FROM note_versions WHERE id = ?", currentId
            ).toArray()[0] as any;
            if (!row) break;
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
                this.sql.exec(
                    `UPDATE notes SET title = ?, content = ?, yjs_state = NULL, folder_id = ?, sync_mode = ?, updated_at = unixepoch() WHERE id = ?`,
                    body.title || "Untitled", body.content || "",
                    body.folder_id !== undefined ? body.folder_id : existing.folder_id,
                    body.sync_mode !== undefined ? body.sync_mode : existing.sync_mode,
                    id
                );
                // Evict stale Yjs doc so next WebSocket client starts fresh
                this.docs.delete(id);
                const timer = this.saveTimers.get(id);
                if (timer) { clearTimeout(timer); this.saveTimers.delete(id); }
                if (body.content) this.createVersion(id, body.title || "Untitled", body.content);
            } else {
                this.sql.exec(
                    `INSERT INTO notes (id, title, content, folder_id, sync_mode, updated_at) VALUES (?, ?, ?, ?, ?, unixepoch())`,
                    id, body.title || "Untitled", body.content || "", body.folder_id ?? null, body.sync_mode || "cloud"
                );
                if (body.content) this.createVersion(id, body.title || "Untitled", body.content);
            }
            const note = this.getNote(id);
            this.broadcastJson({ type: "note-updated", note });
            return Response.json(note);
        }
        if (request.method === "DELETE" && path.startsWith("/notes/") && !path.includes("/", "/notes/".length)) {
            const id = path.slice("/notes/".length);
            this.sql.exec("UPDATE notes SET deleted_at = unixepoch() WHERE id = ?", id);
            this.docs.delete(id);
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
            this.docs.delete(id);
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
                // Sync Yjs content to the content column so public pages have fresh data
                const content = this.extractContentJson(id);
                if (content) {
                    this.sql.exec("UPDATE notes SET content = ? WHERE id = ?", content, id);
                }
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

            // Version the current state before switching (so no work is lost)
            const currentNote = this.getNote(noteId);
            if (currentNote?.content) {
                this.createVersion(noteId, currentNote.title || "Untitled", currentNote.content as string, "auto-backup");
            }

            // Switch current branch
            this.sql.exec("UPDATE notes SET current_branch_id = ?, updated_at = unixepoch() WHERE id = ?", branch_id, noteId);

            // Load branch HEAD content
            let content = "";
            if (branch.head_version_id) {
                content = this.reconstructVersion(branch.head_version_id, noteId);
            }

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

            const sourceContent = this.reconstructVersion(source.head_version_id, noteId);

            // Create a merge version on the current branch
            this.createVersion(noteId, `Merge ${source.name}`, sourceContent, "merge");

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
                `SELECT id, parent_id, branch_id, title, is_checkpoint, created_by, created_at FROM note_versions
                 WHERE note_id = ? ORDER BY created_at DESC LIMIT 100`, noteId
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
                `SELECT id, note_id, title, is_checkpoint, branch_id, created_by, created_at FROM note_versions
                 WHERE note_id = ? ORDER BY created_at DESC LIMIT 100`, noteId
            ).toArray();
            return Response.json(rows);
        }
        // Reconstruct a specific version's full content
        if (request.method === "GET" && path.match(/^\/notes\/[^/]+\/history\/[^/]+$/)) {
            const parts = path.split("/");
            const noteId = parts[2];
            const versionId = parts[4];
            const row = this.sql.exec(
                "SELECT id, note_id, title, is_checkpoint, created_by, created_at FROM note_versions WHERE id = ? AND note_id = ?",
                versionId, noteId
            ).toArray()[0];
            if (!row) return new Response("Version not found", { status: 404 });
            const content = this.reconstructVersion(versionId, noteId);
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

            const restoredContent = this.reconstructVersion(version_id, noteId);

            // Version the current state before restoring (so restore itself is reversible)
            const current = this.getNote(noteId);
            if (current?.content) {
                this.createVersion(noteId, current.title || "Untitled", current.content as string, "auto-backup");
            }

            // Apply the restored content
            const restoredTitle = (this.sql.exec(
                "SELECT title FROM note_versions WHERE id = ?", version_id
            ).toArray()[0] as any)?.title || "Untitled";

            this.sql.exec(
                "UPDATE notes SET title = ?, content = ?, yjs_state = NULL, updated_at = unixepoch() WHERE id = ?",
                restoredTitle, restoredContent, noteId
            );

            this.createVersion(noteId, restoredTitle, restoredContent, "restore");
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
            return Response.json(rows);
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
                if (content) {
                    const userId = this.ctx.getTags(ws).find((t) => t.startsWith("user:"))?.slice(5) || "unknown";
                    this.createVersion(id, title || "Untitled", content, userId);
                }
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
            .exec("SELECT id, title, content, folder_id, sync_mode, locked, published, published_at, created_at, updated_at FROM notes WHERE deleted_at IS NULL ORDER BY updated_at DESC")
            .toArray();
    }

    private getTrashNotes() {
        return this.sql
            .exec("SELECT id, title, content, folder_id, sync_mode, locked, published, published_at, deleted_at, created_at, updated_at FROM notes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC")
            .toArray();
    }

    private getNote(id: string) {
        const rows = this.sql
            .exec("SELECT id, title, content, folder_id, sync_mode, locked, published, published_at, current_branch_id, created_at, updated_at FROM notes WHERE id = ?", id)
            .toArray();
        return rows[0] || null;
    }

    // Extract TipTap JSON from Yjs state so public pages can render it
    private extractContentJson(noteId: string): string | null {
        try {
            const doc = this.getYDoc(noteId);
            const fragment = doc.getXmlFragment("default");
            if (fragment.length === 0) return null;
            const json = { type: "doc", content: Array.from(fragment).map(yNodeToTiptap).flat().filter(Boolean) };
            return JSON.stringify(json);
        } catch {
            return null;
        }
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
