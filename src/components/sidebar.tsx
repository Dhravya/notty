import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import { useFolders } from "@/context/folders-context";
import { useNotes } from "@/context/notes-context";
import { useAdapter } from "@/context/adapter-context";
import { useAuth } from "@/context/auth-context";
import { DarkModeToggle } from "./dark-mode-toggle";
import { AuthSection } from "./auth-section";
import { isTauri } from "@/lib/platform";
import { useTabNavigate } from "@/context/tabs-context";
import type { SharedNote } from "@/lib/adapter";

const FOLDER_COLORS = [
    "#EF4444", "#F59E0B", "#10B981", "#3B82F6",
    "#8B5CF6", "#EC4899", "#F97316", "#06B6D4",
];

export function Sidebar() {
    const navigate = useNavigate();
    const tabNavigate = useTabNavigate();
    const location = useLocation();
    const { folders, selectedFolderId, selectFolder, createFolder, deleteFolder, renameFolder } = useFolders();
    const { notes, trash } = useNotes();
    const adapter = useAdapter();
    const { user } = useAuth();
    const [sharedNotes, setSharedNotes] = useState<SharedNote[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");
    const [creatingFolder, setCreatingFolder] = useState<{ step: "name" | "color"; name: string } | null>(null);
    const editRef = useRef<HTMLInputElement>(null);
    const createRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!user) return;
        adapter.getSharedWithMe().then(setSharedNotes).catch(() => {});
    }, [user, adapter]);

    useEffect(() => {
        if (editingId && editRef.current) editRef.current.focus();
    }, [editingId]);

    useEffect(() => {
        if (creatingFolder?.step === "name" && createRef.current) createRef.current.focus();
    }, [creatingFolder?.step]);

    const noteCountForFolder = (folderId: string) =>
        notes.filter((n: any) => n.folder_id === folderId).length;

    const startRename = (id: string, name: string) => {
        setEditingId(id);
        setEditValue(name);
    };

    const commitRename = () => {
        if (editingId && editValue.trim()) {
            renameFolder(editingId, editValue.trim());
        }
        setEditingId(null);
    };

    const startCreateFolder = () => {
        setCreatingFolder({ step: "name", name: "" });
    };

    const commitCreateName = () => {
        if (!creatingFolder || !creatingFolder.name.trim()) {
            setCreatingFolder(null);
            return;
        }
        setCreatingFolder({ ...creatingFolder, step: "color" });
    };

    const handleNewFolder = async (color: string) => {
        if (!creatingFolder) return;
        await createFolder(creatingFolder.name.trim(), color);
        setCreatingFolder(null);
    };

    return (
        <aside className="w-60 h-screen flex flex-col border-r border-[var(--color-border-warm)] shrink-0 select-none transition-colors duration-300" style={{ backgroundColor: selectedFolderId ? "var(--folder-tint-sidebar, var(--color-sidebar))" : "var(--color-sidebar)" }}>
            {/* Logo + drag region */}
            <div
                className="px-5 pb-4 flex items-center gap-2.5 border-b border-[var(--color-border-warm)]/50"
                style={{ paddingTop: isTauri ? 38 : 20 }}
                {...(isTauri ? { "data-tauri-drag-region": true } : {})}
            >
                <img src="/logo.png" className="w-7 h-7 rounded-lg" alt="" />
                <span className="font-serif italic text-xl tracking-tight text-[var(--color-ink)]">notty</span>
            </div>

            {/* Nav */}
            <nav className="px-3 pt-4 space-y-0.5">
                <button
                    onClick={() => { selectFolder(null); navigate("/"); }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[13px] transition-colors duration-150 ${
                        selectedFolderId === null && location.pathname !== "/trash"
                            ? "bg-[var(--color-sidebar-active)] text-[var(--color-ink)] font-medium"
                            : "text-[var(--color-ink-muted)] hover:bg-[var(--color-sidebar-active)]/60"
                    }`}
                >
                    <span>All Notes</span>
                    <span className="text-[11px] tabular-nums text-[var(--color-ink-muted)]">{notes.length}</span>
                </button>
            </nav>

            {/* Folders */}
            <div className="mt-6 flex-1 overflow-y-auto scrollbar-hide px-3">
                <div className="flex items-center justify-between px-3 mb-2">
                    <span className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-ink-muted)]">
                        Folders
                    </span>
                </div>
                <div className="space-y-px">
                    {folders.map((folder) => (
                        <div key={folder.id} className="group relative">
                            <button
                                onClick={() => { selectFolder(folder.id); navigate("/"); }}
                                className={`w-full flex items-center justify-between px-3 py-[7px] rounded-xl text-[13px] transition-colors duration-150 ${
                                    selectedFolderId === folder.id
                                        ? "bg-[var(--color-sidebar-active)] text-[var(--color-ink)] font-medium"
                                        : "text-[var(--color-ink-muted)] hover:bg-[var(--color-sidebar-active)]/60"
                                }`}
                            >
                                <span className="flex items-center gap-2.5 min-w-0">
                                    <span
                                        className="w-2 h-2 rounded-full shrink-0 ring-1 ring-black/5"
                                        style={{ backgroundColor: folder.color }}
                                    />
                                    {editingId === folder.id ? (
                                        <input
                                            ref={editRef}
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            onBlur={commitRename}
                                            onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setEditingId(null); }}
                                            onClick={(e) => e.stopPropagation()}
                                            className="bg-transparent border-b border-[var(--color-accent)] outline-none text-[13px] w-full text-[var(--color-ink)]"
                                        />
                                    ) : (
                                        <span className="truncate">{folder.name}</span>
                                    )}
                                </span>
                                <span className="flex items-center gap-1">
                                    <span className="text-[11px] tabular-nums text-[var(--color-ink-muted)] group-hover:hidden">
                                        {noteCountForFolder(folder.id)}
                                    </span>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); startRename(folder.id, folder.name); }}
                                        className="hidden group-hover:flex items-center justify-center w-5 h-5 rounded-md text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-sidebar-active)] transition-colors"
                                        aria-label="Rename folder"
                                    >
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); deleteFolder(folder.id); }}
                                        className="hidden group-hover:flex items-center justify-center w-5 h-5 rounded-md text-[var(--color-ink-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                        aria-label="Delete folder"
                                    >
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                        </svg>
                                    </button>
                                </span>
                            </button>
                        </div>
                    ))}
                </div>

                {/* New folder */}
                <div className="mt-1.5 px-3">
                    {creatingFolder?.step === "name" ? (
                        <input
                            ref={createRef}
                            value={creatingFolder.name}
                            onChange={(e) => setCreatingFolder({ ...creatingFolder, name: e.target.value })}
                            onKeyDown={(e) => { if (e.key === "Enter") commitCreateName(); if (e.key === "Escape") setCreatingFolder(null); }}
                            onBlur={commitCreateName}
                            placeholder="Folder name..."
                            className="w-full bg-transparent border-b border-[var(--color-accent)] outline-none text-[13px] py-1.5 text-[var(--color-ink)] placeholder-[var(--color-ink-muted)]"
                        />
                    ) : creatingFolder?.step === "color" ? (
                        <div className="flex items-center gap-1.5 py-2">
                            {FOLDER_COLORS.map((c) => (
                                <button
                                    key={c}
                                    onClick={() => handleNewFolder(c)}
                                    className="w-5 h-5 rounded-full border-2 border-transparent hover:border-[var(--color-ink-muted)] transition-colors hover:scale-110"
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                    ) : (
                        <button
                            onClick={startCreateFolder}
                            className="text-[12px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors py-1.5 flex items-center gap-1.5"
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            New folder
                        </button>
                    )}
                </div>
            </div>

            {/* Shared with me */}
            {sharedNotes.length > 0 && (
                <div className="mt-4 px-3">
                    <div className="flex items-center px-3 mb-2">
                        <span className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-ink-muted)]">
                            Shared with me
                        </span>
                    </div>
                    <div className="space-y-px">
                        {sharedNotes.map((s) => (
                            <button
                                key={s.id}
                                onClick={() => tabNavigate(`/note/${s.id}`, { title: s.title || "Untitled" })}
                                className="w-full flex items-center justify-between px-3 py-[7px] rounded-xl text-[13px] text-[var(--color-ink-muted)] hover:bg-[var(--color-sidebar-active)]/60 transition-colors"
                            >
                                <span className="truncate">{s.title || "Untitled"}</span>
                                <span className="text-[10px] text-[var(--color-ink-muted)]/60">{s.owner_name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Auth + Bottom */}
            <AuthSection />
            {user && !(user as any).isAnonymous && (
                <div className="px-4 py-3 border-t border-[var(--color-border-warm)]/50 space-y-2">
                    <button
                        onClick={() => navigate("/settings/public")}
                        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] text-[var(--color-ink-muted)] hover:bg-[var(--color-sidebar-active)] hover:text-[var(--color-ink)] transition-colors"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                        <span className="flex-1 text-left">My Public Page</span>
                    </button>
                </div>
            )}
            <div className="px-4 py-3 border-t border-[var(--color-border-warm)]/50 space-y-2">
                <button
                    onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
                    className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] text-[var(--color-ink-muted)] hover:bg-[var(--color-sidebar-active)] hover:text-[var(--color-ink)] transition-colors"
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <span className="flex-1 text-left">Search & commands</span>
                    <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-border-warm)] font-mono">{/Mac|iPhone|iPad/.test(navigator.userAgent) ? "\u2318K" : "Ctrl+K"}</kbd>
                </button>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                        <DarkModeToggle />
                        {trash.length > 0 && (
                            <button
                                onClick={() => { selectFolder(null); navigate("/trash"); }}
                                className={`relative p-1.5 rounded-lg transition-colors ${
                                    location.pathname === "/trash"
                                        ? "text-[var(--color-ink)] bg-[var(--color-sidebar-active)]"
                                        : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-sidebar-active)]"
                                }`}
                                aria-label={`Trash (${trash.length})`}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                                <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-[var(--color-ink-muted)] text-[var(--color-bg,#fff)] text-[9px] font-medium leading-none">
                                    {trash.length}
                                </span>
                            </button>
                        )}
                    </div>
                    <span className="text-[10px] text-[var(--color-ink-muted)]/60 font-serif italic">notty v2</span>
                </div>
            </div>
        </aside>
    );
}
