import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { History, RotateCcw, X, Eye, GitBranch, Plus, Trash2, GitMerge, Check } from "lucide-react";
import { useAdapter } from "@/context/adapter-context";
import type { NoteVersion, NoteBranch, NoteTree } from "@/lib/adapter";

// Stable branch colors that work on both light and dark
const BRANCH_COLORS = [
    "var(--color-accent)", // teal — default/main branch
    "#8B5CF6",             // violet
    "#F59E0B",             // amber
    "#EC4899",             // pink
    "#14B8A6",             // teal-alt
    "#F97316",             // orange
    "#6366F1",             // indigo
    "#EF4444",             // red
];

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
    }) + ", " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
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

function createdByLabel(v: NoteVersion): string | null {
    if (!v.created_by || v.created_by === "system") return null;
    if (v.created_by === "auto-backup") return "backup";
    if (v.created_by === "restore") return "restored";
    return v.created_by;
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
    const panelRef = useRef<HTMLDivElement>(null);
    const versionListRef = useRef<HTMLDivElement>(null);

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

    // Close on Escape
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !showNewBranch) onClose();
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [onClose, showNewBranch]);

    const branches = tree?.branches || [];
    const versions = tree?.versions || [];
    const currentBranch = branches.find((b) => b.is_current);

    // Build lookup maps
    const branchMap = useMemo(() => {
        const m = new Map<string, NoteBranch>();
        branches.forEach(b => m.set(b.id, b));
        return m;
    }, [branches]);

    const branchColorMap = useMemo(() => {
        const m = new Map<string, string>();
        // Sort: default branch first, then by creation time, for stable color assignment
        const sorted = [...branches].sort((a, b) => {
            if (a.is_default) return -1;
            if (b.is_default) return 1;
            return a.created_at - b.created_at;
        });
        sorted.forEach((b, i) => m.set(b.id, BRANCH_COLORS[i % BRANCH_COLORS.length]));
        return m;
    }, [branches]);

    const headMap = useMemo(() => {
        // version_id -> branch that has it as HEAD
        const m = new Map<string, NoteBranch>();
        branches.forEach(b => {
            if (b.head_version_id) m.set(b.head_version_id, b);
        });
        return m;
    }, [branches]);

    // Version numbering per branch
    const versionLabels = useMemo(() => {
        const labels = new Map<string, string>();
        // Group by branch, number oldest-first within each branch
        const byBranch = new Map<string, NoteVersion[]>();
        for (const v of versions) {
            const bid = v.branch_id || "";
            if (!byBranch.has(bid)) byBranch.set(bid, []);
            byBranch.get(bid)!.push(v);
        }
        for (const [, bVersions] of byBranch) {
            // versions come newest-first, reverse for numbering
            const ordered = [...bVersions].reverse();
            ordered.forEach((v, i) => {
                labels.set(v.id, i === 0 ? "Base" : `v${i}`);
            });
        }
        return labels;
    }, [versions]);

    const handleSelectVersion = useCallback(async (version: NoteVersion) => {
        if (selected?.id === version.id && selected.content) return;
        setLoadingVersion(true);
        setParentContent(null);
        const full = await adapter.getVersion(noteId, version.id);
        if (full) {
            setSelected(full);
            if (version.parent_id) {
                const parent = await adapter.getVersion(noteId, version.parent_id);
                if (parent?.content) setParentContent(parent.content);
            }
        }
        setLoadingVersion(false);
    }, [adapter, noteId, selected?.id, selected?.content]);

    // Keyboard navigation for version list
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (showNewBranch) return;
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            e.preventDefault();
            const currentIdx = selected ? versions.findIndex(v => v.id === selected.id) : -1;
            let nextIdx: number;
            if (e.key === "ArrowUp") {
                nextIdx = currentIdx <= 0 ? versions.length - 1 : currentIdx - 1;
            } else {
                nextIdx = currentIdx >= versions.length - 1 ? 0 : currentIdx + 1;
            }
            if (versions[nextIdx]) handleSelectVersion(versions[nextIdx]);
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [versions, selected, showNewBranch, handleSelectVersion]);

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

    // Diff: parent → selected (what this version introduced)
    const selectedText = selected?.content ? jsonToText(selected.content) : "";
    const baseText = parentContent ? jsonToText(parentContent) : "";
    const diff = selected?.content
        ? parentContent
            ? computeDiff(baseText, selectedText)
            : []
        : [];

    const hasChanges = diff.some(l => l.type !== "same");
    const additions = diff.filter(l => l.type === "add").length;
    const deletions = diff.filter(l => l.type === "remove").length;

    const selectedBranch = selected?.branch_id ? branchMap.get(selected.branch_id) : null;
    const selectedColor = selected?.branch_id ? branchColorMap.get(selected.branch_id) : undefined;

    return (
        <div className="fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

            <div
                ref={panelRef}
                className="relative ml-auto w-full max-w-3xl bg-[var(--color-paper)] border-l border-[var(--color-border-warm)] shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-200"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border-warm)]">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <History size={15} className="text-[var(--color-ink-muted)]" />
                            <h2 className="text-sm font-semibold text-[var(--color-ink)]">History</h2>
                        </div>
                        {currentBranch && (
                            <div className="flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded-md bg-[var(--color-sidebar-active)] text-[var(--color-ink)]">
                                <GitBranch size={11} style={{ color: branchColorMap.get(currentBranch.id) }} />
                                {currentBranch.name}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[var(--color-ink-muted)] hidden sm:block">
                            <kbd className="px-1 py-0.5 rounded border border-[var(--color-border-warm)] text-[9px]">↑↓</kbd> navigate
                        </span>
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--color-sidebar-active)] transition-colors">
                            <X size={15} className="text-[var(--color-ink-muted)]" />
                        </button>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Left sidebar */}
                    <div className="w-64 border-r border-[var(--color-border-warm)] flex flex-col overflow-hidden flex-shrink-0">
                        {/* Branches */}
                        <div className="px-3 pt-3 pb-2 border-b border-[var(--color-border-warm)]">
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[10px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">
                                    Branches
                                    <span className="ml-1.5 text-[var(--color-ink-muted)]/60 normal-case tracking-normal font-normal">
                                        {branches.length}
                                    </span>
                                </span>
                                <button
                                    onClick={() => { setShowNewBranch(!showNewBranch); setNewBranchName(""); }}
                                    className="p-1 rounded hover:bg-[var(--color-sidebar-active)] transition-colors"
                                    title="New branch"
                                >
                                    {showNewBranch
                                        ? <X size={12} className="text-[var(--color-ink-muted)]" />
                                        : <Plus size={12} className="text-[var(--color-ink-muted)]" />
                                    }
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
                                        placeholder="branch-name"
                                        className="w-full text-xs px-2.5 py-1.5 pr-8 rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-paper)] text-[var(--color-ink)] font-mono focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]/20 placeholder:text-[var(--color-ink-muted)]/40"
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
                                {branches.map((branch) => {
                                    const color = branchColorMap.get(branch.id) || "var(--color-ink-muted)";
                                    return (
                                        <div
                                            key={branch.id}
                                            className={`flex items-center justify-between px-2 py-1.5 rounded-md text-xs group transition-colors ${
                                                branch.is_current
                                                    ? "bg-[var(--color-sidebar-active)]"
                                                    : "hover:bg-[var(--color-sidebar-active)]/60 cursor-pointer"
                                            }`}
                                            onClick={() => !branch.is_current && handleCheckout(branch)}
                                        >
                                            <div className="flex items-center gap-1.5 truncate min-w-0">
                                                <div
                                                    className="w-2 h-2 rounded-full shrink-0"
                                                    style={{ backgroundColor: color }}
                                                />
                                                <span className={`font-mono truncate ${branch.is_current ? "text-[var(--color-ink)] font-medium" : "text-[var(--color-ink-muted)]"}`}>
                                                    {branch.name}
                                                </span>
                                                {branch.is_current === 1 && (
                                                    <span className="text-[9px] font-sans text-[var(--color-ink-muted)] shrink-0">current</span>
                                                )}
                                            </div>
                                            {!branch.is_current && (
                                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleMerge(branch); }}
                                                        className="p-0.5 rounded hover:text-[var(--color-accent)] text-[var(--color-ink-muted)] transition-colors"
                                                        title={`Merge into ${currentBranch?.name || "current"}`}
                                                    >
                                                        <GitMerge size={11} />
                                                    </button>
                                                    {!branch.is_default && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteBranch(branch); }}
                                                            className="p-0.5 rounded hover:text-red-500 text-[var(--color-ink-muted)] transition-colors"
                                                            title="Delete branch"
                                                        >
                                                            <Trash2 size={11} />
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Version timeline */}
                        <div ref={versionListRef} className="flex-1 overflow-y-auto px-3 py-2">
                            <span className="text-[10px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider mb-2 block">
                                Versions
                                <span className="ml-1.5 text-[var(--color-ink-muted)]/60 normal-case tracking-normal font-normal">
                                    {versions.length}
                                </span>
                            </span>
                            {loading ? (
                                <div className="py-8 text-xs text-[var(--color-ink-muted)] text-center">Loading...</div>
                            ) : versions.length === 0 ? (
                                <div className="py-8 text-xs text-[var(--color-ink-muted)] text-center">No history yet</div>
                            ) : (
                                <div className="relative">
                                    {/* Timeline line */}
                                    <div className="absolute left-[7px] top-3 bottom-3 w-px bg-[var(--color-border-warm)]" />

                                    <div className="space-y-px">
                                        {versions.map((v) => {
                                            const isSelected = v.id === selected?.id;
                                            const headBranch = headMap.get(v.id);
                                            const branchName = v.branch_id ? branchMap.get(v.branch_id)?.name : undefined;
                                            const color = v.branch_id ? branchColorMap.get(v.branch_id) : "var(--color-ink-muted)";
                                            const label = versionLabels.get(v.id) || v.id.slice(0, 7);
                                            const tag = createdByLabel(v);

                                            return (
                                                <button
                                                    key={v.id}
                                                    onClick={() => handleSelectVersion(v)}
                                                    className={`relative w-full text-left pl-[22px] pr-2 py-2 rounded-md transition-colors ${
                                                        isSelected
                                                            ? "bg-[var(--color-sidebar-active)]"
                                                            : "hover:bg-[var(--color-sidebar-active)]/60"
                                                    }`}
                                                >
                                                    {/* Timeline dot */}
                                                    <div
                                                        className={`absolute left-[4px] top-1/2 -translate-y-1/2 rounded-full transition-all ${
                                                            isSelected
                                                                ? "w-[9px] h-[9px]"
                                                                : headBranch
                                                                    ? "w-[8px] h-[8px] border-2"
                                                                    : "w-[7px] h-[7px] border-[1.5px]"
                                                        }`}
                                                        style={{
                                                            backgroundColor: isSelected ? color : (headBranch ? undefined : "var(--color-paper)"),
                                                            borderColor: isSelected ? undefined : color,
                                                            boxShadow: isSelected ? `0 0 0 2px color-mix(in srgb, ${color} 25%, transparent)` : undefined,
                                                        }}
                                                    />

                                                    {/* Row 1: version label + hash + badges */}
                                                    <div className="flex items-center justify-between gap-1.5">
                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                            <span className={`text-[11px] font-mono shrink-0 ${
                                                                isSelected ? "font-semibold" : "font-medium"
                                                            }`} style={{ color: isSelected ? color : "var(--color-ink)" }}>
                                                                {label}
                                                            </span>
                                                            <span className="text-[10px] text-[var(--color-ink-muted)]/60 font-mono">
                                                                {v.id.slice(0, 7)}
                                                            </span>
                                                            {tag && (
                                                                <span className="text-[9px] px-1 py-px rounded bg-[var(--color-border-warm)] text-[var(--color-ink-muted)] shrink-0">
                                                                    {tag}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            {headBranch && (
                                                                <span
                                                                    className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                                                                    style={{
                                                                        backgroundColor: `color-mix(in srgb, ${branchColorMap.get(headBranch.id) || color} 12%, transparent)`,
                                                                        color: branchColorMap.get(headBranch.id) || color,
                                                                    }}
                                                                >
                                                                    {headBranch.name} HEAD
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Row 2: branch + time */}
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        {branchName && (
                                                            <span
                                                                className="text-[9px] font-mono opacity-70"
                                                                style={{ color }}
                                                            >
                                                                {branchName}
                                                            </span>
                                                        )}
                                                        <span className="text-[10px] text-[var(--color-ink-muted)]">
                                                            {formatTime(v.created_at)}
                                                        </span>
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
                    <div className="flex-1 overflow-y-auto flex flex-col min-w-0">
                        {!selected ? (
                            <div className="flex flex-col items-center justify-center h-full gap-3">
                                <History size={24} className="text-[var(--color-ink-muted)] opacity-15" />
                                <div className="text-center">
                                    <p className="text-xs text-[var(--color-ink-muted)]">Select a version to inspect</p>
                                    <p className="text-[10px] text-[var(--color-ink-muted)]/50 mt-1">Use arrow keys or click</p>
                                </div>
                            </div>
                        ) : loadingVersion ? (
                            <div className="flex items-center justify-center h-full text-xs text-[var(--color-ink-muted)]">
                                Loading version...
                            </div>
                        ) : (
                            <>
                                {/* Version detail bar */}
                                <div className="px-4 py-3 border-b border-[var(--color-border-warm)] space-y-2">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-medium text-[var(--color-ink)]">
                                                    {versionLabels.get(selected.id) || selected.id.slice(0, 7)}
                                                </span>
                                                <span className="text-[10px] font-mono text-[var(--color-ink-muted)]">
                                                    {selected.id.slice(0, 7)}
                                                </span>
                                                {selectedBranch && (
                                                    <span
                                                        className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-md"
                                                        style={{
                                                            backgroundColor: `color-mix(in srgb, ${selectedColor} 10%, transparent)`,
                                                            color: selectedColor,
                                                        }}
                                                    >
                                                        <GitBranch size={9} />
                                                        {selectedBranch.name}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1 text-[10px] text-[var(--color-ink-muted)]">
                                                <span>{formatTime(selected.created_at)}</span>
                                                {selected.title && <span>&middot; {selected.title}</span>}
                                                {createdByLabel(selected) && <span>&middot; {createdByLabel(selected)}</span>}
                                            </div>
                                        </div>
                                        <button
                                            onClick={handleRestore}
                                            disabled={restoring}
                                            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-[var(--color-accent)] text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
                                        >
                                            <RotateCcw size={11} />
                                            {restoring ? "Restoring..." : "Restore"}
                                        </button>
                                    </div>

                                    {/* Toggle + diff stats */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center bg-[var(--color-sidebar)] rounded-md p-0.5">
                                            <button
                                                onClick={() => setShowDiff(true)}
                                                className={`text-[10px] px-2.5 py-1 rounded transition-colors font-medium ${
                                                    showDiff
                                                        ? "bg-[var(--color-paper)] text-[var(--color-ink)] shadow-sm"
                                                        : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                                                }`}
                                            >
                                                Changes
                                            </button>
                                            <button
                                                onClick={() => setShowDiff(false)}
                                                className={`text-[10px] px-2.5 py-1 rounded transition-colors font-medium flex items-center gap-1 ${
                                                    !showDiff
                                                        ? "bg-[var(--color-paper)] text-[var(--color-ink)] shadow-sm"
                                                        : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                                                }`}
                                            >
                                                <Eye size={10} /> Content
                                            </button>
                                        </div>
                                        {showDiff && hasChanges && (
                                            <div className="flex items-center gap-2 text-[10px] font-mono">
                                                <span className="text-emerald-600 dark:text-emerald-400">+{additions}</span>
                                                <span className="text-red-600 dark:text-red-400">-{deletions}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="flex-1 overflow-y-auto p-4">
                                    {showDiff ? (
                                        <div className="font-mono text-[11px] leading-relaxed">
                                            {!parentContent ? (
                                                <div className="text-[var(--color-ink-muted)] text-xs py-8 text-center">
                                                    Base version — no previous version to diff against
                                                </div>
                                            ) : !hasChanges ? (
                                                <div className="text-[var(--color-ink-muted)] text-xs py-8 text-center">
                                                    No changes from previous version
                                                </div>
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
