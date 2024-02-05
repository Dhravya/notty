# <a href="https://notty.dhr.wtf">

  <img alt="Notty is a simple, minimal AI powered note taking app and markdown editor" src="https://notty.dhr.wtf/ogimage.png">
  <h1 align="center">Notty</h1>
</a>

<p align="center">
  An open source, minimal AI powered note taking app and powerful markdown editor
</p>

## ✨ Features

- **Simple**: Notty is designed to be extremely noise free and minimal, using it is a breeze.
- **AI Powered**: Notty uses AI to help you write better notes and documents.
- **Markdown**: Comes with a markdown editor built in, with WSIWYG functionality
- **Cloud Sync**: Sync your notes across devices using the cloud
- **Conflict Resolution**: If you use notty on multiple devices, it will automatically resolve conflicts for you, if not, it will prompt you to choose the correct version.
- **Local-first**: Notty is designed to be local first, meaning your data is _always_ stored on your device, and optionally in the cloud.
- **FAST**: Powered by Cloudflare KV, Notty is blazing fast.

what more could you ask for?

## 🚀 Getting Started

You can get started with notty by visiting [notty.dhr.wtf](https://notty.dhr.wtf)

To set up locally, you can clone the repository and run the following commands:

```bash
git clone https://github.com/dhravya/notty
cd notty
bun install
bun run dev
```

To run the cloudflare worker, you need to install wrangler, set up your cloudflare account and would also need to edit the `wrangler.toml` file to include your account id, zone ID, create bindings and add the necessary environment variables.

```bash
wrangler dev
```

The necessary environment variables are in the [`.env.example`](.env.example) file.

## 📚 Documentation

The code is more or less self-explanatory and implementation details are documented as comments,

### Tech Stack

- **Frontend**: Nextjs
- **Backend**: Cloudflare Workers
- **Database**: Cloudflare KV
- **AI**: OpenRouter API
- **Editor**: [Novel](https://github.com/steventey/novel)
- **Menu and UI**: [TailwindCSS](https://tailwindcss.com/) + [Vaul by Emil Kowalski](https://github.com/emilkowalski/vaul) + [Shadcn UI](https://ui.shadcn.com)

❤️ Thanks to all the open source projects that made this possible.

## TODO (Planned features)

- [.] Fix delete button
- [ ] Use a forked version of [Novel](https://github.com/steventey/novel) to add
  - [ ] Image upload (`/api/upload` route is already there, just need to send the req)
  - [ ] Background color of blocks
- [ ] Dark mode (`next-themes` already there in [`src/app/providers.tsx`](src/app/providers.tsx), but commented out because styles are not yet implemented)
- [.] Home page with list of all notes (google docs style) - currently `/` endpoint redirects to a random new note, that endpoint can be at `/new` and `/` can be the home page

## Future Features

- [ ] Locked notes (requires [webauthn](https://github.com/nextauthjs/next-auth-webauthn)) maybe
- [ ] Share notes and real time collab using [`partykit`](https://www.partykit.io/) maybe?

## 🤝 Contributing

Contributions, issues and feature requests are welcome. Feel free to check the [issues page](/issues) if you want to contribute.

## 📝 License

Notty is licensed under the MIT License. See [LICENSE](LICENSE) for more information.
