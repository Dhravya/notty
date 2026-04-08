import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useAdapter } from "./adapter-context";
import { useAuth } from "./auth-context";
import type { MediaItem } from "@/lib/adapter";

type MediaContextType = {
    media: MediaItem[];
    loading: boolean;
    uploadMedia: (file: File, dimensions?: { width: number; height: number }) => Promise<MediaItem>;
    deleteMedia: (id: string) => Promise<void>;
    publishMedia: (id: string, published: boolean) => Promise<void>;
    updateCaption: (id: string, caption: string) => Promise<void>;
    getMediaUrl: (id: string) => string;
    revalidate: () => Promise<void>;
};

const MediaContext = createContext<MediaContextType | null>(null);

export function MediaProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const adapter = useAdapter();
    const [media, setMedia] = useState<MediaItem[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchMedia = useCallback(async () => {
        try {
            const items = await adapter.getMedia();
            setMedia(items);
        } catch (e) {
            console.error("Failed to fetch media:", e);
        } finally {
            setLoading(false);
        }
    }, [adapter]);

    useEffect(() => {
        if (!user) return;
        fetchMedia();
    }, [user, fetchMedia]);

    const uploadMedia = useCallback(async (file: File, dimensions?: { width: number; height: number }) => {
        const item = await adapter.uploadMedia(file, dimensions);
        setMedia((prev) => [item, ...prev]);
        return item;
    }, [adapter]);

    const deleteMedia = useCallback(async (id: string) => {
        setMedia((prev) => prev.filter((m) => m.id !== id));
        await adapter.deleteMedia(id);
    }, [adapter]);

    const publishMedia = useCallback(async (id: string, published: boolean) => {
        setMedia((prev) => prev.map((m) => m.id === id ? { ...m, published: published ? 1 : 0 } : m));
        await adapter.publishMedia(id, published);
    }, [adapter]);

    const updateCaption = useCallback(async (id: string, caption: string) => {
        setMedia((prev) => prev.map((m) => m.id === id ? { ...m, caption } : m));
        await adapter.updateMediaCaption(id, caption);
    }, [adapter]);

    const getMediaUrl = useCallback((id: string) => adapter.getMediaUrl(id), [adapter]);

    return (
        <MediaContext.Provider value={{ media, loading, uploadMedia, deleteMedia, publishMedia, updateCaption, getMediaUrl, revalidate: fetchMedia }}>
            {children}
        </MediaContext.Provider>
    );
}

export function useMedia() {
    const ctx = useContext(MediaContext);
    if (!ctx) throw new Error("useMedia must be used within MediaProvider");
    return ctx;
}
