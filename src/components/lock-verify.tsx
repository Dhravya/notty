import { useState } from "react";
import { Lock, Fingerprint } from "lucide-react";
import { useAdapter } from "@/context/adapter-context";

export function LockVerify({ noteId, noteTitle, onVerified }: {
    noteId: string;
    noteTitle?: string;
    onVerified: (lockToken: string) => void;
}) {
    const adapter = useAdapter();
    const [status, setStatus] = useState<"idle" | "verifying" | "error">("idle");
    const [error, setError] = useState("");

    const handleVerify = async () => {
        setStatus("verifying");
        setError("");
        try {
            const { lockToken } = await adapter.verifyLock(noteId);
            onVerified(lockToken);
        } catch (e: any) {
            setError(e.message || "Verification failed");
            setStatus("error");
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 p-8">
            <div className="w-16 h-16 rounded-2xl bg-[var(--color-sidebar-active)] flex items-center justify-center">
                <Lock size={28} className="text-[var(--color-ink-muted)]" />
            </div>
            <div className="space-y-2">
                <h2 className="text-xl font-medium text-[var(--color-ink)]">This note is locked</h2>
                {noteTitle && noteTitle !== "Untitled" && (
                    <p className="text-sm text-[var(--color-ink-muted)]">{noteTitle}</p>
                )}
                <p className="text-sm text-[var(--color-ink-muted)]">
                    Verify your identity with a passkey to view this note.
                </p>
            </div>

            <button
                onClick={handleVerify}
                disabled={status === "verifying"}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--color-ink)] text-[var(--color-paper)] text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
                <Fingerprint size={16} />
                {status === "verifying" ? "Verifying..." : "Verify with passkey"}
            </button>

            {error && (
                <p className="text-sm text-red-500">{error}</p>
            )}
        </div>
    );
}
