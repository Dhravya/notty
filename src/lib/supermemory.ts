import Supermemory from "supermemory";
import { env } from "@/env";

// Initialize Supermemory client
export const createSupermemoryClient = () => {
  return new Supermemory({
    apiKey: env.SUPERMEMORY_API_KEY,
  });
};

// Configure Supermemory settings (call once on app startup or in a setup endpoint)
export async function configureSupermemorySettings() {
  try {
    const response = await fetch("https://api.supermemory.ai/v3/settings", {
      method: "PATCH",
      headers: {
        "x-supermemory-api-key": env.SUPERMEMORY_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        shouldLLMFilter: true,
        filterPrompt: `This is a personal note-taking application called Notty. containerTag is the user's email address (userId). We store user notes, their content, and conversations. Each note can contain rich text, code snippets, and other formatted content. The system helps users find relevant notes based on semantic search.`,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to configure Supermemory settings: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error configuring Supermemory settings:", error);
    throw error;
  }
}

// Add a note to Supermemory
export async function addNoteToSupermemory(
  content: string,
  userId: string,
  noteId: string
) {
  const client = createSupermemoryClient();

  try {
    await client.add({
      content,
      containerTag: userId,
      metadata: {
        note_id: noteId,
        type: "note",
        timestamp: new Date().toISOString(),
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Error adding note to Supermemory:", error);
    throw error;
  }
}

// Search notes in Supermemory
export async function searchNotesInSupermemory(
  query: string,
  userId: string
) {
  const client = createSupermemoryClient();

  try {
    const results = await client.search.memories({
      q: query,
      containerTag: userId,
      searchMode: "hybrid", // Searches memories + document chunks
      limit: 10,
    });

    return results;
  } catch (error) {
    console.error("Error searching in Supermemory:", error);
    throw error;
  }
}

// Get user profile with optional search
export async function getUserProfileWithSearch(
  userId: string,
  query?: string
) {
  const client = createSupermemoryClient();

  try {
    const profileData = await client.profile({
      containerTag: userId,
      q: query, // Optional: include for combined profile + search
    });

    return profileData;
  } catch (error) {
    console.error("Error fetching user profile:", error);
    throw error;
  }
}

// Get user profile only (without search)
export async function getUserProfile(userId: string) {
  const client = createSupermemoryClient();

  try {
    const profileData = await client.profile({
      containerTag: userId,
    });

    return profileData;
  } catch (error) {
    console.error("Error fetching user profile:", error);
    throw error;
  }
}
