import { streamText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { env } from "@/env";
import { auth } from "@/lib/auth";

// IMPORTANT! Set the runtime to edge
export const runtime = "edge";

export async function POST(req: Request): Promise<Response> {
  // Check if API keys are configured
  if (!env.GEMINI_API_KEY) {
    return new Response(
      "API keys not configured. Please add GEMINI_API_KEY to your .env file.",
      { status: 500 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { prompt } = await req.json();

  let contextFromNotes = "";

  // If Supermemory is configured and user is authenticated, get relevant notes as context
  if (env.SUPERMEMORY_API_KEY) {
    const user = await auth();

    if (user?.user?.email) {
      try {
        const Supermemory = (await import("supermemory")).default;
        const supermemoryClient = new Supermemory({
          apiKey: env.SUPERMEMORY_API_KEY,
        });

        // Search for relevant notes based on the prompt
        const searchResponse = await supermemoryClient.search.execute({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          q: prompt,
          limit: 3, // Get top 3 most relevant notes
        });

        // Extract content from search results
        if (searchResponse.results && searchResponse.results.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
          const relevantContent = searchResponse.results
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
            .map((result: any) => result.content)
            .join("\n\n");
          contextFromNotes = `\n\nRelevant context from your notes:\n${relevantContent}`;
        }
      } catch (error) {
        console.error("Error fetching context from Supermemory:", error);
        // Continue without context if search fails
      }
    }
  }

  try {
    // Create Google AI instance with explicit API key
    const google = createGoogleGenerativeAI({
      apiKey: env.GEMINI_API_KEY,
    });

    const result = await streamText({
      model: google("gemini-2.0-flash-exp"),
      messages: [
        {
          role: "system",
          content:
            "You are an AI writing assistant that continues existing text based on context from prior text. " +
            "Give more weight/priority to the later characters than the beginning ones. " +
            "Limit your response to no more than 200 characters, but make sure to construct complete sentences. " +
            "Just output in text format.",
        },
        {
          role: "user",
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          content: prompt + contextFromNotes,
        },
      ],
      temperature: 0.7,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Error generating completion:", error);
    return new Response(
      `Failed to generate completion: ${error instanceof Error ? error.message : "Unknown error"}`,
      { status: 500 },
    );
  }
}
