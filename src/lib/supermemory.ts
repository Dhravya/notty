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
 * Build a safe filesystem-style path for a note. Used as metadata so
 * Supermemory knows the file structure of the user's notes.
 */
function noteFilePath(note: SupermemoryNote): string {
  const safeName = (note.title || "untitled")
    .replace(/[^a-zA-Z0-9_\-. ]/g, "_")
    .slice(0, 100);
  return `/notes/${safeName}.md`;
}

/**
 * Upsert a note into Supermemory as a file upload. Uses the note's id as the
 * customId so that subsequent calls for the same note overwrite the existing
 * document.
 *
 * Each note is uploaded with a `filePath` in metadata (e.g. `/notes/My Note.md`)
 * so Supermemory understands the file structure. The user's container tag scopes
 * the document so searches only return that user's notes.
 *
 * Throws on any non-2xx response so callers can surface failures (e.g. report
 * accurate `synced` counts in the bulk sync route).
 */
export async function postSupermemoryDocument(
  apiKey: string,
  note: SupermemoryNote,
  userId: string
): Promise<void> {
  const filePath = noteFilePath(note);
  const res = await fetch("https://api.supermemory.ai/v3/documents", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: note.content || "",
      customId: note.id,
      containerTag: userContainerTag(userId),
      metadata: {
        title: note.title,
        filePath,
        fileName: `${(note.title || "untitled").slice(0, 100)}.md`,
        fileType: "markdown",
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
