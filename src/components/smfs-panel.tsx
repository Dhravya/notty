import { useEffect, useCallback, useRef, useState } from "react";
import { useSmfs } from "@/context/smfs-context";
import { useFileTree, FileTree } from "@pierre/trees/react";

export function SmfsRightPanel() {
    const smfs = useSmfs();

    const { sandboxReady, initSandbox, refreshFiles, files, selectFile } = smfs;

    // Initialize sandbox and load files on mount.
    useEffect(() => {
        if (!smfs.isOpen) return;
        if (!sandboxReady) {
            initSandbox().then(() => {
                refreshFiles();
            });
        } else {
            refreshFiles();
        }
    }, [smfs.isOpen, sandboxReady, initSandbox, refreshFiles]);

    const handleSelectionChange = useCallback(
        (selectedPaths: readonly string[]) => {
            if (selectedPaths.length > 0) {
                const path = selectedPaths[0];
                if (!path.endsWith("/")) {
                    selectFile(path);
                }
            }
        },
        [selectFile],
    );

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

    if (!smfs.isOpen) return null;

    return (
        <div
            className="smfs-panel flex flex-col h-full border-l"
            style={{
                background: "var(--color-paper)",
                borderColor: "var(--color-border-warm)",
            }}
        >
            <PanelHeader />

            {!smfs.sandboxReady ? (
                <SandboxInitState />
            ) : (
                <>
                    <FileTreeSection model={model} />
                    <ChatSection />
                </>
            )}
        </div>
    );
}

function PanelHeader() {
    const smfs = useSmfs();
    return (
        <div
            className="h-12 px-4 flex items-center justify-between border-b shrink-0"
            style={{
                background: "var(--color-paper)",
                borderColor: "var(--color-border-warm)",
            }}
        >
            <span className="text-[14px] font-medium" style={{ color: "var(--color-ink)" }}>
                Supermemory FS
            </span>
            <div className="flex items-center gap-1">
                <button
                    onClick={() => smfs.syncNotes()}
                    disabled={smfs.syncing}
                    className="p-1.5 rounded-lg hover:bg-[var(--color-sidebar-active)] transition-colors"
                    title="Sync notes to Supermemory"
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={smfs.syncing ? "animate-spin" : ""}
                        style={{ color: "var(--color-ink-muted)" }}
                    >
                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.2" />
                    </svg>
                </button>
                <button
                    onClick={() => smfs.refreshFiles()}
                    disabled={smfs.loading}
                    className="p-1.5 rounded-lg hover:bg-[var(--color-sidebar-active)] transition-colors"
                    title="Refresh files"
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={smfs.loading ? "animate-spin" : ""}
                        style={{ color: "var(--color-ink-muted)" }}
                    >
                        <polyline points="23 4 23 10 17 10" />
                        <polyline points="1 20 1 14 7 14" />
                        <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                    </svg>
                </button>
                <button
                    onClick={() => smfs.togglePanel()}
                    className="p-1.5 rounded-lg hover:bg-[var(--color-sidebar-active)] transition-colors"
                    title="Close panel"
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ color: "var(--color-ink-muted)" }}
                    >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </div>
        </div>
    );
}

function SandboxInitState() {
    const smfs = useSmfs();
    if (smfs.sandboxInitFailed) {
        return (
            <div className="flex-1 flex items-center justify-center flex-col gap-3">
                <span className="text-[13px]" style={{ color: "var(--color-ink-muted)" }}>
                    Sandbox unavailable
                </span>
                <button
                    onClick={() => smfs.initSandbox().then(() => smfs.refreshFiles())}
                    className="px-4 py-2 rounded-lg bg-[var(--color-sidebar-active)] text-[var(--color-ink)] text-[13px] font-medium hover:opacity-80 transition-opacity"
                >
                    Retry
                </button>
            </div>
        );
    }
    return (
        <div className="flex-1 flex items-center justify-center flex-col gap-3">
            <svg
                className="animate-spin h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                style={{ color: "var(--color-ink-muted)" }}
            >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
            </svg>
            <span className="text-[13px]" style={{ color: "var(--color-ink-muted)" }}>
                Initializing sandbox...
            </span>
        </div>
    );
}

