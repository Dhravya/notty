import { env } from "@/env";
import { auth } from "@/lib/auth";

export const runtime = "edge";

export async function GET(req: Request): Promise<Response> {
  const user = await auth();

  if (!user?.user?.email) {
    return new Response("Login is required for this endpoint", {
      status: 401,
    });
  }

  // Get prompt from query
  const prompt = new URL(req.url).searchParams.get("prompt");

  if (!prompt) {
    return new Response("Invalid request", {
      status: 400,
    });
  }

  try {
    const Supermemory = (await import("supermemory")).default;
    const supermemoryClient = new Supermemory({
      apiKey: env.SUPERMEMORY_API_KEY,
    });

    // Search memories using Supermemory
    const searchResponse = await supermemoryClient.search.execute({
      q: prompt,
      limit: 10,
    });

    // Format response to match existing UI expectations
    // Expected format: [answerText, [[memoryText, metadata], ...]]
    const answer = "Here are the relevant notes I found:";
    const memories = searchResponse.results?.map((result: any) => [
      result.content,
      {
        note_id: result.metadata?.noteId,
        user: result.metadata?.userId,
      },
    ]) || [];

    return new Response(JSON.stringify([answer, memories]), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Search error:", error);
    return new Response("Failed to search memories", {
      status: 500,
    });
  }
}
