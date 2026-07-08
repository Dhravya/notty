// Registry of open editors' flush functions. Lets actions that depend on the
// server having the latest content (publish, share) force a save first instead
// of racing the debounced autosave.

const flushers = new Map<string, () => Promise<void>>();

export function registerNoteFlusher(noteId: string, flush: () => Promise<void>) {
    flushers.set(noteId, flush);
    return () => {
        if (flushers.get(noteId) === flush) flushers.delete(noteId);
    };
}

/** Flush the open editor for a note, if any. Resolves even if no editor is open. */
export async function flushNote(noteId: string): Promise<void> {
    const flush = flushers.get(noteId);
    if (flush) await flush();
}
