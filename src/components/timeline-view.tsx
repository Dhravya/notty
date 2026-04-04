import { Link } from "react-router";
import type { Note, Folder } from "@/lib/adapter";
import { getNoteColor, extractPreview } from "./note-card";
import { formatEntryDate, groupByDate } from "@/lib/date-utils";

export function TimelineView({
    notes, folders, onDelete, selectedIndex = -1, onSelect, isDark,
}: {
    notes: Note[];
    folders: Folder[];
    onDelete: (id: string) => void;
    selectedIndex?: number;
    onSelect?: (index: number) => void;
    isDark?: boolean;
}) {
    const dateGroups = groupByDate(notes);
    if (notes.length === 0) return null;

    const noteIndexMap = new Map(notes.map((n, i) => [n.id, i]));
    const folderMap = new Map(folders.map((f) => [f.id, f]));

    return (
        <div className="space-y-0">
            {[...dateGroups.entries()].map(([dateKey, groupNotes]) => {
                const { month, day } = formatEntryDate(groupNotes[0].created_at);
                return (
                    <div key={dateKey} className="flex gap-6">
                        <div className="w-16 shrink-0 text-right sticky top-0 self-start pt-6 z-10">
                            <div className="text-[11px] uppercase tracking-widest text-[var(--color-ink-muted)]">{month}</div>
                            <div className="font-serif text-2xl text-[var(--color-accent)]">{day}</div>
                        </div>
                        <div className="flex-1 space-y-3 py-4 border-l-2 border-[var(--color-border-warm)] pl-6">
                            {groupNotes.map((note) => {
                                const color = getNoteColor(note.id, isDark);
                                const { time } = formatEntryDate(note.created_at);
                                const preview = extractPreview(note.content);
                                const folder = folderMap.get(note.folder_id ?? "");
                                const flatIdx = noteIndexMap.get(note.id) ?? -1;
                                const isSelected = flatIdx === selectedIndex;

                                return (
                                    <Link key={note.id} to={`/note/${note.id}`} className="block group"
                                        data-note-index={flatIdx} onClick={() => onSelect?.(flatIdx)}>
                                        <div
                                            className={`rounded-l-md rounded-r-2xl p-5 transition-all duration-150 hover:bg-[var(--color-sidebar-active)] ${
                                                isSelected ? "ring-[3px] ring-[var(--color-accent)] bg-[var(--color-sidebar-active)] shadow-[0_0_0_1px_var(--color-accent),0_4px_20px_rgba(42,161,152,0.25)]" : ""
                                            }`}
                                            style={{ backgroundColor: isSelected ? undefined : `${color.bg}40` }}
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-xs text-[var(--color-ink-muted)]">{time}</span>
                                                {folder && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded"
                                                        style={{ backgroundColor: `${folder.color}20`, color: folder.color }}>
                                                        {folder.name}
                                                    </span>
                                                )}
                                                {note.sync_mode === "local" && (
                                                    <span className="text-[10px] text-[var(--color-ink-muted)] opacity-50">
                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="inline">
                                                            <rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" />
                                                        </svg>
                                                        {" "}Local
                                                    </span>
                                                )}
                                                <button
                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(note.id); }}
                                                    className="ml-auto p-1 rounded-lg opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity"
                                                    style={{ color: color.text }} aria-label="Delete note"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                    </svg>
                                                </button>
                                            </div>
                                            <h3 className="font-serif text-lg" style={{ color: color.text }}>{note.title || "Untitled"}</h3>
                                            {preview && <p className="text-sm text-[var(--color-ink-muted)] mt-1 line-clamp-2">{preview}</p>}
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
