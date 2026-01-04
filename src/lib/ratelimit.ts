import { env } from "@/env";

/**
 * Rate limiting utility
 *
 * Supports two backends:
 * 1. Cloudflare Worker (recommended for Cloudflare deployments)
 * 2. Vercel KV (fallback for Vercel deployments)
 */

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

/**
 * Check rate limit using Cloudflare Worker
 */
async function checkCloudflareRateLimit(
  type: string,
  identifier: string
): Promise<RateLimitResult> {
  try {
    const response = await fetch(
      `${env.WORKER_BASE_URL}/ratelimit?type=${type}&identifier=${identifier}`,
      {
        headers: {
          "X-Custom-Auth-Key": env.CLOUDFLARE_R2_TOKEN,
        },
      }
    );

    const data = await response.json() as {
      allowed: boolean;
      limit: number;
      remaining: number;
      reset: number;
    };

    return {
      success: data.allowed,
      limit: data.limit,
      remaining: data.remaining,
      reset: data.reset,
    };
  } catch (error) {
    console.error("Cloudflare rate limit check failed:", error);
    // Fallback: allow the request if rate limit check fails
    return {
      success: true,
      limit: 50,
      remaining: 49,
      reset: Date.now() + 86400000,
    };
  }
}

/**
 * Check rate limit using Vercel KV (Upstash)
 */
async function checkVercelKVRateLimit(
  key: string,
  limit: number,
  window: "1 h" | "1 d"
): Promise<RateLimitResult> {
  // Only import if KV is configured
  if (!env.KV_REST_API_URL || !env.KV_REST_API_TOKEN) {
    return {
      success: true,
      limit,
      remaining: limit - 1,
      reset: Date.now() + 86400000,
    };
  }

  try {
    const { kv } = await import("@vercel/kv");
    const { Ratelimit } = await import("@upstash/ratelimit");

    const ratelimit = new Ratelimit({
      redis: kv,
      limiter: Ratelimit.slidingWindow(limit, window as "1 h" | "1 d"),
    });

    const result = await ratelimit.limit(key);

    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (error) {
    console.error("Vercel KV rate limit check failed:", error);
    // Fallback: allow the request if rate limit check fails
    return {
      success: true,
      limit,
      remaining: limit - 1,
      reset: Date.now() + 86400000,
    };
  }
}

/**
 * Check rate limit
 *
 * Automatically uses Cloudflare Worker if deployed, otherwise falls back to Vercel KV
 */
export async function checkRateLimit(
  type: "search" | "chat" | "note" | "default",
  identifier: string
): Promise<RateLimitResult> {
  // Use Cloudflare Worker if available
  if (env.WORKER_BASE_URL) {
    return checkCloudflareRateLimit(type, identifier);
  }

  // Fallback to Vercel KV
  const limits: Record<string, { limit: number; window: "1 h" | "1 d" }> = {
    search: { limit: 50, window: "1 d" },
    chat: { limit: 20, window: "1 h" },
    note: { limit: 1000, window: "1 d" },
    default: { limit: 50, window: "1 d" },
  };

  const config = limits[type] || limits.default;
  return checkVercelKVRateLimit(`ratelimit_${type}_${identifier}`, config.limit, config.window);
}

/**
 * Rate limit middleware for API routes
 *
 * Usage:
 * ```typescript
 * const rateLimit = await withRateLimit(request, "search", userId);
 * if (!rateLimit.success) {
 *   return new Response("Rate limit exceeded", {
 *     status: 429,
 *     headers: {
 *       "X-RateLimit-Limit": rateLimit.limit.toString(),
 *       "X-RateLimit-Remaining": rateLimit.remaining.toString(),
 *       "X-RateLimit-Reset": rateLimit.reset.toString(),
 *     },
 *   });
 * }
 * ```
 */
export async function withRateLimit(
  request: Request,
  type: "search" | "chat" | "note" | "default",
  identifier?: string
): Promise<RateLimitResult> {
  // Use IP address if no identifier provided
  const id =
    identifier ||
    request.headers.get("x-forwarded-for") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown";

  return checkRateLimit(type, id);
}
