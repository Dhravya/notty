import { Hono } from "hono";
import type { Env } from "../index";
import { authMiddleware, type AuthContext } from "../middleware/auth";
import { exportContentAsText } from "@shared/utils/note";

const app = new Hono<{ Bindings: Env; Variables: AuthContext }>();

// Apply auth middleware to all routes
app.use("*", authMiddleware);

// Get a specific note
app.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  if (!user) {
    return c.json({ error: "Login required for cloud sync" }, 401);
  }

  const key = `${user.email}-${id}`;
  const data = await c.env.NOTTY_KV.get(key, "json");

  if (!data) {
    return c.json({ error: "Note not found" }, 404);
  }

  return c.json(data);
});

// Get all notes for a user
app.get("/", async (c) => {
  const user = c.get("user");

  if (!user) {
    return c.json({ error: "Login required" }, 401);
  }

  const prefix = `${user.email}-`;
  const list = await c.env.NOTTY_KV.list({ prefix });

  const notes: [string, unknown][] = [];

  for (const key of list.keys) {
    const value = await c.env.NOTTY_KV.get(key.name, "json");
    if (value) {
      notes.push([key.name, value]);
    }
  }

  return c.json(notes);
});

// Save a note
app.post("/", async (c) => {
  const user = c.get("user");

  if (!user) {
    return c.text("Saved locally | Login for Cloud Sync", 401);
  }

  const body = await c.req.json<{ id: string; data: unknown }>();
  const { id, data } = body;

  if (!id || !data) {
    return c.text("Invalid request", 400);
  }

  const key = `${user.email}-${id}`;

  // Save to KV
  await c.env.NOTTY_KV.put(key, JSON.stringify(data));

  // Save to Supermemory for AI search
  try {
    const content = exportContentAsText(data);
    if (content.trim()) {
      await fetch("https://v2.api.supermemory.ai/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": c.env.SUPERMEMORY_API_KEY,
        },
        body: JSON.stringify({
          content: content,
          metadata: {
            userId: user.email,
            noteId: id,
          },
          tags: [user.email, `note-${id}`],
        }),
      });
    }
  } catch (error) {
    console.error("Failed to save to Supermemory:", error);
  }

  return c.text("Saved");
});

// Delete a note
app.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  if (!user) {
    return c.json({ error: "Login required" }, 401);
  }

  const key = `${user.email}-${id}`;

  // Archive the note first
  const data = await c.env.NOTTY_KV.get(key, "json");
  if (data) {
    await c.env.NOTTY_KV.put(`archived-${key}`, JSON.stringify(data));
  }

  // Delete the note
  await c.env.NOTTY_KV.delete(key);

  return c.text("Deleted");
});

export { app as noteRoutes };
