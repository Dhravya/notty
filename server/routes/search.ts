import { Hono } from "hono";
import type { Env } from "../index";
import { authMiddleware, type AuthContext } from "../middleware/auth";

const app = new Hono<{ Bindings: Env; Variables: AuthContext }>();

app.use("*", authMiddleware);

// Rate limiting map (in production, use KV or Durable Objects)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const checkRateLimit = (ip: string): boolean => {
  const now = Date.now();
  const limit = rateLimitMap.get(ip);

  if (!limit || now > limit.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 24 * 60 * 60 * 1000 });
    return true;
  }

  if (limit.count >= 50) {
    return false;
  }

  limit.count++;
  return true;
};

app.get("/", async (c) => {
  const user = c.get("user");

  if (!user) {
    return c.json({ error: "Login required for AI search" }, 401);
  }

  const ip = c.req.header("x-forwarded-for") || "unknown";
  if (!checkRateLimit(ip)) {
    return c.json({ error: "Rate limit exceeded. Try again tomorrow." }, 429);
  }

  const query = c.req.query("prompt");

  if (!query) {
    return c.json({ error: "Query is required" }, 400);
  }

  try {
    // Search with Supermemory
    const response = await fetch(
      `https://v2.api.supermemory.ai/search?${new URLSearchParams({
        q: query,
        limit: "10",
      })}`,
      {
        method: "GET",
        headers: {
          "x-api-key": c.env.SUPERMEMORY_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error("Supermemory search failed");
    }

    const searchResults = await response.json();

    // Filter results by user
    const userResults = (searchResults as { results?: Array<{ metadata?: { userId?: string }; content?: string; score?: number }> }).results?.filter(
      (result: { metadata?: { userId?: string } }) => result.metadata?.userId === user.email
    ) || [];

    // Generate AI response based on search results
    const context = userResults
      .map((r: { content?: string }) => r.content)
      .join("\n\n");

    if (!context) {
      return c.json({
        answer: "No relevant notes found for your query.",
        results: [],
      });
    }

    // Use OpenAI to generate a response
    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${c.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant that answers questions based on the user's notes. Be concise and helpful. If the notes don't contain relevant information, say so.",
            },
            {
              role: "user",
              content: `Based on these notes:\n\n${context}\n\nAnswer this question: ${query}`,
            },
          ],
          max_tokens: 500,
        }),
      }
    );

    const aiResult = await openaiResponse.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const answer = aiResult.choices?.[0]?.message?.content || "Unable to generate response.";

    return c.json({
      answer,
      results: userResults.map((r: { content?: string; metadata?: { noteId?: string }; score?: number }) => ({
        content: r.content,
        noteId: r.metadata?.noteId,
        score: r.score,
      })),
    });
  } catch (error) {
    console.error("Search error:", error);
    return c.json({ error: "Search failed" }, 500);
  }
});

export { app as searchRoutes };
