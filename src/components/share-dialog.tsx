import { useState, useEffect } from "react";
import { X, Copy, Check, Link, Trash2 } from "lucide-react";
import { useAdapter } from "@/context/adapter-context";
import type { Share } from "@/lib/adapter";

export function ShareDialog({ noteId, onClose }: { noteId: string; onClose: () => void }) {
    const adapter = useAdapter();
    const [shares, setShares] = useState<Share[]>([]);
    const [email, setEmail] = useState("");
    const [emailPermission, setEmailPermission] = useState<"view" | "edit">("view");
    const [linkPermission, setLinkPermission] = useState<"view" | "edit">("view");
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        adapter.listShares(noteId).then(setShares).catch(console.error);
    }, [noteId, adapter]);

    const handleShareByEmail = async () => {
        if (!email.trim()) return;
        setLoading(true);
        try {
            await adapter.createShare(noteId, { email: email.trim(), permission: emailPermission });
            setEmail("");
            const updated = await adapter.listShares(noteId);
            setShares(updated);
        } catch (e: any) {
            console.error("Share failed:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateLink = async () => {
        setLoading(true);
        try {
            await adapter.createShare(noteId, { permission: linkPermission });
            const updated = await adapter.listShares(noteId);
            setShares(updated);
        } catch (e: any) {
            console.error("Create link failed:", e);
        } finally {
            setLoading(false);
        }
    };

    const copyLink = (token: string, shareId: string) => {
        const url = `${window.location.origin}/shared/${token}`;
        navigator.clipboard.writeText(url);
        setCopiedId(shareId);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleRevoke = async (id: string) => {
        await adapter.deleteShare(id);
        setShares((prev) => prev.filter((s) => s.id !== id));
    };

    const linkShares = shares.filter((s) => s.token && !s.shared_with_email);
    const userShares = shares.filter((s) => s.shared_with_email || s.shared_with_id);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
            <div className="bg-[var(--color-card)] border border-[var(--color-border-warm)] rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-medium text-[var(--color-ink)]">Share note</h2>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--color-sidebar-active)] text-[var(--color-ink-muted)]">
                        <X size={18} />
                    </button>
                </div>

                {/* Share by email */}
                <div className="space-y-2">
                    <label className="text-xs font-medium text-[var(--color-ink-muted)]">Share with email</label>
                    <div className="flex gap-2">
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleShareByEmail()}
                            placeholder="user@example.com"
                            className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-border-warm)] bg-[var(--color-paper)] text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] outline-none focus:border-[var(--color-accent)]"
                        />
                        <select
                            value={emailPermission}
                            onChange={(e) => setEmailPermission(e.target.value as "view" | "edit")}
                            className="px-2 py-2 rounded-lg border border-[var(--color-border-warm)] bg-[var(--color-paper)] text-xs text-[var(--color-ink)]"
                        >
                            <option value="view">View</option>
                            <option value="edit">Edit</option>
                        </select>
                        <button
                            onClick={handleShareByEmail}
                            disabled={loading || !email.trim()}
                            className="px-3 py-2 rounded-lg bg-[var(--color-ink)] text-[var(--color-paper)] text-sm font-medium disabled:opacity-50"
                        >
                            Share
                        </button>
                    </div>
                </div>

                {/* Generate link */}
                <div className="space-y-2">
                    <label className="text-xs font-medium text-[var(--color-ink-muted)]">Share via link</label>
                    <div className="flex gap-2">
                        <select
                            value={linkPermission}
                            onChange={(e) => setLinkPermission(e.target.value as "view" | "edit")}
                            className="px-2 py-2 rounded-lg border border-[var(--color-border-warm)] bg-[var(--color-paper)] text-xs text-[var(--color-ink)]"
                        >
                            <option value="view">View</option>
                            <option value="edit">Edit</option>
                        </select>
                        <button
                            onClick={handleCreateLink}
                            disabled={loading}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border-warm)] hover:bg-[var(--color-sidebar-active)] text-sm text-[var(--color-ink-muted)] disabled:opacity-50"
                        >
                            <Link size={14} /> Generate {linkPermission} link
                        </button>
                    </div>
                </div>

                {/* Existing link shares */}
                {linkShares.length > 0 && (
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-[var(--color-ink-muted)]">Active links</label>
                        <div className="space-y-1.5">
                            {linkShares.map((s) => (
                                <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-paper)]">
                                    <Link size={12} className="text-[var(--color-ink-muted)] shrink-0" />
                                    <span className="flex-1 text-xs text-[var(--color-ink)] font-mono truncate">
                                        {window.location.host}/shared/{s.token?.slice(0, 8)}...
                                    </span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                        s.permission === "edit"
                                            ? "bg-emerald-500/10 text-emerald-600"
                                            : "bg-blue-500/10 text-blue-600"
                                    }`}>
                                        {s.permission}
                                    </span>
                                    <button
                                        onClick={() => s.token && copyLink(s.token, s.id)}
                                        className="p-1 rounded hover:bg-[var(--color-sidebar-active)] text-[var(--color-ink-muted)]"
                                        title="Copy link"
                                    >
                                        {copiedId === s.id ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                                    </button>
                                    <button onClick={() => handleRevoke(s.id)} className="p-1 rounded hover:bg-red-500/10 text-[var(--color-ink-muted)] hover:text-red-500">
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Existing user shares */}
                {userShares.length > 0 && (
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-[var(--color-ink-muted)]">Shared with people</label>
                        <div className="space-y-1.5">
                            {userShares.map((s) => (
                                <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-paper)]">
                                    <span className="flex-1 text-sm text-[var(--color-ink)]">
                                        {s.shared_with_name || s.shared_with_email}
                                    </span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                        s.permission === "edit"
                                            ? "bg-emerald-500/10 text-emerald-600"
                                            : "bg-blue-500/10 text-blue-600"
                                    }`}>
                                        {s.permission}
                                    </span>
                                    <button onClick={() => handleRevoke(s.id)} className="p-1 rounded hover:bg-red-500/10 text-[var(--color-ink-muted)] hover:text-red-500">
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
