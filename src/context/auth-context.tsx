import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useAdapter } from "./adapter-context";

type User = {
    id: string;
    email?: string;
    name?: string;
    isAnonymous?: boolean;
};

type AuthContextType = {
    user: User | null;
    loading: boolean;
    /** True when session lookup + sign-in both finished but produced no user. */
    failed: boolean;
    signIn: () => Promise<User | null>;
    signOut: () => Promise<void>;
    retry: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const adapter = useAdapter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);

    const signIn = useCallback(async () => {
        const u = await adapter.signIn();
        if (u) setUser(u);
        return u;
    }, [adapter]);

    const signOut = useCallback(async () => {
        await adapter.signOut();
        setUser(null);
    }, [adapter]);

    const retry = useCallback(() => {
        setLoading(true);
        setFailed(false);
        setAttempt((a) => a + 1);
    }, []);

    // When any API call hits a 401 mid-session (expired/rotated cookie), re-run
    // the session check so we either recover a session or show the banner —
    // instead of the app silently failing every save while looking signed in.
    useEffect(() => {
        let pending = false;
        const onExpired = () => {
            if (pending) return;
            pending = true;
            setTimeout(() => { pending = false; }, 5000); // debounce bursts of 401s
            // Re-check quietly (no loading flip — that would unmount the editor
            // mid-typing). If the session is truly gone, show the banner.
            (async () => {
                try {
                    const u = await adapter.getSession();
                    const resolved = u ?? (await signIn().catch(() => null));
                    setUser(resolved);
                    setFailed(!resolved);
                } catch {}
            })();
        };
        window.addEventListener("notty:auth-expired", onExpired);
        return () => window.removeEventListener("notty:auth-expired", onExpired);
    }, [adapter, signIn]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const u = await adapter.getSession();
                const resolved = u ?? (await signIn().catch((e) => {
                    console.error("Sign-in failed:", e);
                    return null;
                }));
                if (cancelled) return;
                setUser(resolved);
                setFailed(!resolved);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [adapter, signIn, attempt]);

    return (
        <AuthContext.Provider value={{ user, loading, failed, signIn, signOut, retry }}>
            {failed && <AuthErrorBanner onRetry={retry} />}
            {children}
        </AuthContext.Provider>
    );
}

function AuthErrorBanner({ onRetry }: { onRetry: () => void }) {
    return (
        <div
            role="alert"
            className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-4 py-2.5 rounded-lg border border-red-500/30 bg-[var(--color-card)] text-sm text-[var(--color-ink)] shadow-lg max-w-[92vw]"
        >
            <span className="text-[var(--color-ink-muted)]">
                Couldn't sign in — the app can't reach your account.
            </span>
            <button
                onClick={onRetry}
                className="font-medium text-[var(--color-ink)] underline underline-offset-2 hover:opacity-80"
            >
                Retry
            </button>
        </div>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within AuthProvider");
    return ctx;
}
