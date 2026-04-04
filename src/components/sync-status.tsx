export function SyncStatus({ syncMode, onToggle }: { syncMode: "cloud" | "local"; onToggle: () => void }) {
    const isCloud = syncMode === "cloud";

    return (
        <button
            onClick={onToggle}
            className="flex items-center gap-1.5 text-[12px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors px-2.5 py-1 rounded-lg hover:bg-[var(--color-sidebar-active)]"
            title={isCloud ? "Synced to cloud" : "Local only"}
        >
            <span className={`w-1.5 h-1.5 rounded-full ${isCloud ? "bg-emerald-500" : "bg-[var(--color-ink-muted)]/40"}`} />
            {isCloud ? "Synced" : "Local only"}
        </button>
    );
}
