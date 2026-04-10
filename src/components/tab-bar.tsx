import { useTabs } from "@/context/tabs-context";
import { X } from "lucide-react";

export function TabBar() {
    const { tabs, activeTabId, switchTab, closeTab } = useTabs();

    if (tabs.length <= 1) {
        return (
            <div className="h-10 w-full shrink-0" data-tauri-drag-region />
        );
    }

    return (
        <div
            className="h-10 w-full shrink-0 flex items-end gap-0 px-2 border-b border-[var(--color-border-warm)]/30"
            data-tauri-drag-region
        >
            {tabs.map(tab => {
                const isActive = tab.id === activeTabId;
                return (
                    <button
                        key={tab.id}
                        onClick={() => switchTab(tab.id)}
                        onMouseDown={(e) => {
                            if (e.button === 1 && tab.id !== "home") {
                                e.preventDefault();
                                closeTab(tab.id);
                            }
                        }}
                        className={`group relative flex items-center gap-1.5 px-3 h-8 max-w-[180px] text-[12px] rounded-t-lg transition-colors shrink-0 ${
                            isActive
                                ? "bg-[var(--color-paper)] text-[var(--color-ink)] font-medium"
                                : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-paper)]/50"
                        }`}
                    >
                        <span className="truncate">{tab.title}</span>
                        {tab.id !== "home" && (
                            <span
                                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                                className="shrink-0 w-4 h-4 flex items-center justify-center rounded-sm opacity-0 group-hover:opacity-100 hover:bg-[var(--color-border-warm)] transition-all"
                            >
                                <X size={10} />
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
