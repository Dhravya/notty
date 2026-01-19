import { Hono } from "hono";
import { stream } from "hono/streaming";
import type { Env } from "../index";

const app = new Hono<{ Bindings: Env }>();

// Rate limiting map
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

app.post("/", async (c) => {
  const ip = c.req.header("x-forwarded-for") || "unknown";

  if (!checkRateLimit(ip)) {
    return c.text("Rate limit exceeded. Try again tomorrow.", 429);
  }

  const body = await c.req.json<{ prompt: string }>();
  const { prompt } = body;

  if (!prompt) {
    return c.text("Prompt is required", 400);
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
            "You are an AI writing assistant that continues existing text based on context from prior text. " +
            "Give more weight/priority to the later characters than the beginning ones. " +
            "Limit your response to no more than 200 characters, but make sure to construct complete sentences. Just output in text format.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 100,
      stream: true,
    }),
  });

  if (!response.ok) {
    return c.text("Failed to generate text", 500);
  }

  // Stream the response
  return stream(c, async (stream) => {
    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter((line) => line.trim() !== "");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              await stream.write(content);
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  });
});

export { app as generateRoutes };
