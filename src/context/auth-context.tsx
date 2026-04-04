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
    signIn: () => Promise<void>;
    signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const adapter = useAdapter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const signIn = useCallback(async () => {
        try {
            const u = await adapter.signIn();
            if (u) setUser(u);
        } catch (e) {
            console.error("Sign-in failed:", e);
        }
    }, [adapter]);

    const signOut = useCallback(async () => {
        await adapter.signOut();
        setUser(null);
    }, [adapter]);

    useEffect(() => {
        (async () => {
            try {
                const u = await adapter.getSession();
                if (u) {
                    setUser(u);
                } else {
                    await signIn();
                }
            } catch {
                await signIn();
            } finally {
                setLoading(false);
            }
        })();
    }, [adapter, signIn]);

    return (
        <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within AuthProvider");
    return ctx;
}
