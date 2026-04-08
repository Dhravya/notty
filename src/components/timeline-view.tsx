import { Link } from "react-router";
import { FileText } from "lucide-react";
import type { Note, Folder, MediaItem } from "@/lib/adapter";
import { getNoteColor, extractPreview } from "./note-card";
import { formatEntryDate, groupByDate, clusterByMoment, formatTimeRange } from "@/lib/date-utils";

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
    items, folders, onDeleteNote, onDeleteMedia, onTogglePublishMedia, onOpenMedia, selectedIndex = -1, onSelect, isDark,
}: {
    items: TimelineItem[];
    folders: Folder[];
    onDeleteNote: (id: string) => void;
    onDeleteMedia: (id: string) => void;
    onTogglePublishMedia: (id: string, published: boolean) => void;
    onOpenMedia?: (mediaId: string) => void;
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

                // Cluster media items within this date group into moments
                const mediaOnly = groupItems.filter((i) => i.kind === "media") as (typeof groupItems[number] & { kind: "media"; data: MediaItem })[];
                const moments = clusterByMoment(mediaOnly.map(m => m.data), 30 * 60);
                const momentMap = new Map<string, MediaItem[]>();
                for (const cluster of moments) {
                    if (cluster.length >= 2) {
                        for (const m of cluster) momentMap.set(m.id, cluster);
                    }
                }
                const renderedMoments = new Set<string>();

                return (
                    <div key={dateKey} className="flex gap-4 sm:gap-6">
                        <div className="w-12 sm:w-16 shrink-0 text-right sticky top-0 self-start pt-6 z-10">
                            <div className="text-[10px] sm:text-[11px] uppercase tracking-widest text-[var(--color-ink-muted)]">{month}</div>
                            <div className="font-serif text-xl sm:text-2xl text-[var(--color-accent)]">{day}</div>
                        </div>
                        <div className="flex-1 space-y-3 py-4 border-l-2 border-[var(--color-border-warm)] pl-4 sm:pl-6">
                            {groupItems.map((item) => {
                                if (item.kind === "note") {
                                    const idx = flatIdx++;
                                    return <NoteTimelineEntry
                                        key={`n-${item.data.id}`} note={item.data} folder={folderMap.get(item.data.folder_id ?? "")}
                                        isSelected={idx === selectedIndex} flatIdx={idx} onSelect={onSelect} onDelete={onDeleteNote} isDark={isDark}
                                    />;
                                }

                                // Check if this media item is part of a moment cluster
                                const cluster = momentMap.get(item.data.id);
                                if (cluster && cluster.length >= 2) {
                                    const momentKey = cluster.map(m => m.id).join(",");
                                    if (renderedMoments.has(momentKey)) return null;
                                    renderedMoments.add(momentKey);
                                    const idx = flatIdx++;

                                    return <MomentCluster
                                        key={`moment-${cluster[0].id}`}
                                        items={cluster}
                                        getUrl={(id) => {
                                            const mi = items.find(i => i.kind === "media" && i.data.id === id);
                                            return mi?.kind === "media" ? mi.url : "";
                                        }}
                                        onOpen={(id) => onOpenMedia?.(id)}
                                        onDelete={onDeleteMedia}
                                        onTogglePublish={onTogglePublishMedia}
                                        isDark={isDark}
                                    />;
                                }

                                const idx = flatIdx++;
                                return <MediaTimelineEntry
                                    key={`m-${item.data.id}`} item={item.data} url={item.url}
                                    isSelected={idx === selectedIndex} flatIdx={idx} onSelect={onSelect}
                                    onDelete={onDeleteMedia} onTogglePublish={onTogglePublishMedia}
                                    onOpen={() => onOpenMedia?.(item.data.id)}
                                    isDark={isDark}
                                />;
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function MomentCluster({ items, getUrl, onOpen, onDelete, onTogglePublish, isDark }: {
    items: MediaItem[];
    getUrl: (id: string) => string;
    onOpen: (id: string) => void;
    onDelete: (id: string) => void;
    onTogglePublish: (id: string, published: boolean) => void;
    isDark?: boolean;
}) {
    const timeRange = formatTimeRange(
        items[0].created_at,
        items[items.length - 1].created_at
    );

    return (
        <div className="rounded-2xl border border-[var(--color-border-warm)] overflow-hidden bg-[var(--color-card)]/50">
            <div className="px-4 sm:px-5 pt-3 pb-2 flex items-center gap-2">
                <span className="text-xs text-[var(--color-ink-muted)]">{timeRange}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-sidebar-active)] text-[var(--color-ink-muted)]">
                    {items.length} items
                </span>
            </div>
            <div className="flex gap-1.5 px-4 sm:px-5 pb-4 overflow-x-auto scrollbar-hide">
                {items.map((item) => {
                    const url = getUrl(item.id);
                    return (
                        <button
                            key={item.id}
                            data-media-id={item.id}
                            onClick={() => onOpen(item.id)}
                            className="shrink-0 w-24 h-24 sm:w-32 sm:h-32 rounded-xl overflow-hidden relative group/thumb"
                        >
                            {item.type === "image" ? (
                                <img src={url} alt={item.caption || item.filename} className="w-full h-full object-cover" loading="lazy" />
                            ) : item.type === "video" ? (
                                <div className="w-full h-full bg-black/10 flex items-center justify-center">
                                    <video src={url} className="w-full h-full object-cover" muted preload="metadata" />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21" /></svg>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="w-full h-full bg-[var(--color-sidebar)] flex items-center justify-center">
                                    <FileText size={24} className="text-[var(--color-ink-muted)]" />
                                </div>
                            )}
                            {item.caption && (
                                <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1">
                                    <p className="text-[10px] text-white truncate">{item.caption}</p>
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
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
        <Link to={`/note/${note.id}`} viewTransition className="block group" data-note-index={flatIdx} onClick={() => onSelect?.(flatIdx)}>
            <div
                className={`rounded-l-md rounded-r-2xl p-4 sm:p-5 transition-all duration-150 hover:bg-[var(--color-sidebar-active)] ${
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
                        className="ml-auto p-2 rounded-lg opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity min-w-[44px] min-h-[44px] flex items-center justify-center -m-1"
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

function MediaTimelineEntry({ item, url, isSelected, flatIdx, onSelect, onDelete, onTogglePublish, onOpen, isDark }: {
    item: MediaItem; url: string; isSelected: boolean; flatIdx: number;
    onSelect?: (i: number) => void; onDelete: (id: string) => void;
    onTogglePublish: (id: string, published: boolean) => void;
    onOpen?: () => void; isDark?: boolean;
}) {
    const color = getNoteColor(item.id, isDark);
    const { time } = formatEntryDate(item.created_at);
    const isPublished = !!item.published;
    const typeLabel = item.type === "image" ? "Image" : item.type === "video" ? "Video" : "PDF";

    return (
        <div className="block group" data-note-index={flatIdx} data-media-id={item.id} onClick={() => onSelect?.(flatIdx)}>
            <div
                className={`rounded-l-md rounded-r-2xl overflow-hidden transition-all duration-150 hover:bg-[var(--color-sidebar-active)] ${
                    isSelected ? "ring-[3px] ring-[var(--color-accent)] bg-[var(--color-sidebar-active)] shadow-[0_0_0_1px_var(--color-accent),0_4px_20px_rgba(42,161,152,0.25)]" : ""
                }`}
                style={{ backgroundColor: isSelected ? undefined : `${color.bg}40` }}
            >
                <div className="flex items-center gap-2 px-4 sm:px-5 pt-4 pb-2">
                    <span className="text-xs text-[var(--color-ink-muted)]">{time}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-sidebar-active)] text-[var(--color-ink-muted)]">
                        {typeLabel}
                    </span>
                    {isPublished && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1" style={{ backgroundColor: "#10B98118", color: "#047857" }}>
                            Public
                        </span>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                        <button
                            onClick={(e) => { e.stopPropagation(); onTogglePublish(item.id, !isPublished); }}
                            className={`p-2 rounded-lg transition-opacity min-w-[44px] min-h-[44px] flex items-center justify-center -m-1 ${isPublished ? "opacity-80" : "opacity-0 group-hover:opacity-50 hover:!opacity-100"}`}
                            style={{ color: isPublished ? "#047857" : color.text }}
                            title={isPublished ? "Make private" : "Make public"}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                            </svg>
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                            className="p-2 rounded-lg opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity min-w-[44px] min-h-[44px] flex items-center justify-center -m-1"
                            style={{ color: color.text }} aria-label="Delete"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                        </button>
                    </div>
                </div>

                <button onClick={onOpen} className="w-full text-left cursor-pointer">
                    {item.type === "image" ? (
                        <div className="px-4 sm:px-5 pb-2">
                            <img src={url} alt={item.caption || item.filename} className="w-full max-h-64 object-cover rounded-lg" loading="lazy" />
                        </div>
                    ) : item.type === "video" ? (
                        <div className="px-4 sm:px-5 pb-2">
                            <video src={url} className="w-full max-h-64 object-cover rounded-lg" controls preload="metadata" playsInline />
                        </div>
                    ) : (
                        <div className="px-4 sm:px-5 pb-2">
                            <div className="w-full h-32 rounded-lg bg-[var(--color-sidebar)] flex items-center justify-center gap-3">
                                <FileText size={28} className="text-[var(--color-ink-muted)]" />
                                <span className="text-sm text-[var(--color-ink-muted)]">PDF Document</span>
                            </div>
                        </div>
                    )}
                </button>

                <div className="px-4 sm:px-5 pb-3">
                    {item.caption ? (
                        <p className="text-[12px] text-[var(--color-ink)] mb-1">{item.caption}</p>
                    ) : null}
                    <span className="text-[11px] text-[var(--color-ink-muted)] opacity-50">{item.filename}</span>
                </div>
            </div>
        </div>
    );
}
