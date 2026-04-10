import type { NottyAdapter, Note, NoteVersion, NoteBranch, NoteTree, User, Folder, Share, SharedNote, Profile, MediaItem } from "./adapter";
import type * as Y from "yjs";
import { NottyProvider } from "./yjs-provider";
import { authClient, createDesktopAuthClient } from "./auth-client";
import { getDesktopSettings } from "./desktop-settings";

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke(cmd, args);
}

function syncMarkdown() {
    invoke("sync_to_markdown").catch(console.error);
}

// Cloud detection: caches successful results, retries on failure.
// Never blocks local operations — cloud sync is fire-and-forget.
let cloudUrlCache: string | null | undefined = undefined; // undefined = not checked yet
let cloudCheckPromise: Promise<string | null> | null = null;
let cloudAuthClient: ReturnType<typeof createDesktopAuthClient> | null = null;
let sessionTokenCache: string | null = null;

function getCloudAuth() {
    return cloudAuthClient || authClient;
}

// Authenticated fetch to cloud — attaches session token via custom header
// (Cookie is a forbidden header in browser fetch, so we use X-Session-Token
// and the server converts it to a cookie before passing to Better Auth)
function cloudFetch(url: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    if (sessionTokenCache) {
        headers.set("X-Session-Token", sessionTokenCache);
    }
    return fetch(url, { ...init, headers });
}

async function detectCloud(): Promise<string | null> {
    if (cloudUrlCache) return cloudUrlCache; // cached success
    if (cloudCheckPromise) return cloudCheckPromise;

    cloudCheckPromise = (async () => {
        try {
            const settings = await getDesktopSettings();
            const url = settings.cloudUrl;
            if (!url) return null;
            sessionTokenCache = settings.sessionToken;
            if (!sessionTokenCache) {
                console.warn("[notty] No session token — cloud sync disabled until sign-in");
                return null;
            }
            const res = await cloudFetch(`${url}/api/auth/get-session`, { signal: AbortSignal.timeout(2000) });
            if (res.ok) {
                cloudUrlCache = url;
                cloudAuthClient = createDesktopAuthClient(url);
                return url;
            }
            console.warn("[notty] Cloud session check failed:", res.status);
        } catch (e) {
            console.warn("[notty] Cloud detection failed:", e);
        }
        return null;
    })();

    const result = await cloudCheckPromise;
    cloudCheckPromise = null; // don't cache failures — allow retry
    return result;
}

export function resetCloudDetection() {
    cloudUrlCache = undefined;
    cloudCheckPromise = null;
    cloudAuthClient = null;
    sessionTokenCache = null;
}

// Fire-and-forget cloud sync — never awaited, never blocks local ops
function cloudSync(fn: (cloud: string) => void) {
    detectCloud().then((cloud) => {
        if (cloud) fn(cloud);
    }).catch((e) => console.warn("[notty] cloudSync error:", e));
}

export class DesktopAdapter implements NottyAdapter {
    private syncInterval: ReturnType<typeof setInterval>;

    constructor() {
        this.syncInterval = setInterval(syncMarkdown, 30_000);
        detectCloud();
    }

    async getSession(): Promise<User | null> {
        const cloud = await detectCloud();
        if (cloud && sessionTokenCache) {
            try {
                const res = await cloudFetch(`${cloud}/api/auth/get-session`);
                if (res.ok) {
                    const data = await res.json() as { user?: User };
                    if (data.user) return data.user;
                }
            } catch {}
        }
        return { id: "local", name: "Local User" };
    }

    async signIn(): Promise<User | null> {
        const cloud = await detectCloud();
        if (cloud) {
            try {
                const res = await getCloudAuth().signIn.anonymous();
                if (res.data?.user) return res.data.user as User;
            } catch {}
        }
        return { id: "local", name: "Local User" };
    }

    async signOut(): Promise<void> {
        try { await getCloudAuth().signOut(); } catch {}
    }

    async getNotes(): Promise<Note[]> {
        const local: Note[] = await invoke("get_notes");

        // Merge cloud notes in background — don't block the UI
        const cloud = cloudUrlCache;
        if (cloud) {
            try {
                const res = await cloudFetch(`${cloud}/api/notes`, { signal: AbortSignal.timeout(3000) });
                if (res.ok) {
                    const cloudNotes: Note[] = await res.json();
                    const merged = new Map<string, Note>();
                    for (const n of local) merged.set(n.id, n);
                    for (const n of cloudNotes) {
                        const existing = merged.get(n.id);
                        if (!existing || n.updated_at > existing.updated_at) {
                            merged.set(n.id, n);
                            invoke("save_note", { id: n.id, title: n.title, content: n.content, folderId: n.folder_id ?? null }).catch(() => {});
                        } else if (existing && n.folder_id && existing.folder_id !== n.folder_id) {
                            // Cloud folder assignment is authoritative — sync it even if local content is newer
                            existing.folder_id = n.folder_id;
                            invoke("move_note_to_folder", { id: n.id, folderId: n.folder_id }).catch(() => {});
                        }
                    }
                    return Array.from(merged.values()).sort((a, b) => b.updated_at - a.updated_at);
                }
            } catch {}
        }
        return local;
    }

    async getNote(id: string): Promise<Note | null> {
        // Local is always fast and authoritative on desktop
        const local = await invoke<Note | null>("get_note", { id });
        if (local) return local;

        const cloud = cloudUrlCache;
        if (cloud) {
            try {
                const res = await cloudFetch(`${cloud}/api/notes/${id}`, { signal: AbortSignal.timeout(2000) });
                if (res.ok) return res.json();
            } catch {}
        }
        return null;
    }

