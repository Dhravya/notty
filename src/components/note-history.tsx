import { useState, useEffect, useCallback } from "react";
import { History, RotateCcw, X, Eye, GitBranch, Plus, Trash2 } from "lucide-react";
import { useAdapter } from "@/context/adapter-context";
import { GitTree } from "./git-tree";
import type { NoteVersion, NoteBranch, NoteTree } from "@/lib/adapter";

function formatTime(ts: number): string {
    const d = new Date(ts > 1e12 ? ts : ts * 1000);
    if (isNaN(d.getTime())) return "Unknown";
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000) return "Just now";
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    const sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleDateString("en-US", {
        month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }),
    }) + " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function jsonToText(content: string): string {
    try { return extractText(JSON.parse(content)); }
    catch { return content; }
}

function extractText(node: any): string {
    if (!node) return "";
    if (node.text) return node.text;
    if (!node.content) return "";
    return node.content.map((n: any) => extractText(n)).join(
        node.type === "paragraph" ? "" : "\n"
    ) + (node.type === "paragraph" ? "\n" : "");
}

type DiffLine = { type: "same" | "add" | "remove"; text: string };

function computeDiff(oldText: string, newText: string): DiffLine[] {
    const a = oldText.split("\n"), b = newText.split("\n");
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
            dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    const result: DiffLine[] = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) { result.unshift({ type: "same", text: a[i - 1] }); i--; j--; }
        else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) { result.unshift({ type: "add", text: b[j - 1] }); j--; }
        else { result.unshift({ type: "remove", text: a[i - 1] }); i--; }
    }
    return result;
}

