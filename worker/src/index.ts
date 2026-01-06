import { NotesSync } from './durable-objects';
import { handleMigrationRequest } from './migrate';

export { NotesSync };

interface Env {
  NOTES_SYNC: DurableObjectNamespace;
  nottykv: KVNamespace;
  ratelimit: KVNamespace;
  SECURITY_KEY: string;
}

interface RateLimitConfig {
  limit: number;
  window: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  default: { limit: 50, window: 86400 },
  search: { limit: 50, window: 86400 },
  chat: { limit: 20, window: 3600 },
  note: { limit: 1000, window: 86400 },
};

async function checkRateLimit(
  env: Env,
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; limit: number; remaining: number; reset: number }> {
  const now = Date.now();
  const windowStart = Math.floor(now / (config.window * 1000)) * (config.window * 1000);
  const rateLimitKey = `ratelimit:${key}:${windowStart}`;

  const current = await env.ratelimit.get(rateLimitKey);
  const count = current ? parseInt(current) : 0;

  if (count >= config.limit) {
    return {
      allowed: false,
      limit: config.limit,
      remaining: 0,
      reset: windowStart + config.window * 1000,
    };
  }

  await env.ratelimit.put(rateLimitKey, String(count + 1), {
    expirationTtl: config.window * 2,
  });

  return {
    allowed: true,
    limit: config.limit,
    remaining: config.limit - count - 1,
    reset: windowStart + config.window * 1000,
  };
}

function isAuthorized(request: Request, env: Env): boolean {
  return request.headers.get('X-Custom-Auth-Key') === env.SECURITY_KEY;
}

async function handleDurableObject(request: Request, env: Env): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');

  if (!userId) {
    return new Response('User ID required', { status: 400 });
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rateLimit = await checkRateLimit(env, `note:${ip}`, RATE_LIMITS.note);

  if (!rateLimit.allowed) {
    return new Response('Rate limit exceeded', {
      status: 429,
      headers: {
        'X-RateLimit-Limit': String(rateLimit.limit),
        'X-RateLimit-Remaining': String(rateLimit.remaining),
        'X-RateLimit-Reset': String(rateLimit.reset),
      },
    });
  }

  const id = env.NOTES_SYNC.idFromName(userId);
  const stub = env.NOTES_SYNC.get(id);
  const doResponse = await stub.fetch(request);

  return new Response(doResponse.body, {
    status: doResponse.status,
    statusText: doResponse.statusText,
    headers: {
      ...Object.fromEntries(doResponse.headers),
      'X-RateLimit-Limit': String(rateLimit.limit),
      'X-RateLimit-Remaining': String(rateLimit.remaining),
      'X-RateLimit-Reset': String(rateLimit.reset),
    },
  });
}

async function handleLegacyKV(request: Request, env: Env): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  const getAllFromUser = url.searchParams.get('getAllFromUser');

  if (getAllFromUser) {
    const keys = await env.nottykv.list({ prefix: getAllFromUser + '-' });
    const keyValuePairs: Record<string, string | null> = {};
    for (const key of keys.keys) {
      keyValuePairs[key.name] = await env.nottykv.get(key.name);
    }
    return new Response(JSON.stringify(keyValuePairs), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!key) {
    return new Response('No key provided', { status: 400 });
  }

  switch (request.method) {
    case 'PUT':
      const body = await request.text();
      await env.nottykv.put(key, body);
      return new Response('OK');

    case 'DELETE':
      const data = await env.nottykv.get(key);
      if (!data) {
        return new Response('Not found', { status: 404 });
      }
      await env.nottykv.put('archived-' + key, data);
      await env.nottykv.delete(key);
      return new Response('OK');

    default:
      const value = await env.nottykv.get(key);
      if (!value) {
        return new Response('Not found', { status: 404 });
      }
      return new Response(value);
  }
}

async function handleRateLimitCheck(request: Request, env: Env): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'default';
  const identifier = url.searchParams.get('identifier') || request.headers.get('CF-Connecting-IP') || 'unknown';

  const config = RATE_LIMITS[type] || RATE_LIMITS.default;
  const rateLimit = await checkRateLimit(env, `${type}:${identifier}`, config);

  return new Response(
    JSON.stringify({
      allowed: rateLimit.allowed,
      limit: rateLimit.limit,
      remaining: rateLimit.remaining,
      reset: rateLimit.reset,
    }),
    {
      status: rateLimit.allowed ? 200 : 429,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': String(rateLimit.limit),
        'X-RateLimit-Remaining': String(rateLimit.remaining),
        'X-RateLimit-Reset': String(rateLimit.reset),
      },
    }
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Custom-Auth-Key',
        },
      });
    }

    try {
      let response: Response;

      if (path.startsWith('/do/')) {
        response = await handleDurableObject(request, env);
      } else if (path === '/migrate') {
        response = await handleMigrationRequest(request, env);
      } else if (path === '/ratelimit') {
        response = await handleRateLimitCheck(request, env);
      } else {
        response = await handleLegacyKV(request, env);
      }

      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};
