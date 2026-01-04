# Supermemory Integration Guide

This document explains how Supermemory has been integrated into Notty to replace Embedchain.

## Overview

Supermemory provides:
- **Semantic Search**: Find relevant notes using natural language queries
- **User Profiles**: Automatically maintained facts about users based on their notes
- **Hybrid Search**: Searches both memories and original document chunks

## Setup

### 1. Get Supermemory API Key

1. Visit [https://console.supermemory.ai](https://console.supermemory.ai)
2. Create an account and get your API key
3. Add it to your `.env` file:

```env
SUPERMEMORY_API_KEY=sm_...
```

### 2. Configure Supermemory Settings

**Important**: Run this setup endpoint once before using the app:

```bash
curl -X POST https://your-app-url.com/api/supermemory/setup \
  -H "Cookie: your-auth-cookie"
```

This configures Supermemory with the proper filter settings for the note-taking app.

## Features

### 1. Automatic Note Indexing

When a user saves a note, it's automatically added to Supermemory for semantic search.

**File**: `src/app/api/note/route.ts`

```typescript
import { addNoteToSupermemory } from "@/lib/supermemory";

// In POST handler
await addNoteToSupermemory(
  exportContentAsText(data),
  user.user.email,
  id
);
```

### 2. Semantic Search

Users can search their notes using natural language queries.

**File**: `src/app/api/search/route.ts`

```typescript
import { searchNotesInSupermemory } from "@/lib/supermemory";

const searchResults = await searchNotesInSupermemory(
  prompt,
  user.user.email
);
```

### 3. Personalized Chat (New Feature!)

A new chat endpoint that provides context-aware responses based on:
- User's static profile facts
- User's dynamic context
- Relevant notes from semantic search

**Endpoint**: `POST /api/chat`

**Request**:
```json
{
  "message": "What have I been working on lately?"
}
```

**Response**:
```json
{
  "response": "Based on your notes, you've been working on...",
  "profile": {
    "static": ["User is interested in AI/ML", ...],
    "dynamic": ["Recently working on Next.js project", ...]
  },
  "relevantNotes": [
    { "content": "...", "noteId": "123" }
  ]
}
```

## Architecture

### Container Tag Strategy

- **containerTag**: User's email address (`user.email`)
- This ensures each user's notes are isolated and searchable only by them

### Search Modes

The app uses **hybrid search mode**, which searches both:
1. **Memories**: Extracted facts and knowledge from notes
2. **Document chunks**: Original note content

### Metadata

Each note stored in Supermemory includes:
```typescript
{
  note_id: string,      // The note's ID in Cloudflare KV
  type: "note",         // Always "note" for this app
  timestamp: string     // ISO timestamp when saved
}
```

## API Reference

### Utility Functions

Located in `src/lib/supermemory.ts`:

#### `addNoteToSupermemory(content, userId, noteId)`
Adds or updates a note in Supermemory.

#### `searchNotesInSupermemory(query, userId)`
Searches user's notes using hybrid search mode.

#### `getUserProfile(userId)`
Gets user's profile (static + dynamic facts).

#### `getUserProfileWithSearch(userId, query?)`
Gets profile and optionally searches in one call.

#### `configureSupermemorySettings()`
Configures Supermemory with app-specific settings.

## API Endpoints

### `POST /api/supermemory/setup`
Configures Supermemory settings. Run once during setup.

### `POST /api/note`
Saves note to Cloudflare KV and Supermemory.

### `GET /api/search?prompt=...`
Searches notes using Supermemory.

### `POST /api/chat` (NEW)
Chat endpoint with user profile context.

## Migration from Embedchain

### What Changed

1. **Dependencies**:
   - ❌ Removed: Embedchain Python backend
   - ✅ Added: `supermemory` npm package

2. **Environment Variables**:
   - ❌ `BACKEND_BASE_URL` (deprecated, kept for backward compatibility)
   - ✅ `SUPERMEMORY_API_KEY`

3. **API Calls**:
   - ❌ `POST ${BACKEND_BASE_URL}/api/v1/add`
   - ✅ `client.memories.add()`
   - ❌ `GET ${BACKEND_BASE_URL}/api/v1/search`
   - ✅ `client.search()`

### Benefits Over Embedchain

1. **No Backend**: Direct API calls, no Python backend needed
2. **User Profiles**: Automatic fact extraction about users
3. **Better Performance**: Hybrid search with memories + chunks
4. **Edge Runtime Compatible**: Works in Next.js Edge runtime
5. **Richer Context**: Profile data for personalized experiences

## Troubleshooting

### Search returns no results

1. Ensure notes are being saved properly
2. Check that `SUPERMEMORY_API_KEY` is set
3. Verify settings are configured (call `/api/supermemory/setup`)
4. Check browser console for errors

### Profile is empty

- Profiles build up over time as users save notes
- Add more content to notes for better fact extraction

### Rate limiting

- Chat endpoint: 20 requests/hour
- Search endpoint: 50 requests/day
- Adjust in code if needed

## Testing

### Test Search

```bash
# Login first, then:
curl "https://your-app-url.com/api/search?prompt=test+query" \
  -H "Cookie: your-auth-cookie"
```

### Test Chat

```bash
curl -X POST https://your-app-url.com/api/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: your-auth-cookie" \
  -d '{"message": "What have I been working on?"}'
```

## Future Enhancements

1. **Streaming Responses**: Use Supermemory with streaming for real-time chat
2. **Document Upload**: Support PDF/image uploads via Supermemory's file API
3. **Shared Spaces**: Add organization-level containerTags for team notes
4. **Advanced Filters**: Filter by date, note type, etc.

## Resources

- [Supermemory Documentation](https://supermemory.ai/docs)
- [Supermemory Console](https://console.supermemory.ai)
- [API Reference](https://supermemory.ai/docs/api)
