/**
 * NotesSync Durable Object
 *
 * Handles real-time note synchronization for a single user
 */

export interface Note {
  id: string;
  content: any;
  updatedAt: number;
  version: number;
}

export interface SyncMessage {
  type: "sync" | "update" | "delete" | "get" | "list";
  noteId?: string;
  note?: Note;
  notes?: Record<string, Note>;
}

export class NotesSync implements DurableObject {
  private state: DurableObjectState;
  private sessions: Set<WebSocket>;
  private notes: Map<string, Note>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.sessions = new Set();
    this.notes = new Map();

    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<Record<string, Note>>("notes");
      if (stored) {
        for (const [id, note] of Object.entries(stored)) {
          this.notes.set(id, note);
        }
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocket();
    }

    const noteId = url.searchParams.get("id");

    switch (request.method) {
      case "GET":
        if (!noteId) {
          return new Response(
            JSON.stringify(Object.fromEntries(
              Array.from(this.notes.entries()).map(([id, note]) => [id, note.content])
            )),
            { headers: { "Content-Type": "application/json" } }
          );
        }
        const note = this.notes.get(noteId);
        if (!note) {
          return new Response("Not found", { status: 404 });
        }
        return new Response(JSON.stringify(note.content), {
          headers: { "Content-Type": "application/json" },
        });

      case "PUT":
        if (!noteId) {
          return new Response("Note ID required", { status: 400 });
        }
        const content = await request.json();
        await this.updateNote({
          id: noteId,
          content,
          updatedAt: Date.now(),
          version: (this.notes.get(noteId)?.version || 0) + 1,
        });
        return new Response("OK");

      case "DELETE":
        if (!noteId) {
          return new Response("Note ID required", { status: 400 });
        }
        await this.deleteNote(noteId);
        return new Response("OK");

      default:
        return new Response("Method not allowed", { status: 405 });
    }
  }

  private handleWebSocket(): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.sessions.add(server);
    server.accept();

    server.addEventListener("message", async (event) => {
      try {
        const message: SyncMessage = JSON.parse(event.data as string);
        await this.handleWebSocketMessage(message, server);
      } catch (error) {
        server.send(JSON.stringify({ type: "error", error: String(error) }));
      }
    });

    server.addEventListener("close", () => this.sessions.delete(server));
    server.addEventListener("error", () => this.sessions.delete(server));

    server.send(JSON.stringify({
      type: "sync",
      notes: Object.fromEntries(this.notes),
    }));

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleWebSocketMessage(message: SyncMessage, sender: WebSocket) {
    switch (message.type) {
      case "update":
        if (message.note) {
          await this.updateNote(message.note);
          this.broadcast(message, sender);
        }
        break;
      case "delete":
        if (message.noteId) {
          await this.deleteNote(message.noteId);
          this.broadcast(message, sender);
        }
        break;
      case "get":
        if (message.noteId) {
          sender.send(JSON.stringify({ type: "sync", note: this.notes.get(message.noteId) }));
        }
        break;
      case "list":
        sender.send(JSON.stringify({ type: "sync", notes: Object.fromEntries(this.notes) }));
        break;
    }
  }

  private async updateNote(note: Note) {
    const existing = this.notes.get(note.id);
    if (existing && existing.version > note.version) return;

    this.notes.set(note.id, note);
    await this.state.storage.put("notes", Object.fromEntries(this.notes));
    this.broadcast({ type: "update", note });
  }

  private async deleteNote(noteId: string) {
    this.notes.delete(noteId);
    await this.state.storage.put("notes", Object.fromEntries(this.notes));
    this.broadcast({ type: "delete", noteId });
  }

  private broadcast(message: SyncMessage, except?: WebSocket) {
    const messageStr = JSON.stringify(message);
    for (const session of this.sessions) {
      if (session !== except) {
        try {
          session.send(messageStr);
        } catch {
          this.sessions.delete(session);
        }
      }
    }
  }
}
