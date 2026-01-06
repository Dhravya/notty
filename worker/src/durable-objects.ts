/**
 * NotesSync Durable Object with SQLite Storage
 *
 * Uses Cloudflare's native SQLite storage for zero-latency database access.
 * Each user gets their own Durable Object instance with isolated SQLite database.
 */

export interface Note {
  id: string;
  content: string; // JSON stringified content
  updatedAt: number;
  version: number;
  createdAt: number;
}

export interface SyncMessage {
  type: "sync" | "update" | "delete" | "get" | "list";
  noteId?: string;
  note?: Note;
  notes?: Record<string, Note>;
}

export class NotesSync implements DurableObject {
  private state: DurableObjectState;
  private env: any;
  private sessions: Set<WebSocket>;
  private sql: SqlStorage;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
    this.sessions = new Set();
    this.sql = state.storage.sql;

    // Initialize SQLite database schema
    this.state.blockConcurrencyWhile(async () => {
      await this.initializeDatabase();
    });
  }

  private async initializeDatabase() {
    // Create notes table if it doesn't exist
    await this.sql.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Create index for faster queries
    await this.sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_updated_at ON notes(updated_at DESC)
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade for real-time sync
    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocket();
    }

    const noteId = url.searchParams.get("id");

    switch (request.method) {
      case "GET":
        return this.handleGet(noteId);
      case "PUT":
        return this.handlePut(noteId, request);
      case "DELETE":
        return this.handleDelete(noteId);
      default:
        return new Response("Method not allowed", { status: 405 });
    }
  }

  private async handleGet(noteId: string | null): Promise<Response> {
    try {
      if (!noteId) {
        // List all notes
        const notes = await this.sql
          .exec(`SELECT id, content, version, created_at, updated_at FROM notes ORDER BY updated_at DESC`)
          .toArray();

        const notesMap: Record<string, any> = {};
        for (const note of notes) {
          notesMap[note.id as string] = {
            ...JSON.parse(note.content as string),
            _metadata: {
              version: note.version,
              createdAt: note.created_at,
              updatedAt: note.updated_at,
            },
          };
        }

        return new Response(JSON.stringify(notesMap), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Get single note
      const result = await this.sql
        .exec(`SELECT content, version, created_at, updated_at FROM notes WHERE id = ?`, noteId)
        .one();

      if (!result) {
        return new Response("Not found", { status: 404 });
      }

      const noteData = {
        ...JSON.parse(result.content as string),
        _metadata: {
          version: result.version,
          createdAt: result.created_at,
          updatedAt: result.updated_at,
        },
      };

      return new Response(JSON.stringify(noteData), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error in handleGet:", error);
      return new Response("Internal error", { status: 500 });
    }
  }

  private async handlePut(noteId: string | null, request: Request): Promise<Response> {
    if (!noteId) {
      return new Response("Note ID required", { status: 400 });
    }

    try {
      const content = await request.json();
      const contentStr = JSON.stringify(content);
      const now = Date.now();

      // Check if note exists
      const existing = await this.sql
        .exec(`SELECT version FROM notes WHERE id = ?`, noteId)
        .one();

      let newVersion = 1;

      if (existing) {
        // Update existing note
        newVersion = (existing.version as number) + 1;
        await this.sql.exec(
          `UPDATE notes SET content = ?, version = ?, updated_at = ? WHERE id = ?`,
          contentStr,
          newVersion,
          now,
          noteId
        );
      } else {
        // Insert new note
        await this.sql.exec(
          `INSERT INTO notes (id, content, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
          noteId,
          contentStr,
          newVersion,
          now,
          now
        );
      }

      // Broadcast update to all connected WebSocket clients
      this.broadcast({
        type: "update",
        note: {
          id: noteId,
          content: contentStr,
          version: newVersion,
          updatedAt: now,
          createdAt: existing ? (existing.created_at as number) : now,
        },
      });

      return new Response(JSON.stringify({ success: true, version: newVersion }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error in handlePut:", error);
      return new Response("Internal error", { status: 500 });
    }
  }

  private async handleDelete(noteId: string | null): Promise<Response> {
    if (!noteId) {
      return new Response("Note ID required", { status: 400 });
    }

    try {
      const result = await this.sql.exec(`DELETE FROM notes WHERE id = ?`, noteId);

      if (result.rowsWritten === 0) {
        return new Response("Not found", { status: 404 });
      }

      // Broadcast delete to all connected WebSocket clients
      this.broadcast({
        type: "delete",
        noteId,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error in handleDelete:", error);
      return new Response("Internal error", { status: 500 });
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

    // Send current state to the new client
    this.sendCurrentState(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  private async sendCurrentState(socket: WebSocket) {
    try {
      const notes = await this.sql
        .exec(`SELECT id, content, version, created_at, updated_at FROM notes`)
        .toArray();

      const notesMap: Record<string, Note> = {};
      for (const note of notes) {
        notesMap[note.id as string] = {
          id: note.id as string,
          content: note.content as string,
          version: note.version as number,
          createdAt: note.created_at as number,
          updatedAt: note.updated_at as number,
        };
      }

      socket.send(JSON.stringify({ type: "sync", notes: notesMap }));
    } catch (error) {
      socket.send(JSON.stringify({ type: "error", error: String(error) }));
    }
  }

  private async handleWebSocketMessage(message: SyncMessage, sender: WebSocket) {
    switch (message.type) {
      case "update":
        if (message.note) {
          // Handle via HTTP endpoint logic
          const mockRequest = new Request("http://internal/", {
            method: "PUT",
            body: message.note.content,
          });
          await this.handlePut(message.note.id, mockRequest);
        }
        break;

      case "delete":
        if (message.noteId) {
          await this.handleDelete(message.noteId);
        }
        break;

      case "get":
        if (message.noteId) {
          const result = await this.sql
            .exec(`SELECT id, content, version, created_at, updated_at FROM notes WHERE id = ?`, message.noteId)
            .one();

          if (result) {
            sender.send(
              JSON.stringify({
                type: "sync",
                note: {
                  id: result.id,
                  content: result.content,
                  version: result.version,
                  createdAt: result.created_at,
                  updatedAt: result.updated_at,
                },
              })
            );
          }
        }
        break;

      case "list":
        await this.sendCurrentState(sender);
        break;
    }
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
