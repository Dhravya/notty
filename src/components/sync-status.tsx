import { useOnlineStatus } from "@/lib/online-status";
import { isTauri } from "@/lib/platform";

type SaveState = "idle" | "saving" | "saved" | "offline-saved";

export function SaveIndicator({ saveState }: { saveState: SaveState }) {
    const online = useOnlineStatus();

    if (saveState === "idle") return null;

    // Determine what to show
    let dotColor: string;
    let label: string;
    let sublabel: string | null = null;

    if (!online && !isTauri) {
        dotColor = "bg-amber-500";
        label = saveState === "saving" ? "Saving locally…" : "Saved offline";
        sublabel = "Will sync when online";
    } else if (isTauri) {
        dotColor = saveState === "saving" ? "bg-amber-500" : "bg-emerald-500";
        label = saveState === "saving" ? "Saving…" : "Saved";
    } else {
        dotColor = saveState === "saving" ? "bg-amber-500" : "bg-emerald-500";
        label = saveState === "saving" ? "Saving…" : "Saved";
    }

    return (
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-ink-muted)] transition-opacity duration-300">
            <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${saveState === "saving" ? "animate-pulse" : ""}`} />
            <span>{label}</span>
            {sublabel && (
                <span className="opacity-60">· {sublabel}</span>
            )}
        </div>
    );
}

export function OfflineBanner() {
    const online = useOnlineStatus();

    if (online || isTauri) return null;

    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--color-card)] border border-[var(--color-border-warm)] shadow-lg text-[12px] text-[var(--color-ink-muted)] animate-in-up">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span>You're offline — notes are saved locally and will sync when you reconnect</span>
        </div>
    );
}

export function StorageBadge({ syncMode }: { syncMode?: "cloud" | "local" }) {
    const online = useOnlineStatus();

    if (!online && !isTauri) {
        return (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
                </svg>
                Offline
            </span>
        );
    }

    if (syncMode === "local") {
        return (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-sidebar-active)] text-[var(--color-ink-muted)]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" />
                </svg>
                Local
            </span>
        );
    }

    return null;
}
