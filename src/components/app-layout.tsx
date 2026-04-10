import { useState, type ReactNode, type CSSProperties } from "react";
import { Sidebar } from "./sidebar";
import { TabBar } from "./tab-bar";
import { CommandPalette } from "./command-palette";
import { ShortcutsHelp } from "./shortcuts-help";
import { useFolders } from "@/context/folders-context";
import { useHotkeys } from "@/lib/hotkeys";
import { toggleDarkMode } from "@/lib/dark-mode";
import { isTauri } from "@/lib/platform";

export function AppLayout({ children }: { children: ReactNode }) {
    const { folders, selectedFolderId } = useFolders();
    const folder = folders.find((f) => f.id === selectedFolderId);
    const [sidebarVisible, setSidebarVisible] = useState(() => window.innerWidth >= 768);

    useHotkeys([
        { key: "mod+\\", handler: () => setSidebarVisible((v) => !v), allowInInput: true },
        { key: "mod+d", handler: toggleDarkMode, allowInInput: true },
    ]);

    const style: CSSProperties | undefined = folder?.color
        ? {
              "--folder-tint": `color-mix(in srgb, ${folder.color} 8%, var(--color-paper))`,
              "--folder-tint-sidebar": `color-mix(in srgb, ${folder.color} 6%, var(--color-sidebar))`,
              "--folder-tint-active": `color-mix(in srgb, ${folder.color} 12%, var(--color-sidebar-active))`,
          } as CSSProperties
        : undefined;

    return (
        <div className="flex h-screen overflow-hidden transition-colors duration-300" style={style}>
            {/* Sidebar — fixed overlay on mobile, static on desktop */}
            {sidebarVisible && (
                <>
                    <div className="md:hidden fixed inset-0 z-40 bg-black/30" onClick={() => setSidebarVisible(false)} />
                    <div className="fixed md:static z-50 md:z-auto h-screen">
                        <Sidebar />
                    </div>
                </>
            )}
            <main
                className="flex-1 overflow-y-auto transition-colors duration-300 min-w-0"
                style={{ backgroundColor: folder?.color ? "var(--folder-tint)" : "var(--color-paper)" }}
            >
                {/* Tab bar (Tauri) or plain drag region */}
                {isTauri && <TabBar />}
                {/* Mobile menu button */}
                {!sidebarVisible && (
                    <button
                        onClick={() => setSidebarVisible(true)}
                        className="md:hidden fixed top-4 left-4 z-30 p-2 rounded-lg bg-[var(--color-card)] border border-[var(--color-border-warm)] shadow-sm text-[var(--color-ink-muted)]"
                        aria-label="Open menu"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                    </button>
                )}
                {children}
            </main>
            <CommandPalette />
            <ShortcutsHelp />
        </div>
    );
}
