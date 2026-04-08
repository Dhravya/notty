import type * as Y from "yjs";
import type { NottyAdapter, Note, NoteVersion, NoteBranch, NoteTree, User, Folder, Share, SharedNote, Profile } from "./adapter";
import { NottyProvider } from "./yjs-provider";
import { authClient } from "./auth-client";

async function assertOk(res: Response, context: string) {
    if (!res.ok) throw new Error(`${context}: ${res.status} ${res.statusText}`);
}

export class WebAdapter implements NottyAdapter {
    async getSession(): Promise<User | null> {
        const session = await authClient.getSession();
        return (session.data?.user as User) ?? null;
    }

    async signIn(): Promise<User | null> {
        const res = await authClient.signIn.anonymous();
        return (res.data?.user as User) ?? null;
    }

    async signOut(): Promise<void> {
        await authClient.signOut();
    }

    async getNotes(): Promise<Note[]> {
        const res = await fetch("/api/notes");
        await assertOk(res, "Failed to fetch notes");
        return res.json();
    }

    async getNote(id: string): Promise<Note | null> {
        const res = await fetch(`/api/notes/${id}`);
        if (res.status === 404) return null;
        await assertOk(res, "Failed to fetch note");
        return res.json();
    }

    async getNoteMeta(id: string, shareToken?: string): Promise<Partial<Note> | null> {
        const params = shareToken ? `?share=${encodeURIComponent(shareToken)}` : "";
        const res = await fetch(`/api/notes/${id}/meta${params}`);
        if (res.status === 404) return null;
        if (!res.ok) return null;
        return res.json();
    }

    saveNote(id: string, title: string, content: string, folderId?: string | null): void {
        const body: Record<string, any> = { id, title, content };
        if (folderId !== undefined) body.folder_id = folderId;
        fetch("/api/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }).catch((e) => {
            console.error("Failed to save note:", e);
        });
    }

    async deleteNote(id: string): Promise<void> {
        const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
        await assertOk(res, "Failed to delete note");
    }

    async getFolders(): Promise<Folder[]> {
        const res = await fetch("/api/folders");
        await assertOk(res, "Failed to fetch folders");
        return res.json();
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

    // History (git-style versioning — server reconstructs content from patches)
    async getNoteHistory(noteId: string): Promise<NoteVersion[]> {
        const res = await fetch(`/api/notes/${noteId}/history`);
        await assertOk(res, "Failed to fetch note history");
        return res.json();
    }

    async getVersion(noteId: string, versionId: string): Promise<NoteVersion | null> {
        const res = await fetch(`/api/notes/${noteId}/history/${versionId}`);
        if (res.status === 404) return null;
        await assertOk(res, "Failed to fetch version");
        return res.json();
    }

    async restoreVersion(noteId: string, versionId: string): Promise<Note | null> {
        const res = await fetch(`/api/notes/${noteId}/history/restore`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ version_id: versionId }),
        });
        await assertOk(res, "Failed to restore version");
        return res.json();
    }

    // Branches
    async getBranches(noteId: string): Promise<NoteBranch[]> {
        const res = await fetch(`/api/notes/${noteId}/branches`);
        await assertOk(res, "Failed to fetch branches");
        return res.json();
    }

    async createBranch(noteId: string, name: string): Promise<NoteBranch> {
        const res = await fetch(`/api/notes/${noteId}/branches`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
        });
        await assertOk(res, "Failed to create branch");
        return res.json();
    }

    async checkoutBranch(noteId: string, branchId: string): Promise<{ branch: string; content: string }> {
        const res = await fetch(`/api/notes/${noteId}/branches/checkout`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ branch_id: branchId }),
        });
        await assertOk(res, "Failed to checkout branch");
        return res.json();
    }

    async deleteBranch(noteId: string, branchId: string): Promise<void> {
        const res = await fetch(`/api/notes/${noteId}/branches/${branchId}`, { method: "DELETE" });
        await assertOk(res, "Failed to delete branch");
    }

    async getNoteTree(noteId: string): Promise<NoteTree> {
        const res = await fetch(`/api/notes/${noteId}/tree`);
        await assertOk(res, "Failed to fetch tree");
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
