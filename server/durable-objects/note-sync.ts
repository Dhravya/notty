import type { Env } from "../index";

interface Connection {
  webSocket: WebSocket;
  userId: string;
  quit: boolean;
}

interface SyncMessage {
  type: "update" | "sync" | "awareness" | "cursor";
  data: unknown;
  userId: string;
  userName?: string;
}

export class NoteSyncDurableObject implements DurableObject {
  private connections: Map<WebSocket, Connection> = new Map();
  private state: DurableObjectState;
  private env: Env;
  private noteContent: Uint8Array | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    // Load stored content on initialization
    this.state.blockConcurrencyWhile(async () => {
      this.noteContent = await this.state.storage.get("content") || null;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Handle WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Get user info from query params
      const userId = url.searchParams.get("userId") || "anonymous";
      const userName = url.searchParams.get("userName") || "Anonymous";

      this.handleWebSocket(server, userId, userName);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    // Handle HTTP requests for REST API
    if (request.method === "GET") {
      const content = await this.state.storage.get("content");
      return new Response(JSON.stringify({ content }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (request.method === "POST") {
      const body = await request.json() as { content: unknown };
      await this.state.storage.put("content", body.content);
      return new Response("OK");
    }

    return new Response("Not Found", { status: 404 });
  }

  private handleWebSocket(webSocket: WebSocket, userId: string, userName: string): void {
    webSocket.accept();

    const connection: Connection = {
      webSocket,
      userId,
      quit: false,
    };

    this.connections.set(webSocket, connection);

    // Send current state to new connection
    if (this.noteContent) {
      webSocket.send(
        JSON.stringify({
          type: "sync",
          data: Array.from(this.noteContent),
          userId: "server",
        })
      );
    }

    // Notify others of new user
    this.broadcast(
      {
        type: "awareness",
        data: { action: "join", userId, userName },
        userId,
        userName,
      },
      webSocket
    );

    // Send list of current users to new connection
    const users = Array.from(this.connections.values())
      .filter((c) => c.webSocket !== webSocket)
      .map((c) => c.userId);

    webSocket.send(
      JSON.stringify({
        type: "awareness",
        data: { action: "users", users },
        userId: "server",
      })
    );

    webSocket.addEventListener("message", async (event) => {
      try {
        const message: SyncMessage = JSON.parse(event.data as string);

        switch (message.type) {
          case "update":
            // Store the update
            if (message.data) {
              this.noteContent = new Uint8Array(message.data as number[]);
              await this.state.storage.put("content", this.noteContent);
            }
            // Broadcast to all other clients
            this.broadcast(message, webSocket);
            break;

          case "cursor":
            // Broadcast cursor position to others
            this.broadcast(message, webSocket);
            break;

          case "awareness":
            // Broadcast awareness updates
            this.broadcast(message, webSocket);
            break;
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });

    webSocket.addEventListener("close", () => {
      this.connections.delete(webSocket);
      connection.quit = true;

      // Notify others that user left
      this.broadcast(
        {
          type: "awareness",
          data: { action: "leave", userId },
          userId,
        },
        null
      );
    });

    webSocket.addEventListener("error", () => {
      this.connections.delete(webSocket);
      connection.quit = true;
    });
  }

  private broadcast(message: SyncMessage, exclude: WebSocket | null): void {
    const messageStr = JSON.stringify(message);

    for (const [ws, connection] of this.connections) {
      if (ws !== exclude && !connection.quit) {
        try {
          ws.send(messageStr);
        } catch {
          // Connection is dead, clean it up
          this.connections.delete(ws);
        }
      }
    }
  }
}
