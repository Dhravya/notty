import { auth } from "@/lib/auth";
import { configureSupermemorySettings } from "@/lib/supermemory";

export const runtime = "edge";

/**
 * Setup endpoint to configure Supermemory settings
 * This should be called once when setting up the application
 */
export async function POST(req: Request): Promise<Response> {
  const user = await auth();

  if (!user?.user?.email) {
    return new Response("Unauthorized", {
      status: 401,
    });
  }

  try {
    const result = await configureSupermemorySettings();

    return new Response(
      JSON.stringify({
        message: "Supermemory settings configured successfully",
        result,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error setting up Supermemory:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to configure Supermemory settings",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}
