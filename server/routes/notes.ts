import { Hono } from "hono";
import type { Env } from "../index";
import { authMiddleware, type AuthContext } from "../middleware/auth";

const app = new Hono<{ Bindings: Env; Variables: AuthContext }>();

app.use("*", authMiddleware);

// Get a specific note
app.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  if (!user) {
    return c.json({ error: "Login required for cloud sync" }, 401);
  }

  const key = `${user.email}-${id}`;
  const data = await c.env.NOTTY_KV.get(key, "text");

  if (!data) {
    return c.json({ error: "Note not found" }, 404);
  }

  // Check if it's markdown (starts with # or plain text) or legacy JSON
  if (data.startsWith("{")) {
    // Legacy JSON format - convert to markdown response
    try {
      const json = JSON.parse(data);
      return c.json({ markdown: null, legacy: json });
    } catch {
      return c.json({ markdown: data });
    }
  }

  return c.json({ markdown: data });
});

// Get all notes for a user
app.get("/", async (c) => {
  const user = c.get("user");

  if (!user) {
    return c.json({ error: "Login required" }, 401);
  }

  const prefix = `${user.email}-`;
  const list = await c.env.NOTTY_KV.list({ prefix });

  const notes: Array<{ id: string; title: string; preview: string }> = [];

  for (const key of list.keys) {
    const noteId = key.name.replace(prefix, "");
    const data = await c.env.NOTTY_KV.get(key.name, "text");

    if (data) {
      let title = "Untitled";
      let preview = "";

      if (data.startsWith("{")) {
        // Legacy JSON
        try {
          const json = JSON.parse(data);
          title = json.content?.[0]?.content?.[0]?.text || "Untitled";
        } catch {
          title = "Untitled";
        }
      } else {
        // Markdown - extract title from first line
        const lines = data.split("\n").filter((l: string) => l.trim());
        title = lines[0]?.replace(/^#+\s*/, "") || "Untitled";
        preview = lines.slice(1, 3).join(" ").substring(0, 100);
      }

      notes.push({ id: noteId, title, preview });
    }
  }

  return c.json(notes);
});

// Save a note (accepts markdown or legacy JSON)
app.post("/", async (c) => {
  const user = c.get("user");

  if (!user) {
    return c.text("Saved locally | Login for Cloud Sync", 401);
  }

  const body = await c.req.json<{ id: string; markdown?: string; data?: unknown }>();
  const { id, markdown, data } = body;

  if (!id) {
    return c.text("Invalid request", 400);
  }

  const key = `${user.email}-${id}`;

  // Prefer markdown, fall back to JSON data
  let content: string;
  if (markdown) {
    content = markdown;
    await c.env.NOTTY_KV.put(key, markdown);
  } else if (data) {
    content = JSON.stringify(data);
    await c.env.NOTTY_KV.put(key, content);
  } else {
    return c.text("Invalid request - no content", 400);
  }

  // Save to Supermemory for AI search
  try {
    const textContent = markdown || extractTextFromJSON(data);
    if (textContent.trim()) {
      await fetch("https://v2.api.supermemory.ai/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": c.env.SUPERMEMORY_API_KEY,
        },
        body: JSON.stringify({
          content: textContent,
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
  const data = await c.env.NOTTY_KV.get(key, "text");
  if (data) {
    await c.env.NOTTY_KV.put(`archived-${key}`, data);
  }

  await c.env.NOTTY_KV.delete(key);

  return c.text("Deleted");
});

// Helper to extract text from legacy JSON format
function extractTextFromJSON(data: unknown): string {
  if (!data || typeof data !== "object") return "";

  const doc = data as { content?: Array<{ content?: Array<{ text?: string }> }> };
  const blocks = doc.content || [];

  return blocks
    .map((block) => {
      if (block.content) {
        return block.content.map((c) => c.text || "").join("");
      }
      return "";
    })
    .join("\n");
}

export { app as noteRoutes };
