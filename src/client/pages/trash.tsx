import { useNotes } from "@/context/notes-context";
import { AppLayout } from "@/components/app-layout";
import { getNoteColor, extractPreview } from "@/components/note-card";
import { useIsDark } from "@/lib/dark-mode";

function formatDate(ts: number): string {
    const d = new Date(ts > 1e12 ? ts : ts * 1000);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function TrashPage() {
    const { trash, restoreNote, permanentlyDeleteNote, emptyTrash } = useNotes();
    const isDark = useIsDark();

    return (
        <AppLayout>
            <div className="max-w-4xl mx-auto px-8 py-10">
                <div className="flex items-end justify-between mb-8">
                    <div>
                        <h1 className="font-serif text-3xl tracking-tight text-[var(--color-ink)]">Trash</h1>
                        <p className="text-sm text-[var(--color-ink-muted)] mt-1">
                            {trash.length} {trash.length === 1 ? "note" : "notes"} in trash
                        </p>
                    </div>
                    {trash.length > 0 && (
                        <button
                            onClick={() => { if (confirm("Permanently delete all notes in trash?")) emptyTrash(); }}
                            className="px-4 py-1.5 text-sm font-medium rounded-lg border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 active:scale-[0.97] transition-all duration-150"
                        >
                            Empty trash
                        </button>
                    )}
                </div>

                {trash.length === 0 ? (
                    <div className="text-center py-24">
                        <svg className="mx-auto mb-4 text-[var(--color-ink-muted)]" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        <p className="font-serif italic text-xl text-[var(--color-ink-muted)]">Trash is empty</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {trash.map((note) => {
                            const color = getNoteColor(note.id, isDark);
                            const preview = extractPreview(note.content);
                            return (
                                <div
                                    key={note.id}
                                    className="flex items-center gap-4 px-4 py-3 rounded-xl border border-[var(--color-border-warm)] hover:bg-[var(--color-sidebar-active)]/40 transition-colors group"
                                >
                                    <div
                                        className="w-2 h-8 rounded-full shrink-0"
                                        style={{ backgroundColor: color.bg }}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-serif text-sm font-medium text-[var(--color-ink)] truncate">
                                            {note.title || "Untitled"}
                                        </p>
                                        {preview && (
                                            <p className="text-xs text-[var(--color-ink-muted)] truncate mt-0.5">{preview}</p>
                                        )}
                                        {note.deleted_at && (
                                            <p className="text-[11px] text-[var(--color-ink-muted)]/60 mt-0.5">
                                                Deleted {formatDate(note.deleted_at)}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => restoreNote(note.id)}
                                            className="px-3 py-1 text-xs font-medium rounded-lg border border-[var(--color-border-warm)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-sidebar-active)] transition-colors"
                                        >
                                            Restore
                                        </button>
                                        <button
                                            onClick={() => permanentlyDeleteNote(note.id)}
                                            className="px-3 py-1 text-xs font-medium rounded-lg border border-red-200 dark:border-red-900/50 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                        >
                                            Delete forever
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
