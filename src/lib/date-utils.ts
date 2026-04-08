export function formatEntryDate(ts: number): { month: string; day: string; year: string; time: string; full: string } {
    const d = new Date(ts > 1e12 ? ts : ts * 1000);
    if (isNaN(d.getTime())) return { month: "", day: "", year: "", time: "", full: "" };
    return {
        month: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
        day: d.getDate().toString().padStart(2, "0"),
        year: d.getFullYear().toString(),
        time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
        full: d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    };
}

// Cluster items uploaded close together into "moments" (default 30 min gap)
export function clusterByMoment<T extends { created_at: number }>(items: T[], gapSeconds = 30 * 60): T[][] {
    if (items.length === 0) return [];
    const sorted = [...items].sort((a, b) => a.created_at - b.created_at);
    const clusters: T[][] = [[sorted[0]]];
    for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i].created_at - sorted[i - 1].created_at;
        if (gap <= gapSeconds) {
            clusters[clusters.length - 1].push(sorted[i]);
        } else {
            clusters.push([sorted[i]]);
        }
    }
    return clusters;
}

export function formatTimeRange(startTs: number, endTs: number): string {
    const fmt = (ts: number) => {
        const d = new Date(ts > 1e12 ? ts : ts * 1000);
        return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    };
    const start = fmt(startTs);
    const end = fmt(endTs);
    return start === end ? start : `${start} – ${end}`;
}

export function groupByDate<T extends { created_at: number }>(notes: T[]): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const note of notes) {
        const d = new Date(note.created_at > 1e12 ? note.created_at : note.created_at * 1000);
        const key = isNaN(d.getTime()) ? "Unknown" : d.toISOString().split("T")[0];
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(note);
    }
    return groups;
}
