import { useState } from "react";
import { Link } from "react-router";
import { Drawer } from "vaul";
import { useNotes } from "@/context/notes-context";
import { AuthSection } from "./auth-section";
import { extractPreview } from "./note-card";

export function MenuDrawer() {
    const { notes, deleteNote } = useNotes();
    const [open, setOpen] = useState(false);

    return (
        <Drawer.Root direction="right" open={open} onOpenChange={setOpen}>
            <Drawer.Trigger asChild>
                <button
                    className="p-2 rounded-lg text-[var(--color-ink-muted)] hover:bg-[var(--color-border-warm)]/50 transition-colors"
                    aria-label="Menu"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                </button>
            </Drawer.Trigger>
            <Drawer.Portal>
                <Drawer.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50" />
                <Drawer.Content className="fixed right-0 top-0 bottom-0 z-50 w-80 flex flex-col bg-[var(--color-paper)] border-l border-[var(--color-border-warm)]">
                    <div className="p-5 border-b border-[var(--color-border-warm)]">
                        <Drawer.Title className="font-serif text-xl italic text-[var(--color-ink)]">
                            All Notes
                        </Drawer.Title>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3">
                        {notes.length === 0 && (
                            <p className="text-sm text-center py-12 font-serif italic text-[var(--color-ink-muted)]">
                                No notes yet
                            </p>
                        )}
                        {notes.map((note) => (
                            <div key={note.id} className="group flex items-center gap-2 rounded-lg hover:bg-[var(--color-border-warm)]/40 transition-colors">
                                <Link to={`/note/${note.id}`} onClick={() => setOpen(false)} className="flex-1 p-3 min-w-0">
                                    <p className="font-serif text-sm truncate text-[var(--color-ink)]">{note.title || "Untitled"}</p>
                                    <p className="text-xs truncate mt-1 text-[var(--color-ink-muted)]">{extractPreview(note.content) || "Empty"}</p>
                                </Link>
                                <button
                                    onClick={() => deleteNote(note.id)}
                                    className="p-2 mr-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all text-[var(--color-ink-muted)] hover:text-red-500 hover:bg-red-500/10"
                                    aria-label="Delete"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>
                    <AuthSection />
                    <div className="p-3 text-center border-t border-[var(--color-border-warm)]">
                        <p className="text-xs text-[var(--color-ink-muted)]">Built with Notty</p>
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    );
}
