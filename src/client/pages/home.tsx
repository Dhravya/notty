import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router";
import { LayoutGrid, List, Pencil, Image, Plus, Camera, FileUp } from "lucide-react";
import { Drawer } from "vaul";
import { AppLayout } from "@/components/app-layout";
import { NoteCard } from "@/components/note-card";
import { MediaCard } from "@/components/media-card";
import { TimelineView, mergeTimeline } from "@/components/timeline-view";
import { MediaViewer } from "@/components/media-viewer";
import { useNotes } from "@/context/notes-context";
import { useFolders } from "@/context/folders-context";
import { useMedia } from "@/context/media-context";
import { useHotkeys } from "@/lib/hotkeys";
import { useIsDark } from "@/lib/dark-mode";
import { OfflineBanner } from "@/components/sync-status";

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
        const img = new window.Image();
        img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(img.src); };
        img.onerror = () => { resolve({ width: 0, height: 0 }); URL.revokeObjectURL(img.src); };
        img.src = URL.createObjectURL(file);
    });
}

type SortMode = "recent" | "created";
type ViewMode = "grid" | "timeline";

function usePersistedView(): [ViewMode, (v: ViewMode) => void] {
    const [view, setView] = useState<ViewMode>(() => {
        try { return (localStorage.getItem("notty-view") as ViewMode) || "grid"; }
        catch { return "grid"; }
    });
    const set = (v: ViewMode) => {
        setView(v);
        try { localStorage.setItem("notty-view", v); } catch {}
    };
    useEffect(() => {
        const handler = (e: Event) => set((e as CustomEvent).detail);
        window.addEventListener("notty:view-change", handler);
        return () => window.removeEventListener("notty:view-change", handler);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return [view, set];
}

export function HomePage() {
    const navigate = useNavigate();
    const { notes, loading, deleteNote, revalidate } = useNotes();
    const { folders, selectedFolderId, selectFolder, renameFolder, updateFolderDescription } = useFolders();
    const { media, uploadMedia, deleteMedia, publishMedia, updateCaption, getMediaUrl, revalidate: revalidateMedia } = useMedia();
    const [sortMode, setSortMode] = useState<SortMode>("recent");
    const [viewMode, setViewMode] = usePersistedView();
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [uploading, setUploading] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [uploadDrawerOpen, setUploadDrawerOpen] = useState(false);
    const dragCountRef = useRef(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const isDark = useIsDark();

    // Viewer state
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerIndex, setViewerIndex] = useState(0);

    const [editingName, setEditingName] = useState(false);
    const [nameValue, setNameValue] = useState("");
    const [editingDesc, setEditingDesc] = useState(false);
    const [descValue, setDescValue] = useState("");
    const nameRef = useRef<HTMLInputElement>(null);
    const descRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => { revalidate(); revalidateMedia(); }, [revalidate, revalidateMedia]);

    const handleUpload = useCallback(async (files: FileList | File[]) => {
        setUploading(true);
        setUploadDrawerOpen(false);
        try {
            for (const file of Array.from(files)) {
                if (!file.type.startsWith("image/") && !file.type.startsWith("video/") && file.type !== "application/pdf") continue;
                let dims: { width: number; height: number } | undefined;
                if (file.type.startsWith("image/")) {
                    dims = await getImageDimensions(file);
                }
                await uploadMedia(file, dims);
            }
        } finally {
            setUploading(false);
        }
    }, [uploadMedia]);

    // Paste handler
    useEffect(() => {
        const onPaste = (e: ClipboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            const files = e.clipboardData?.files;
            if (files && files.length > 0) {
                e.preventDefault();
                handleUpload(files);
            }
        };
        document.addEventListener("paste", onPaste);
        return () => document.removeEventListener("paste", onPaste);
    }, [handleUpload]);

    const selectedFolder = folders.find((f) => f.id === selectedFolderId);
    const folderNameMap = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders]);

    const filtered = selectedFolderId
        ? notes.filter((n: any) => n.folder_id === selectedFolderId)
        : notes;

    const sorted = useMemo(() =>
        [...filtered].sort((a, b) => {
            if (sortMode === "created") return (b.created_at || 0) - (a.created_at || 0);
            return (b.updated_at || 0) - (a.updated_at || 0);
        }),
    [filtered, sortMode]);

    // Media items for the viewer (all media, not just visible)
    const mediaItems = useMemo(() =>
        selectedFolderId ? [] : media,
    [selectedFolderId, media]);

    const timelineItems = useMemo(() =>
        mergeTimeline(sorted, selectedFolderId ? [] : media, getMediaUrl),
    [sorted, selectedFolderId, media, getMediaUrl]);

    const totalItems = timelineItems.length;
    useEffect(() => { setSelectedIndex((i) => Math.min(i, totalItems - 1)); }, [totalItems]);

    const createAndNavigate = useCallback(() => {
        const id = crypto.randomUUID();
        navigate(`/note/${id}${selectedFolderId ? `?folder=${selectedFolderId}` : ""}`, { viewTransition: true });
    }, [navigate, selectedFolderId]);

    useEffect(() => {
        if (selectedIndex < 0) return;
        document.querySelector(`[data-note-index="${selectedIndex}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [selectedIndex]);

    const openMediaFromId = useCallback((id: string) => {
        const idx = mediaItems.findIndex(m => m.id === id);
        if (idx < 0) return;

        // Pause any playing video on the card
        const cardEl = document.querySelector(`[data-media-id="${id}"]`);
        const cardVideo = cardEl?.querySelector("video") as HTMLVideoElement | null;
        if (cardVideo) cardVideo.pause();

        const thumb = cardEl?.querySelector("img, video") as HTMLElement | null;
        if (thumb) thumb.style.viewTransitionName = "media-hero";

        const open = () => { setViewerIndex(idx); setViewerOpen(true); };

        if (!document.startViewTransition) { open(); return; }
        document.startViewTransition(() => {
            flushSync(open);
            if (thumb) thumb.style.viewTransitionName = "";
        });
    }, [mediaItems]);

    const closeViewer = useCallback(() => {
        const item = mediaItems[viewerIndex];
        if (!item) { setViewerOpen(false); return; }

        if (!document.startViewTransition) { setViewerOpen(false); return; }

        const transition = document.startViewTransition(() => {
            flushSync(() => setViewerOpen(false));
            const thumb = document.querySelector(`[data-media-id="${item.id}"] img, [data-media-id="${item.id}"] video`) as HTMLElement | null;
            if (thumb) thumb.style.viewTransitionName = "media-hero";
        });
        transition.finished.then(() => {
            const thumb = document.querySelector(`[data-media-id="${item.id}"] img, [data-media-id="${item.id}"] video`) as HTMLElement | null;
            if (thumb) thumb.style.viewTransitionName = "";
        });
    }, [mediaItems, viewerIndex]);

    useHotkeys([
        { key: "n", handler: createAndNavigate },
        { key: "j", handler: () => setSelectedIndex((i) => Math.min(i + 1, totalItems - 1)) },
        { key: "arrowdown", handler: () => setSelectedIndex((i) => Math.min(i + 1, totalItems - 1)) },
        { key: "k", handler: () => setSelectedIndex((i) => Math.max(i - 1, 0)) },
        { key: "arrowup", handler: () => setSelectedIndex((i) => Math.max(i - 1, 0)) },
        { key: "enter", handler: () => { if (sorted[selectedIndex]) navigate(`/note/${sorted[selectedIndex].id}`, { viewTransition: true }); } },
        { key: "x", handler: () => { if (sorted[selectedIndex]) { deleteNote(sorted[selectedIndex].id); setSelectedIndex((i) => Math.max(i - 1, 0)); } } },
        { key: "v", handler: () => setViewMode(viewMode === "grid" ? "timeline" : "grid") },
        { key: "s", handler: () => setSortMode((m) => m === "recent" ? "created" : "recent") },
        { key: "/", handler: () => document.querySelector<HTMLInputElement>("[data-search-input]")?.focus() },
        { key: "g", handler: () => { selectFolder(null); navigate("/"); } },
    ]);

    const heading = selectedFolder?.name || "All Notes";

    const startEditName = () => {
        if (!selectedFolder) return;
        setNameValue(selectedFolder.name);
        setEditingName(true);
        setTimeout(() => nameRef.current?.focus(), 0);
    };
    const commitName = () => {
        if (selectedFolder && nameValue.trim()) renameFolder(selectedFolder.id, nameValue.trim());
        setEditingName(false);
    };
    const startEditDesc = () => {
        if (!selectedFolder) return;
        setDescValue(selectedFolder.description || "");
        setEditingDesc(true);
        setTimeout(() => descRef.current?.focus(), 0);
    };
    const commitDesc = () => {
        if (selectedFolder) updateFolderDescription(selectedFolder.id, descValue);
        setEditingDesc(false);
    };

    return (
        <AppLayout>
            <div className="min-h-full relative"
                onDragEnter={(e) => { e.preventDefault(); dragCountRef.current++; setDragging(true); }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
                onDragLeave={() => { dragCountRef.current--; if (dragCountRef.current <= 0) { setDragging(false); dragCountRef.current = 0; } }}
                onDrop={(e) => { e.preventDefault(); setDragging(false); dragCountRef.current = 0; if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files); }}
            >
                {dragging && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--color-bg)]/80 backdrop-blur-sm border-2 border-dashed border-[var(--color-accent)] rounded-2xl">
                        <div className="text-center">
                            <Image size={32} className="mx-auto mb-2 text-[var(--color-accent)]" />
                            <p className="font-serif text-lg text-[var(--color-accent)]">Drop to upload</p>
                        </div>
                    </div>
                )}
                <div className="max-w-6xl mx-auto px-4 py-6 sm:px-8 sm:py-10">
                    {/* Header */}
                    <div className="flex items-end justify-between mb-6 sm:mb-8">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2.5 group/title">
                                {editingName ? (
                                    <input ref={nameRef} value={nameValue}
                                        onChange={(e) => setNameValue(e.target.value)}
                                        onBlur={commitName}
                                        onKeyDown={(e) => { if (e.key === "Enter") commitName(); if (e.key === "Escape") setEditingName(false); }}
                                        className="font-serif text-2xl sm:text-3xl tracking-tight text-[var(--color-ink)] bg-transparent border-b-2 border-[var(--color-accent)] outline-none w-full"
                                    />
                                ) : (
                                    <>
                                        <h1 className="font-serif text-2xl sm:text-3xl tracking-tight text-[var(--color-ink)]">{heading}</h1>
                                        {selectedFolder && (
                                            <button onClick={startEditName}
                                                className="opacity-0 group-hover/title:opacity-100 transition-opacity p-1 rounded-md text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-sidebar-active)]"
                                                aria-label="Edit folder name">
                                                <Pencil size={14} />
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                            {selectedFolder && (
                                <div className="mt-2">
                                    {editingDesc ? (
                                        <textarea ref={descRef} value={descValue}
                                            onChange={(e) => setDescValue(e.target.value)} onBlur={commitDesc}
                                            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitDesc(); } if (e.key === "Escape") setEditingDesc(false); }}
                                            rows={2} className="w-full max-w-xl text-sm text-[var(--color-ink-muted)] bg-transparent border-b border-[var(--color-accent)] outline-none resize-none"
                                            placeholder="Add a description..." />
                                    ) : (
                                        <p onClick={startEditDesc}
                                            className="text-sm text-[var(--color-ink-muted)] cursor-text max-w-xl hover:text-[var(--color-ink)] transition-colors">
                                            {selectedFolder.description || "Add a description..."}
                                        </p>
                                    )}
                                </div>
                            )}
                            <p className="text-sm text-[var(--color-ink-muted)] mt-1">
                                {filtered.length} {filtered.length === 1 ? "note" : "notes"}
                                {media.length > 0 && !selectedFolderId && ` · ${media.length} media`}
                            </p>
                        </div>
                        {/* Desktop action buttons */}
                        <div className="hidden sm:flex items-center gap-2">
                            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                                className="px-3 py-1.5 text-sm font-medium rounded-lg border border-[var(--color-border-warm)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-sidebar-active)] active:scale-[0.97] transition-all duration-150 flex items-center gap-1.5 disabled:opacity-50"
                                title="Upload image, video, or PDF (or paste from clipboard)">
                                {uploading ? (
                                    <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <Image size={14} />
                                )}
                            </button>
                            <input ref={fileInputRef} type="file" accept="image/*,video/*,application/pdf" multiple hidden
                                onChange={(e) => { if (e.target.files?.length) { handleUpload(e.target.files); e.target.value = ""; } }} />
                            <button onClick={createAndNavigate}
                                className="px-4 py-1.5 text-sm font-medium rounded-lg border border-[var(--color-border-warm)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-sidebar-active)] active:scale-[0.97] transition-all duration-150 flex items-center gap-2">
                                + New note
                                <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-border-warm)] font-mono opacity-60">N</kbd>
                            </button>
                        </div>
                    </div>

                    {/* Search */}
                    <div className="mb-4 sm:mb-6">
                        <div className="relative max-w-lg">
                            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input type="text" placeholder="Search your notes... ( / )" disabled data-search-input
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--color-border-warm)] bg-[var(--color-card)] text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] opacity-50 cursor-not-allowed" />
                        </div>
                    </div>

                    {/* Sort + view toggle */}
                    <div className="flex items-center gap-4 mb-4 sm:mb-6">
                        <div className="flex items-center gap-1">
                            {(["recent", "created"] as const).map((mode) => (
                                <button key={mode} onClick={() => setSortMode(mode)}
                                    className={`text-xs px-3 py-1 rounded-lg transition-colors ${
                                        sortMode === mode ? "bg-[var(--color-sidebar-active)] text-[var(--color-ink)] font-medium" : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                                    }`}>
                                    {mode === "recent" ? "Recently accessed" : "Date created"}
                                </button>
                            ))}
                        </div>
                        <div className="ml-auto flex items-center gap-0.5 bg-[var(--color-sidebar)] rounded-lg p-0.5">
                            {([["grid", LayoutGrid], ["timeline", List]] as const).map(([mode, Icon]) => (
                                <button key={mode} onClick={() => setViewMode(mode as ViewMode)}
                                    className={`p-1.5 rounded-md transition-colors ${
                                        viewMode === mode ? "bg-[var(--color-sidebar-active)] text-[var(--color-ink)]" : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                                    }`} aria-label={`${mode} view`}>
                                    <Icon size={14} />
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Content */}
                    {loading ? (
                        <div className="text-center py-20 text-[var(--color-ink-muted)] text-sm">Loading...</div>
                    ) : totalItems === 0 ? (
                        <div className="text-center py-24">
                            <p className="font-serif italic text-2xl text-[var(--color-ink-muted)] mb-3">
                                {selectedFolderId ? "This folder is empty" : "Start writing something beautiful"}
                            </p>
                            <p className="text-sm text-[var(--color-ink-muted)]/70">
                                {selectedFolderId ? "Move some notes here or create a new one." : "Write a note, paste an image, or drag a file here."}
                            </p>
                        </div>
                    ) : viewMode === "grid" ? (
                        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-5">
                            {timelineItems.map((item, i) => (
                                <div key={item.kind === "note" ? `n-${item.data.id}` : `m-${item.data.id}`} data-note-index={i}
                                    className={`rounded-2xl transition-all duration-150 ${
                                        selectedIndex === i ? "ring-[3px] ring-[var(--color-accent)] scale-[1.03] shadow-[0_0_0_1px_var(--color-accent),0_4px_20px_rgba(42,161,152,0.25)]" : ""
                                    }`} onClick={() => setSelectedIndex(i)}>
                                    {item.kind === "note" ? (
                                        <NoteCard note={item.data} onDelete={deleteNote} isDark={isDark}
                                            folderName={folderNameMap.get(item.data.folder_id ?? "")} />
                                    ) : (
                                        <MediaCard item={item.data} mediaUrl={item.url}
                                            onDelete={deleteMedia} onTogglePublish={publishMedia}
                                            onClick={() => openMediaFromId(item.data.id)}
                                            isDark={isDark} />
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <TimelineView
                            items={timelineItems}
                            folders={folders} onDeleteNote={deleteNote}
                            onDeleteMedia={deleteMedia} onTogglePublishMedia={publishMedia}
                            onOpenMedia={openMediaFromId}
                            selectedIndex={selectedIndex} onSelect={setSelectedIndex} isDark={isDark} />
                    )}
                </div>

                {/* Mobile FAB */}
                <div className="sm:hidden fixed bottom-6 right-6 z-40 flex flex-col gap-3">
                    {uploading && (
                        <div className="w-14 h-14 rounded-full bg-[var(--color-accent)] flex items-center justify-center shadow-lg">
                            <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        </div>
                    )}
                    {!uploading && (
                        <Drawer.Root open={uploadDrawerOpen} onOpenChange={setUploadDrawerOpen}>
                            <Drawer.Trigger asChild>
                                <button className="w-14 h-14 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform">
                                    <Plus size={24} />
                                </button>
                            </Drawer.Trigger>
                            <Drawer.Portal>
                                <Drawer.Overlay className="fixed inset-0 bg-black/40 z-[90]" />
                                <Drawer.Content className="fixed bottom-0 left-0 right-0 z-[91] bg-[var(--color-card)] rounded-t-2xl">
                                    <div className="mx-auto w-12 h-1.5 bg-[var(--color-border-warm)] rounded-full mt-3 mb-2" />
                                    <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                                        <h3 className="font-serif text-lg text-[var(--color-ink)] mb-4">Add to your diary</h3>
                                        <div className="grid grid-cols-3 gap-3 mb-4">
                                            <button
                                                onClick={() => { setUploadDrawerOpen(false); createAndNavigate(); }}
                                                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[var(--color-sidebar)] active:bg-[var(--color-sidebar-active)] transition-colors"
                                            >
                                                <Pencil size={22} className="text-[var(--color-accent)]" />
                                                <span className="text-xs text-[var(--color-ink-muted)]">Note</span>
                                            </button>
                                            <button
                                                onClick={() => { cameraInputRef.current?.click(); }}
                                                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[var(--color-sidebar)] active:bg-[var(--color-sidebar-active)] transition-colors"
                                            >
                                                <Camera size={22} className="text-[var(--color-accent)]" />
                                                <span className="text-xs text-[var(--color-ink-muted)]">Camera</span>
                                            </button>
                                            <button
                                                onClick={() => { fileInputRef.current?.click(); }}
                                                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[var(--color-sidebar)] active:bg-[var(--color-sidebar-active)] transition-colors"
                                            >
                                                <FileUp size={22} className="text-[var(--color-accent)]" />
                                                <span className="text-xs text-[var(--color-ink-muted)]">File</span>
                                            </button>
                                        </div>
                                    </div>
                                </Drawer.Content>
                            </Drawer.Portal>
                        </Drawer.Root>
                    )}
                    <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden
                        onChange={(e) => { if (e.target.files?.length) { handleUpload(e.target.files); e.target.value = ""; } }} />
                </div>
            </div>

            {/* Media Viewer */}
            {viewerOpen && mediaItems.length > 0 && (
                <MediaViewer
                    items={mediaItems}
                    initialIndex={viewerIndex}
                    getMediaUrl={getMediaUrl}
                    onClose={closeViewer}
                    onUpdateCaption={updateCaption}
                    onTogglePublish={publishMedia}
                />
            )}
            <OfflineBanner />
        </AppLayout>
    );
}
