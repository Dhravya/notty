import { Link } from "react-router";
import type { Note } from "@/lib/adapter";

const LIGHT_COLORS = [
    { bg: "#F0E6D3", text: "#5C4A2E" },
    { bg: "#D4E8D0", text: "#2D4A28" },
    { bg: "#D6E4F0", text: "#2A3F5C" },
    { bg: "#F0D6D6", text: "#5C2A2A" },
    { bg: "#E8D8F0", text: "#3F2A5C" },
    { bg: "#F0EAD6", text: "#5C5028" },
    { bg: "#D6F0EA", text: "#2A5C4A" },
    { bg: "#F0D6E8", text: "#5C2A4A" },
    { bg: "#E0E8D0", text: "#3A4A28" },
    { bg: "#D6E0F0", text: "#2A355C" },
    { bg: "#F0E0D6", text: "#5C3A2A" },
    { bg: "#D8F0D6", text: "#2A5C2E" },
];

const DARK_COLORS = [
    { bg: "#2E2820", text: "#D4C4A8" },
    { bg: "#1E2C1A", text: "#A8CCA0" },
    { bg: "#1A2433", text: "#9AB4D4" },
    { bg: "#301E1E", text: "#D4A0A0" },
    { bg: "#261E30", text: "#B8A0D4" },
    { bg: "#2C2818", text: "#D4C898" },
    { bg: "#1A2C26", text: "#98D4BC" },
    { bg: "#301E28", text: "#D4A0BC" },
    { bg: "#222C1A", text: "#B0C898" },
    { bg: "#1A1E30", text: "#9CA8D4" },
    { bg: "#2C2018", text: "#D4B098" },
    { bg: "#1A2C1C", text: "#98D4A0" },
];

export function hashStr(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
}

export function getNoteColor(id: string, dark?: boolean) {
    const colors = dark ? DARK_COLORS : LIGHT_COLORS;
    return colors[hashStr(id) % colors.length];
}

function extractText(node: any): string {
    if (node.text) return node.text;
    if (node.content) return node.content.map(extractText).join("");
    return "";
}

export function extractPreview(content: string): string {
    if (!content) return "";
    try {
        const parsed = typeof content === "string" ? JSON.parse(content) : content;
        if (parsed?.type === "doc" && parsed.content) {
            return parsed.content.slice(1, 5).map(extractText).filter(Boolean).join(" ").slice(0, 200);
        }
        return "";
    } catch {
        return content.replace(/<[^>]*>/g, "").slice(0, 200);
    }
}

function formatDate(ts: number): string {
    const d = new Date(ts > 1e12 ? ts : ts * 1000);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatYear(ts: number): string {
    const d = new Date(ts > 1e12 ? ts : ts * 1000);
    return isNaN(d.getTime()) ? "" : d.getFullYear().toString();
}

export function NoteCard({
    note, onDelete, onOpen, folderName, isDark,
}: {
    note: Note;
    onDelete: (id: string) => void;
    onOpen?: (note: Note) => void;
    folderName?: string;
    isDark?: boolean;
}) {
    const title = note.title || "Untitled";
    const preview = extractPreview(note.content);
    const color = getNoteColor(note.id, isDark);
    const year = formatYear(note.created_at);
    const date = formatDate(note.updated_at);
    const isLocal = note.sync_mode === "local";

    return (
        <Link
            to={`/note/${note.id}`}
            viewTransition
            className="block group"
            onClick={onOpen ? (e) => { e.preventDefault(); onOpen(note); } : undefined}
        >
            <div
                className={`rounded-l-md rounded-r-2xl overflow-hidden hover:-translate-y-1 hover:shadow-xl transition-all duration-200 min-h-[180px] flex flex-col ${isLocal ? "border-2 border-dashed shadow-none" : "shadow-[0_1px_3px_rgba(0,0,0,0.06)]"}`}
                style={{ backgroundColor: color.bg, viewTransitionName: `note-${note.id}`, ...(isLocal ? { borderColor: `${color.text}30` } : {}) }}
            >
                <div className="px-4 pt-4 pb-1.5 flex items-center gap-2 flex-wrap">
                    {year && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md" style={{ backgroundColor: `${color.text}12`, color: color.text }}>
                            {year}
                        </span>
                    )}
                    {folderName && (
                        <span className="text-[11px] px-2 py-0.5 rounded-md" style={{ backgroundColor: `${color.text}08`, color: color.text, opacity: 0.75 }}>
                            {folderName}
                        </span>
                    )}
                    {!!note.locked && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md flex items-center gap-1" style={{ backgroundColor: "#F59E0B18", color: "#B45309" }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            Locked
                        </span>
                    )}
                    {!!note.published && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md flex items-center gap-1" style={{ backgroundColor: "#10B98118", color: "#047857" }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                            Published
                        </span>
                    )}
                </div>
                <div className="px-4 pb-1.5">
                    <h3 className="font-serif text-[17px] leading-snug font-semibold line-clamp-3" style={{ color: color.text }}>
                        {title}
                    </h3>
                </div>
                {preview ? (
                    <div className="px-4 pb-3 flex-1">
                        <p className="text-[12px] leading-relaxed line-clamp-3" style={{ color: color.text, opacity: 0.55 }}>{preview}</p>
                    </div>
                ) : <div className="flex-1" />}
                <div className="px-4 pb-3.5 pt-2 flex items-center justify-between mt-auto">
                    <div className="flex items-center gap-2">
                        {isLocal && (
                            <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md" style={{ backgroundColor: `${color.text}10`, color: color.text, opacity: 0.6 }}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" />
                                </svg>
                                Local only
                            </span>
                        )}
                        {date && <span className="text-[11px]" style={{ color: color.text, opacity: 0.35 }}>{date}</span>}
                    </div>
                    <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(note.id); }}
                        className="p-1 rounded-lg opacity-60 sm:opacity-0 sm:group-hover:opacity-70 hover:!opacity-100 transition-all duration-200"
                        style={{ color: color.text }}
                        aria-label="Delete note"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                    </button>
                </div>
            </div>
        </Link>
    );
}