type FileTreeModel = ReturnType<typeof useFileTree>["model"];

function FileTreeSection({ model }: { model: FileTreeModel }) {
    const smfs = useSmfs();
    const [filesExpanded, setFilesExpanded] = useState(false);

    return (
        <div
            className={`shrink-0 ${filesExpanded ? "border-b" : ""}`}
            style={{ borderColor: "var(--color-border-warm)" }}
        >
            <button
                onClick={() => setFilesExpanded((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2 hover:bg-[var(--color-sidebar-active)]/50 transition-colors"
            >
                <span
                    className="text-[12px] font-medium uppercase tracking-wider"
                    style={{ color: "var(--color-ink-muted)" }}
                >
                    Files
                </span>
                <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                        color: "var(--color-ink-muted)",
                        transition: "transform 0.2s ease",
                        transform: filesExpanded ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                >
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            <div
                className={`px-2 ${filesExpanded ? "max-h-[240px] overflow-y-auto" : "max-h-0 overflow-hidden"}`}
                style={{ transition: "max-height 0.2s ease" }}
            >
                {smfs.files.length === 0 ? (
                    <div className="px-2 py-3 text-center">
                        <span className="text-[12px]" style={{ color: "var(--color-ink-muted)" }}>
                            No files yet
                        </span>
                    </div>
                ) : (
                    <FileTree
                        model={model}
                        style={
                            {
                                fontSize: "12px",
                                "--trees-item-height": "28px",
                            } as React.CSSProperties
                        }
                    />
                )}
            </div>

            {smfs.selectedFile && smfs.selectedFileContent !== null && (
                <div
                    className="border-t px-3 py-2"
                    style={{ borderColor: "var(--color-border-warm)" }}
                >
                    <div className="flex items-center justify-between mb-1">
                        <span
                            className="text-[11px] font-mono truncate"
                            style={{ color: "var(--color-ink-muted)" }}
                        >
                            {smfs.selectedFile}
                        </span>
                        <button
                            onClick={() => smfs.selectFile(null)}
                            className="p-0.5 rounded hover:bg-[var(--color-sidebar-active)]"
                            title="Close preview"
                        >
                            <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={{ color: "var(--color-ink-muted)" }}
                            >
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                    <pre
                        className="text-[10px] max-h-[100px] overflow-auto rounded p-2 font-mono whitespace-pre-wrap"
                        style={{
                            background: "var(--color-sidebar-active)",
                            color: "var(--color-ink)",
                        }}
                    >
                        {smfs.selectedFileContent}
                    </pre>
                </div>
            )}
        </div>
    );
}

function ChatSection() {
    const smfs = useSmfs();
    const [input, setInput] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [smfs.messages, smfs.agentLoading]);

    const submit = async () => {
        if (!input.trim() || smfs.agentLoading) return;
        const msg = input.trim();
        setInput("");
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }
        await smfs.sendMessage(msg);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        void submit();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
        }
    };

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        const ta = e.target;
        ta.style.height = "auto";
        ta.style.height = `${Math.min(ta.scrollHeight, 96)}px`;
    };

    const showSend = input.trim().length > 0 && !smfs.agentLoading;

    return (
        <div className="flex-1 flex flex-col min-h-0">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                {smfs.messages.length === 0 && !smfs.agentLoading ? (
                    <div className="h-full flex items-center justify-center text-center px-4">
                        <span className="text-[13px]" style={{ color: "var(--color-ink-muted)" }}>
                            Ask the agent to create files, run commands, or search your notes.
                        </span>
                    </div>
                ) : (
                    <>
                        {smfs.messages.map((msg) => {
                            if (msg.role === "user") {
                                return (
                                    <div key={msg.id} className="flex justify-end">
                                        <div
                                            className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 bg-[var(--color-sidebar-active)] text-[13px] leading-relaxed whitespace-pre-wrap"
                                            style={{ color: "var(--color-ink)" }}
                                        >
                                            {msg.content}
                                        </div>
                                    </div>
                                );
                            }
                            return (
                                <div key={msg.id} className="flex justify-start">
                                    <div
                                        className="max-w-[90%] text-[13px] leading-relaxed whitespace-pre-wrap"
                                        style={{ color: "var(--color-ink)" }}
                                    >
                                        {msg.content}
                                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                                            <div className="space-y-1.5">
                                                {msg.toolCalls.map((tc, i) => {
                                                    const tcInput = tc.input as {
                                                        command?: string;
                                                        query?: string;
                                                    };
                                                    const label =
                                                        tcInput.command ?? tcInput.query ?? tc.name;
                                                    return (
                                                        <details key={i} className="mt-2 group">
                                                            <summary
                                                                className="cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-sidebar-active)] text-[12px] font-mono hover:opacity-80 transition-opacity"
                                                                style={{
                                                                    color: "var(--color-ink-muted)",
                                                                }}
                                                            >
                                                                <span
                                                                    style={{
                                                                        color: "var(--color-accent)",
                                                                    }}
                                                                >
                                                                    $
                                                                </span>
                                                                {label}
                                                            </summary>
                                                            {tc.result && (
                                                                <pre
                                                                    className="mt-1.5 mx-1 p-3 rounded-lg text-[11px] font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed"
                                                                    style={{
                                                                        background:
                                                                            "var(--color-sidebar-active)",
                                                                        color: "var(--color-ink-muted)",
                                                                    }}
                                                                >
                                                                    {tc.result}
                                                                </pre>
                                                            )}
                                                        </details>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {smfs.agentLoading && (
                            <div className="flex justify-start">
                                <div className="flex items-center gap-1 px-4 py-2">
                                    <span className="smfs-dot-1 w-2 h-2 rounded-full bg-[var(--color-ink-muted)] opacity-40" />
                                    <span className="smfs-dot-2 w-2 h-2 rounded-full bg-[var(--color-ink-muted)] opacity-40" />
                                    <span className="smfs-dot-3 w-2 h-2 rounded-full bg-[var(--color-ink-muted)] opacity-40" />
                                </div>
                            </div>
                        )}
                    </>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div
                className="border-t px-4 py-3 shrink-0"
                style={{ borderColor: "var(--color-border-warm)" }}
            >
                <form onSubmit={handleSubmit} className="flex items-end gap-2">
                    <textarea
                        ref={textareaRef}
                        rows={1}
                        value={input}
                        onChange={handleInput}
                        onKeyDown={handleKeyDown}
                        placeholder={
                            smfs.agentLoading ? "Agent is thinking..." : "Ask the agent..."
                        }
                        disabled={smfs.agentLoading}
                        className="flex-1 bg-transparent text-[13px] outline-none resize-none placeholder:text-[var(--color-ink-muted)]/50 leading-relaxed"
                        style={{ color: "var(--color-ink)" }}
                    />
                    {smfs.agentLoading ? (
                        <div className="p-2 rounded-xl" title="Loading">
                            <svg
                                className="animate-spin h-4 w-4"
                                viewBox="0 0 24 24"
                                fill="none"
                                style={{ color: "var(--color-ink-muted)" }}
                            >
                                <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                />
                                <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                />
                            </svg>
                        </div>
                    ) : (
                        showSend && (
                            <button
                                type="submit"
                                className="p-2 rounded-xl bg-[var(--color-ink)] text-[var(--color-paper)] hover:opacity-80 transition-opacity disabled:opacity-30"
                                title="Send"
                            >
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <line x1="12" y1="19" x2="12" y2="5" />
                                    <polyline points="5 12 12 5 19 12" />
                                </svg>
                            </button>
                        )
                    )}
                </form>
            </div>
        </div>
    );
}
