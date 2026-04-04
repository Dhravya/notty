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
