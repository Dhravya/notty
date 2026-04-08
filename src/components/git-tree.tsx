import { useMemo } from "react";
import type { NoteVersion, NoteBranch } from "@/lib/adapter";

const COL_W = 28;
const ROW_H = 32;
const DOT_R = 4;
const PAD_X = 16;
const PAD_Y = 12;

type LayoutNode = NoteVersion & { col: number; row: number };

function layoutTree(
    versions: NoteVersion[],
    branches: NoteBranch[]
): { nodes: LayoutNode[]; branchCols: Map<string, number> } {
    // Assign columns: default branch first, then by creation time
    const sorted = [...branches].sort((a, b) => {
        if (a.is_default) return -1;
        if (b.is_default) return 1;
        return a.created_at - b.created_at;
    });
    const branchCols = new Map<string, number>();
    sorted.forEach((b, i) => branchCols.set(b.id, i));

    // Sort versions newest-first (top of graph)
    const byTime = [...versions].sort((a, b) => b.created_at - a.created_at);

    const nodes: LayoutNode[] = byTime.map((v, i) => ({
        ...v,
        col: branchCols.get(v.branch_id || "") ?? 0,
        row: i,
    }));

    return { nodes, branchCols };
}

export function GitTree({
    versions,
    branches,
    syncMode,
    selectedId,
    onSelect,
}: {
    versions: NoteVersion[];
    branches: NoteBranch[];
    syncMode: string;
    selectedId?: string | null;
    onSelect: (versionId: string) => void;
}) {
    const { nodes, branchCols } = useMemo(() => layoutTree(versions, branches), [versions, branches]);

    const nodeMap = useMemo(() => {
        const m = new Map<string, LayoutNode>();
        nodes.forEach((n) => m.set(n.id, n));
        return m;
    }, [nodes]);

    const headIds = useMemo(() => new Set(branches.map((b) => b.head_version_id).filter(Boolean)), [branches]);
    const currentBranch = branches.find((b) => b.is_current);

    const width = (branchCols.size || 1) * COL_W + PAD_X * 2;
    const height = nodes.length * ROW_H + PAD_Y * 2 + 20;

    const isCloud = syncMode === "cloud";

    function cx(col: number) { return PAD_X + col * COL_W + COL_W / 2; }
    function cy(row: number) { return PAD_Y + 20 + row * ROW_H; }

    function branchColor(branchId: string | undefined, isCurrent: boolean) {
        if (isCurrent) return isCloud ? "var(--color-accent)" : "#F59E0B";
        return "var(--color-ink-muted)";
    }

    return (
        <svg
            width={width}
            height={height}
            className="select-none"
            style={{ minWidth: width }}
        >
            {/* Branch labels */}
            {[...branchCols.entries()].map(([branchId, col]) => {
                const branch = branches.find((b) => b.id === branchId);
                if (!branch) return null;
                const isCurrent = branch.is_current === 1;
                return (
                    <text
                        key={branchId}
                        x={cx(col)}
                        y={PAD_Y + 6}
                        textAnchor="middle"
                        fontSize={9}
                        fontWeight={isCurrent ? 600 : 400}
                        fill={branchColor(branchId, isCurrent)}
                        className="font-mono"
                    >
                        {branch.name}
                    </text>
                );
            })}

            {/* Connecting lines */}
            {nodes.map((node) => {
                if (!node.parent_id) return null;
                const parent = nodeMap.get(node.parent_id);
                if (!parent) return null;

                const x1 = cx(node.col);
                const y1 = cy(node.row);
                const x2 = cx(parent.col);
                const y2 = cy(parent.row);

                const isCurrent = node.branch_id === currentBranch?.id;
                const color = branchColor(node.branch_id, isCurrent);

                if (node.col === parent.col) {
                    return (
                        <line
                            key={`l-${node.id}`}
                            x1={x1} y1={y1} x2={x2} y2={y2}
                            stroke={color} strokeWidth={1.5} opacity={0.5}
                        />
                    );
                }

                // Curved line for cross-branch connections
                const midY = y1 + (y2 - y1) * 0.3;
                return (
                    <path
                        key={`l-${node.id}`}
                        d={`M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`}
                        stroke={color} strokeWidth={1.5} fill="none" opacity={0.5}
                    />
                );
            })}

            {/* Version dots */}
            {nodes.map((node) => {
                const x = cx(node.col);
                const y = cy(node.row);
                const isCurrent = node.branch_id === currentBranch?.id;
                const isHead = headIds.has(node.id);
                const isSelected = node.id === selectedId;
                const color = branchColor(node.branch_id, isCurrent);
                const r = node.is_checkpoint ? DOT_R + 1 : DOT_R;

                return (
                    <g key={node.id} onClick={() => onSelect(node.id)} className="cursor-pointer">
                        {/* Selection ring */}
                        {isSelected && (
                            <circle cx={x} cy={y} r={r + 4} fill="none" stroke={color} strokeWidth={1.5} opacity={0.3} />
                        )}
                        {/* HEAD ring */}
                        {isHead && (
                            <circle cx={x} cy={y} r={r + 2.5} fill="none" stroke={color} strokeWidth={1} opacity={0.6} />
                        )}
                        {/* Dot */}
                        <circle
                            cx={x} cy={y} r={r}
                            fill={node.is_checkpoint ? color : "var(--color-paper)"}
                            stroke={color}
                            strokeWidth={node.is_checkpoint ? 0 : 1.5}
                        />
                        {/* Cloud/local indicator — tiny icon */}
                        {isHead && (
                            <text
                                x={x + r + 5}
                                y={y + 3}
                                fontSize={8}
                                fill={isCloud ? "#10B981" : "#F59E0B"}
                                opacity={0.7}
                            >
                                {isCloud ? "☁" : "⬤"}
                            </text>
                        )}
                    </g>
                );
            })}
        </svg>
    );
}
