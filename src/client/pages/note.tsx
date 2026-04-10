import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router";
import { ArrowLeft, LayoutGrid, Share2, Lock, Unlock, GitBranch, MoreVertical, Trash2, FolderInput, ChevronLeft } from "lucide-react";
import { Editor } from "@/components/editor";
import { CommandPalette } from "@/components/command-palette";
import { ShortcutsHelp } from "@/components/shortcuts-help";
import { ShareDialog } from "@/components/share-dialog";
import { LockVerify } from "@/components/lock-verify";
import { PublishToggle } from "@/components/publish-toggle";
import { NoteHistory } from "@/components/note-history";
import { useNotes } from "@/context/notes-context";
import { useFolders } from "@/context/folders-context";
import { useAdapter } from "@/context/adapter-context";
import { useAuth } from "@/context/auth-context";
import { formatEntryDate } from "@/lib/date-utils";
import { useHotkeys } from "@/lib/hotkeys";
import { StorageBadge, OfflineBanner } from "@/components/sync-status";

function NoteMenu({
    noteId,
    currentFolderId,
    isOwner,
    isLocked,
    onShowHistory,
    onLock,
    onUnlock,
    onClose,
}: {
    noteId: string;
    currentFolderId?: string | null;
    isOwner: boolean;
    isLocked: boolean;
    onShowHistory: () => void;
    onLock: () => void;
    onUnlock: () => void;
    onClose: () => void;
}) {
    const navigate = useNavigate();
    const { folders } = useFolders();
    const { deleteNote, moveNoteToFolder } = useNotes();
    const [showFolders, setShowFolders] = useState(false);

    const handleDelete = () => {
        deleteNote(noteId);
        navigate("/", { viewTransition: true });
    };

    const handleMove = (folderId: string | null) => {
        moveNoteToFolder(noteId, folderId);
        onClose();
    };

    return (
        <>
            <div className="fixed inset-0 z-50" onClick={onClose} />
            <div className="absolute right-0 top-full mt-1 w-52 rounded-xl bg-[var(--color-card)] border border-[var(--color-border-warm)] shadow-xl z-50 overflow-hidden py-1">
                {showFolders ? (
                    <>
                        <button
                            onClick={() => setShowFolders(false)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[var(--color-ink-muted)] hover:bg-[var(--color-sidebar-active)] transition-colors"
                        >
                            <ChevronLeft size={14} /> Back
                        </button>
                        <div className="h-px bg-[var(--color-border-warm)] mx-2 my-1" />
                        <button
                            onClick={() => handleMove(null)}
                            disabled={!currentFolderId}
                            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[var(--color-ink)] hover:bg-[var(--color-sidebar-active)] transition-colors disabled:opacity-30"
                        >
                            No folder
                        </button>
                        {folders.map((f) => (
                            <button
                                key={f.id}
                                onClick={() => handleMove(f.id)}
                                disabled={f.id === currentFolderId}
                                className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[var(--color-ink)] hover:bg-[var(--color-sidebar-active)] transition-colors disabled:opacity-30"
                            >
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
                                <span className="truncate">{f.name}</span>
                            </button>
                        ))}
                    </>
                ) : (
                    <>
                        <button
                            onClick={() => setShowFolders(true)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[var(--color-ink)] hover:bg-[var(--color-sidebar-active)] transition-colors"
                        >
                            <FolderInput size={14} /> Move to folder
                        </button>
                        {/* Mobile-only: show controls that are hidden from the top bar */}
                        {isOwner && (
                            <button
                                onClick={() => { onShowHistory(); onClose(); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[var(--color-ink)] hover:bg-[var(--color-sidebar-active)] transition-colors sm:hidden"
                            >
                                <GitBranch size={14} /> Version history
                            </button>
                        )}
                        {isOwner && (
                            <button
                                onClick={() => { isLocked ? onUnlock() : onLock(); onClose(); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[var(--color-ink)] hover:bg-[var(--color-sidebar-active)] transition-colors sm:hidden"
                            >
                                {isLocked ? <><Lock size={14} /> Unlock note</> : <><Unlock size={14} /> Lock note</>}
                            </button>
                        )}
                        <div className="h-px bg-[var(--color-border-warm)] mx-2 my-1" />
                        <button
                            onClick={handleDelete}
                            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                            <Trash2 size={14} /> Delete note
                        </button>
                    </>
                )}
            </div>
        </>
    );
}

export function NotePage() {
    const { id } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { notes, saveNote } = useNotes();
    const { folders, selectFolder } = useFolders();
    const adapter = useAdapter();
    const { user, loading: authLoading } = useAuth();
    const shareToken = searchParams.get("share") || undefined;

    // Folder attachment is deferred — the editor's first save will include it
    const folderId = searchParams.get("folder");

    const [showControls, setShowControls] = useState(true);
    const [showShare, setShowShare] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [editorKey, setEditorKey] = useState(0);
    const [lockToken, setLockToken] = useState<string | null>(null);
    const [noteState, setNoteState] = useState<"checking" | "locked" | "ready" | "not-found">("checking");
    const [noteMeta, setNoteMeta] = useState<any>(null);

    // Save guard: blocks editor saves during checkout/restore/merge
    // so the old editor's unmount flush can't overwrite new branch content
    const saveGuardRef = useRef(false);

    const note = notes.find((n) => n.id === id);
    const effectiveFolderId = folderId || note?.folder_id || null;

    // Called AFTER the API call completes (guard already set by NoteHistory).
    // Cleans up stale state and remounts the editor.
    const handleContentReset = useCallback(async () => {
        setShowHistory(false);
        await new Promise<void>((resolve) => {
            const req = indexedDB.deleteDatabase(`notty-${id}`);
            req.onsuccess = req.onerror = req.onblocked = () => resolve();
        });
        setEditorKey((k) => k + 1);
    }, [id]);

    // Check note access + lock state — wait for auth first
    useEffect(() => {
        if (!id || authLoading || !user) return;
        adapter.getNoteMeta(id, shareToken).then((meta) => {
            if (!meta) {
                if (!shareToken) {
                    setNoteState("ready");
                } else {
                    setNoteState("not-found");
                }
                return;
            }
            setNoteMeta(meta);
            setNoteState(meta.locked ? "locked" : "ready");
        }).catch(() => {
            setNoteState(!shareToken ? "ready" : "not-found");
        });
    }, [id, adapter, shareToken, authLoading, user]);

    // Escape navigates back, preserving folder context
    useHotkeys([
        {
            key: "escape",
            handler: () => {
                if (effectiveFolderId) selectFolder(effectiveFolderId);
                navigate("/", { viewTransition: true });
            },
            allowInInput: true,
        },
    ]);

    // Auto-hide controls on desktop (hover: hover) only — touch devices always show
    useEffect(() => {
        const isTouch = window.matchMedia("(hover: none)").matches;
        if (isTouch) return;

        let timer: ReturnType<typeof setTimeout>;
        const onMove = () => {
            setShowControls(true);
            clearTimeout(timer);
            timer = setTimeout(() => setShowControls(false), 3000);
        };
        window.addEventListener("mousemove", onMove);
        timer = setTimeout(() => setShowControls(false), 3000);
        return () => { window.removeEventListener("mousemove", onMove); clearTimeout(timer); };
    }, []);

    const handleLock = async () => {
        if (!id) return;
        try {
            await adapter.lockNote(id);
            setNoteMeta((m: any) => m ? { ...m, locked: 1 } : m);
        } catch (e: any) {
            console.error("Lock failed:", e);
        }
    };

    const handleUnlock = async () => {
        if (!id || !lockToken) return;
        try {
            await adapter.unlockNote(id, lockToken);
            setNoteMeta((m: any) => m ? { ...m, locked: 0 } : m);
            setNoteState("ready");
        } catch (e: any) {
            console.error("Unlock failed:", e);
        }
    };

    if (!id) return <div>Note not found</div>;

    const date = note ? formatEntryDate(note.created_at) : null;
    const isLocked = !!(noteMeta?.locked);
    const permission: "owner" | "edit" | "view" = noteMeta?.permission || "owner";
    const isOwner = permission === "owner";
    const canEdit = permission !== "view";
    const isViewOnly = permission === "view";

    // Not found / no access
    if (noteState === "not-found") {
        return (
            <div className="min-h-screen bg-[var(--color-paper)] flex flex-col items-center justify-center p-8">
                <div className="text-center space-y-4">
                    <h2 className="font-serif text-2xl text-[var(--color-ink)]">Note not found</h2>
                    <p className="text-sm text-[var(--color-ink-muted)]">This note doesn't exist or you don't have access to it.</p>
                    <button
                        onClick={() => navigate("/")}
                        className="px-4 py-2 rounded-lg bg-[var(--color-ink)] text-[var(--color-paper)] text-sm font-medium"
                    >
                        Go home
                    </button>
                </div>
            </div>
        );
    }

    // If locked and no lock token, show verify screen
    if (noteState === "locked" && !lockToken) {
        return (
            <div className="min-h-screen bg-[var(--color-paper)]">
                <div className="fixed top-0 left-0 right-0 z-40 flex items-center px-5 py-3">
                    <Link
                        to="/"
                        viewTransition
                        className="flex items-center gap-2 text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors px-3 py-1.5 rounded-lg hover:bg-[var(--color-sidebar-active)]"
                    >
                        <ArrowLeft size={16} />
                        <span className="font-serif italic">notty</span>
                    </Link>
                </div>
                <LockVerify
                    noteId={id}
                    noteTitle={noteMeta?.title}
                    onVerified={(token) => {
                        setLockToken(token);
                        setNoteState("ready");
                    }}
                />
                <CommandPalette />
            </div>
        );
    }

    if (noteState === "checking") {
        return (
            <div className="min-h-screen bg-[var(--color-paper)] flex items-center justify-center">
                <div className="text-sm text-[var(--color-ink-muted)]">Loading...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[var(--color-paper)]" style={{ viewTransitionName: `note-${id}` }}>
            {/* Floating top bar */}
            <div className={`fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-3 sm:px-5 py-3 transition-opacity duration-500 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
                <Link
                    to="/"
                    viewTransition
                    className="flex items-center gap-2 text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors px-3 py-1.5 rounded-lg hover:bg-[var(--color-sidebar-active)]"
                >
                    <ArrowLeft size={16} />
                    <span className="font-serif italic hidden sm:inline">notty</span>
                </Link>

                <div className="flex items-center gap-1.5 sm:gap-2 text-[var(--color-ink-muted)]">
                    {/* Date — desktop only */}
                    {date && date.full && (
                        <span className="hidden sm:inline text-xs tracking-wide">
                            {date.month} {date.day}, {date.year} &mdash; {date.time}
                        </span>
                    )}

                    {/* Permission badges */}
                    {isViewOnly && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 font-medium">
                            View only
                        </span>
                    )}
                    {!isOwner && canEdit && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-medium">
                            Can edit
                        </span>
                    )}

                    {/* Desktop-only controls */}
                    <span className="hidden sm:contents">
                        <StorageBadge syncMode={note?.sync_mode as "cloud" | "local" | undefined} />
                        {isOwner && <PublishToggle noteId={id} />}

                        {isOwner && (
                            isLocked ? (
                                <button
                                    onClick={handleUnlock}
                                    className="text-xs px-2 py-1 rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-600 flex items-center gap-1"
                                    title="Unlock note (requires passkey)"
                                >
                                    <Lock size={12} /> Locked
                                </button>
                            ) : (
                                <button
                                    onClick={handleLock}
                                    className="p-1.5 rounded-lg hover:text-[var(--color-ink)] hover:bg-[var(--color-sidebar-active)] transition-colors"
                                    title="Lock with passkey"
                                >
                                    <Unlock size={15} />
                                </button>
                            )
                        )}

                        {isOwner && (
                            <button
                                onClick={() => setShowHistory(true)}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs hover:text-[var(--color-ink)] hover:bg-[var(--color-sidebar-active)] transition-colors"
                                title="Version control & branches"
                            >
                                <GitBranch size={13} />
                                <span className="font-mono text-[10px]">history</span>
                            </button>
                        )}
                    </span>

                    {/* Share — always visible */}
                    {isOwner && (
                        <button
                            onClick={() => setShowShare(true)}
                            className="p-1.5 rounded-lg hover:text-[var(--color-ink)] hover:bg-[var(--color-sidebar-active)] transition-colors"
                            title="Share"
                        >
                            <Share2 size={15} />
                        </button>
                    )}

                    {/* Grid link — desktop only */}
                    <Link
                        to="/"
                        viewTransition
                        className="hidden sm:flex p-1.5 rounded-lg hover:text-[var(--color-ink)] hover:bg-[var(--color-sidebar-active)] transition-colors"
                        title="Back to notes"
                    >
                        <LayoutGrid size={15} />
                    </Link>

                    {/* More actions */}
                    {isOwner && (
                        <div className="relative">
                            <button
                                onClick={() => setShowMenu((v) => !v)}
                                className="p-1.5 rounded-lg hover:text-[var(--color-ink)] hover:bg-[var(--color-sidebar-active)] transition-colors"
                                title="More actions"
                            >
                                <MoreVertical size={15} />
                            </button>
                            {showMenu && (
                                <NoteMenu
                                    noteId={id}
                                    currentFolderId={effectiveFolderId}
                                    isOwner={isOwner}
                                    isLocked={isLocked}
                                    onShowHistory={() => setShowHistory(true)}
                                    onLock={handleLock}
                                    onUnlock={handleUnlock}
                                    onClose={() => setShowMenu(false)}
                                />
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Editor */}
            <div className="max-w-4xl mx-auto px-3 sm:px-6 pt-14 sm:pt-16 pb-16 sm:pb-24">
                <div className="bg-[var(--color-card)] border border-[var(--color-border-warm)] rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04),0_12px_32px_rgba(0,0,0,0.03)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3),0_12px_32px_rgba(0,0,0,0.2)] min-h-[85vh]">
                    <Editor key={`${id}-${editorKey}`} noteId={id} shareToken={shareToken} readOnly={isViewOnly} folderId={folderId} saveGuardRef={saveGuardRef} />
                </div>
            </div>

            {showShare && <ShareDialog noteId={id} onClose={() => setShowShare(false)} />}
            {showHistory && (
                <NoteHistory
                    noteId={id}
                    currentContent={note?.content || ""}
                    saveGuardRef={saveGuardRef}
                    onContentReset={handleContentReset}
                    onClose={() => setShowHistory(false)}
                />
            )}
            <CommandPalette />
            <ShortcutsHelp />
            <OfflineBanner />
        </div>
    );
}
