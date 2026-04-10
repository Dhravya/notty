import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { isTauri } from "@/lib/platform";

export type Tab = {
    id: string;
    path: string;
    title: string;
};

type TabsContextType = {
    tabs: Tab[];
    activeTabId: string | null;
    openTab: (path: string, title?: string) => void;
    closeTab: (id: string) => void;
    switchTab: (id: string) => void;
    updateTabTitle: (id: string, title: string) => void;
};

const TabsContext = createContext<TabsContextType | null>(null);

const HOME_TAB: Tab = { id: "home", path: "/", title: "All Notes" };

export function TabsProvider({ children }: { children: ReactNode }) {
    const navigate = useNavigate();
    const [tabs, setTabs] = useState<Tab[]>([HOME_TAB]);
    const [activeTabId, setActiveTabId] = useState("home");
    const tabsRef = useRef(tabs);
    tabsRef.current = tabs;

    const openTab = useCallback((path: string, title?: string) => {
        const existing = tabsRef.current.find(t => t.path === path);
        if (existing) {
            setActiveTabId(existing.id);
        } else {
            const id = path === "/" ? "home" : crypto.randomUUID();
            setTabs(prev => [...prev, { id, path, title: title || "Untitled" }]);
            setActiveTabId(id);
        }
        navigate(path);
    }, [navigate]);

    const closeTab = useCallback((id: string) => {
        if (id === "home") return;
        const current = tabsRef.current;
        const idx = current.findIndex(t => t.id === id);
        const next = current.filter(t => t.id !== id);
        setTabs(next);
        if (activeTabId === id) {
            const newActive = next[Math.min(idx, next.length - 1)] || HOME_TAB;
            setActiveTabId(newActive.id);
            navigate(newActive.path);
        }
    }, [activeTabId, navigate]);

    const switchTab = useCallback((id: string) => {
        const tab = tabsRef.current.find(t => t.id === id);
        if (tab) {
            setActiveTabId(id);
            navigate(tab.path);
        }
    }, [navigate]);

    const updateTabTitle = useCallback((id: string, title: string) => {
        setTabs(prev => prev.map(t => t.id === id ? { ...t, title } : t));
    }, []);

    return (
        <TabsContext.Provider value={{ tabs, activeTabId, openTab, closeTab, switchTab, updateTabTitle }}>
            {children}
        </TabsContext.Provider>
    );
}

export function useTabs() {
    const ctx = useContext(TabsContext);
    if (!ctx) throw new Error("useTabs must be used within TabsProvider");
    return ctx;
}

/** Drop-in replacement for useNavigate that opens tabs in Tauri */
export function useTabNavigate() {
    const { openTab } = useTabs();
    const navigate = useNavigate();

    return useCallback((path: string, opts?: { title?: string }) => {
        if (isTauri) {
            openTab(path, opts?.title);
        } else {
            navigate(path);
        }
    }, [openTab, navigate]);
}
