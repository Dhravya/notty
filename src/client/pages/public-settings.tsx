import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useAdapter } from "@/context/adapter-context";
import type { Profile } from "@/lib/adapter";

const FONT_OPTIONS = [
    { value: "sans", label: "Sans", preview: "DM Sans" },
    { value: "serif", label: "Serif", preview: "Instrument Serif" },
    { value: "mono", label: "Mono", preview: "Menlo" },
] as const;

const COLOR_OPTIONS = [
    { value: "light", label: "Light", bg: "#FAF8F5", ink: "#2C2416" },
    { value: "dark", label: "Dark", bg: "#181715", ink: "#E8E4DC" },
] as const;

export function PublicSettingsPage() {
    const adapter = useAdapter();
    const navigate = useNavigate();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        adapter.getProfile().then(setProfile).catch(console.error);
    }, [adapter]);

    const handleSave = async () => {
        if (!profile) return;
        setSaving(true);
        setError("");
        try {
            await adapter.updateProfile(profile);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e: any) {
            setError(e.message || "Failed to save");
        } finally {
            setSaving(false);
        }
    };

    if (!profile) {
        return (
            <div className="min-h-screen bg-[var(--color-paper)] flex items-center justify-center">
                <div className="text-sm text-[var(--color-ink-muted)]">Loading...</div>
            </div>
        );
    }

    const publicUrl = profile.username
        ? `https://${profile.username}.notty.page`
        : null;

    return (
        <div className="min-h-screen bg-[var(--color-paper)]">
            <div className="max-w-lg mx-auto px-6 py-12 space-y-8">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate("/")}
                        className="p-1.5 rounded-lg hover:bg-[var(--color-sidebar-active)] text-[var(--color-ink-muted)]"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <h1 className="text-xl font-medium text-[var(--color-ink)]">Public Page Settings</h1>
                </div>

                <div className="space-y-6">
                    {/* Username */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-[var(--color-ink)]">Username</label>
                        <div className="flex items-center gap-2">
                            <input
                                value={profile.username || ""}
                                onChange={(e) => setProfile({ ...profile, username: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                                placeholder="yourname"
                                className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-border-warm)] bg-[var(--color-paper)] text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] outline-none focus:border-[var(--color-accent)]"
                            />
                            <span className="text-xs text-[var(--color-ink-muted)]">.notty.page</span>
                        </div>
                    </div>

                    {/* Page Title */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-[var(--color-ink)]">Page Title</label>
                        <input
                            value={profile.pageTitle}
                            onChange={(e) => setProfile({ ...profile, pageTitle: e.target.value })}
                            placeholder="My Notes"
                            className="w-full px-3 py-2 rounded-lg border border-[var(--color-border-warm)] bg-[var(--color-paper)] text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] outline-none focus:border-[var(--color-accent)]"
                        />
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-[var(--color-ink)]">Description</label>
                        <textarea
                            value={profile.pageDescription}
                            onChange={(e) => setProfile({ ...profile, pageDescription: e.target.value })}
                            placeholder="A short description for your public page..."
                            rows={3}
                            className="w-full px-3 py-2 rounded-lg border border-[var(--color-border-warm)] bg-[var(--color-paper)] text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] outline-none focus:border-[var(--color-accent)] resize-none"
                        />
                    </div>

                    {/* Font */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-[var(--color-ink)]">Font</label>
                        <div className="flex gap-2">
                            {FONT_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    onClick={() => setProfile({ ...profile, font: opt.value })}
                                    className={`flex-1 px-3 py-3 rounded-xl border text-center transition-all ${
                                        profile.font === opt.value
                                            ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5 ring-1 ring-[var(--color-accent)]"
                                            : "border-[var(--color-border-warm)] hover:border-[var(--color-ink-muted)]"
                                    }`}
                                >
                                    <div className="text-lg text-[var(--color-ink)]" style={{
                                        fontFamily: opt.value === "sans" ? '"DM Sans", sans-serif'
                                            : opt.value === "serif" ? '"Instrument Serif", Georgia, serif'
                                            : 'ui-monospace, Menlo, monospace'
                                    }}>
                                        Aa
                                    </div>
                                    <div className="text-[11px] text-[var(--color-ink-muted)] mt-1">{opt.label}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Color Mode */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-[var(--color-ink)]">Theme</label>
                        <div className="flex gap-2">
                            {COLOR_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    onClick={() => setProfile({ ...profile, colorMode: opt.value })}
                                    className={`flex-1 px-3 py-3 rounded-xl border transition-all ${
                                        profile.colorMode === opt.value
                                            ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]"
                                            : "border-[var(--color-border-warm)] hover:border-[var(--color-ink-muted)]"
                                    }`}
                                >
                                    <div className="w-full h-8 rounded-lg mb-2" style={{ backgroundColor: opt.bg, border: "1px solid " + (opt.value === "dark" ? "#333" : "#ddd") }}>
                                        <div className="flex items-center justify-center h-full text-xs font-medium" style={{ color: opt.ink }}>
                                            Abc
                                        </div>
                                    </div>
                                    <div className="text-[11px] text-[var(--color-ink-muted)]">{opt.label}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-2">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-4 py-2 rounded-lg bg-[var(--color-ink)] text-[var(--color-paper)] text-sm font-medium disabled:opacity-50"
                        >
                            {saved ? "Saved!" : saving ? "Saving..." : "Save"}
                        </button>
                        {publicUrl && (
                            <a
                                href={publicUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-sm text-[var(--color-accent)] hover:underline"
                            >
                                <ExternalLink size={14} /> View public page
                            </a>
                        )}
                    </div>

                    {error && <p className="text-sm text-red-500">{error}</p>}
                </div>
            </div>
        </div>
    );
}
