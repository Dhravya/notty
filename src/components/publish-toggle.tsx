import { useState, useEffect, useRef } from "react";
import { Globe, GlobeLock, Copy, Check, ExternalLink } from "lucide-react";
import { useAdapter } from "@/context/adapter-context";
import { useAuth } from "@/context/auth-context";
import { useNotes, type Note } from "@/context/notes-context";
import type { Profile } from "@/lib/adapter";

export function PublishToggle({ noteId }: { noteId: string }) {
    const adapter = useAdapter();
    const { user } = useAuth();
    const { notes, patchNote } = useNotes();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [profile, setProfile] = useState<Profile | null>(null);
    const ref = useRef<HTMLDivElement>(null);

    if ((user as any)?.isAnonymous) return null;

    const note = notes.find((n) => n.id === noteId);
    const isPublished = !!(note?.published);
    const isLocked = !!(note?.locked);

    useEffect(() => {
        if (open && !profile) {
            adapter.getProfile().then(setProfile).catch(() => {});
        }
    }, [open]);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const handlePublish = async () => {
        if (isLocked) return;
        setLoading(true);
        try {
            await adapter.publishNote(noteId, true);
            patchNote(noteId, { published: 1, published_at: Math.floor(Date.now() / 1000) } as Partial<Note>);
        } catch (e: any) {
            console.error("Publish failed:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleUnpublish = async () => {
        setLoading(true);
        try {
            await adapter.publishNote(noteId, false);
            patchNote(noteId, { published: 0 } as Partial<Note>);
            setOpen(false);
        } catch (e: any) {
            console.error("Unpublish failed:", e);
        } finally {
            setLoading(false);
        }
    };

    const publicUrl = profile?.username
        ? `https://${profile.username}.notty.page/${noteId}`
        : null;

    const handleCopy = () => {
        if (publicUrl) {
            navigator.clipboard.writeText(publicUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => isPublished ? setOpen(!open) : handlePublish()}
                disabled={loading || (isLocked && !isPublished)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors flex items-center gap-1.5 ${
                    isPublished
                        ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600"
                        : "border-[var(--color-border-warm)] bg-[var(--color-paper)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                } disabled:opacity-40`}
                title={isLocked && !isPublished ? "Unlock note to publish" : isPublished ? "Published — click to manage" : "Publish to public page"}
            >
                {isPublished ? <Globe size={12} /> : <GlobeLock size={12} />}
                {loading ? "..." : isPublished ? "Published" : "Publish"}
            </button>

            {open && isPublished && (
                <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-[var(--color-border-warm)] bg-[var(--color-card)] shadow-xl z-50 overflow-hidden">
                    <div className="px-4 pt-4 pb-3 space-y-3">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-sm font-medium text-[var(--color-ink)]">Live on the web</span>
                        </div>

                        {publicUrl ? (
                            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-warm)] bg-[var(--color-paper)] px-3 py-2">
                                <span className="flex-1 text-xs text-[var(--color-ink)] truncate font-mono">{publicUrl.replace("https://", "")}</span>
                                <button
                                    onClick={handleCopy}
                                    className="p-1 rounded hover:bg-[var(--color-sidebar-active)] text-[var(--color-ink-muted)] shrink-0"
                                    title="Copy link"
                                >
                                    {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                                </button>
                                <a
                                    href={publicUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1 rounded hover:bg-[var(--color-sidebar-active)] text-[var(--color-ink-muted)] shrink-0"
                                    title="Open"
                                >
                                    <ExternalLink size={13} />
                                </a>
                            </div>
                        ) : (
                            <p className="text-xs text-[var(--color-ink-muted)]">
                                Set a username in <a href="/settings/public" className="underline">Public Page Settings</a> to get a public URL.
                            </p>
                        )}
                    </div>

                    <div className="border-t border-[var(--color-border-warm)] px-4 py-3">
                        <button
                            onClick={handleUnpublish}
                            disabled={loading}
                            className="text-xs text-red-500 hover:text-red-600 transition-colors disabled:opacity-50"
                        >
                            Unpublish
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
