import { useState, useEffect, useCallback, useRef } from "react";
import { Editor } from "@/components/editor";
import { useNotes, type Note } from "@/context/notes-context";
import { useAuth } from "@/context/auth-context";
import { ChevronLeft, ChevronRight, Plus, X, ExternalLink } from "lucide-react";

const QUICK_FOLDER = "__quick_notes__";

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke(cmd, args);
}

async function hideWindow() {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    getCurrentWindow().hide();
}


export function QuickNotePage() {
    // Sync theme from localStorage (separate webview may not inherit the class)
    useEffect(() => {
        const theme = localStorage.getItem("theme");
        if (theme === "dark") {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }
    }, []);

    const { createNote, saveNote } = useNotes();
    const { user } = useAuth();
    const [quickNotes, setQuickNotes] = useState<Note[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loaded, setLoaded] = useState(false);
    const quickNotesRef = useRef(quickNotes);
    quickNotesRef.current = quickNotes;
    const currentIndexRef = useRef(currentIndex);
    currentIndexRef.current = currentIndex;

    const loadQuickNotes = useCallback(async () => {
        const notes: Note[] = await tauriInvoke("get_quick_notes");
        setQuickNotes(notes);
        return notes;
    }, []);

    const addNewNote = useCallback(async () => {
        const id = crypto.randomUUID();
        createNote(id, QUICK_FOLDER);
        const newNote: Note = {
            id,
            title: "Untitled",
            content: "",
            folder_id: QUICK_FOLDER,
            created_at: Date.now() / 1000,
            updated_at: Date.now() / 1000,
        };
        setQuickNotes((prev) => [newNote, ...prev]);
        setCurrentIndex(0);
    }, [createNote]);

    useEffect(() => {
        loadQuickNotes().then((notes) => {
            if (notes.length === 0) addNewNote();
            setLoaded(true);
        });
    }, []);

    // Reload quick notes from DB when window regains focus (picks up saves from cycling)
    useEffect(() => {
        const onFocus = () => loadQuickNotes();
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, [loadQuickNotes]);

    const prev = useCallback(() => {
        setCurrentIndex((i) => (i > 0 ? i - 1 : quickNotesRef.current.length - 1));
    }, []);

    const next = useCallback(() => {
        setCurrentIndex((i) => (i < quickNotesRef.current.length - 1 ? i + 1 : 0));
    }, []);

    const openInMain = useCallback(async () => {
        const note = quickNotesRef.current[currentIndexRef.current];
        if (!note) return;
        await tauriInvoke("open_note_in_main", { noteId: note.id });
        hideWindow();
    }, []);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") { e.preventDefault(); hideWindow(); }
            if (e.metaKey && e.key === "[") { e.preventDefault(); prev(); }
            if (e.metaKey && e.key === "]") { e.preventDefault(); next(); }
            if (e.metaKey && e.key === "n") { e.preventDefault(); addNewNote(); }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [prev, next, addNewNote]);

    if (!loaded || !user) {
        return <div className="h-screen bg-[var(--color-paper)] flex items-center justify-center text-sm text-[var(--color-ink-muted)]">Loading...</div>;
    }

    const currentNote = quickNotes[currentIndex];

    return (
        <div className="h-screen flex flex-col bg-[var(--color-paper)] rounded-xl overflow-hidden">
            {/* Draggable title bar */}
            <div
                className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-warm)] select-none shrink-0"
                data-tauri-drag-region
            >
                <span className="text-xs text-[var(--color-ink-muted)] font-serif italic">
                    quick note
                </span>

                <div className="flex items-center gap-1">
                    {quickNotes.length > 1 && (
                        <>
                            <button onClick={prev} className="p-1 rounded hover:bg-[var(--color-border-warm)] transition-colors" title="Previous (Cmd+[)">
                                <ChevronLeft size={14} className="text-[var(--color-ink-muted)]" />
                            </button>
                            <span className="text-[10px] text-[var(--color-ink-muted)] tabular-nums min-w-[2rem] text-center">
                                {currentIndex + 1} / {quickNotes.length}
                            </span>
                            <button onClick={next} className="p-1 rounded hover:bg-[var(--color-border-warm)] transition-colors" title="Next (Cmd+])">
                                <ChevronRight size={14} className="text-[var(--color-ink-muted)]" />
                            </button>
                        </>
                    )}
                    <button onClick={addNewNote} className="p-1 rounded hover:bg-[var(--color-border-warm)] transition-colors" title="New quick note (Cmd+N)">
                        <Plus size={14} className="text-[var(--color-ink-muted)]" />
                    </button>
                    <button onClick={openInMain} className="p-1 rounded hover:bg-[var(--color-border-warm)] transition-colors" title="Open in main window">
                        <ExternalLink size={14} className="text-[var(--color-ink-muted)]" />
                    </button>
                    <button onClick={hideWindow} className="p-1 rounded hover:bg-[var(--color-border-warm)] transition-colors" title="Close (Esc)">
                        <X size={14} className="text-[var(--color-ink-muted)]" />
                    </button>
                </div>
            </div>

            {/* Editor */}
            <div className="flex-1 overflow-auto">
                {currentNote && (
                    <Editor
                        key={currentNote.id}
                        noteId={currentNote.id}
                        folderId={QUICK_FOLDER}
                        compact
                    />
                )}
            </div>
        </div>
    );
}
