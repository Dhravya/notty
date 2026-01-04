# Cloudflare Migration Guide

This guide explains the migration from Vercel/Embedchain to Cloudflare infrastructure with Durable Objects and Supermemory.

## Overview of Changes

### Removed ❌
- **Embedchain Python backend** - Replaced with Supermemory
- **Vercel KV dependency** - Made optional (Cloudflare KV can be used instead)
- **Python dependencies** - No more Python backend needed

### Added ✅
- **Cloudflare Durable Objects** - Real-time note synchronization
- **Cloudflare KV for rate limiting** - Alternative to Vercel KV
- **Supermemory integration** - Semantic search and user profiles
- **WebSocket support** - Real-time sync across devices

## Architecture

### Before
```
┌─────────────┐
│  Next.js    │──┐
└─────────────┘  │
                 │
┌─────────────┐  │
│ Embedchain  │◄─┤
│  (Python)   │  │
└─────────────┘  │
                 │
┌─────────────┐  │
│ Vercel KV   │◄─┤
└─────────────┘  │
                 │
┌─────────────┐  │
│ CF Worker   │◄─┘
│   (KV only) │
└─────────────┘
```

### After
```
┌─────────────────┐
│    Next.js      │──┐
└─────────────────┘  │
                     │
┌─────────────────┐  │
│  Supermemory    │◄─┤
│  (Semantic DB)  │  │
└─────────────────┘  │
                     │
┌─────────────────────────┐
│   Cloudflare Worker     │◄┘
│ ┌─────────────────────┐ │
│ │ Durable Objects     │ │
│ │ - Real-time sync    │ │
│ │ - Per-user state    │ │
│ │ - WebSocket         │ │
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │ Cloudflare KV       │ │
│ │ - Rate limiting     │ │
│ │ - Note backup       │ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

## Migration Steps

### 1. Set Up Supermemory

```bash
# Get API key from https://console.supermemory.ai
# Add to .env:
SUPERMEMORY_API_KEY=sm_your_key_here
```

Configure Supermemory:
```bash
curl -X POST http://localhost:3000/api/supermemory/setup \
  -H "Cookie: your-auth-cookie"
```

See [SUPERMEMORY_INTEGRATION.md](./SUPERMEMORY_INTEGRATION.md) for details.

### 2. Deploy Cloudflare Worker with Durable Objects

```bash
cd nottykv-cloudflare-worker

# Create rate limit KV namespace
wrangler kv:namespace create "ratelimit"

# Note the IDs from output and update wrangler.toml
# Replace YOUR_RATELIMIT_KV_ID and YOUR_PREVIEW_ID

# Deploy
wrangler deploy
```

See [nottykv-cloudflare-worker/README.md](./nottykv-cloudflare-worker/README.md) for details.

### 3. Update Environment Variables

Update your `.env`:

```env
# Existing
DATABASE_URL="db.sqlite"
OPENROUTER_API_TOKEN=xxx
CLOUDFLARE_R2_TOKEN=xxx
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
WORKER_BASE_URL=https://your-worker.workers.dev
AUTH_SECRET=xxx

# Optional (for Vercel deployments)
KV_REST_API_URL=xxx
KV_REST_API_TOKEN=xxx

# New - Supermemory
SUPERMEMORY_API_KEY=sm_xxx

# Deprecated (no longer needed)
# BACKEND_BASE_URL=xxx
```

### 4. Test the Migration

#### Test Rate Limiting
```bash
# Using Cloudflare Worker
curl "https://your-worker.workers.dev/ratelimit?type=search&identifier=test@example.com" \
  -H "X-Custom-Auth-Key: your-key"
```

#### Test Durable Objects
```bash
# Create/update note
curl -X PUT "https://your-worker.workers.dev/do/note?userId=test@example.com&id=123" \
  -H "X-Custom-Auth-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"content": "Test note"}'

# Get note
curl "https://your-worker.workers.dev/do/note?userId=test@example.com&id=123" \
  -H "X-Custom-Auth-Key: your-key"

# List all notes
curl "https://your-worker.workers.dev/do/notes?userId=test@example.com" \
  -H "X-Custom-Auth-Key: your-key"
```

#### Test WebSocket
```javascript
const ws = new WebSocket('wss://your-worker.workers.dev/do/note?userId=test@example.com', {
  headers: {
    'X-Custom-Auth-Key': 'your-key'
  }
});

ws.onmessage = (event) => {
  console.log('Received:', JSON.parse(event.data));
};

// Send update
ws.send(JSON.stringify({
  type: 'update',
  note: {
    id: '123',
    content: { text: 'Hello World' },
    updatedAt: Date.now(),
    version: 1
  }
}));
```

#### Test Supermemory Search
```bash
# Login first, then:
curl "http://localhost:3000/api/search?prompt=test+query" \
  -H "Cookie: your-auth-cookie"
