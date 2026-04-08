import type { NottyAdapter, Note, User, Folder, Share, SharedNote, Profile, MediaItem } from "./adapter";
import type * as Y from "yjs";
import { NottyProvider } from "./yjs-provider";
import { authClient } from "./auth-client";
import { getDesktopSettings } from "./desktop-settings";

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke(cmd, args);
}

function syncMarkdown() {
    invoke("sync_to_markdown").catch(console.error);
}

let cloudUrl: string | null = null;
async function detectCloud(): Promise<string | null> {
    if (cloudUrl !== null) return cloudUrl || null;
    try {
        const settings = await getDesktopSettings();
        const url = settings.cloudUrl;
        if (!url) { cloudUrl = ""; return null; }
        const res = await fetch(`${url}/api/auth/get-session`, { signal: AbortSignal.timeout(1000) });
        if (res.ok || res.status === 200) { cloudUrl = url; return url; }
    } catch {}
    cloudUrl = "";
    return null;
}

export function resetCloudDetection() {
    cloudUrl = null;
}

export class DesktopAdapter implements NottyAdapter {
    private syncInterval: ReturnType<typeof setInterval>;

    constructor() {
        this.syncInterval = setInterval(syncMarkdown, 30_000);
    }

    async getSession(): Promise<User | null> {
        // Try cloud session first
        const cloud = await detectCloud();
        if (cloud) {
            try {
                const session = await authClient.getSession();
                if (session.data?.user) return session.data.user as User;
            } catch {}
        }
        return { id: "local", name: "Local User" };
    }

    async signIn(): Promise<User | null> {
        const cloud = await detectCloud();
        if (cloud) {
            try {
                const res = await authClient.signIn.anonymous();
                if (res.data?.user) return res.data.user as User;
            } catch {}
        }
        return { id: "local", name: "Local User" };
    }

    async signOut(): Promise<void> {
        try { await authClient.signOut(); } catch {}
    }

    async getNotes(): Promise<Note[]> {
        // Merge: local notes + cloud notes
        const local: Note[] = await invoke("get_notes");
        const cloud = await detectCloud();
        if (cloud) {
            try {
                const res = await fetch(`${cloud}/api/notes`);
                if (res.ok) {
                    const cloudNotes: Note[] = await res.json();
                    // Merge: prefer cloud version if newer, keep local-only notes
                    const merged = new Map<string, Note>();
                    for (const n of local) merged.set(n.id, n);
                    for (const n of cloudNotes) {
                        const existing = merged.get(n.id);
                        if (!existing || n.updated_at > existing.updated_at) {
                            merged.set(n.id, n);
                            // Sync cloud note to local
                            invoke("save_note", { id: n.id, title: n.title, content: n.content }).catch(() => {});
                        }
                    }
                    return Array.from(merged.values()).sort((a, b) => b.updated_at - a.updated_at);
                }
            } catch {}
        }
        return local;
    }

    async getNote(id: string): Promise<Note | null> {
        // Try local first (fast), then cloud
        const local = await invoke<Note | null>("get_note", { id });
        if (local) return local;

        const cloud = await detectCloud();
        if (cloud) {
            try {
                const res = await fetch(`${cloud}/api/notes/${id}`);
                if (res.ok) return res.json();
            } catch {}
        }
        return null;
    }

