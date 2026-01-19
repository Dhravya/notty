import { Hono } from "hono";
import { cors } from "hono/cors";
import { createRequestHandler } from "react-router";
import { auth } from "./auth";
import { noteRoutes } from "./routes/notes";
import { searchRoutes } from "./routes/search";
import { generateRoutes } from "./routes/generate";
import { NoteSyncDurableObject } from "./durable-objects/note-sync";

export { NoteSyncDurableObject };

export interface Env {
  NOTTY_KV: KVNamespace;
  DB: D1Database;
  NOTE_SYNC: DurableObjectNamespace;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  OPENAI_API_KEY: string;
  SUPERMEMORY_API_KEY: string;
}

const app = new Hono<{ Bindings: Env }>();

// CORS configuration
app.use(
  "*",
  cors({
    origin: (origin) => origin || "*",
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// Better Auth routes
app.on(["POST", "GET"], "/api/auth/*", async (c) => {
  const authInstance = auth(c.env);
  return authInstance.handler(c.req.raw);
});

// API routes
app.route("/api/notes", noteRoutes);
app.route("/api/search", searchRoutes);
app.route("/api/generate", generateRoutes);

// WebSocket route for real-time sync
app.get("/api/sync/:noteId", async (c) => {
  const noteId = c.req.param("noteId");
  const id = c.env.NOTE_SYNC.idFromName(noteId);
  const stub = c.env.NOTE_SYNC.get(id);
  return stub.fetch(c.req.raw);
});

// React Router handler for all other routes
app.all("*", async (c) => {
  // @ts-expect-error - React Router types
  const handler = createRequestHandler(
    // @ts-expect-error - build import
    () => import("virtual:react-router/server-build"),
    import.meta.env.MODE
  );
  return handler(c.req.raw, {
    cloudflare: { env: c.env },
  });
});

export default app;
