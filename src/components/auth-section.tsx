import { useState, useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { authClient } from "@/lib/auth-client";
import { isTauri } from "@/lib/platform";
import { signInWithPasskeyTauri, handleDeepLinkToken } from "@/lib/auth-helpers";

function PasskeyIcon({ size = 14 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z" />
            <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
        </svg>
    );
}

function GoogleIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
    );
}

function GitHubIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
        </svg>
    );
}

function AppleIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
        </svg>
    );
}

export function useDeepLinkAuth() {
    useEffect(() => {
        if (!isTauri) return;
        let unlisten: (() => void) | undefined;
        import("@tauri-apps/api/event").then(({ listen }) => {
            listen<string>("auth-deep-link", (event) => {
                handleDeepLinkToken(event.payload);
            }).then((fn) => { unlisten = fn; });
        });
        return () => { unlisten?.(); };
    }, []);
}

export function AuthSection() {
    const { user, signOut } = useAuth();
    const [passkeyError, setPasskeyError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(false);
    const [hasPasskey, setHasPasskey] = useState(false);
    const isAnonymous = user?.isAnonymous || !user?.email;

    useEffect(() => {
        if (isAnonymous) return;
        authClient.passkey.listUserPasskeys().then(({ data }) => {
            if (data && data.length > 0) setHasPasskey(true);
        });
    }, [isAnonymous]);

    useDeepLinkAuth();

    if (!isAnonymous) {
        return (
            <div className="px-4 py-3 border-t border-[var(--color-border-warm)]/50 space-y-2">
                <div className="flex items-center justify-between">
                    <div className="min-w-0">
                        <p className="text-[12px] font-medium truncate text-[var(--color-ink)]">
                            {user?.name || user?.email}
                        </p>
                        {user?.name && user?.email && (
                            <p className="text-[10px] truncate text-[var(--color-ink-muted)]">{user.email}</p>
                        )}
                    </div>
                    <button
                        onClick={signOut}
                        className="text-[10px] px-2 py-1 rounded-md text-[var(--color-ink-muted)] hover:bg-[var(--color-sidebar-active)] transition-colors shrink-0"
                    >
                        Sign out
                    </button>
                </div>
                {!hasPasskey && (
                    <button
                        onClick={async () => {
                            await authClient.passkey.addPasskey({ name: "My Device" });
                            setHasPasskey(true);
                        }}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] text-[var(--color-ink-muted)] hover:bg-[var(--color-sidebar-active)] transition-colors"
                    >
                        <PasskeyIcon size={12} />
                        Add a passkey
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="px-4 py-3 border-t border-[var(--color-border-warm)]/50 space-y-2">
            <button
                onClick={async () => {
                    setPasskeyError(null);
                    try {
                        if (isTauri) {
                            await signInWithPasskeyTauri();
                        } else {
                            await authClient.signIn.passkey({
                                fetchOptions: {
                                    onSuccess: () => window.location.reload(),
                                    onError: (ctx) => setPasskeyError(ctx.error.message),
                                },
                            });
                        }
                    } catch (e: any) {
                        setPasskeyError(e?.message || "Passkey auth failed");
                    }
                }}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-medium bg-[var(--color-ink)] text-[var(--color-paper)] hover:opacity-90 transition-colors"
            >
                <PasskeyIcon />
                Sign in with Passkey
            </button>
            {passkeyError && <p className="text-[10px] text-red-500 text-center">{passkeyError}</p>}
            {!expanded ? (
                <button
                    onClick={() => setExpanded(true)}
                    className="w-full text-[11px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors text-center py-1"
                >
                    More sign in options
                </button>
            ) : (
                <div className="space-y-1.5">
                    <button onClick={() => authClient.signIn.social({ provider: "apple" })}
                        className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-[12px] bg-black text-white hover:bg-black/90 transition-colors">
                        <AppleIcon /> Apple
                    </button>
                    <button onClick={() => authClient.signIn.social({ provider: "google" })}
                        className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-[12px] bg-white text-gray-700 border border-[var(--color-border-warm)] hover:bg-gray-50 transition-colors">
                        <GoogleIcon /> Google
                    </button>
                    <button onClick={() => authClient.signIn.social({ provider: "github" })}
                        className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-[12px] bg-[#24292f] text-white hover:bg-[#32383f] transition-colors">
                        <GitHubIcon /> GitHub
                    </button>
                </div>
            )}
        </div>
    );
}
