import { auth } from "@/lib/auth";
import { env } from "@/env";

export async function GET(_: Request): Promise<Response> {
    const user = await auth()

    if (!(user?.user?.email)) {
        return new Response("Saved locally | Login for Cloud Sync", {
            status: 401,
        });
    }

    // save to cloudflare
    const getResponse = await fetch(`${env.WORKER_BASE_URL}?getAllFromUser=${user.user.email}`,
        {
            method: "GET",
            headers: {
                'X-Custom-Auth-Key': env.CLOUDFLARE_R2_TOKEN
            }
        }
    )

    if (getResponse.status !== 200) {
        return new Response("Failed to get", {
            status: 500,
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const data = await getResponse.json()

    // Convert it into a list instead of an object
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const keys = Object.keys(data)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const values = Object.values(data)

    // convert to list of [key, value] pairs
    const result = keys.map((key, index) => {
        return [key, values[index]]
    })

    return new Response(JSON.stringify(result), {
        status: 200,
    });
}