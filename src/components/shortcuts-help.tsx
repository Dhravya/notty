import { useState } from "react";
import { useHotkeys, isMac } from "@/lib/hotkeys";

const mod = isMac ? "\u2318" : "Ctrl";

const SHORTCUT_SECTIONS = [
    {
        title: "Global",
        shortcuts: [
            { keys: `${mod}+K`, desc: "Command palette" },
            { keys: `${mod}+D`, desc: "Toggle dark mode" },
            { keys: `${mod}+\\`, desc: "Toggle sidebar" },
            { keys: "?", desc: "Show keyboard shortcuts" },
        ],
    },
    {
        title: "Home / Note List",
        shortcuts: [
            { keys: "N", desc: "New note" },
            { keys: "J / \u2193", desc: "Select next note" },
            { keys: "K / \u2191", desc: "Select previous note" },
            { keys: "Enter", desc: "Open selected note" },
            { keys: "X", desc: "Delete selected note" },
            { keys: "/", desc: "Focus search" },
            { keys: "V", desc: "Toggle grid/timeline view" },
            { keys: "S", desc: "Cycle sort mode" },
            { keys: "F", desc: "New folder" },
            { keys: "G then A", desc: "Go to All Notes" },
        ],
    },
    {
        title: "Editor",
        shortcuts: [
            { keys: "Esc", desc: "Back to notes" },
            { keys: `${mod}+S`, desc: "Save note" },
            { keys: "/", desc: "Slash commands (in editor)" },
        ],
    },
    {
        title: "Editor Formatting",
        shortcuts: [
            { keys: `${mod}+B`, desc: "Bold" },
            { keys: `${mod}+I`, desc: "Italic" },
            { keys: `${mod}+U`, desc: "Underline" },
            { keys: `${mod}+Shift+X`, desc: "Strikethrough" },
            { keys: `${mod}+E`, desc: "Code" },
        ],
    },
];

export function ShortcutsHelp() {
    const [open, setOpen] = useState(false);

    useHotkeys([
        { key: "shift+/", handler: () => setOpen((o) => !o) }, // ? key
    ]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={() => setOpen(false)}>
            <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
            <div
                className="relative w-full max-w-md bg-[var(--color-card)] border border-[var(--color-border-warm)] rounded-2xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-warm)]">
                    <h2 className="font-serif text-lg text-[var(--color-ink)]">Keyboard Shortcuts</h2>
                    <button onClick={() => setOpen(false)} className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
                <div className="max-h-[60vh] overflow-y-auto px-6 py-4 space-y-5">
                    {SHORTCUT_SECTIONS.map((section) => (
                        <div key={section.title}>
                            <h3 className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-ink-muted)] mb-2">
                                {section.title}
                            </h3>
                            <div className="space-y-1">
                                {section.shortcuts.map((s) => (
                                    <div key={s.keys} className="flex items-center justify-between py-1.5">
                                        <span className="text-sm text-[var(--color-ink)]">{s.desc}</span>
                                        <kbd className="text-[11px] px-2 py-0.5 rounded border border-[var(--color-border-warm)] bg-[var(--color-paper)] text-[var(--color-ink-muted)] font-mono whitespace-nowrap">
                                            {s.keys}
                                        </kbd>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="px-6 py-3 border-t border-[var(--color-border-warm)] text-center">
                    <p className="text-[11px] text-[var(--color-ink-muted)]">Press <kbd className="px-1 py-px rounded border border-[var(--color-border-warm)] font-mono text-[10px]">?</kbd> to toggle</p>
                </div>
            </div>
        </div>
    );
}
