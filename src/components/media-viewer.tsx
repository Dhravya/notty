import { useState, useRef, useCallback, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, Download, Globe, FileText } from "lucide-react";
import type { MediaItem } from "@/lib/adapter";

export function MediaViewer({
    items, initialIndex, getMediaUrl, onClose, onUpdateCaption, onTogglePublish,
}: {
    items: MediaItem[];
    initialIndex: number;
    getMediaUrl: (id: string) => string;
    onClose: () => void;
    onUpdateCaption: (id: string, caption: string) => void;
    onTogglePublish: (id: string, published: boolean) => void;
}) {
    const [index, setIndex] = useState(initialIndex);
    const [editingCaption, setEditingCaption] = useState(false);
    const [captionValue, setCaptionValue] = useState("");
    const [dismissY, setDismissY] = useState(0);
    const touchRef = useRef({ startX: 0, startY: 0, direction: null as "h" | "v" | null });
    const captionRef = useRef<HTMLTextAreaElement>(null);

    const item = items[index];
    const cancelledRef = useRef(false);

    // Close if index is out of bounds (e.g. item deleted while viewing)
    useEffect(() => {
        if (!items[index]) onClose();
    }, [index, items, onClose]);

    // Lock body scroll
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, []);

    // Keyboard nav
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (editingCaption) return;
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowLeft" && index > 0) setIndex(index - 1);
            if (e.key === "ArrowRight" && index < items.length - 1) setIndex(index + 1);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [index, items.length, editingCaption, onClose]);

    if (!item) return null;

    const url = getMediaUrl(item.id);
    const isPublished = !!item.published;

    const goTo = (i: number) => {
        if (i >= 0 && i < items.length) setIndex(i);
    };

    // Touch handling — lock direction on first significant movement
    const onTouchStart = useCallback((e: React.TouchEvent) => {
        const t = e.touches[0];
        touchRef.current = { startX: t.clientX, startY: t.clientY, direction: null };
    }, []);

    const onTouchMove = useCallback((e: React.TouchEvent) => {
        const t = e.touches[0];
        const dx = t.clientX - touchRef.current.startX;
        const dy = t.clientY - touchRef.current.startY;

        if (!touchRef.current.direction && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
            touchRef.current.direction = Math.abs(dy) > Math.abs(dx) ? "v" : "h";
        }

        if (touchRef.current.direction === "v" && dy > 0) {
            setDismissY(dy);
        }
    }, []);

    const onTouchEnd = useCallback((e: React.TouchEvent) => {
        const t = e.changedTouches[0];
        const dx = t.clientX - touchRef.current.startX;
        const direction = touchRef.current.direction;

        if (direction === "v" && dismissY > 150) {
            onClose();
            return;
        }
        setDismissY(0);

        if (direction === "h" && Math.abs(dx) > 50) {
            if (dx < 0 && index < items.length - 1) setIndex(index + 1);
            if (dx > 0 && index > 0) setIndex(index - 1);
        }

        touchRef.current.direction = null;
    }, [dismissY, index, items.length, onClose]);

    const startEditCaption = () => {
        setCaptionValue(item.caption || "");
        setEditingCaption(true);
        setTimeout(() => captionRef.current?.focus(), 50);
    };

    const saveCaption = () => {
        if (cancelledRef.current) { cancelledRef.current = false; return; }
        onUpdateCaption(item.id, captionValue);
        setEditingCaption(false);
    };

    const dismissOpacity = Math.max(0, 1 - dismissY / 300);

    return (
        <div
            className="fixed inset-0 z-[100] flex flex-col bg-black select-none"
            style={{
                transform: dismissY > 0 ? `translateY(${dismissY}px)` : undefined,
                opacity: dismissOpacity,
                transition: dismissY === 0 ? "transform 0.2s ease, opacity 0.2s ease" : "none",
            }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
        >
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 py-3 sm:px-6 bg-black/60 backdrop-blur-sm z-10 shrink-0">
                <button onClick={onClose} className="p-2.5 -m-2 rounded-full text-white/80 hover:text-white active:bg-white/10 min-w-[44px] min-h-[44px] flex items-center justify-center">
                    <X size={22} />
                </button>
                <span className="text-white/60 text-sm truncate mx-4 flex-1 text-center">
                    {item.filename}
                    <span className="text-white/30 ml-2">{index + 1}/{items.length}</span>
                </span>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => onTogglePublish(item.id, !isPublished)}
                        className={`p-2.5 -m-1 rounded-full min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors ${isPublished ? "text-emerald-400" : "text-white/40 hover:text-white/70"}`}
                        title={isPublished ? "Public" : "Private"}
                    >
                        <Globe size={18} />
                    </button>
                    <a
                        href={url} download={item.filename}
                        className="p-2.5 -m-1 rounded-full text-white/40 hover:text-white/70 min-w-[44px] min-h-[44px] flex items-center justify-center"
                    >
                        <Download size={18} />
                    </a>
                </div>
            </div>

            {/* Main content area */}
            <div className="flex-1 min-h-0 relative flex items-center justify-center overflow-hidden">
                {/* Prev/next tap zones (desktop) */}
                {index > 0 && (
                    <button onClick={() => goTo(index - 1)} className="hidden sm:flex absolute left-0 top-0 bottom-0 w-20 items-center justify-center z-10 text-white/0 hover:text-white/60 transition-colors">
                        <ChevronLeft size={32} />
                    </button>
                )}
                {index < items.length - 1 && (
                    <button onClick={() => goTo(index + 1)} className="hidden sm:flex absolute right-0 top-0 bottom-0 w-20 items-center justify-center z-10 text-white/0 hover:text-white/60 transition-colors">
                        <ChevronRight size={32} />
                    </button>
                )}

                <MediaContent item={item} url={url} />
            </div>

            {/* Bottom bar — caption + dots */}
            <div className="shrink-0 bg-black/60 backdrop-blur-sm px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
                {editingCaption ? (
                    <div className="max-w-lg mx-auto mb-3">
                        <textarea
                            ref={captionRef}
                            value={captionValue}
                            onChange={(e) => setCaptionValue(e.target.value)}
                            onBlur={saveCaption}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveCaption(); }
                                if (e.key === "Escape") { cancelledRef.current = true; setEditingCaption(false); }
                            }}
                            rows={2}
                            placeholder="Add a caption..."
                            className="w-full bg-white/10 text-white placeholder-white/30 rounded-xl px-4 py-3 text-sm resize-none outline-none focus:ring-1 focus:ring-white/30"
                        />
                    </div>
                ) : (
                    <button onClick={startEditCaption} className="block w-full max-w-lg mx-auto mb-3 text-left min-h-[44px] px-1 active:bg-white/5 rounded-lg">
                        <p className={`text-sm ${item.caption ? "text-white/80" : "text-white/30 italic"}`}>
                            {item.caption || "Tap to add a caption..."}
                        </p>
                    </button>
                )}

                {/* Navigation dots */}
                {items.length > 1 && items.length <= 20 && (
                    <div className="flex justify-center gap-1.5 pb-1">
                        {items.map((_, i) => (
                            <button key={i} onClick={() => setIndex(i)} className="p-1">
                                <div className={`rounded-full transition-all ${i === index ? "w-2 h-2 bg-white" : "w-1.5 h-1.5 bg-white/30"}`} />
                            </button>
                        ))}
                    </div>
                )}
                {items.length > 20 && (
                    <div className="text-center text-white/30 text-xs pb-1">
                        {index + 1} of {items.length}
                    </div>
                )}
            </div>
        </div>
    );
}

