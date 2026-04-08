import type * as Y from "yjs";
import type { NottyProvider } from "./yjs-provider";

export type Note = {
    id: string;
    title: string;
    content: string;
    folder_id?: string | null;
    sync_mode?: "cloud" | "local";
    locked?: boolean | number;
    published?: boolean | number;
    published_at?: number | null;
    color?: string | null;
    created_at: number;
    updated_at: number;
};

export type Share = {
    id: string;
    shared_with_id?: string | null;
    shared_with_email?: string | null;
    shared_with_name?: string | null;
    permission: "view" | "edit";
    token?: string;
    created_at: number;
};

export type SharedNote = {
    id: string;
    title: string;
    locked?: boolean | number;
    owner_name: string;
    permission: "view" | "edit";
    shared_at: number;
};

export type Profile = {
    userId: string;
    username?: string | null;
    pageTitle: string;
    pageDescription: string;
    font: "sans" | "serif" | "mono";
    colorMode: "light" | "dark";
};

export type NoteVersion = {
    id: string;
    note_id: string;
    title: string;
    is_checkpoint: number;
    branch_id?: string;
    content?: string;
    created_by: string;
    created_at: number;
};

export type NoteBranch = {
    id: string;
    name: string;
    head_version_id: string | null;
    is_default: number;
    is_current: number;
    created_at: number;
};

export type NoteTree = {
    branches: NoteBranch[];
    versions: NoteVersion[];
    sync_mode: string;
};

export type Folder = {
    id: string;
    name: string;
    color: string;
    description?: string;
    sort_order: number;
    created_at: number;
    updated_at: number;
};

export type User = {
    id: string;
    name?: string;
    email?: string;
};

export interface NottyAdapter {
    // Auth
    getSession(): Promise<User | null>;
    signIn(): Promise<User | null>;
    signOut(): Promise<void>;

    // Notes
    getNotes(): Promise<Note[]>;
    getNote(id: string): Promise<Note | null>;
    getNoteMeta(id: string, shareToken?: string): Promise<Partial<Note> | null>;
    saveNote(id: string, title: string, content: string, folderId?: string | null): void;
    deleteNote(id: string): Promise<void>;

    // Folders
    getFolders(): Promise<Folder[]>;
    saveFolder(folder: Partial<Folder> & { id: string; name: string }): Promise<void>;
    deleteFolder(id: string): Promise<void>;
    moveNoteToFolder(noteId: string, folderId: string | null): Promise<void>;
    setNoteSyncMode(noteId: string, mode: "cloud" | "local"): Promise<void>;

    // Sharing
    createShare(noteId: string, opts: { email?: string; permission?: string }): Promise<{ id: string; shareToken: string }>;
    listShares(noteId: string): Promise<Share[]>;
    deleteShare(id: string): Promise<void>;
    getSharedWithMe(): Promise<SharedNote[]>;

    // Locking
    lockNote(noteId: string): Promise<void>;
    unlockNote(noteId: string, lockToken: string): Promise<void>;
    verifyLock(noteId: string): Promise<{ lockToken: string }>;

    // History (git-style versioning)
    getNoteHistory(noteId: string): Promise<NoteVersion[]>;
    getVersion(noteId: string, versionId: string): Promise<NoteVersion | null>;
    restoreVersion(noteId: string, versionId: string): Promise<Note | null>;

    // Branches
    getBranches(noteId: string): Promise<NoteBranch[]>;
    createBranch(noteId: string, name: string): Promise<NoteBranch>;
    checkoutBranch(noteId: string, branchId: string): Promise<{ branch: string; content: string }>;
    deleteBranch(noteId: string, branchId: string): Promise<void>;
    getNoteTree(noteId: string): Promise<NoteTree>;

    // Publishing
    publishNote(noteId: string, published: boolean): Promise<void>;

    // Profile
    getProfile(): Promise<Profile>;
    updateProfile(data: Partial<Profile>): Promise<void>;

    // Realtime
    createProvider(noteId: string, doc: Y.Doc, opts?: { shareToken?: string }): NottyProvider;
}
