import { createContext, useContext, type ReactNode } from "react";
import type { NottyAdapter } from "@/lib/adapter";

const AdapterContext = createContext<NottyAdapter | null>(null);

export function AdapterProvider({ adapter, children }: { adapter: NottyAdapter; children: ReactNode }) {
    return (
        <AdapterContext.Provider value={adapter}>
            {children}
        </AdapterContext.Provider>
    );
}

export function useAdapter(): NottyAdapter {
    const ctx = useContext(AdapterContext);
    if (!ctx) throw new Error("useAdapter must be used within AdapterProvider");
    return ctx;
}
