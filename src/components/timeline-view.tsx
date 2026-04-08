import { Link } from "react-router";
import type { Note, Folder, MediaItem } from "@/lib/adapter";
import { getNoteColor, extractPreview } from "./note-card";
import { formatEntryDate, groupByDate } from "@/lib/date-utils";

export type TimelineItem =
    | { kind: "note"; data: Note }
    | { kind: "media"; data: MediaItem; url: string };

export function mergeTimeline(notes: Note[], media: MediaItem[], getMediaUrl: (id: string) => string): TimelineItem[] {
    const items: TimelineItem[] = [
        ...notes.map((n) => ({ kind: "note" as const, data: n })),
        ...media.map((m) => ({ kind: "media" as const, data: m, url: getMediaUrl(m.id) })),
    ];
    items.sort((a, b) => (b.data.created_at || 0) - (a.data.created_at || 0));
    return items;
}

export function TimelineView({
    items, folders, onDeleteNote, onDeleteMedia, onTogglePublishMedia, selectedIndex = -1, onSelect, isDark,
}: {
    items: TimelineItem[];
    folders: Folder[];
    onDeleteNote: (id: string) => void;
    onDeleteMedia: (id: string) => void;
    onTogglePublishMedia: (id: string, published: boolean) => void;
    selectedIndex?: number;
    onSelect?: (index: number) => void;
    isDark?: boolean;
}) {
    const withCreatedAt = items.map((item) => ({ ...item, created_at: item.data.created_at }));
    const dateGroups = groupByDate(withCreatedAt);
    if (items.length === 0) return null;

    const folderMap = new Map(folders.map((f) => [f.id, f]));

    let flatIdx = 0;

    return (
        <div className="space-y-0">
            {[...dateGroups.entries()].map(([dateKey, groupItems]) => {
                const { month, day } = formatEntryDate(groupItems[0].created_at);
                return (
                    <div key={dateKey} className="flex gap-6">
                        <div className="w-16 shrink-0 text-right sticky top-0 self-start pt-6 z-10">
                            <div className="text-[11px] uppercase tracking-widest text-[var(--color-ink-muted)]">{month}</div>
                            <div className="font-serif text-2xl text-[var(--color-accent)]">{day}</div>
                        </div>
                        <div className="flex-1 space-y-3 py-4 border-l-2 border-[var(--color-border-warm)] pl-6">
                            {groupItems.map((item) => {
                                const idx = flatIdx++;
                                const isSelected = idx === selectedIndex;

                                if (item.kind === "note") {
                                    return <NoteTimelineEntry
                                        key={`n-${item.data.id}`} note={item.data} folder={folderMap.get(item.data.folder_id ?? "")}
                                        isSelected={isSelected} flatIdx={idx} onSelect={onSelect} onDelete={onDeleteNote} isDark={isDark}
                                    />;
                                }

                                return <MediaTimelineEntry
                                    key={`m-${item.data.id}`} item={item.data} url={item.url}
                                    isSelected={isSelected} flatIdx={idx} onSelect={onSelect}
                                    onDelete={onDeleteMedia} onTogglePublish={onTogglePublishMedia} isDark={isDark}
                                />;
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function NoteTimelineEntry({ note, folder, isSelected, flatIdx, onSelect, onDelete, isDark }: {
    note: Note; folder?: Folder; isSelected: boolean; flatIdx: number;
    onSelect?: (i: number) => void; onDelete: (id: string) => void; isDark?: boolean;
}) {
    const color = getNoteColor(note.id, isDark);
    const { time } = formatEntryDate(note.created_at);
    const preview = extractPreview(note.content);

    return (
        <Link to={`/note/${note.id}`} className="block group" data-note-index={flatIdx} onClick={() => onSelect?.(flatIdx)}>
            <div
                className={`rounded-l-md rounded-r-2xl p-5 transition-all duration-150 hover:bg-[var(--color-sidebar-active)] ${
                    isSelected ? "ring-[3px] ring-[var(--color-accent)] bg-[var(--color-sidebar-active)] shadow-[0_0_0_1px_var(--color-accent),0_4px_20px_rgba(42,161,152,0.25)]" : ""
                }`}
                style={{ backgroundColor: isSelected ? undefined : `${color.bg}40` }}
            >
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-[var(--color-ink-muted)]">{time}</span>
                    {folder && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${folder.color}20`, color: folder.color }}>
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
}

function MediaTimelineEntry({ item, url, isSelected, flatIdx, onSelect, onDelete, onTogglePublish, isDark }: {
    item: MediaItem; url: string; isSelected: boolean; flatIdx: number;
    onSelect?: (i: number) => void; onDelete: (id: string) => void;
    onTogglePublish: (id: string, published: boolean) => void; isDark?: boolean;
}) {
    const color = getNoteColor(item.id, isDark);
    const { time } = formatEntryDate(item.created_at);
    const isPublished = !!item.published;

    return (
        <div className="block group" data-note-index={flatIdx} onClick={() => onSelect?.(flatIdx)}>
            <div
                className={`rounded-l-md rounded-r-2xl overflow-hidden transition-all duration-150 hover:bg-[var(--color-sidebar-active)] ${
                    isSelected ? "ring-[3px] ring-[var(--color-accent)] bg-[var(--color-sidebar-active)] shadow-[0_0_0_1px_var(--color-accent),0_4px_20px_rgba(42,161,152,0.25)]" : ""
                }`}
                style={{ backgroundColor: isSelected ? undefined : `${color.bg}40` }}
            >
                <div className="flex items-center gap-2 px-5 pt-4 pb-2">
                    <span className="text-xs text-[var(--color-ink-muted)]">{time}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-sidebar-active)] text-[var(--color-ink-muted)]">
                        {item.type === "image" ? "Image" : "Video"}
                    </span>
                    {isPublished && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1" style={{ backgroundColor: "#10B98118", color: "#047857" }}>
                            Public
                        </span>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                        <button
                            onClick={(e) => { e.stopPropagation(); onTogglePublish(item.id, !isPublished); }}
                            className={`p-1 rounded-lg transition-opacity ${isPublished ? "opacity-80" : "opacity-0 group-hover:opacity-50 hover:!opacity-100"}`}
                            style={{ color: isPublished ? "#047857" : color.text }}
                            title={isPublished ? "Make private" : "Make public"}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                            </svg>
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                            className="p-1 rounded-lg opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity"
                            style={{ color: color.text }} aria-label="Delete"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                        </button>
                    </div>
                </div>

                {item.type === "image" ? (
                    <div className="px-5 pb-4">
                        <img src={url} alt={item.filename} className="w-full max-h-64 object-cover rounded-lg" loading="lazy" />
                    </div>
                ) : (
                    <div className="px-5 pb-4">
                        <video src={url} className="w-full max-h-64 object-cover rounded-lg" controls preload="metadata" />
                    </div>
                )}

                <div className="px-5 pb-3">
                    <span className="text-[11px] text-[var(--color-ink-muted)] opacity-50">{item.filename}</span>
                </div>
            </div>
        </div>
    );
}
