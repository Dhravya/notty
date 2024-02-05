import { kv } from "@vercel/kv";
import { Ratelimit } from "@upstash/ratelimit";
import { env } from "@/env";
import { auth } from "@/lib/auth";
import { type AiResponse } from "@/types/aiResponse";

export const runtime = "edge";

export async function GET(req: Request): Promise<Response> {

    const user = await auth();

    if (!user?.user?.email) {
        return new Response("Login is required for this endpoint", {
            status: 401,
        });
    }

    if (
        env.KV_REST_API_URL &&
        env.KV_REST_API_TOKEN
    ) {
        const ip = req.headers.get("x-forwarded-for");
        const ratelimit = new Ratelimit({
            redis: kv,
            limiter: Ratelimit.slidingWindow(50, "1 d"),
        });

        const { success, limit, reset, remaining } = await ratelimit.limit(
            `notty_ratelimit_${ip}`,
        );

        if (!success) {
            return new Response("You have reached your request limit for the day.", {
                status: 429,
                headers: {
                    "X-RateLimit-Limit": limit.toString(),
                    "X-RateLimit-Remaining": remaining.toString(),
                    "X-RateLimit-Reset": reset.toString(),
                },
            });
        }
    }

    // Get prompt from query
    const prompt = new URL(req.url).searchParams.get("prompt");

    if (!prompt) {
        return new Response("Invalid request", {
            status: 400,
        });
    }

    const aiResponse = await fetch(`${env.BACKEND_BASE_URL}/api/v1/search?query=${prompt}&user_id=${user.user.email}`, {
        method: "GET",
        headers: {
            "Authorization": `${env.CLOUDFLARE_R2_TOKEN}`
        }
    });

    if (aiResponse.status !== 200) {
        return new Response("Failed to get search results", {
            status: 500,
        });
    }

    const data = await aiResponse.json() as AiResponse;

    return new Response(JSON.stringify(data), {
        status: 200,
    });

}