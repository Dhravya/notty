import { auth } from "@/lib/auth";
import { type AiResponse } from "@/types/aiResponse";
import { searchNotesInSupermemory } from "@/lib/supermemory";
import { withRateLimit } from "@/lib/ratelimit";

export const runtime = "edge";

export async function GET(req: Request): Promise<Response> {

    const user = await auth();

    if (!user?.user?.email) {
        return new Response("Login is required for this endpoint", {
            status: 401,
        });
    }

    // Check rate limit using Cloudflare Worker or Vercel KV
    const rateLimit = await withRateLimit(req, "search", user.user.email);
    if (!rateLimit.success) {
        return new Response("You have reached your request limit for the day.", {
            status: 429,
            headers: {
                "X-RateLimit-Limit": rateLimit.limit.toString(),
                "X-RateLimit-Remaining": rateLimit.remaining.toString(),
                "X-RateLimit-Reset": rateLimit.reset.toString(),
            },
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
        const searchResults = await searchNotesInSupermemory(prompt, user.user.email);

        // Transform Supermemory response to match the expected AiResponse format
        // Supermemory returns: { results: [{ id, memory/chunk, metadata, similarity, ... }] }
        // Expected format: [summary_string, [[content, metadata], ...]]

        const formattedResults: AiResponse = [
            `Search results for: "${prompt}"`,
            searchResults.results.map((result) => [
                // Use 'memory' field for memory results, 'chunk' field for chunk results
                result.memory || result.chunk || "",
                {
                    app_id: "notty-supermemory",
                    data_type: "note",
                    doc_id: result.id,
                    hash: result.id,
                    note_id: (result.metadata?.note_id as string) || "",
                    url: "",
                    user: user.user?.email || "",
                    score: result.similarity,
                },
            ]),
        ];

        return new Response(JSON.stringify(formattedResults), {
            status: 200,
        });
    } catch (error) {
        console.error("Error searching with Supermemory:", error);
        return new Response("Failed to get search results", {
            status: 500,
        });
    }

}