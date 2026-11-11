# Cherry Berry

Cherry Berry is an open-source (MIT) design studio: real vector tools, print-ready export, full brand kits and an open `.cherry` file format, with nothing behind a paywall. It runs on web, desktop and mobile, against the central Cherry Berry Cloud instance or your own self-hosted server.

## Run locally

Requires Node 22+ and pnpm 9+.

```bash
pnpm i
cp .env.example .env   # then set AUTH_SECRET: openssl rand -base64 32
pnpm db:up   # Postgres via Docker Compose
pnpm dev
```

No Docker? Set `DATABASE_URL=pglite:./.data/pg` in `.env` to use an embedded Postgres (PGlite) for development, and skip `pnpm db:up`.

Open http://localhost:5173.