function MediaContent({ item, url }: { item: MediaItem; url: string }) {
    if (item.type === "image") {
        return (
            <img
                src={url}
                alt={item.caption || item.filename}
                className="max-w-full max-h-full object-contain"
                style={{ viewTransitionName: "media-hero" }}
                draggable={false}
            />
        );
    }

    if (item.type === "video") {
        return (
            <video
                key={item.id}
                src={url}
                controls
                autoPlay
                playsInline
                className="max-w-full max-h-full object-contain"
                style={{ viewTransitionName: "media-hero" }}
            />
        );
    }

    if (item.type === "pdf") {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-4">
                <div className="hidden sm:block w-full max-w-2xl h-full bg-white rounded-lg overflow-hidden">
                    <iframe
                        src={url}
                        className="w-full h-full border-0"
                        title={item.filename}
                    />
                </div>
                <div className="sm:hidden flex flex-col items-center gap-4">
                    <FileText size={48} className="text-white/40" />
                    <p className="text-white/60 text-sm">{item.filename}</p>
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-6 py-3 bg-white/10 text-white rounded-xl text-sm hover:bg-white/20 active:bg-white/15"
                    >
                        <FileText size={18} />
                        Open PDF
                    </a>
                </div>
            </div>
        );
    }

    return null;
}
