# Notty Cloudflare Worker

Backend infrastructure for Notty's real-time note synchronization and rate limiting.

## Features

- **Durable Objects** for real-time note syncing (WebSocket + HTTP)
- **Cloudflare KV** for rate limiting and note backup
- **CORS enabled** for cross-origin requests
- **Rate limiting** with different limits per operation type

## Setup

### 1. Install Dependencies

```bash
cd worker
npm install
```

### 2. Create KV Namespaces

```bash
# Create production KV namespaces
wrangler kv:namespace create "nottykv"
wrangler kv:namespace create "ratelimit"

# Create preview KV namespaces for development
wrangler kv:namespace create "nottykv" --preview
wrangler kv:namespace create "ratelimit" --preview
```

Copy the IDs from the output and update `wrangler.toml`:

```toml
kv_namespaces = [
  { binding = "nottykv", id = "YOUR_NOTTYKV_ID" },
  { binding = "ratelimit", id = "YOUR_RATELIMIT_ID" }
]

[env.dev]
kv_namespaces = [
  { binding = "nottykv", id = "YOUR_PREVIEW_NOTTYKV_ID" },
  { binding = "ratelimit", id = "YOUR_PREVIEW_RATELIMIT_ID" }
]
```

### 3. Set Security Key

Update `SECURITY_KEY` in `wrangler.toml` or use secrets:

```bash
wrangler secret put SECURITY_KEY
```

### 4. Deploy

```bash
# Development
npm run dev

# Production
npm run deploy
```

## API Endpoints

### Durable Objects (Real-time Sync)

**Base URL:** `https://notty-worker.your-subdomain.workers.dev/do/`

All endpoints require:
- `userId` query parameter
- `X-Custom-Auth-Key` header

#### WebSocket Connection
```javascript
const ws = new WebSocket('wss://notty-worker.your-subdomain.workers.dev/do/?userId=user@example.com', {
  headers: {
    'X-Custom-Auth-Key': 'your-key'
  }
});
```

#### HTTP API

**Get all notes:**
```bash
GET /do/?userId=user@example.com
```

**Get single note:**
```bash
GET /do/?userId=user@example.com&id=123
```

**Update note:**
```bash
PUT /do/?userId=user@example.com&id=123
Content-Type: application/json

{...note content...}
```

**Delete note:**
```bash
DELETE /do/?userId=user@example.com&id=123
```

### Rate Limiting

**Check rate limit:**
```bash
GET /ratelimit?type=search&identifier=user@example.com
```

Response:
```json
{
  "allowed": true,
  "limit": 50,
  "remaining": 49,
  "reset": 1234567890
}
```

### Legacy KV (Backward Compatible)

**Get value:**
```bash
GET /?key=user@example.com-123
```

**Put value:**
```bash
PUT /?key=user@example.com-123
```

**Delete value:**
```bash
DELETE /?key=user@example.com-123
```

**Get all user notes:**
```bash
GET /?getAllFromUser=user@example.com
```

## Rate Limits

Configure in `src/index.ts`:

```typescript
const RATE_LIMITS = {
  default: { limit: 50, window: 86400 },    // 50/day
  search: { limit: 50, window: 86400 },     // 50/day
  chat: { limit: 20, window: 3600 },        // 20/hour
  note: { limit: 1000, window: 86400 },     // 1000/day
};
```

## Development

```bash
# Run locally
npm run dev

# Tail logs
npm run tail

# Deploy
npm run deploy
```

## Environment Setup

Update your Next.js `.env`:

```env
WORKER_BASE_URL=https://notty-worker.your-subdomain.workers.dev
CLOUDFLARE_R2_TOKEN=your-security-key
```

## Cost Estimate

- **Workers**: 100,000 requests/day free, then $0.50/million
- **Durable Objects**: $0.15/million requests + $0.20/GB-month storage
- **KV**: $0.50/million reads, $5.00/million writes
- **Typical usage**: ~$0-5/month for small to medium apps

## Monitoring

```bash
# View logs
wrangler tail

# List Durable Objects
wrangler durable-objects:list NotesSync

# View KV keys
wrangler kv:key list --namespace-id YOUR_NOTTYKV_ID
```

## Troubleshooting

**Migrations not applied:**
```bash
wrangler migrations list
wrangler migrations apply
```

**KV namespace not found:**
- Ensure IDs in `wrangler.toml` match created namespaces
- Check binding names are correct

**Rate limit not working:**
- Verify ratelimit KV namespace exists
- Check logs for errors: `wrangler tail`

## Resources

- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
