export type SupermemoryNote = {
  id: string;
  title: string;
  content: string;
};

/**
 * Upsert a note into Supermemory. Uses the note's id as the customId so that
 * subsequent calls for the same note overwrite the existing document.
 */
export async function postSupermemoryDocument(
  apiKey: string,
  note: SupermemoryNote
): Promise<void> {
  await fetch("https://api.supermemory.ai/v3/documents", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: note.content || "",
      customId: note.id,
      metadata: { title: note.title, source: "notty", noteId: note.id },
    }),
  });
}

/**
 * Remove a note from Supermemory by its customId (= Notty note id).
 * Silently ignores 404 (note was never synced or already removed).
 */
export async function deleteSupermemoryDocument(
  apiKey: string,
  noteId: string
): Promise<void> {
  await fetch(`https://api.supermemory.ai/v3/documents/${encodeURIComponent(noteId)}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
  });
}
