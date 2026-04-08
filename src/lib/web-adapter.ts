import type * as Y from "yjs";
import type { NottyAdapter, Note, User, Folder, Share, SharedNote, Profile } from "./adapter";
import { NottyProvider } from "./yjs-provider";
import { authClient } from "./auth-client";

async function assertOk(res: Response, context: string) {
    if (!res.ok) throw new Error(`${context}: ${res.status} ${res.statusText}`);
}

// IndexedDB-backed cache for the notes list so the PWA works offline
const IDB_STORE = "notty-pwa-cache";

async function getCachedNotes(): Promise<Note[]> {
    try {
        const db = await openCache();
        return await idbGet<Note[]>(db, "notes") ?? [];
    } catch { return []; }
}

async function setCachedNotes(notes: Note[]): Promise<void> {
    try {
        const db = await openCache();
        await idbPut(db, "notes", notes);
    } catch {}
}

async function getCachedFolders(): Promise<Folder[]> {
    try {
        const db = await openCache();
        return await idbGet<Folder[]>(db, "folders") ?? [];
    } catch { return []; }
}

async function setCachedFolders(folders: Folder[]): Promise<void> {
    try {
        const db = await openCache();
        await idbPut(db, "folders", folders);
    } catch {}
}

function openCache(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_STORE, 1);
        req.onupgradeneeded = () => req.result.createObjectStore("kv");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function idbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction("kv", "readonly");
        const req = tx.objectStore("kv").get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function idbPut(db: IDBDatabase, key: string, value: any): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction("kv", "readwrite");
        const req = tx.objectStore("kv").put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

export class WebAdapter implements NottyAdapter {
    async getSession(): Promise<User | null> {
        try {
            const session = await authClient.getSession();
            return (session.data?.user as User) ?? null;
        } catch {
            // Offline — return cached local user so the app still renders
            return { id: "offline", name: "Offline" };
        }
    }

    async signIn(): Promise<User | null> {
        const res = await authClient.signIn.anonymous();
        return (res.data?.user as User) ?? null;
    }

    async signOut(): Promise<void> {
        await authClient.signOut();
    }

    async getNotes(): Promise<Note[]> {
        try {
            const res = await fetch("/api/notes");
            await assertOk(res, "Failed to fetch notes");
            const notes: Note[] = await res.json();
            setCachedNotes(notes);
            return notes;
        } catch {
            // Offline — serve from IndexedDB cache
            return getCachedNotes();
        }
    }

    async getNote(id: string): Promise<Note | null> {
        try {
            const res = await fetch(`/api/notes/${id}`);
            if (res.status === 404) return null;
            await assertOk(res, "Failed to fetch note");
            return res.json();
        } catch {
            // Offline — check cache
            const cached = await getCachedNotes();
            return cached.find((n) => n.id === id) ?? null;
        }
    }

    async getNoteMeta(id: string, shareToken?: string): Promise<Partial<Note> | null> {
        try {
            const params = shareToken ? `?share=${encodeURIComponent(shareToken)}` : "";
            const res = await fetch(`/api/notes/${id}/meta${params}`);
            if (res.status === 404) return null;
            if (!res.ok) return null;
            return res.json();
        } catch {
            // Offline — let the editor open anyway (Yjs has the content)
            return null;
        }
    }

    saveNote(id: string, title: string, content: string, folderId?: string | null): void {
        const body: Record<string, any> = { id, title, content };
        if (folderId !== undefined) body.folder_id = folderId;
        fetch("/api/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }).catch(() => {
            // Offline — Yjs/IndexedDB already has the content, it'll sync when back online
        });
    }

    async deleteNote(id: string): Promise<void> {
        const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
        await assertOk(res, "Failed to delete note");
    }

    async getFolders(): Promise<Folder[]> {
        try {
            const res = await fetch("/api/folders");
            await assertOk(res, "Failed to fetch folders");
            const folders: Folder[] = await res.json();
            setCachedFolders(folders);
            return folders;
        } catch {
            return getCachedFolders();
        }
    }

    async saveFolder(folder: Partial<Folder> & { id: string; name: string }): Promise<void> {
        const res = await fetch("/api/folders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(folder),
        });
        await assertOk(res, "Failed to save folder");
    }

    async deleteFolder(id: string): Promise<void> {
        const res = await fetch(`/api/folders/${id}`, { method: "DELETE" });
        await assertOk(res, "Failed to delete folder");
    }

    async moveNoteToFolder(noteId: string, folderId: string | null): Promise<void> {
        const res = await fetch(`/api/notes/${noteId}/folder`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folder_id: folderId }),
        });
        await assertOk(res, "Failed to move note");
    }

    async setNoteSyncMode(noteId: string, mode: "cloud" | "local"): Promise<void> {
        const res = await fetch(`/api/notes/${noteId}/sync-mode`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sync_mode: mode }),
        });
        await assertOk(res, "Failed to set sync mode");
    }

    // Sharing
    async createShare(noteId: string, opts: { email?: string; permission?: string }): Promise<{ id: string; shareToken: string }> {
        const res = await fetch("/api/shares", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ noteId, ...opts }),
        });
        await assertOk(res, "Failed to create share");
        return res.json();
    }

    async listShares(noteId: string): Promise<Share[]> {
        const res = await fetch(`/api/shares?noteId=${encodeURIComponent(noteId)}`);
        await assertOk(res, "Failed to list shares");
        return res.json();
    }

    async deleteShare(id: string): Promise<void> {
        const res = await fetch(`/api/shares/${id}`, { method: "DELETE" });
        await assertOk(res, "Failed to delete share");
    }

    async getSharedWithMe(): Promise<SharedNote[]> {
        const res = await fetch("/api/shared-with-me");
        if (!res.ok) return [];
        return res.json();
    }

    // Locking
    async lockNote(noteId: string): Promise<void> {
        const res = await fetch(`/api/notes/${noteId}/lock`, { method: "POST" });
        await assertOk(res, "Failed to lock note");
    }

    async unlockNote(noteId: string, lockToken: string): Promise<void> {
        const res = await fetch(`/api/notes/${noteId}/unlock`, {
            method: "POST",
            headers: { "X-Lock-Token": lockToken },
        });
        await assertOk(res, "Failed to unlock note");
    }

    async verifyLock(noteId: string): Promise<{ lockToken: string }> {
        // Step 1: Trigger passkey authentication via Better Auth
        await authClient.signIn.passkey();

        // Step 2: Exchange for lock token
        const res = await fetch(`/api/notes/${noteId}/verify-lock/complete`, {
            method: "POST",
        });
        await assertOk(res, "Failed to verify lock");
        return res.json();
    }

    // Publishing
    async publishNote(noteId: string, published: boolean): Promise<void> {
        const res = await fetch(`/api/notes/${noteId}/publish`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ published }),
        });
        await assertOk(res, "Failed to publish note");
    }

    // Profile
    async getProfile(): Promise<Profile> {
        const res = await fetch("/api/profile");
        return res.json();
    }

    async updateProfile(data: Partial<Profile>): Promise<void> {
        const res = await fetch("/api/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        await assertOk(res, "Failed to update profile");
    }

    createProvider(noteId: string, doc: Y.Doc, opts?: { shareToken?: string }): NottyProvider {
        return new NottyProvider(noteId, doc, { connect: false, shareToken: opts?.shareToken });
    }
}
