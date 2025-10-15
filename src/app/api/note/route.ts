import { env } from "@/env";
import { auth } from "@/lib/auth";
import { exportContentAsText } from "@/lib/note";

export const runtime = "edge";

export async function POST(req: Request): Promise<Response> {
  const user = await auth();

  // get request body
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const body = await req.json();

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { id, data } = body;

  if (!id || !data) {
    return new Response("Invalid request", {
      status: 400,
    });
  }

  // If user is logged in AND cloudflare is configured, save to cloud
  if (user?.user?.email && env.WORKER_BASE_URL && env.CLOUDFLARE_R2_TOKEN) {
    const key = `${user.user.email}-${id}`;

    try {
      const putResponse = await fetch(`${env.WORKER_BASE_URL}?key=${key}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Custom-Auth-Key": env.CLOUDFLARE_R2_TOKEN,
        },
        body: JSON.stringify(data),
      });

      if (putResponse.status !== 200) {
        console.error("Failed to save to Cloudflare");
      }
    } catch (error) {
      console.error("Error saving to Cloudflare:", error);
    }
  }

  // Create memory using Supermemory (if API key configured)
  if (env.SUPERMEMORY_API_KEY && user?.user?.email) {
    try {
      const Supermemory = (await import("supermemory")).default;
      const supermemoryClient = new Supermemory({
        apiKey: env.SUPERMEMORY_API_KEY,
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const noteContent = exportContentAsText(data);

      await supermemoryClient.memories.add({
        content: noteContent,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        metadata: {
          userId: user.user.email,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          noteId: id,
          type: "note",
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          title: data.doc?.content?.[0]?.content?.[0]?.text || "Untitled",
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Error occurred while saving memory to Supermemory: ", error);
      // Don't fail the save if memory indexing fails
    }
  }

  // Always return success for local-first experience
  return new Response("Saved", {
    status: 200,
  });
}

export async function GET(req: Request): Promise<Response> {
  const id = new URL(req.url).searchParams.get("id");
  const user = await auth();

  if (!id) {
    return new Response("Invalid request", {
      status: 400,
    });
  }

  // If not logged in or cloudflare not configured, return 404 (client will use localStorage)
  if (!user?.user?.email || !env.WORKER_BASE_URL || !env.CLOUDFLARE_R2_TOKEN) {
    return new Response("Not found - using local storage", {
      status: 404,
    });
  }

  const key = `${user.user.email}-${id}`;

  try {
    const getResponse = await fetch(`${env.WORKER_BASE_URL}?key=${key}`, {
      method: "GET",
      headers: {
        "X-Custom-Auth-Key": env.CLOUDFLARE_R2_TOKEN,
      },
    });

    if (getResponse.status !== 200) {
      return new Response(await getResponse.text(), {
        status: getResponse.status,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const data = await getResponse.json();

    return new Response(JSON.stringify(data), {
      status: 200,
    });
  } catch (error) {
    console.error("Error fetching from Cloudflare:", error);
    return new Response("Not found - using local storage", {
      status: 404,
    });
  }
}

export async function DELETE(req: Request): Promise<Response> {
  const id = new URL(req.url).searchParams.get("id");
  const user = await auth();

  if (!id) {
    return new Response("Invalid request", {
      status: 400,
    });
  }

  // If not logged in or cloudflare not configured, return success (client handles deletion)
  if (!user?.user?.email || !env.WORKER_BASE_URL || !env.CLOUDFLARE_R2_TOKEN) {
    return new Response("Deleted locally", {
      status: 200,
    });
  }

  const key = `${user.user.email}-${id}`;

  try {
    const deleteResponse = await fetch(`${env.WORKER_BASE_URL}?key=${key}`, {
      method: "DELETE",
      headers: {
        "X-Custom-Auth-Key": env.CLOUDFLARE_R2_TOKEN,
      },
    });

    const data = await deleteResponse.text();

    if (deleteResponse.status !== 200) {
      console.error("Failed to delete from Cloudflare:", data);
    }
  } catch (error) {
    console.error("Error deleting from Cloudflare:", error);
  }

  // Always return success for local-first experience
  return new Response("Deleted", {
    status: 200,
  });
}
