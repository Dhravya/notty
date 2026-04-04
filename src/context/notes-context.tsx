import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { useAdapter } from "./adapter-context";
import { useAuth } from "./auth-context";
import type { Note } from "@/lib/adapter";

export type { Note };

type NotesContextType = {
    notes: Note[];
    loading: boolean;
    createNote: (id: string) => Promise<Note>;
    deleteNote: (id: string) => Promise<void>;
    updateNote: (id: string, data: Partial<Pick<Note, "title" | "content">>) => void;
    patchNote: (id: string, data: Partial<Note>) => void;
    saveNote: (id: string, title: string, content: string, folderId?: string | null) => void;
    moveNoteToFolder: (noteId: string, folderId: string | null) => void;
    setNoteSyncMode: (noteId: string, mode: "cloud" | "local") => void;
    revalidate: () => Promise<void>;
};

const NotesContext = createContext<NotesContextType | null>(null);

export function NotesProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const adapter = useAdapter();
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    // Track locally-modified notes that may not be on the server yet
    const localEditsRef = useRef<Map<string, Note>>(new Map());

    const fetchNotes = useCallback(async () => {
        try {
            const serverNotes = await adapter.getNotes();
            setNotes((prev) => {
                // Merge: server data + any local edits not yet on server
                const merged = new Map<string, Note>();
                for (const n of serverNotes) merged.set(n.id, n);
                // Overlay local edits (newer than server)
                for (const [id, local] of localEditsRef.current) {
                    const server = merged.get(id);
                    if (!server || local.updated_at > (server.updated_at || 0)) {
                        merged.set(id, local);
                    } else {
                        // Server caught up, remove from local edits
                        localEditsRef.current.delete(id);
                    }
                }
                return Array.from(merged.values()).sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
            });
        } catch (e) {
            console.error("Failed to fetch notes:", e);
        } finally {
            setLoading(false);
        }
    }, [adapter]);

    useEffect(() => {
        if (!user) return;
        fetchNotes();
    }, [user, fetchNotes]);

    const saveNote = useCallback((id: string, title: string, content: string, folderId?: string | null) => {
        const now = Date.now();
        const note: Note = { id, title, content, folder_id: folderId, created_at: now, updated_at: now };

        localEditsRef.current.set(id, note);

        setNotes((prev) => {
            const exists = prev.find((n) => n.id === id);
            if (exists) {
                const updated = { ...exists, title, content, updated_at: now, ...(folderId !== undefined ? { folder_id: folderId } : {}) };
                localEditsRef.current.set(id, updated);
                return prev.map((n) => (n.id === id ? updated : n));
            }
            return [note, ...prev];
        });

        adapter.saveNote(id, title, content, folderId);
    }, [adapter]);

    const createNote = useCallback(async (id: string): Promise<Note> => {
        const note: Note = { id, title: "Untitled", content: "", created_at: Date.now(), updated_at: Date.now() };
        localEditsRef.current.set(id, note);
        setNotes((prev) => [note, ...prev]);
        adapter.saveNote(id, "Untitled", "");
        return note;
    }, [adapter]);

    const deleteNote = useCallback(async (id: string) => {
        localEditsRef.current.delete(id);
        setNotes((prev) => prev.filter((n) => n.id !== id));
        await adapter.deleteNote(id);
    }, [adapter]);

    const updateNote = useCallback((id: string, data: Partial<Pick<Note, "title" | "content">>) => {
        setNotes((prev) =>
            prev.map((n) => (n.id === id ? { ...n, ...data, updated_at: Date.now() } : n))
        );
    }, []);

    const patchNote = useCallback((id: string, data: Partial<Note>) => {
        localEditsRef.current.delete(id);
        setNotes((prev) =>
            prev.map((n) => (n.id === id ? { ...n, ...data } : n))
        );
    }, []);

    const moveNoteToFolder = useCallback((noteId: string, folderId: string | null) => {
        setNotes((prev) =>
            prev.map((n) => (n.id === noteId ? { ...n, folder_id: folderId, updated_at: Date.now() } : n))
        );
        adapter.moveNoteToFolder(noteId, folderId).catch(console.error);
    }, [adapter]);

    const setNoteSyncMode = useCallback((noteId: string, mode: "cloud" | "local") => {
        setNotes((prev) =>
            prev.map((n) => (n.id === noteId ? { ...n, sync_mode: mode, updated_at: Date.now() } : n))
        );
        adapter.setNoteSyncMode(noteId, mode).catch(console.error);
    }, [adapter]);

    return (
        <NotesContext.Provider value={{ notes, loading, createNote, deleteNote, updateNote, patchNote, saveNote, moveNoteToFolder, setNoteSyncMode, revalidate: fetchNotes }}>
            {children}
        </NotesContext.Provider>
    );
}

export function useNotes() {
    const ctx = useContext(NotesContext);
    if (!ctx) throw new Error("useNotes must be used within NotesProvider");
    return ctx;
}
