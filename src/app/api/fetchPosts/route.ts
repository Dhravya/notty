import { auth } from "@/lib/auth";
import { env } from "@/env";

export async function GET(_: Request): Promise<Response> {
  const user = await auth();

  // If not logged in or cloudflare not configured, return empty array (client uses localStorage)
  if (!user?.user?.email || !env.WORKER_BASE_URL || !env.CLOUDFLARE_R2_TOKEN) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  try {
    // Fetch from cloudflare
    const getResponse = await fetch(
      `${env.WORKER_BASE_URL}?getAllFromUser=${user.user.email}`,
      {
        method: "GET",
        headers: {
          "X-Custom-Auth-Key": env.CLOUDFLARE_R2_TOKEN,
        },
      },
    );

    if (getResponse.status !== 200) {
      console.error("Failed to fetch from Cloudflare");
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const data = await getResponse.json();

    // Convert it into a list instead of an object
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const keys = Object.keys(data);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const values = Object.values(data);

    // convert to list of [key, value] pairs
    const result = keys.map((key, index) => {
      return [key, values[index]];
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error fetching posts:", error);
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}
