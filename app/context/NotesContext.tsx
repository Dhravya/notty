import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

type NoteItem = {
  id: string;
  title: string;
  preview?: string;
};

type NotesContextValue = {
  notes: [string, { title: string; preview?: string }][];
  loading: boolean;
  deleteNote: (keyToDelete: string) => Promise<void>;
  revalidateNotes: () => Promise<void>;
};

const NotesContext = createContext<NotesContextValue | null>(null);

export const useNotes = () => {
  const contextValue = useContext(NotesContext);

  if (contextValue === null) {
    throw new Error("useNotes must be used within a NotesProvider");
  }

  return contextValue;
};

export const NotesProvider = ({ children }: { children: ReactNode }) => {
  const [notes, setNotes] = useState<[string, { title: string; preview?: string }][]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLocalStorageData = useCallback(async () => {
    if (typeof window === "undefined") return [];

    const entries = Object.entries(localStorage);
    const keyVal = entries
      .map(([key, value]) => {
        // Match note IDs (10-digit timestamps) or markdown note keys
        if (key.startsWith("note-md-")) {
          const id = key.replace("note-md-", "");
          const lines = value.split("\n").filter((l: string) => l.trim());
          const title = lines[0]?.replace(/^#+\s*/, "") || "Untitled";
          const preview = lines.slice(1, 3).join(" ").substring(0, 100);
          return [id, { title, preview }] as [string, { title: string; preview?: string }];
        }
        // Legacy JSON format
        if (key.match(/^\d{10}$/)) {
          try {
            const data = JSON.parse(value);
            const title = data.content?.[0]?.content?.[0]?.text || "Untitled";
            return [key, { title }] as [string, { title: string; preview?: string }];
          } catch {
            return undefined;
          }
        }
        return undefined;
      })
      .filter((kv): kv is [string, { title: string; preview?: string }] => kv !== undefined);

    return keyVal;
  }, []);

  const fetchCloudData = useCallback(async () => {
    try {
      const response = await fetch("/api/notes");
      if (response.status !== 200) {
        return [];
      }
      const data: NoteItem[] = await response.json();
      return data.map((note) => [note.id, { title: note.title, preview: note.preview }] as [string, { title: string; preview?: string }]);
    } catch (error) {
      console.error("Error fetching cloud data:", error);
      return [];
    }
  }, []);

  const combineData = useCallback(async () => {
    setLoading(true);

    const [localData, cloudData] = await Promise.all([
      fetchLocalStorageData(),
      fetchCloudData(),
    ]);

    const allData = [...localData, ...cloudData]
      .filter(([_, value]) => value !== null)
      .sort((a, b) => Number(b[0]) - Number(a[0]));

    // Deduplicate by key
    const uniqueKeys = Array.from(new Set(allData.map(([key]) => key)));
    const uniqueData = uniqueKeys.map((key) => {
      return allData.find(([k]) => k === key)!;
    });

    setNotes(uniqueData);
    setLoading(false);
  }, [fetchLocalStorageData, fetchCloudData]);

  useEffect(() => {
    combineData();
  }, [combineData]);

  const deleteNote = useCallback(async (keyToDelete: string) => {
    if (typeof window === "undefined") return;

    // Archive locally
    const mdKey = `note-md-${keyToDelete}`;
    const mdValue = localStorage.getItem(mdKey);
    if (mdValue) {
      localStorage.removeItem(mdKey);
      localStorage.setItem(`archived-${mdKey}`, mdValue);
    }

    // Legacy format
    const legacyValue = localStorage.getItem(keyToDelete);
    if (legacyValue) {
      localStorage.removeItem(keyToDelete);
      localStorage.setItem(`archived-${keyToDelete}`, legacyValue);
    }

    // Delete from cloud
    try {
      await fetch(`/api/notes/${keyToDelete}`, {
        method: "DELETE",
      });
    } catch (error) {
      console.error("Error deleting note:", error);
    }

    await combineData();
  }, [combineData]);

  const revalidateNotes = useCallback(async () => {
    await combineData();
  }, [combineData]);

  return (
    <NotesContext.Provider value={{ notes, loading, deleteNote, revalidateNotes }}>
      {children}
    </NotesContext.Provider>
  );
};
