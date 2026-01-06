/**
 * Migration Script: KV to Durable Objects
 *
 * This script migrates existing note data from Cloudflare KV to Durable Objects.
 * Run this after deploying the Worker to migrate existing user data.
 *
 * Usage:
 *   curl -X POST https://your-worker.workers.dev/migrate \
 *     -H "X-Custom-Auth-Key: your-key" \
 *     -H "Content-Type: application/json" \
 *     -d '{"userId": "user@example.com"}'
 */

interface Env {
  NOTES_SYNC: DurableObjectNamespace;
  nottykv: KVNamespace;
  SECURITY_KEY: string;
}

export async function migrateUserData(
  env: Env,
  userId: string
): Promise<{ migrated: number; errors: string[] }> {
  const errors: string[] = [];
  let migrated = 0;

  try {
    // Get Durable Object for this user
    const id = env.NOTES_SYNC.idFromName(userId);
    const stub = env.NOTES_SYNC.get(id);

    // List all keys for this user from KV
    const prefix = userId + '-';
    const list = await env.nottykv.list({ prefix });

    console.log(`Found ${list.keys.length} notes for ${userId} in KV`);

    // Migrate each note
    for (const key of list.keys) {
      try {
        const noteId = key.name.replace(prefix, '');
        const content = await env.nottykv.get(key.name);

        if (!content) {
          errors.push(`No content found for key: ${key.name}`);
          continue;
        }

        // Save to Durable Object
        const response = await stub.fetch(
          new Request(`http://internal/?id=${encodeURIComponent(noteId)}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: content,
          })
        );

        if (response.ok) {
          migrated++;
          console.log(`Migrated note ${noteId} for ${userId}`);

          // Optionally: Archive the old KV entry
          await env.nottykv.put(`migrated-${key.name}`, content);
        } else {
          const error = await response.text();
          errors.push(`Failed to migrate ${noteId}: ${error}`);
        }
      } catch (error) {
        errors.push(`Error migrating ${key.name}: ${String(error)}`);
      }
    }

    return { migrated, errors };
  } catch (error) {
    errors.push(`Migration failed: ${String(error)}`);
    return { migrated, errors };
  }
}

export async function handleMigrationRequest(
  request: Request,
  env: Env
): Promise<Response> {
  // Verify auth
  if (request.headers.get('X-Custom-Auth-Key') !== env.SECURITY_KEY) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await request.json() as { userId?: string; migrateAll?: boolean };

    if (body.migrateAll) {
      // Migrate all users (be careful with this!)
      return new Response(
        JSON.stringify({
          error: 'migrateAll not implemented - migrate users individually for safety',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!body.userId) {
      return new Response(
        JSON.stringify({ error: 'userId required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = await migrateUserData(env, body.userId);

    return new Response(
      JSON.stringify({
        success: true,
        userId: body.userId,
        migrated: result.migrated,
        errors: result.errors,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Migration failed',
        details: String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
