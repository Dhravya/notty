import { env } from "@/env";
import { auth } from "@/lib/auth";
import { getUserProfile, searchNotesInSupermemory } from "@/lib/supermemory";
import { withRateLimit } from "@/lib/ratelimit";
import { OpenAI } from "openai";

export const runtime = "edge";

const openai = new OpenAI({
  apiKey: env.OPENROUTER_API_TOKEN,
  baseURL: "https://openrouter.ai/api/v1",
});

/**
 * Chat endpoint with Supermemory user profile support
 * This endpoint provides personalized responses based on user's notes and profile
 */
export async function POST(req: Request): Promise<Response> {
  const user = await auth();

  if (!user?.user?.email) {
    return new Response("Login is required for this endpoint", {
      status: 401,
    });
  }

  // Check rate limit using Cloudflare Worker or Vercel KV
  const rateLimit = await withRateLimit(req, "chat", user.user.email);
  if (!rateLimit.success) {
    return new Response("You have reached your request limit for the hour.", {
      status: 429,
      headers: {
        "X-RateLimit-Limit": rateLimit.limit.toString(),
        "X-RateLimit-Remaining": rateLimit.remaining.toString(),
        "X-RateLimit-Reset": rateLimit.reset.toString(),
      },
    });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { message } = await req.json();

    if (!message || typeof message !== "string") {
      return new Response("Invalid request: message is required", {
        status: 400,
      });
    }

    // Fetch user profile (static and dynamic facts)
    const profileData = await getUserProfile(user.user.email);

    // Search for relevant notes
    const searchResults = await searchNotesInSupermemory(
      message,
      user.user.email,
    );

    // Build context from profile and search results
    const staticFacts = profileData.profile.static.join("\n");
    const dynamicFacts = profileData.profile.dynamic.join("\n");
    const relevantNotes = searchResults.results
      .slice(0, 5)
      .map((r, i) => `${i + 1}. ${r.memory || r.chunk || ""}`)
      .join("\n\n");

    const systemPrompt = `You are a helpful AI assistant for a personal note-taking app called Notty. You have access to the user's notes and their profile.

User Profile - Static Facts:
${staticFacts || "No static facts yet"}

User Profile - Dynamic Context:
${dynamicFacts || "No dynamic context yet"}

Relevant Notes:
${relevantNotes || "No relevant notes found"}

Use this context to provide personalized, helpful responses. Reference specific notes when relevant.`;

    // Call OpenAI for the response
    const completion = await openai.chat.completions.create({
      model: "anthropic/claude-3.5-sonnet",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: message,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const assistantResponse =
      completion.choices[0]?.message?.content ||
      "Sorry, I couldn't generate a response.";

    return new Response(
      JSON.stringify({
        response: assistantResponse,
        profile: {
          static: profileData.profile.static,
          dynamic: profileData.profile.dynamic,
        },
        relevantNotes: searchResults.results.slice(0, 3).map((r) => {
          const content = r.memory || r.chunk || "";
          return {
            content: content.substring(0, 200) + (content.length > 200 ? "..." : ""),
            noteId: r.metadata?.note_id,
          };
        }),
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("Error in chat endpoint:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to process chat request",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
}