    saveNote(id: string, title: string, content: string, folderId?: string | null): void {
        invoke("save_note", { id, title, content, folderId })
            .then(syncMarkdown)
            .catch(console.error);

        detectCloud().then((cloud) => {
            if (cloud) {
                const body: Record<string, any> = { id, title, content };
                if (folderId !== undefined) body.folder_id = folderId;
                fetch(`${cloud}/api/notes`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                }).catch(() => {});
            }
        });
    }

    async deleteNote(id: string): Promise<void> {
        await invoke("delete_note", { id });
        syncMarkdown();

        const cloud = await detectCloud();
        if (cloud) {
            fetch(`${cloud}/api/notes/${id}`, { method: "DELETE" }).catch(() => {});
        }
    }

    async getFolders(): Promise<Folder[]> {
        const local: Folder[] = await invoke("get_folders");
        const cloud = await detectCloud();
        if (cloud) {
            try {
                const res = await fetch(`${cloud}/api/folders`);
                if (res.ok) {
                    const cloudFolders: Folder[] = await res.json();
                    const merged = new Map<string, Folder>();
                    for (const f of local) merged.set(f.id, f);
                    for (const f of cloudFolders) {
                        const existing = merged.get(f.id);
                        if (!existing || f.updated_at > existing.updated_at) {
                            merged.set(f.id, f);
                            invoke("save_folder", { id: f.id, name: f.name, color: f.color, description: f.description, sortOrder: f.sort_order }).catch(() => {});
                        }
                    }
                    return Array.from(merged.values()).sort((a, b) => a.sort_order - b.sort_order);
                }
            } catch {}
        }
        return local;
    }

    async saveFolder(folder: Partial<Folder> & { id: string; name: string }): Promise<void> {
        await invoke("save_folder", { id: folder.id, name: folder.name, color: folder.color, description: folder.description, sortOrder: folder.sort_order });
        const cloud = await detectCloud();
        if (cloud) {
            fetch(`${cloud}/api/folders`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(folder),
            }).catch(() => {});
        }
    }

    async deleteFolder(id: string): Promise<void> {
        await invoke("delete_folder", { id });
        const cloud = await detectCloud();
        if (cloud) {
            fetch(`${cloud}/api/folders/${id}`, { method: "DELETE" }).catch(() => {});
        }
    }

    async moveNoteToFolder(noteId: string, folderId: string | null): Promise<void> {
        const note = await invoke<Note | null>("get_note", { id: noteId });
        if (note) {
            await invoke("save_note", { id: note.id, title: note.title, content: note.content, folderId, syncMode: note.sync_mode });
        }
        const cloud = await detectCloud();
        if (cloud) {
            fetch(`${cloud}/api/notes/${noteId}/folder`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ folder_id: folderId }),
            }).catch(() => {});
        }
    }

    async setNoteSyncMode(noteId: string, mode: "cloud" | "local"): Promise<void> {
        const note = await invoke<Note | null>("get_note", { id: noteId });
        if (!note) return;
        await invoke("save_note", { id: note.id, title: note.title, content: note.content, folderId: note.folder_id, syncMode: mode });

        if (mode === "cloud") {
            const cloud = await detectCloud();
            if (cloud) {
                fetch(`${cloud}/api/notes`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: note.id, title: note.title, content: note.content, folder_id: note.folder_id, sync_mode: mode }),
                }).catch(() => {});
            }
        }
    }

    async getNoteMeta(id: string): Promise<Partial<Note> | null> {
        return this.getNote(id);
    }

    // Sharing — not available on desktop
    async createShare(): Promise<{ id: string; shareToken: string }> { throw new Error("Sharing requires cloud"); }
    async listShares(): Promise<Share[]> { return []; }
    async deleteShare(): Promise<void> {}
    async getSharedWithMe(): Promise<SharedNote[]> { return []; }

    // Locking — not available on desktop
    async lockNote(): Promise<void> { throw new Error("Locking requires cloud"); }
    async unlockNote(): Promise<void> { throw new Error("Locking requires cloud"); }
    async verifyLock(): Promise<{ lockToken: string }> { throw new Error("Locking requires cloud"); }

    // Media — not available on desktop
    async getMedia(): Promise<MediaItem[]> { return []; }
    async uploadMedia(): Promise<MediaItem> { throw new Error("Media upload requires cloud"); }
    async deleteMedia(): Promise<void> { throw new Error("Media requires cloud"); }
    async publishMedia(): Promise<void> { throw new Error("Media requires cloud"); }
    getMediaUrl(): string { return ""; }

    // Publishing — not available on desktop
    async publishNote(): Promise<void> { throw new Error("Publishing requires cloud"); }

    // Profile
    async getProfile(): Promise<Profile> {
        return { userId: "local", username: null, pageTitle: "My Notes", pageDescription: "", font: "serif", colorMode: "light" };
    }
    async updateProfile(): Promise<void> { throw new Error("Profile requires cloud"); }

    createProvider(noteId: string, doc: Y.Doc): NottyProvider {
        // Desktop: offline-only Yjs (IndexedDB persistence, no WebSocket)
        // Cloud sync happens via HTTP in saveNote/deleteNote
        return new NottyProvider(noteId, doc, { connect: false });
    }
}