export function NoteHistory({ noteId, currentContent, onRestore, onBranchSwitch, onClose }: {
    noteId: string;
    currentContent: string;
    onRestore: () => void;
    onBranchSwitch: (branchName: string) => void;
    onClose: () => void;
}) {
    const adapter = useAdapter();
    const [tree, setTree] = useState<NoteTree | null>(null);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<NoteVersion | null>(null);
    const [loadingVersion, setLoadingVersion] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [showDiff, setShowDiff] = useState(true);
    const [newBranchName, setNewBranchName] = useState("");
    const [showNewBranch, setShowNewBranch] = useState(false);

    const loadTree = useCallback(() => {
        adapter.getNoteTree(noteId).then((t) => {
            setTree(t);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [noteId, adapter]);

    useEffect(() => { loadTree(); }, [loadTree]);

    const handleSelectVersion = async (versionId: string) => {
        if (selected?.id === versionId && selected.content) return;
        setLoadingVersion(true);
        const full = await adapter.getVersion(noteId, versionId);
        if (full) setSelected(full);
        setLoadingVersion(false);
    };

    const handleRestore = async () => {
        if (!selected) return;
        setRestoring(true);
        try {
            await adapter.restoreVersion(noteId, selected.id);
            onRestore();
        } catch (e) { console.error("Restore failed:", e); }
        setRestoring(false);
    };

    const handleCreateBranch = async () => {
        if (!newBranchName.trim()) return;
        try {
            await adapter.createBranch(noteId, newBranchName.trim());
            setNewBranchName("");
            setShowNewBranch(false);
            loadTree();
        } catch (e: any) {
            console.error("Create branch failed:", e);
        }
    };

    const handleCheckout = async (branch: NoteBranch) => {
        try {
            const result = await adapter.checkoutBranch(noteId, branch.id);
            onBranchSwitch(result.branch);
        } catch (e) { console.error("Checkout failed:", e); }
    };

    const handleDeleteBranch = async (branch: NoteBranch) => {
        try {
            await adapter.deleteBranch(noteId, branch.id);
            loadTree();
        } catch (e) { console.error("Delete branch failed:", e); }
    };

    const branches = tree?.branches || [];
    const versions = tree?.versions || [];
    const currentBranch = branches.find((b) => b.is_current);
    const syncMode = tree?.sync_mode || "cloud";

    const currentText = jsonToText(currentContent);
    const selectedText = selected?.content ? jsonToText(selected.content) : "";
    const diff = selected?.content ? computeDiff(selectedText, currentText) : [];

    return (
        <div className="fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />

            <div className="relative ml-auto w-full max-w-3xl bg-[var(--color-paper)] border-l border-[var(--color-border-warm)] shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-border-warm)]">
                    <div className="flex items-center gap-2.5">
                        <History size={16} className="text-[var(--color-ink-muted)]" />
                        <h2 className="text-sm font-semibold text-[var(--color-ink)]">Version Control</h2>
                        {currentBranch && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-mono font-medium">
                                {currentBranch.name}
                            </span>
                        )}
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                            syncMode === "cloud"
                                ? "bg-emerald-500/10 text-emerald-600"
                                : "bg-amber-500/10 text-amber-600"
                        }`}>
                            {syncMode === "cloud" ? "synced" : "local"}
                        </span>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--color-sidebar-active)] transition-colors">
                        <X size={16} className="text-[var(--color-ink-muted)]" />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Left: Tree + Branches */}
                    <div className="w-56 border-r border-[var(--color-border-warm)] flex flex-col overflow-hidden flex-shrink-0">
                        {/* Branch list */}
                        <div className="px-3 py-2.5 border-b border-[var(--color-border-warm)]">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">Branches</span>
                                <button
                                    onClick={() => setShowNewBranch(!showNewBranch)}
                                    className="p-1 rounded hover:bg-[var(--color-sidebar-active)] transition-colors"
                                    title="New branch"
                                >
                                    <Plus size={12} className="text-[var(--color-ink-muted)]" />
                                </button>
                            </div>

                            {showNewBranch && (
                                <div className="flex gap-1 mb-2">
                                    <input
                                        type="text"
                                        value={newBranchName}
                                        onChange={(e) => setNewBranchName(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && handleCreateBranch()}
                                        placeholder="branch-name"
                                        className="flex-1 text-xs px-2 py-1 rounded border border-[var(--color-border-warm)] bg-[var(--color-paper)] text-[var(--color-ink)] font-mono focus:outline-none focus:border-[var(--color-accent)]"
                                        autoFocus
                                    />
                                    <button
                                        onClick={handleCreateBranch}
                                        className="text-xs px-2 py-1 rounded bg-[var(--color-accent)] text-white"
                                    >
                                        Create
                                    </button>
                                </div>
                            )}

                            {branches.map((branch) => (
                                <div
                                    key={branch.id}
                                    className={`flex items-center justify-between px-2 py-1.5 rounded-md text-xs group ${
                                        branch.is_current
                                            ? "bg-[var(--color-accent)]/5 text-[var(--color-accent)]"
                                            : "text-[var(--color-ink-muted)] hover:bg-[var(--color-sidebar-active)]"
                                    }`}
                                >
                                    <button
                                        onClick={() => !branch.is_current && handleCheckout(branch)}
                                        className="flex items-center gap-1.5 font-mono truncate"
                                        disabled={!!branch.is_current}
                                    >
                                        <GitBranch size={11} />
                                        {branch.name}
                                        {branch.is_current === 1 && (
                                            <span className="text-[8px] font-sans opacity-60">HEAD</span>
                                        )}
                                    </button>
                                    {!branch.is_default && !branch.is_current && (
                                        <button
                                            onClick={() => handleDeleteBranch(branch)}
                                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-500 transition-all"
                                        >
                                            <Trash2 size={10} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Git tree graph */}
                        <div className="flex-1 overflow-y-auto overflow-x-auto px-1 py-2">
                            {loading ? (
                                <div className="p-3 text-xs text-[var(--color-ink-muted)]">Loading...</div>
                            ) : versions.length === 0 ? (
                                <div className="p-3 text-xs text-[var(--color-ink-muted)]">
                                    No history yet
                                </div>
                            ) : (
                                <GitTree
                                    versions={versions}
                                    branches={branches}
                                    syncMode={syncMode}
                                    selectedId={selected?.id}
                                    onSelect={handleSelectVersion}
                                />
                            )}
                        </div>
                    </div>

                    {/* Right: Version detail / diff */}
                    <div className="flex-1 overflow-y-auto flex flex-col">
                        {!selected ? (
                            <div className="flex flex-col items-center justify-center h-full text-sm text-[var(--color-ink-muted)] gap-2">
                                <GitBranch size={24} className="opacity-30" />
                                <span>Click a version in the tree to inspect</span>
                            </div>
                        ) : loadingVersion ? (
                            <div className="flex items-center justify-center h-full text-sm text-[var(--color-ink-muted)]">
                                Reconstructing...
                            </div>
                        ) : (
                            <>
                                {/* Version info bar */}
                                <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border-warm)] bg-[var(--color-card)]">
                                    <div className="flex items-center gap-2">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-medium text-[var(--color-ink)]">
                                                {formatTime(selected.created_at)}
                                            </span>
                                            <span className="text-[10px] text-[var(--color-ink-muted)]">
                                                {selected.title}
                                                {selected.created_by && selected.created_by !== "system" && (
                                                    <> &middot; {selected.created_by === "auto-backup" ? "pre-restore" :
                                                     selected.created_by === "restore" ? "restored" :
                                                     selected.created_by}</>
                                                )}
                                                {selected.is_checkpoint ? " (checkpoint)" : ""}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1 bg-[var(--color-paper)] rounded-md border border-[var(--color-border-warm)]">
                                            <button
                                                onClick={() => setShowDiff(true)}
                                                className={`text-[10px] px-2 py-1 rounded-md transition-colors ${
                                                    showDiff ? "bg-[var(--color-ink)] text-[var(--color-paper)]" : "text-[var(--color-ink-muted)]"
                                                }`}
                                            >
                                                Diff
                                            </button>
                                            <button
                                                onClick={() => setShowDiff(false)}
                                                className={`text-[10px] px-2 py-1 rounded-md transition-colors flex items-center gap-0.5 ${
                                                    !showDiff ? "bg-[var(--color-ink)] text-[var(--color-paper)]" : "text-[var(--color-ink-muted)]"
                                                }`}
                                            >
                                                <Eye size={10} /> Raw
                                            </button>
                                        </div>
                                        <button
                                            onClick={handleRestore}
                                            disabled={restoring}
                                            className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg bg-[var(--color-accent)] text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                                        >
                                            <RotateCcw size={10} />
                                            {restoring ? "Restoring..." : "Restore"}
                                        </button>
                                    </div>
                                </div>

                                {/* Diff / preview content */}
                                <div className="flex-1 overflow-y-auto p-4">
                                    {showDiff ? (
                                        <div className="font-mono text-[11px] leading-relaxed">
                                            {diff.length === 0 ? (
                                                <div className="text-[var(--color-ink-muted)]">Identical to current</div>
                                            ) : diff.map((line, i) => (
                                                <div
                                                    key={i}
                                                    className={`px-2 py-0.5 rounded-sm ${
                                                        line.type === "add" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" :
                                                        line.type === "remove" ? "bg-red-500/10 text-red-700 dark:text-red-400" :
                                                        "text-[var(--color-ink-muted)]"
                                                    }`}
                                                >
                                                    <span className="select-none mr-2 opacity-40">
                                                        {line.type === "add" ? "+" : line.type === "remove" ? "−" : " "}
                                                    </span>
                                                    {line.text || " "}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm text-[var(--color-ink)]">
                                            {selectedText}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
