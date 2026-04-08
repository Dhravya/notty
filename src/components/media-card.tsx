import type { MediaItem } from "@/lib/adapter";
import { getNoteColor } from "./note-card";

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDate(ts: number): string {
    const d = new Date(ts > 1e12 ? ts : ts * 1000);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function MediaCard({
    item, mediaUrl, onDelete, onTogglePublish, isDark,
}: {
    item: MediaItem;
    mediaUrl: string;
    onDelete: (id: string) => void;
    onTogglePublish: (id: string, published: boolean) => void;
    isDark?: boolean;
}) {
    const color = getNoteColor(item.id, isDark);
    const isPublished = !!item.published;

    return (
        <div className="block group">
            <div
                className="rounded-l-md rounded-r-2xl overflow-hidden hover:-translate-y-1 hover:shadow-xl transition-all duration-200 min-h-[180px] flex flex-col shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                style={{ backgroundColor: color.bg }}
            >
                {item.type === "image" ? (
                    <div className="relative w-full aspect-[4/3] overflow-hidden bg-black/5">
                        <img
                            src={mediaUrl}
                            alt={item.filename}
                            className="w-full h-full object-cover"
                            loading="lazy"
                        />
                    </div>
                ) : (
                    <div className="relative w-full aspect-[4/3] overflow-hidden bg-black/10">
                        <video
                            src={mediaUrl}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                            preload="metadata"
                            onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
                            onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center group-hover:opacity-0 transition-opacity">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21" /></svg>
                            </div>
                        </div>
                    </div>
                )}

                <div className="px-4 py-3 flex items-center justify-between mt-auto">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[11px] truncate" style={{ color: color.text, opacity: 0.6 }}>
                            {item.filename}
                        </span>
                        <span className="text-[10px] shrink-0" style={{ color: color.text, opacity: 0.3 }}>
                            {formatSize(item.size)}
                        </span>
                        <span className="text-[11px] shrink-0" style={{ color: color.text, opacity: 0.3 }}>
                            {formatDate(item.created_at)}
                        </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <button
                            onClick={() => onTogglePublish(item.id, !isPublished)}
                            className={`p-1 rounded-lg transition-all duration-200 ${
                                isPublished ? "opacity-80" : "opacity-0 group-hover:opacity-50 hover:!opacity-100"
                            }`}
                            style={{ color: isPublished ? "#047857" : color.text }}
                            aria-label={isPublished ? "Make private" : "Make public"}
                            title={isPublished ? "Public — click to make private" : "Private — click to make public"}
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                            </svg>
                        </button>
                        <button
                            onClick={() => onDelete(item.id)}
                            className="p-1 rounded-lg opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-all duration-200"
                            style={{ color: color.text }}
                            aria-label="Delete"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
