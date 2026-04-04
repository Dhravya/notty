import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

export function AuthPasskeyPage() {
    const [status, setStatus] = useState<"loading" | "authenticating" | "done" | "error">("loading");
    const [error, setError] = useState("");

    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect"); // e.g. notty://auth

    useEffect(() => {
        (async () => {
            // Check if user already has a session
            const session = await authClient.getSession();
            if (session.data?.user && !session.data.user.isAnonymous) {
                await issueTokenAndRedirect();
                return;
            }
            // Trigger passkey sign-in
            setStatus("authenticating");
            await authClient.signIn.passkey({
                fetchOptions: {
                    onSuccess: () => issueTokenAndRedirect(),
                    onError: (ctx) => {
                        setError(ctx.error.message);
                        setStatus("error");
                    },
                },
            });
        })();
    }, []);

    async function issueTokenAndRedirect() {
        if (!redirect) {
            setStatus("done");
            return;
        }
        try {
            const res = await fetch("/api/auth/create-token", {
                method: "POST",
                credentials: "include",
            });
            if (!res.ok) throw new Error("Failed to create token");
            const { token } = await res.json() as { token: string };
            setStatus("done");
            window.location.href = `${redirect}?token=${token}`;
        } catch (e: any) {
            setError(e.message);
            setStatus("error");
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-paper)] p-4">
            <div className="text-center max-w-sm space-y-4">
                <h1 className="font-serif text-2xl italic text-[var(--color-ink)]">Notty</h1>
                {status === "loading" && (
                    <p className="text-sm text-[var(--color-ink-muted)]">Preparing...</p>
                )}
                {status === "authenticating" && (
                    <p className="text-sm text-[var(--color-ink-muted)]">Complete passkey authentication in your browser...</p>
                )}
                {status === "done" && (
                    <p className="text-sm text-[var(--color-ink-muted)]">
                        {redirect ? "Authenticated! Returning to Notty..." : "Authenticated! You can close this tab."}
                    </p>
                )}
                {status === "error" && (
                    <div className="space-y-2">
                        <p className="text-sm text-red-500">{error}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="text-sm px-4 py-2 rounded-lg bg-[var(--color-ink)] text-[var(--color-paper)]"
                        >
                            Try again
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
