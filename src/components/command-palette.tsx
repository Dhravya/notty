import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { useNotes } from "@/context/notes-context";
import { useFolders } from "@/context/folders-context";
import { useHotkeys, isMac } from "@/lib/hotkeys";
import { extractPreview } from "./note-card";
import { toggleDarkMode } from "@/lib/dark-mode";

type CommandItem = {
    id: string;
    title: string;
    subtitle?: string;
    section: string;
    shortcut?: string;
    action: () => void;
};

const mod = isMac ? "\u2318" : "Ctrl+";

export function CommandPalette() {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const { notes } = useNotes();
    const { folders, selectFolder } = useFolders();

    const close = useCallback(() => { setOpen(false); setQuery(""); setSelected(0); }, []);

    useHotkeys([
        { key: "mod+k", handler: () => setOpen(true), allowInInput: true },
        { key: "mod+p", handler: () => setOpen(true), allowInInput: true },
    ]);

    useEffect(() => {
        if (open) setTimeout(() => inputRef.current?.focus(), 0);
    }, [open]);

    const createNewNote = useCallback(() => {
        const id = crypto.randomUUID();
        navigate(`/note/${id}`);
        close();
    }, [navigate, close]);

    const toggleDark = useCallback(() => {
        toggleDarkMode();
        close();
    }, [close]);

    const commands = useMemo((): CommandItem[] => {
        const items: CommandItem[] = [];

        // Actions
        items.push({ id: "new-note", title: "New Note", section: "Actions", shortcut: "N", action: createNewNote });
        items.push({ id: "toggle-dark", title: "Toggle Dark Mode", section: "Actions", shortcut: `${mod}D`, action: toggleDark });
        items.push({ id: "go-home", title: "Go to All Notes", section: "Actions", shortcut: "Esc", action: () => { navigate("/"); close(); } });
        items.push({
            id: "toggle-view",
            title: "Toggle Grid/Timeline View",
            section: "Actions",
            shortcut: "V",
            action: () => {
                const current = localStorage.getItem("notty-view") || "grid";
                const next = current === "grid" ? "timeline" : "grid";
                localStorage.setItem("notty-view", next);
                window.dispatchEvent(new CustomEvent("notty:view-change", { detail: next }));
                close();
            },
        });

        // Folders
        items.push({ id: "folder-all", title: "All Notes", section: "Folders", action: () => { selectFolder(null); navigate("/"); close(); } });
        for (const f of folders) {
            items.push({
                id: `folder-${f.id}`,
                title: f.name,
                subtitle: `Folder`,
                section: "Folders",
                action: () => { selectFolder(f.id); navigate("/"); close(); },
            });
        }

        // Notes
        for (const n of notes.slice(0, 50)) {
            items.push({
                id: `note-${n.id}`,
                title: n.title || "Untitled",
                subtitle: extractPreview(n.content).slice(0, 60),
                section: "Notes",
                action: () => { navigate(`/note/${n.id}`); close(); },
            });
        }

        return items;
    }, [notes, folders, createNewNote, toggleDark, navigate, selectFolder, close]);

    const filtered = useMemo(() => {
        if (!query.trim()) return commands;
        const q = query.toLowerCase();
        return commands.filter(
            (c) => c.title.toLowerCase().includes(q) || c.subtitle?.toLowerCase().includes(q)
        );
    }, [commands, query]);

    useEffect(() => { setSelected(0); }, [query]);

    // Scroll selected into view
    useEffect(() => {
        const el = listRef.current?.querySelector(`[data-index="${selected}"]`);
        el?.scrollIntoView({ block: "nearest" });
    }, [selected]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, filtered.length - 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
        else if (e.key === "Enter" && filtered[selected]) { e.preventDefault(); filtered[selected].action(); }
        else if (e.key === "Escape") { e.preventDefault(); close(); }
    };

    if (!open) return null;

    // Group by section
    const sections: { name: string; items: (CommandItem & { globalIdx: number })[] }[] = [];
    let idx = 0;
    for (const item of filtered) {
        let section = sections.find((s) => s.name === item.section);
        if (!section) { section = { name: item.section, items: [] }; sections.push(section); }
        section.items.push({ ...item, globalIdx: idx++ });
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]" onClick={close}>
            <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
            <div
                className="relative w-full max-w-lg bg-[var(--color-card)] border border-[var(--color-border-warm)] rounded-2xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Search input */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--color-border-warm)]">
                    <svg className="text-[var(--color-ink-muted)] shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a command or search..."
                        className="flex-1 bg-transparent text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] outline-none"
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-border-warm)] text-[var(--color-ink-muted)] font-mono">
                        esc
                    </kbd>
                </div>

                {/* Results */}
                <div ref={listRef} className="max-h-[360px] overflow-y-auto py-2">
                    {filtered.length === 0 && (
                        <p className="px-5 py-8 text-center text-sm text-[var(--color-ink-muted)]">No results</p>
                    )}
                    {sections.map((section) => (
                        <div key={section.name}>
                            <p className="px-5 pt-3 pb-1.5 text-[10px] font-medium uppercase tracking-widest text-[var(--color-ink-muted)]">
                                {section.name}
                            </p>
                            {section.items.map((item) => (
                                <button
                                    key={item.id}
                                    data-index={item.globalIdx}
                                    onClick={item.action}
                                    onMouseEnter={() => setSelected(item.globalIdx)}
                                    className={`w-full flex items-center justify-between px-5 py-2.5 text-left transition-colors ${
                                        selected === item.globalIdx
                                            ? "bg-[var(--color-sidebar-active)] text-[var(--color-ink)]"
                                            : "text-[var(--color-ink-muted)] hover:bg-[var(--color-sidebar-active)]/50"
                                    }`}
                                >
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium truncate">{item.title}</p>
                                        {item.subtitle && (
                                            <p className="text-xs text-[var(--color-ink-muted)] truncate mt-0.5">{item.subtitle}</p>
                                        )}
                                    </div>
                                    {item.shortcut && (
                                        <kbd className="ml-3 shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-border-warm)] text-[var(--color-ink-muted)] font-mono">
                                            {item.shortcut}
                                        </kbd>
                                    )}
                                </button>
                            ))}
                        </div>
                    ))}
                </div>

                {/* Footer hint */}
                <div className="px-5 py-2.5 border-t border-[var(--color-border-warm)] flex items-center gap-4 text-[10px] text-[var(--color-ink-muted)]">
                    <span className="flex items-center gap-1">
                        <kbd className="px-1 py-px rounded border border-[var(--color-border-warm)] font-mono">&uarr;&darr;</kbd>
                        navigate
                    </span>
                    <span className="flex items-center gap-1">
                        <kbd className="px-1 py-px rounded border border-[var(--color-border-warm)] font-mono">&crarr;</kbd>
                        select
                    </span>
                    <span className="flex items-center gap-1">
                        <kbd className="px-1 py-px rounded border border-[var(--color-border-warm)] font-mono">?</kbd>
                        all shortcuts
                    </span>
                </div>
            </div>
        </div>
    );
}
