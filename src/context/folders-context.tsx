import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useAdapter } from "./adapter-context";
import { useAuth } from "./auth-context";
import type { Folder } from "@/lib/adapter";

type FoldersContextType = {
    folders: Folder[];
    selectedFolderId: string | null;
    loading: boolean;
    selectFolder: (id: string | null) => void;
    createFolder: (name: string, color: string) => Promise<void>;
    deleteFolder: (id: string) => Promise<void>;
    renameFolder: (id: string, name: string) => Promise<void>;
    updateFolderDescription: (id: string, description: string) => Promise<void>;
};

const FoldersContext = createContext<FoldersContextType | null>(null);

export function FoldersProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const adapter = useAdapter();
    const [folders, setFolders] = useState<Folder[]>([]);
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchFolders = useCallback(async () => {
        const data = await adapter.getFolders();
        setFolders(data);
        setLoading(false);
    }, [adapter]);

    useEffect(() => {
        if (!user) return;
        fetchFolders();
    }, [user, fetchFolders]);

    const createFolder = useCallback(async (name: string, color: string) => {
        const folder: Folder = {
            id: crypto.randomUUID(),
            name, color, description: "",
            sort_order: folders.length,
            created_at: Date.now(), updated_at: Date.now(),
        };
        setFolders((prev) => [...prev, folder]);
        await adapter.saveFolder(folder);
    }, [adapter, folders.length]);

    const deleteFolder = useCallback(async (id: string) => {
        setFolders((prev) => prev.filter((f) => f.id !== id));
        if (selectedFolderId === id) setSelectedFolderId(null);
        await adapter.deleteFolder(id);
    }, [adapter, selectedFolderId]);

    const renameFolder = useCallback(async (id: string, name: string) => {
        let updated: Folder | undefined;
        setFolders((prev) =>
            prev.map((f) => {
                if (f.id === id) { updated = { ...f, name, updated_at: Date.now() }; return updated; }
                return f;
            })
        );
        if (updated) await adapter.saveFolder(updated);
    }, [adapter]);

    const updateFolderDescription = useCallback(async (id: string, description: string) => {
        let updated: Folder | undefined;
        setFolders((prev) =>
            prev.map((f) => {
                if (f.id === id) { updated = { ...f, description, updated_at: Date.now() }; return updated; }
                return f;
            })
        );
        if (updated) await adapter.saveFolder(updated);
    }, [adapter]);

    return (
        <FoldersContext.Provider value={{
            folders, selectedFolderId, loading,
            selectFolder: setSelectedFolderId,
            createFolder, deleteFolder, renameFolder, updateFolderDescription,
        }}>
            {children}
        </FoldersContext.Provider>
    );
}

export function useFolders() {
    const ctx = useContext(FoldersContext);
    if (!ctx) throw new Error("useFolders must be used within FoldersProvider");
    return ctx;
}
