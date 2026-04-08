import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { useAdapter } from "./adapter-context";
import { useAuth } from "./auth-context";
import { toast } from "sonner";
import type { Note } from "@/lib/adapter";

export type { Note };

type PendingDelete = {
    note: Note;
    timer: ReturnType<typeof setTimeout>;
};

type NotesContextType = {
    notes: Note[];
    trash: Note[];
    loading: boolean;
    createNote: (id: string) => Promise<Note>;
    deleteNote: (id: string) => Promise<void>;
    restoreNote: (id: string) => Promise<void>;
    permanentlyDeleteNote: (id: string) => Promise<void>;
    emptyTrash: () => Promise<void>;
    updateNote: (id: string, data: Partial<Pick<Note, "title" | "content">>) => void;
    patchNote: (id: string, data: Partial<Note>) => void;
    saveNote: (id: string, title: string, content: string, folderId?: string | null) => void;
    moveNoteToFolder: (noteId: string, folderId: string | null) => void;
    setNoteSyncMode: (noteId: string, mode: "cloud" | "local") => void;
    revalidate: () => Promise<void>;
};

const NotesContext = createContext<NotesContextType | null>(null);

const UNDO_DELAY_MS = 5000;

function sortByUpdated(notes: Note[]): Note[] {
    return notes.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
}

export function NotesProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const adapter = useAdapter();
    const [notes, setNotes] = useState<Note[]>([]);
    const [trash, setTrash] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const localEditsRef = useRef<Map<string, Note>>(new Map());
    const pendingDeleteRef = useRef<Map<string, PendingDelete>>(new Map());

    const fetchNotes = useCallback(async () => {
        try {
            const [serverNotes, trashNotes] = await Promise.all([
                adapter.getNotes(),
                adapter.getTrash(),
            ]);
            setNotes((prev) => {
                const merged = new Map<string, Note>();
                for (const n of serverNotes) merged.set(n.id, n);
                for (const [id, local] of localEditsRef.current) {
                    const server = merged.get(id);
                    if (!server || local.updated_at > (server.updated_at || 0)) {
                        merged.set(id, local);
                    } else {
                        localEditsRef.current.delete(id);
                    }
                }
                for (const id of pendingDeleteRef.current.keys()) {
                    merged.delete(id);
                }
                return sortByUpdated(Array.from(merged.values()));
            });
            setTrash(trashNotes);
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

    const deleteNote = useCallback(async (id: string) => {
        const note = notes.find((n) => n.id === id) ?? localEditsRef.current.get(id);
        localEditsRef.current.delete(id);
        setNotes((prev) => prev.filter((n) => n.id !== id));

        if (!note) {
            await adapter.deleteNote(id);
            return;
        }

        const existing = pendingDeleteRef.current.get(id);
        if (existing) clearTimeout(existing.timer);

        const timer = setTimeout(async () => {
            pendingDeleteRef.current.delete(id);
            await adapter.deleteNote(id);
            adapter.getTrash().then(setTrash).catch(() => {});
        }, UNDO_DELAY_MS);
        pendingDeleteRef.current.set(id, { note, timer });

        toast(`"${note.title || "Untitled"}" moved to trash`, {
            action: {
                label: "Undo",
                onClick: () => {
                    const pending = pendingDeleteRef.current.get(id);
                    if (!pending) return;
                    clearTimeout(pending.timer);
                    pendingDeleteRef.current.delete(id);
                    localEditsRef.current.set(id, pending.note);
                    setNotes((prev) => sortByUpdated([pending.note, ...prev]));
                },
            },
            duration: UNDO_DELAY_MS,
        });
    }, [notes, adapter]);

    // Cmd+Z / Ctrl+Z to undo last delete
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "z" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
                const tag = (e.target as HTMLElement)?.tagName;
                if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;

                const entries = Array.from(pendingDeleteRef.current.entries());
                if (entries.length === 0) return;

                e.preventDefault();
                const [lastId] = entries[entries.length - 1];
                const pending = pendingDeleteRef.current.get(lastId);
                if (!pending) return;
                clearTimeout(pending.timer);
                pendingDeleteRef.current.delete(lastId);
                localEditsRef.current.set(lastId, pending.note);
                setNotes((prev) => sortByUpdated([pending.note, ...prev]));
                toast.dismiss();
                toast("Note restored");
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, []);

    useEffect(() => {
        return () => {
            for (const [id, { timer }] of pendingDeleteRef.current) {
                clearTimeout(timer);
                adapter.deleteNote(id);
            }
            pendingDeleteRef.current.clear();
        };
    }, [adapter]);

    const restoreNote = useCallback(async (id: string) => {
        const restored = await adapter.restoreNote(id);
        if (restored) {
            setNotes((prev) => sortByUpdated([restored, ...prev]));
        }
        setTrash((prev) => prev.filter((n) => n.id !== id));
    }, [adapter]);

    const permanentlyDeleteNote = useCallback(async (id: string) => {
        await adapter.permanentlyDeleteNote(id);
        setTrash((prev) => prev.filter((n) => n.id !== id));
    }, [adapter]);

    const emptyTrash = useCallback(async () => {
        await Promise.all(trash.map((n) => adapter.permanentlyDeleteNote(n.id)));
        setTrash([]);
    }, [adapter, trash]);

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
        <NotesContext.Provider value={{
            notes, trash, loading, createNote, deleteNote, restoreNote, permanentlyDeleteNote, emptyTrash,
            updateNote, patchNote, saveNote, moveNoteToFolder, setNoteSyncMode, revalidate: fetchNotes,
        }}>
            {children}
        </NotesContext.Provider>
    );
}

export function useNotes() {
    const ctx = useContext(NotesContext);
    if (!ctx) throw new Error("useNotes must be used within NotesProvider");
    return ctx;
}