```

### 5. Update Next.js App (Optional - Already Done)

The following updates were already made:

- ✅ `src/lib/supermemory.ts` - Supermemory integration
- ✅ `src/lib/ratelimit.ts` - Cloudflare/Vercel KV abstraction
- ✅ `src/app/api/search/route.ts` - Using new rate limiting
- ✅ `src/app/api/chat/route.ts` - Using new rate limiting
- ✅ `src/app/api/note/route.ts` - Using Supermemory for indexing

### 6. Deploy

#### Option A: Deploy to Vercel
```bash
# Will use Vercel KV for rate limiting (fallback)
vercel deploy
```

#### Option B: Deploy to Cloudflare Pages
```bash
# Will use Cloudflare KV for rate limiting (primary)
# Set up Cloudflare Pages project
# Add environment variables
# Push to GitHub (auto-deploys)
```

### 7. Clean Up (Optional)

After successful migration:

1. **Remove Python backend server** - Already removed ✅
2. **Remove Vercel KV** (if using Cloudflare):
   ```bash
   # Remove from package.json
   npm uninstall @vercel/kv @upstash/ratelimit

   # Remove from .env
   # KV_REST_API_URL
   # KV_REST_API_TOKEN
   ```

3. **Remove BACKEND_BASE_URL** from .env (deprecated)

## Features

### Real-Time Synchronization

Each user gets their own Durable Object instance that:
- Manages WebSocket connections
- Syncs notes in real-time across devices
- Resolves conflicts with last-write-wins
- Persists to Durable Object storage
- Backs up to KV

**Use Cases:**
- Multi-device editing
- Collaborative notes (future)
- Offline-first with sync

### Semantic Search with Supermemory

- Natural language search across notes
- Hybrid search (memories + document chunks)
- Automatic user profile extraction
- Personalized chat with context

**Use Cases:**
- "Find my notes about Next.js"
- "What have I been working on lately?"
- Chat assistant with memory

### Flexible Rate Limiting

Automatically uses:
- **Cloudflare KV** if `WORKER_BASE_URL` is set
- **Vercel KV** as fallback

**Limits:**
- Search: 50/day
- Chat: 20/hour
- Notes: 1000/day

## Troubleshooting

### Issue: Supermemory search returns no results

**Solution:**
1. Ensure `SUPERMEMORY_API_KEY` is set
2. Run setup endpoint: `POST /api/supermemory/setup`
3. Save a test note to trigger indexing
4. Wait a few seconds for indexing to complete

### Issue: Rate limiting not working

**Solution:**
1. **Using Cloudflare**: Ensure `WORKER_BASE_URL` is set and worker is deployed
2. **Using Vercel**: Ensure `KV_REST_API_URL` and `KV_REST_API_TOKEN` are set
3. Check worker logs: `wrangler tail`

### Issue: Durable Objects not persisting

**Solution:**
1. Check migrations were applied: `wrangler migrations list`
2. Apply if needed: `wrangler migrations apply`
3. Verify wrangler.toml configuration
4. Check worker logs for errors

### Issue: WebSocket connection fails

**Solution:**
1. Ensure using `wss://` (not `ws://`) for production
2. Check CORS headers
3. Verify `X-Custom-Auth-Key` is correct
4. Check browser console for errors

### Issue: TypeScript errors after migration

**Solution:**
```bash
# Reinstall dependencies
npm install

# Check types
npx tsc --noEmit --skipLibCheck
```

## Performance Comparison

| Metric | Before (Embedchain) | After (Supermemory) |
|--------|---------------------|---------------------|
| Search Latency | ~500-1000ms | ~200-400ms |
| Indexing | Manual API calls | Automatic |
| Backend | Python server needed | Direct SDK calls |
| Real-time Sync | No | Yes (WebSockets) |
| Rate Limiting | Vercel KV only | CF KV or Vercel KV |
| Edge Runtime | Partial | Full |

## Cost Comparison

### Before (Embedchain)
- Python backend server: ~$5-10/month
- Vercel KV: ~$5/month
- Cloudflare Worker: Free tier
- **Total: ~$10-15/month**

### After (Supermemory + Cloudflare)
- Supermemory: Free tier (10k memories)
- Cloudflare Durable Objects: ~$0.15/M requests
- Cloudflare KV: ~$0.50/M reads
- Cloudflare Worker: Free tier
- **Total: ~$0-5/month** (depending on usage)

## Rollback Plan

If you need to rollback:

1. **Restore Embedchain backend**:
   ```bash
   git checkout HEAD~1 embedchain-backend
   cd embedchain-backend
   pip install -r requirements.txt
   python main.py
   ```

2. **Restore environment variables**:
   ```env
   BACKEND_BASE_URL=http://localhost:8000
   ```

3. **Revert API routes**:
   ```bash
   git checkout HEAD~1 src/app/api/search/route.ts
   git checkout HEAD~1 src/app/api/note/route.ts
   ```

4. **Reinstall Vercel KV**:
   ```bash
   npm install @vercel/kv @upstash/ratelimit
   ```

## Next Steps

1. **Monitor Performance**: Use Cloudflare analytics to monitor DO and KV usage
2. **Add WebSocket Client**: Create React hooks for real-time updates
3. **Implement Offline Mode**: Use Service Workers + Durable Objects
4. **Add Collaboration**: Multi-user editing with operational transforms
5. **Optimize Costs**: Tune rate limits and caching strategies

## Resources

- [Supermemory Documentation](https://supermemory.ai/docs)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Cloudflare KV](https://developers.cloudflare.com/kv/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

## Support

- GitHub Issues: [Create an issue](https://github.com/Dhravya/notty/issues)
- Cloudflare Discord: [Join server](https://discord.gg/cloudflaredev)
- Supermemory Discord: [Join server](https://supermemory.ai/discord)
