import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { NoteValue } from "@shared/types/note";

type NotesContextValue = {
  notes: [string, NoteValue][];
  loading: boolean;
  deleteNote: (keyToDelete: string) => Promise<void>;
  revalidateNotes: () => Promise<[string, NoteValue][]>;
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
  const [notes, setNotes] = useState<[string, NoteValue][]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLocalStorageData = useCallback(async () => {
    if (typeof window === "undefined") return [];

    const entries = Object.entries(localStorage);
    const keyVal = entries
      .map(([key, value]) => {
        if (value && key.length === 10 && key.match(/^\d+$/)) {
          try {
            return [key, JSON.parse(value)] as [string, NoteValue];
          } catch {
            return undefined;
          }
        }
        return undefined;
      })
      .filter((kv): kv is [string, NoteValue] => kv !== undefined);

    return keyVal;
  }, []);

  const fetchCloudData = useCallback(async () => {
    try {
      const response = await fetch("/api/notes");
      if (response.status !== 200) {
        return [];
      }
      const data = await response.json();
      return data as [string, NoteValue][];
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

    // Process cloud data to match local data format
    const processedCloudData = cloudData?.map(([key, value]) => {
      const id = key.split("-").pop();
      return [id, value] as [string, NoteValue];
    }) || [];

    const newData = [...localData, ...processedCloudData]
      .filter(([_, value]) => value !== null)
      .sort((a, b) => Number(b[0]) - Number(a[0]));

    // Deduplicate by key
    const uniqueKeys = Array.from(new Set(newData.map(([key]) => key)));
    const uniqueData = uniqueKeys.map((key) => {
      return newData.find(([k]) => k === key)!;
    });

    setNotes(uniqueData);
    setLoading(false);

    return uniqueData;
  }, [fetchLocalStorageData, fetchCloudData]);

  useEffect(() => {
    combineData();
  }, [combineData]);

  const deleteNote = useCallback(async (keyToDelete: string) => {
    if (typeof window === "undefined") return;

    // Archive locally
    const newKey = "archived-" + keyToDelete;
    const value = localStorage.getItem(keyToDelete);
    if (value) {
      localStorage.removeItem(keyToDelete);
      localStorage.setItem(newKey, value);
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
    return await combineData();
  }, [combineData]);

  return (
    <NotesContext.Provider value={{ notes, loading, deleteNote, revalidateNotes }}>
      {children}
    </NotesContext.Provider>
  );
};
