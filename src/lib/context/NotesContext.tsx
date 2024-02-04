import React, { createContext, useContext, useState, useEffect } from 'react';
import { type Value } from '@/types/note';

type NotesContextValue = {
    kv: [string, Value][];
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

export const NotesProvider = ({ children }: { children: React.ReactNode }) => {
    const [kv, setKv] = useState<[string, Value][]>([]);
    const [loading, setLoading] = useState(true); // Loading state

    const fetchLocalStorageData = () => {
        const entries = Object.entries(localStorage);
        const keyVal = entries
            .map(([key, value]: [key: string, value: string]) => {
                if (value && key.length === 10 && key.match(/^\d+$/)) {
                    return [key, JSON.parse(value)] as [string, Value];
                }
                return undefined;
            })
            .filter((kv) => kv !== undefined);

        return keyVal as [string, Value][];
    };

    // Function to fetch data from cloud
    const fetchCloudData = async () => {
        try {
            const response = await fetch("/api/fetchPosts");
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const data = await response.json();
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return data as [string, Value][];
        } catch (error) {
            console.error("Error fetching cloud data:", error);
            return [];
        }
    };

    // Function to combine and set data from both sources
    const combineData = async () => {
        setLoading(true); // Set loading state to true when data fetching starts

        const localData = fetchLocalStorageData();
        const cloudData = await fetchCloudData();

        // Process cloud data to match local data format
        const processedCloudData = cloudData.map(
            ([key, value]: [key: string, value: Value]) => {
                const id = key.split("-").pop(); // Extracts the id from [email]-id format
                return [id, value] as [string, Value];
            },
        );

        const newData = [...localData, ...processedCloudData]
            .filter(([key, value]: [string, Value]) => {
                return value !== null;
            })
            .sort((a, b) => {
                return Number(b[0]) - Number(a[0]);
            });
        
        const uniqueKeys = Array.from(new Set(newData.map(([key, _]) => key)));

        const uniqueData = uniqueKeys.map((key) => {
            return newData.find(([k, _]) => k === key)!;
        });

        // Combine and set data
        setKv(uniqueData)
        setLoading(false); // Set loading state to false when data fetching is complete
    };


    useEffect(() => {
        void combineData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const deleteNote = async (keyToDelete: string) => {
        const newKey = "archived-" + keyToDelete;
        const newValue = localStorage.getItem(keyToDelete);
        localStorage.removeItem(keyToDelete);
        localStorage.setItem(newKey, JSON.stringify(newValue));

        try {
            await fetch(`/api/note?id=${keyToDelete}`, {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            // Re-fetch and combine data after deleting the note
            void combineData();
        } catch (error) {
            console.error("Error deleting note:", error);
        }
    };

    const revalidateNotes = async () => {
        void combineData();
    }

    return (
        <NotesContext.Provider value={{ kv, loading, deleteNote, revalidateNotes }}>
            {children}
        </NotesContext.Provider>
    );

};

export default useNotes;
