import { useEffect, useCallback, useRef } from "react";
import { useSmfs } from "@/context/smfs-context";
import { SmfsChat } from "./smfs-chat";
import { useFileTree, FileTree } from "@pierre/trees/react";

export function SmfsPanel() {
    const smfs = useSmfs();
    // Pull stable callbacks out of the context object so we can list them as
    // explicit effect deps (instead of disabling the lint rule).
    const { sandboxReady, initSandbox, refreshFiles, files, selectFile } = smfs;

    // Initialize sandbox and load files on mount.
    useEffect(() => {
        if (!sandboxReady) {
            initSandbox().then(() => {
                refreshFiles();
            });
        } else {
            refreshFiles();
        }
    }, [sandboxReady, initSandbox, refreshFiles]);

    const handleSelectionChange = useCallback((selectedPaths: readonly string[]) => {
        if (selectedPaths.length > 0) {
            const path = selectedPaths[0];
            // Only select files, not directories
            if (!path.endsWith("/")) {
                selectFile(path);
            }
        }
    }, [selectFile]);

    const { model } = useFileTree({
        paths: files,
        initialExpansion: 1,
        search: true,
        onSelectionChange: handleSelectionChange,
    });

    // useFileTree creates the model once and ignores later option changes,
    // so we must call resetPaths when the file list changes.
    const prevFilesRef = useRef(files);
    useEffect(() => {
        if (prevFilesRef.current !== files) {
            prevFilesRef.current = files;
            model.resetPaths(files);
        }
    }, [files, model]);

    if (!smfs.sandboxReady) {
        if (smfs.sandboxInitFailed) {
            return (
                <div className="flex flex-col items-center justify-center py-8 px-3 text-center gap-2">
                    <span className="text-[12px]" style={{ color: "var(--color-ink-muted)" }}>
                        Sandbox unavailable.
                    </span>
                    <button
                        onClick={() => smfs.initSandbox().then(() => smfs.refreshFiles())}
                        className="text-[12px] px-2 py-1 rounded-md transition-colors"
                        style={{
                            color: "var(--color-ink)",
                            background: "var(--color-sidebar-active)",
                        }}
                    >
                        Retry
                    </button>
                </div>
            );
        }
        return (
            <div className="flex flex-col items-center justify-center py-8 px-3">
                <svg className="animate-spin h-5 w-5 mb-2" viewBox="0 0 24 24" fill="none" style={{ color: "var(--color-ink-muted)" }}>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-[12px]" style={{ color: "var(--color-ink-muted)" }}>
                    Initializing sandbox...
                </span>
            </div>
        );
    }

    return (
        <div className="flex flex-col" style={{ maxHeight: "calc(100vh - 300px)" }}>
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2">
                <span className="text-[12px] font-medium" style={{ color: "var(--color-ink-muted)" }}>
                    Files
                </span>
                <div className="flex items-center gap-1">
                    {/* Sync button */}
                    <button
                        onClick={() => smfs.syncNotes()}
                        disabled={smfs.syncing}
                        className="p-1 rounded-md transition-colors hover:bg-[var(--color-sidebar-active)]"
                        title="Sync notes to Supermemory"
                    >
                        <svg
                            className={`h-3.5 w-3.5 ${smfs.syncing ? "animate-spin" : ""}`}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ color: "var(--color-ink-muted)" }}
                        >
                            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.2" />
                        </svg>
                    </button>
                    {/* Refresh button */}
                    <button
                        onClick={() => smfs.refreshFiles()}
                        disabled={smfs.loading}
                        className="p-1 rounded-md transition-colors hover:bg-[var(--color-sidebar-active)]"
                        title="Refresh files"
                    >
                        <svg
                            className={`h-3.5 w-3.5 ${smfs.loading ? "animate-spin" : ""}`}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ color: "var(--color-ink-muted)" }}
                        >
                            <polyline points="23 4 23 10 17 10" />
                            <polyline points="1 20 1 14 7 14" />
                            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* File Tree */}
            <div className="flex-1 overflow-hidden min-h-[120px]">
                {smfs.loading && smfs.files.length === 0 ? (
                    <div className="flex items-center justify-center py-4">
                        <span className="text-[12px]" style={{ color: "var(--color-ink-muted)" }}>Loading files...</span>
                    </div>
                ) : smfs.files.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-4 px-3 text-center">
                        <span className="text-[12px]" style={{ color: "var(--color-ink-muted)" }}>
                            No files yet. Use the agent to create some!
                        </span>
                    </div>
                ) : (
                    <FileTree
                        model={model}
                        className="h-full"
                        style={{
                            fontSize: "12px",
                            "--trees-font-size-override": "12px",
                            "--trees-item-height": "26px",
                        } as React.CSSProperties}
                    />
                )}
            </div>

            {/* Selected file preview */}
            {smfs.selectedFile && smfs.selectedFileContent !== null && (
                <div className="border-t px-3 py-2" style={{ borderColor: "var(--color-border-warm)" }}>
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-mono truncate" style={{ color: "var(--color-ink-muted)" }}>
                            {smfs.selectedFile}
                        </span>
                        <button
                            onClick={() => smfs.selectFile(null)}
                            className="text-[11px] p-0.5 rounded hover:bg-[var(--color-sidebar-active)]"
                            style={{ color: "var(--color-ink-muted)" }}
                        >
                            ✕
                        </button>
                    </div>
                    <pre
                        className="text-[10px] max-h-[100px] overflow-auto rounded p-2 font-mono"
                        style={{ background: "var(--color-sidebar-active)", color: "var(--color-ink)" }}
                    >
                        {smfs.selectedFileContent}
                    </pre>
                </div>
            )}

            {/* Chat */}
            <SmfsChat />
        </div>
    );
}
