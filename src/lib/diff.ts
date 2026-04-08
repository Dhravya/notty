// Git-style diff/patch engine for note versioning.
// Operates on lines of pretty-printed JSON (or raw text lines).
// Patch format: array of ops — ['=', n] retain, ['+', lines[]] insert, ['-', n] delete.

export type PatchOp = ['=', number] | ['+', string[]] | ['-', number];
export type Patch = PatchOp[];

// Normalize content into diffable lines (pretty-print JSON for meaningful diffs)
export function toLines(content: string): string[] {
    if (!content) return [];
    try {
        return JSON.stringify(JSON.parse(content), null, 2).split('\n');
    } catch {
        return content.split('\n');
    }
}

export function createPatch(oldContent: string, newContent: string): string {
    if (oldContent === newContent) return '[]';

    const oldLines = toLines(oldContent);
    const newLines = toLines(newContent);

    // LCS
    const m = oldLines.length, n = newLines.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
            dp[i][j] = oldLines[i - 1] === newLines[j - 1]
                ? dp[i - 1][j - 1] + 1
                : Math.max(dp[i - 1][j], dp[i][j - 1]);

    // Backtrack to raw edit ops
    type RawOp = { type: '=' | '+' | '-'; line: string };
    const raw: RawOp[] = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
            raw.push({ type: '=', line: oldLines[i - 1] });
            i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            raw.push({ type: '+', line: newLines[j - 1] });
            j--;
        } else {
            raw.push({ type: '-', line: oldLines[i - 1] });
            i--;
        }
    }
    raw.reverse();

    // Compress consecutive same-type ops into compact patch
    const ops: Patch = [];
    for (const { type, line } of raw) {
        const last = ops[ops.length - 1];
        if (type === '=') {
            if (last?.[0] === '=') (last as ['=', number])[1]++;
            else ops.push(['=', 1]);
        } else if (type === '+') {
            if (last?.[0] === '+') (last[1] as string[]).push(line);
            else ops.push(['+', [line]]);
        } else {
            if (last?.[0] === '-') (last as ['-', number])[1]++;
            else ops.push(['-', 1]);
        }
    }

    return JSON.stringify(ops);
}

// Apply a patch to base content, producing the new content
export function applyPatch(baseContent: string, patchStr: string): string {
    const ops: Patch = JSON.parse(patchStr);
    if (ops.length === 0) return baseContent;

    const baseLines = toLines(baseContent);
    const result: string[] = [];
    let idx = 0;

    for (const op of ops) {
        if (op[0] === '=') {
            const count = op[1] as number;
            for (let i = 0; i < count; i++) result.push(baseLines[idx++]);
        } else if (op[0] === '+') {
            result.push(...(op[1] as string[]));
        } else {
            idx += op[1] as number;
        }
    }
    while (idx < baseLines.length) result.push(baseLines[idx++]);

    const text = result.join('\n');
    try { return JSON.stringify(JSON.parse(text)); } catch { return text; }
}
