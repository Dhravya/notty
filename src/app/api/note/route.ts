import { env } from "@/env";
import { auth } from "@/lib/auth";

export const runtime = "edge";

// TODO: CLOUD SYNC
export async function POST(req: Request): Promise<Response> {

    const user = await auth()

    if (!(user?.user?.email)) {
        return new Response("Saved locally | Login for Cloud Sync", {
            status: 401,
        });
    }


    // get request body
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const body = await req.json()

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { id, data } = body

    if (!id || !data) {
        return new Response("Invalid request", {
            status: 400,
        });
    }

    const key = `${user.user.email}-${id}`

    // save to cloudflare
    const putResponse = await fetch(`https://nottykv.dhravya.workers.dev?key=${key}`,
        {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "X-Custom-Auth-Key": env.CLOUDFLARE_R2_TOKEN
            },
            body: JSON.stringify(data)
        }
    )

    if (putResponse.status !== 200) {
        return new Response("Failed to save", {
            status: 500,
        });
    }

    return new Response("Saved", {
        status: 200,
    });

}

export async function GET(req: Request): Promise<Response> {
    const id = new URL(req.url).searchParams.get("id")
    const user = await auth()

    if (!(user?.user?.email)) {
        return new Response("Saved locally | Login for Cloud Sync", {
            status: 401,
        });
    }
    if (!id) {
        return new Response("Invalid request", {
            status: 400,
        });
    }


    const key = `${user.user.email}-${id}`

    // save to cloudflare
    const getResponse = await fetch(`https://nottykv.dhravya.workers.dev?key=${key}`,
        {
            method: "GET",
            headers: {
                "X-Custom-Auth-Key": env.CLOUDFLARE_R2_TOKEN
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

    return new Response(JSON.stringify(data), {
        status: 200,
    });
}

export async function DELETE(req: Request): Promise<Response> {
    const id = new URL(req.url).searchParams.get("id")
    const user = await auth()

    if (!(user?.user?.email)) {
        return new Response("Saved locally | Login for Cloud Sync", {
            status: 401,
        });
    }
    if (!id) {
        return new Response("Invalid request", {
            status: 400,
        });
    }

    const key = `${user.user.email}-${id}`

    // save to cloudflare
    const deleteResponse = await fetch(`https://nottykv.dhravya.workers.dev?key=${key}`,
        {
            method: "DELETE",
            headers: {
                "X-Custom-Auth-Key": env.CLOUDFLARE_R2_TOKEN
            }
        }
    )

    const data = await deleteResponse.text()
    console.log(data)
    if (deleteResponse.status !== 200) {
        return new Response(data, {
            status: 404,
        });
    }

    return new Response("Deleted", {
        status: 200,
    });

}