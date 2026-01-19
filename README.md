# <a href="https://notty.dhr.wtf">

  <img alt="Notty is a simple, minimal AI powered note taking app and markdown editor" src="https://notty.dhr.wtf/ogimage.png">
  <h1 align="center">Notty</h1>
</a>

<p align="center">
  An open source, minimal AI powered note taking app with real-time collaboration
</p>

## Features

- **Simple**: Notty is designed to be extremely noise free and minimal, using it is a breeze.
- **AI Powered**: Notty uses AI to help you write better notes and documents. Type `++` for AI autocomplete.
- **AI Search**: Ask questions about your notes using semantic search powered by Supermemory.
- **Real-time Collaboration**: Edit notes with multiple people simultaneously using Durable Objects.
- **Markdown**: Comes with a powerful Tiptap-based editor with WYSIWYG functionality.
- **Cloud Sync**: Sync your notes across devices using Cloudflare KV.
- **Conflict Resolution**: Automatically resolves conflicts across devices, or prompts you to choose.
- **Local-first**: Your data is _always_ stored locally, with optional cloud sync.
- **PWA**: Install as a native app on any device.
- **Dark Mode**: Built-in dark mode support using DarkReader.
- **FAST**: Runs entirely on Cloudflare's edge network.

## Tech Stack

- **Framework**: React Router v7 + Hono
- **Runtime**: Cloudflare Workers
- **Database**: Cloudflare D1 (for auth) + KV (for notes)
- **Real-time**: Cloudflare Durable Objects + WebSockets
- **Auth**: Better Auth with Google OAuth
- **AI Search**: Supermemory
- **AI Generation**: OpenAI GPT-4o-mini
- **Editor**: Tiptap (ProseMirror-based)
- **Styling**: TailwindCSS + Vaul + Shadcn UI

## Getting Started

### Prerequisites

- Node.js 18+
- A Cloudflare account
- Google OAuth credentials
- OpenAI API key
- Supermemory API key

### Installation

1. Clone the repository:

```bash
git clone https://github.com/dhravya/notty
cd notty
npm install
```

2. Set up Cloudflare resources:

```bash
# Create D1 database
wrangler d1 create notty-db

# Create KV namespace
wrangler kv namespace create NOTTY_KV
wrangler kv namespace create NOTTY_KV --preview
```

3. Update `wrangler.jsonc` with your database and KV IDs.

4. Copy `.dev.vars.example` to `.dev.vars` and fill in your secrets:

```bash
cp .dev.vars.example .dev.vars
```

5. Generate and run database migrations:

```bash
npm run db:generate
npm run db:migrate:local
```

6. Start the development server:

```bash
npm run dev
```

### Deployment

```bash
# Set secrets
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put OPENAI_API_KEY
wrangler secret put SUPERMEMORY_API_KEY

# Run production migrations
npm run db:migrate:production

# Deploy
npm run deploy
```

## Project Structure

```
notty/
├── app/                    # React Router frontend
│   ├── components/         # React components
│   ├── context/           # React context providers
│   ├── data/              # Static data
│   ├── hooks/             # Custom React hooks
│   ├── routes/            # Route components
│   └── styles/            # CSS styles
├── server/                # Hono backend
│   ├── db/               # Database schema
│   ├── durable-objects/  # Real-time sync
│   ├── middleware/       # Auth middleware
│   └── routes/           # API routes
├── shared/               # Shared utilities and types
│   ├── types/            # TypeScript types
│   └── utils/            # Utility functions
├── public/               # Static assets
└── migrations/           # Database migrations
```

## Contributing

Contributions, issues and feature requests are welcome. Feel free to check the [issues page](/issues) if you want to contribute.

## License

Notty is licensed under the MIT License. See [LICENSE](LICENSE) for more information.

## Credits

Built with amazing open source projects:

- [Tiptap](https://tiptap.dev) - Headless editor framework
- [Supermemory](https://supermemory.ai) - AI memory for search
- [Better Auth](https://better-auth.com) - Authentication
- [Vaul](https://vaul.emilkowal.ski) - Drawer component
- [Hono](https://hono.dev) - Web framework
- [React Router](https://reactrouter.com) - Routing
