import { useState, useEffect, useCallback, useRef } from "react";
import { History, RotateCcw, X, Eye, GitBranch, Plus, Trash2, GitMerge, Check } from "lucide-react";
import { useAdapter } from "@/context/adapter-context";
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
    }) + ", " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
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

function versionLabel(v: NoteVersion, index: number, total: number) {
    if (index === total - 1) return "Base";
    return `v${total - index - 1}`;
}

export function NoteHistory({ noteId, currentContent, saveGuardRef, onContentReset, onClose }: {
    noteId: string;
    currentContent: string;
    saveGuardRef: React.MutableRefObject<boolean>;
    onContentReset: () => Promise<void>;
    onClose: () => void;
}) {
    const adapter = useAdapter();
    const [tree, setTree] = useState<NoteTree | null>(null);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<NoteVersion | null>(null);
    const [parentContent, setParentContent] = useState<string | null>(null);
    const [loadingVersion, setLoadingVersion] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [showDiff, setShowDiff] = useState(true);
    const [newBranchName, setNewBranchName] = useState("");
    const [showNewBranch, setShowNewBranch] = useState(false);
    const branchInputRef = useRef<HTMLInputElement>(null);

    const loadTree = useCallback(() => {
        adapter.getNoteTree(noteId).then((t) => {
            setTree(t);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [noteId, adapter]);

    useEffect(() => { loadTree(); }, [loadTree]);

    useEffect(() => {
        if (showNewBranch) branchInputRef.current?.focus();
    }, [showNewBranch]);

    const handleSelectVersion = async (version: NoteVersion) => {
        if (selected?.id === version.id && selected.content) return;
        setLoadingVersion(true);
        setParentContent(null);
        const full = await adapter.getVersion(noteId, version.id);
        if (full) {
            setSelected(full);
            // fetch parent content for proper diff
            if (version.parent_id) {
                const parent = await adapter.getVersion(noteId, version.parent_id);
                if (parent?.content) setParentContent(parent.content);
            }
        }
        setLoadingVersion(false);
    };

    const handleRestore = async () => {
        if (!selected) return;
        setRestoring(true);
        try {
            saveGuardRef.current = true;
            await adapter.restoreVersion(noteId, selected.id);
            await onContentReset();
        } catch (e) {
            saveGuardRef.current = false;
            console.error("Restore failed:", e);
        }
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
            saveGuardRef.current = true;
            await adapter.checkoutBranch(noteId, branch.id);
            await onContentReset();
        } catch (e) {
            saveGuardRef.current = false;
            console.error("Checkout failed:", e);
        }
    };

    const handleDeleteBranch = async (branch: NoteBranch) => {
        try {
            await adapter.deleteBranch(noteId, branch.id);
            loadTree();
        } catch (e) { console.error("Delete branch failed:", e); }
    };

    const handleMerge = async (branch: NoteBranch) => {
        try {
            saveGuardRef.current = true;
            await adapter.mergeBranch(noteId, branch.id);
            await onContentReset();
        } catch (e) {
            saveGuardRef.current = false;
            console.error("Merge failed:", e);
        }
    };

    const branches = tree?.branches || [];
    const versions = tree?.versions || [];
    const currentBranch = branches.find((b) => b.is_current);
    const headIds = new Set(branches.map((b) => b.head_version_id).filter(Boolean));

    // Diff: show what this version introduced (parent → selected)
    const selectedText = selected?.content ? jsonToText(selected.content) : "";
    const baseText = parentContent ? jsonToText(parentContent) : "";
    const diff = selected?.content
        ? parentContent
            ? computeDiff(baseText, selectedText)
            : [] // no parent = base version, no diff to show
        : [];

    const hasChanges = diff.some(l => l.type !== "same");

    return (
        <div className="fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

            <div className="relative ml-auto w-full max-w-3xl bg-[var(--color-paper)] border-l border-[var(--color-border-warm)] shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border-warm)]">
                    <div className="flex items-center gap-2.5">
                        <History size={15} className="text-[var(--color-ink-muted)]" />
                        <h2 className="text-sm font-semibold text-[var(--color-ink)]">History</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--color-sidebar-active)] transition-colors">
                        <X size={15} className="text-[var(--color-ink-muted)]" />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Left sidebar: branches + versions */}
                    <div className="w-60 border-r border-[var(--color-border-warm)] flex flex-col overflow-hidden flex-shrink-0">
                        {/* Branches */}
                        <div className="px-3 pt-3 pb-2 border-b border-[var(--color-border-warm)]">
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[10px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">Branches</span>
                                <button
                                    onClick={() => { setShowNewBranch(!showNewBranch); setNewBranchName(""); }}
                                    className="p-1 rounded hover:bg-[var(--color-sidebar-active)] transition-colors"
                                    title="New branch"
                                >
                                    {showNewBranch ? <X size={12} className="text-[var(--color-ink-muted)]" /> : <Plus size={12} className="text-[var(--color-ink-muted)]" />}
                                </button>
                            </div>

                            {showNewBranch && (
                                <div className="relative mb-2">
                                    <input
                                        ref={branchInputRef}
                                        type="text"
                                        value={newBranchName}
                                        onChange={(e) => setNewBranchName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") handleCreateBranch();
                                            if (e.key === "Escape") { setShowNewBranch(false); setNewBranchName(""); }
                                        }}
                                        placeholder="new-branch-name"
                                        className="w-full text-xs px-2.5 py-1.5 pr-8 rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-paper)] text-[var(--color-ink)] font-mono focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]/20"
                                    />
                                    {newBranchName.trim() && (
                                        <button
                                            onClick={handleCreateBranch}
                                            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 transition-colors"
                                        >
                                            <Check size={14} />
                                        </button>
                                    )}
                                </div>
                            )}

                            <div className="space-y-0.5">
                                {branches.map((branch) => (
                                    <div
                                        key={branch.id}
                                        className={`flex items-center justify-between px-2 py-1.5 rounded-md text-xs group transition-colors ${
                                            branch.is_current
                                                ? "bg-[var(--color-accent)]/8 text-[var(--color-accent)]"
                                                : "text-[var(--color-ink-muted)] hover:bg-[var(--color-sidebar-active)] cursor-pointer"
                                        }`}
                                        onClick={() => !branch.is_current && handleCheckout(branch)}
                                    >
                                        <div className="flex items-center gap-1.5 font-mono truncate min-w-0">
                                            <GitBranch size={11} className="shrink-0" />
                                            <span className="truncate">{branch.name}</span>
                                            {branch.is_current === 1 && (
                                                <span className="text-[9px] font-sans opacity-50 shrink-0">current</span>
                                            )}
                                        </div>
                                        {!branch.is_current && (
                                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleMerge(branch); }}
                                                    className="p-0.5 rounded hover:text-[var(--color-accent)] transition-colors"
                                                    title={`Merge into ${currentBranch?.name || "current"}`}
                                                >
                                                    <GitMerge size={11} />
                                                </button>
                                                {!branch.is_default && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteBranch(branch); }}
                                                        className="p-0.5 rounded hover:text-red-500 transition-colors"
                                                        title="Delete branch"
                                                    >
                                                        <Trash2 size={11} />
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Version timeline */}
                        <div className="flex-1 overflow-y-auto px-3 py-2">
                            <span className="text-[10px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider mb-2 block">
                                Versions
                            </span>
                            {loading ? (
                                <div className="py-4 text-xs text-[var(--color-ink-muted)] text-center">Loading...</div>
                            ) : versions.length === 0 ? (
                                <div className="py-4 text-xs text-[var(--color-ink-muted)] text-center">No history yet</div>
                            ) : (
                                <div className="relative">
                                    {/* Timeline line */}
                                    <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[var(--color-border-warm)]" />

                                    <div className="space-y-0.5">
                                        {versions.map((v, i) => {
                                            const isSelected = v.id === selected?.id;
                                            const isHead = headIds.has(v.id);
                                            const label = versionLabel(v, i, versions.length);
                                            const isOnCurrentBranch = v.branch_id === currentBranch?.id;

                                            return (
                                                <button
                                                    key={v.id}
                                                    onClick={() => handleSelectVersion(v)}
                                                    className={`relative w-full text-left pl-6 pr-2 py-1.5 rounded-md transition-colors group ${
                                                        isSelected
                                                            ? "bg-[var(--color-accent)]/8"
                                                            : "hover:bg-[var(--color-sidebar-active)]"
                                                    }`}
                                                >
                                                    {/* Timeline dot */}
                                                    <div className={`absolute left-[4px] top-1/2 -translate-y-1/2 w-[7px] h-[7px] rounded-full border-[1.5px] transition-colors ${
                                                        isSelected
                                                            ? "border-[var(--color-accent)] bg-[var(--color-accent)]"
                                                            : isHead
                                                                ? "border-[var(--color-accent)] bg-[var(--color-paper)]"
                                                                : isOnCurrentBranch
                                                                    ? "border-[var(--color-ink-muted)]/40 bg-[var(--color-paper)]"
                                                                    : "border-[var(--color-ink-muted)]/25 bg-[var(--color-paper)]"
                                                    }`} />

                                                    <div className="flex items-baseline justify-between gap-2">
                                                        <div className="flex items-baseline gap-1.5 min-w-0">
                                                            <span className={`text-[11px] font-mono shrink-0 ${
                                                                isSelected ? "text-[var(--color-accent)] font-semibold" : "text-[var(--color-ink)] font-medium"
                                                            }`}>
                                                                {label}
                                                            </span>
                                                            <span className="text-[10px] text-[var(--color-ink-muted)] font-mono truncate">
                                                                {v.id.slice(0, 7)}
                                                            </span>
                                                        </div>
                                                        {isHead && (
                                                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-medium shrink-0">
                                                                HEAD
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] text-[var(--color-ink-muted)] mt-0.5">
                                                        {formatTime(v.created_at)}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: Version detail / diff */}
                    <div className="flex-1 overflow-y-auto flex flex-col">
                        {!selected ? (
                            <div className="flex flex-col items-center justify-center h-full text-sm text-[var(--color-ink-muted)] gap-2">
                                <History size={20} className="opacity-20" />
                                <span className="text-xs">Select a version to inspect</span>
                            </div>
                        ) : loadingVersion ? (
                            <div className="flex items-center justify-center h-full text-xs text-[var(--color-ink-muted)]">
                                Loading version...
                            </div>
                        ) : (
                            <>
                                {/* Version info bar */}
                                <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border-warm)]">
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs font-medium text-[var(--color-ink)]">
                                            {selected.title}
                                        </span>
                                        <span className="text-[10px] text-[var(--color-ink-muted)]">
                                            {formatTime(selected.created_at)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center bg-[var(--color-paper)] rounded-md border border-[var(--color-border-warm)] p-0.5">
                                            <button
                                                onClick={() => setShowDiff(true)}
                                                className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                                                    showDiff ? "bg-[var(--color-ink)] text-[var(--color-paper)]" : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                                                }`}
                                            >
                                                Diff
                                            </button>
                                            <button
                                                onClick={() => setShowDiff(false)}
                                                className={`text-[10px] px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                                                    !showDiff ? "bg-[var(--color-ink)] text-[var(--color-paper)]" : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                                                }`}
                                            >
                                                <Eye size={10} /> Content
                                            </button>
                                        </div>
                                        <button
                                            onClick={handleRestore}
                                            disabled={restoring}
                                            className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg bg-[var(--color-accent)] text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                                        >
                                            <RotateCcw size={10} />
                                            {restoring ? "Restoring..." : "Restore this version"}
                                        </button>
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="flex-1 overflow-y-auto p-4">
                                    {showDiff ? (
                                        <div className="font-mono text-[11px] leading-relaxed">
                                            {!parentContent ? (
                                                <div className="text-[var(--color-ink-muted)] text-xs">
                                                    This is the base version — no previous version to diff against.
                                                </div>
                                            ) : !hasChanges ? (
                                                <div className="text-[var(--color-ink-muted)] text-xs">No changes in this version.</div>
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