    saveNote(id: string, title: string, content: string, folderId?: string | null): void {
        invoke("save_note", { id, title, content, folderId })
            .then(syncMarkdown)
            .catch(console.error);

        cloudSync((cloud) => {
            const body: Record<string, any> = { id, title, content };
            if (folderId !== undefined) body.folder_id = folderId;
            cloudFetch(`${cloud}/api/notes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            }).catch((e) => console.warn("[notty] Cloud save failed:", e));
        });
    }

    async deleteNote(id: string): Promise<void> {
        await invoke("soft_delete_note", { id });
        syncMarkdown();
        cloudSync((cloud) => {
            cloudFetch(`${cloud}/api/notes/${id}`, { method: "DELETE" }).catch(() => {});
        });
    }

    async getTrash(): Promise<Note[]> {
        return invoke("get_trash_notes");
    }

    async restoreNote(id: string): Promise<Note | null> {
        await invoke("restore_note", { id });
        syncMarkdown();
        cloudSync((cloud) => {
            cloudFetch(`${cloud}/api/notes/${id}/restore`, { method: "POST" }).catch(() => {});
        });
        return invoke("get_note", { id });
    }

    async permanentlyDeleteNote(id: string): Promise<void> {
        await invoke("delete_note", { id });
        syncMarkdown();
        cloudSync((cloud) => {
            cloudFetch(`${cloud}/api/notes/${id}/permanent`, { method: "DELETE" }).catch(() => {});
        });
    }

    async getFolders(): Promise<Folder[]> {
        const local: Folder[] = await invoke("get_folders");
        const cloud = cloudUrlCache;
        if (cloud) {
            try {
                const res = await cloudFetch(`${cloud}/api/folders`, { signal: AbortSignal.timeout(3000) });
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
        cloudSync((cloud) => {
            cloudFetch(`${cloud}/api/folders`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(folder),
            }).catch(() => {});
        });
    }

    async deleteFolder(id: string): Promise<void> {
        await invoke("delete_folder", { id });
        cloudSync((cloud) => {
            cloudFetch(`${cloud}/api/folders/${id}`, { method: "DELETE" }).catch(() => {});
        });
    }

    async moveNoteToFolder(noteId: string, folderId: string | null): Promise<void> {
        await invoke("move_note_to_folder", { id: noteId, folderId });
        cloudSync((cloud) => {
            cloudFetch(`${cloud}/api/notes/${noteId}/folder`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ folder_id: folderId }),
            }).catch(() => {});
        });
    }

    async setNoteSyncMode(noteId: string, mode: "cloud" | "local"): Promise<void> {
        await invoke("set_sync_mode", { id: noteId, syncMode: mode });

        if (mode === "cloud") {
            cloudSync(async (cloud) => {
                const note = await invoke<Note | null>("get_note", { id: noteId });
                if (note) {
                    cloudFetch(`${cloud}/api/notes`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: note.id, title: note.title, content: note.content, folder_id: note.folder_id, sync_mode: mode }),
                    }).catch(() => {});
                }
            });
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

    // History & branches — not available on desktop (cloud only)
    async getNoteHistory(): Promise<NoteVersion[]> { return []; }
    async getVersion(): Promise<NoteVersion | null> { return null; }
    async restoreVersion(): Promise<Note | null> { throw new Error("History requires cloud"); }
    async getBranches(): Promise<NoteBranch[]> { return []; }
    async createBranch(): Promise<NoteBranch> { throw new Error("Branches require cloud"); }
    async checkoutBranch(): Promise<{ branch: string; content: string }> { throw new Error("Branches require cloud"); }
    async deleteBranch(): Promise<void> { throw new Error("Branches require cloud"); }
    async mergeBranch(): Promise<{ ok: boolean; source_branch: string }> { throw new Error("Branches require cloud"); }
    async getNoteTree(): Promise<NoteTree> { return { branches: [], versions: [], sync_mode: "local" }; }

    // Locking — not available on desktop
    async lockNote(): Promise<void> { throw new Error("Locking requires cloud"); }
    async unlockNote(): Promise<void> { throw new Error("Locking requires cloud"); }
    async verifyLock(): Promise<{ lockToken: string }> { throw new Error("Locking requires cloud"); }

    // Media — not available on desktop
    async getMedia(): Promise<MediaItem[]> { return []; }
    async uploadMedia(): Promise<MediaItem> { throw new Error("Media upload requires cloud"); }
    async deleteMedia(): Promise<void> { throw new Error("Media requires cloud"); }
    async publishMedia(): Promise<void> { throw new Error("Media requires cloud"); }
    async updateMediaCaption(): Promise<void> { throw new Error("Media requires cloud"); }
    getMediaUrl(): string { return ""; }

    // Publishing — not available on desktop
    async publishNote(): Promise<void> { throw new Error("Publishing requires cloud"); }

    // Profile
    async getProfile(): Promise<Profile> {
        return { userId: "local", username: null, pageTitle: "My Notes", pageDescription: "", font: "serif", colorMode: "light" };
    }
    async updateProfile(): Promise<void> { throw new Error("Profile requires cloud"); }

    createProvider(noteId: string, doc: Y.Doc): NottyProvider {
        const provider = new NottyProvider(noteId, doc, { connect: false });
        // When cloud is available, connect Yjs WebSocket for real-time sync
        detectCloud().then((cloud) => {
            if (cloud && !provider.destroyed && sessionTokenCache) {
                provider.setServerUrl(cloud, sessionTokenCache);
                provider.connect();
            }
        });
        return provider;
    }
}
