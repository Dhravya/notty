export type SupermemoryNote = {
  id: string;
  title: string;
  content: string;
};

/**
 * Build the per-user containerTag we use to scope every Supermemory write
 * and read. All uploads, deletes, and searches MUST pass this tag — otherwise
 * notes from one user can leak into another user's search results, since the
 * project shares a single Supermemory account.
 */
export function userContainerTag(userId: string): string {
  return `notty:user:${userId}`;
}

async function readBodySafe(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

/**
 * Upsert a note into Supermemory. Uses the note's id as the customId so that
 * subsequent calls for the same note overwrite the existing document.
 *
 * The user's container tag is attached so that searches scoped to the same
 * tag only return that user's notes.
 *
 * Throws on any non-2xx response so callers can surface failures (e.g. report
 * accurate `synced` counts in the bulk sync route).
 */
export async function postSupermemoryDocument(
  apiKey: string,
  note: SupermemoryNote,
  userId: string
): Promise<void> {
  const res = await fetch("https://api.supermemory.ai/v3/documents", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: note.content || "",
      customId: note.id,
      containerTags: [userContainerTag(userId)],
      metadata: {
        title: note.title,
        source: "notty",
        noteId: note.id,
        userId,
      },
    }),
  });
  if (!res.ok) {
    const body = await readBodySafe(res);
    throw new Error(`Supermemory upload failed (HTTP ${res.status}): ${body}`);
  }
}

/**
 * Remove a note from Supermemory by its customId (= Notty note id).
 *
 * Silently ignores 404 (note was never synced or already removed) but throws
 * on any other non-2xx so callers don't leave stale documents behind on
 * transient failures.
 */
export async function deleteSupermemoryDocument(
  apiKey: string,
  noteId: string
): Promise<void> {
  const res = await fetch(`https://api.supermemory.ai/v3/documents/${encodeURIComponent(noteId)}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
  });
  if (res.ok || res.status === 404) return;
  const body = await readBodySafe(res);
  throw new Error(`Supermemory delete failed (HTTP ${res.status}): ${body}`);
}
