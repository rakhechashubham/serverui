# ServerUI Web

Next.js App Router UI for ServerUI.

## Stack

Next.js, React, TypeScript, Tailwind CSS, and xterm.js.

## Commands

Run from `apps/web`, or use the repository Makefile.

```bash
npm install
npm run dev
npm test
npm run lint
npm run format
npm run format:check
npm run build
```

The browser talks only to the Go API (`/api/*` and `/ws/*`). It never opens SSH.

API location is resolved by `src/lib/runtime` (optional `NEXT_PUBLIC_API_BASE`,
local-dev heuristics, or same-origin rewrites via `SERVER_INTERNAL_URL`). See
[docs/architecture.md](../../docs/architecture.md).

Contact: [contact@skyrekon.com](mailto:contact@skyrekon.com)
