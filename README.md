# Cherry Berry

Cherry Berry is an open-source (MIT) design studio: real vector tools, print-ready export, full brand kits and an open `.cherry` file format, with nothing behind a paywall. It runs on web, desktop and mobile, against the central Cherry Berry Cloud instance or your own self-hosted server.

## Run locally

Requires Node 22+ and pnpm (`packageManager: pnpm@12.18.0`).

```bash
pnpm i
cp .env.example .env   # then set AUTH_SECRET: openssl rand -base64 32
pnpm db:up   # Postgres 17 and RustFS (object storage) via Docker Compose
pnpm dev
```

Open http://localhost:5173 (the API server listens on `:3000` by default).

### Running without Docker

- **Database:** Set `DATABASE_URL=pglite:./.data/pg` in `.env` to use embedded Postgres (PGlite) for development and skip `pnpm db:up`.
- **Object storage:** Set `S3_ENDPOINT=memory:` in `.env` to keep uploads in server memory (lost on restart) instead of RustFS.

Uploads live in S3-compatible object storage (`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, optional `S3_REGION`). `pnpm db:up` starts RustFS on `:9000` (console `:9001`, sign in with `rustfsadmin` / `rustfsadmin`) and creates the `cherry` bucket; any S3-compatible service works in production.

## Workspace structure

- `apps/server` (`@cherry/server`) — Fastify 5 API, Better Auth, Drizzle ORM (PostgreSQL / PGlite), and S3-compatible asset storage
- `apps/web` (`@cherry/web`) — React 19 + Vite 8 + Konva (`react-konva`) web editor
- `packages/doc` (`@cherry/doc`) — `.cherry` document Zod schemas, Yjs sync, units, and I/O
- `packages/vector` (`@cherry/vector`) — Paper.js boolean operations, SVG import/export, and path editing

## Commands

| Command | Description |
| :--- | :--- |
| `pnpm db:up` | Start Postgres 17 and RustFS via Docker Compose |
| `pnpm dev` | Run all workspaces in dev mode |
| `pnpm typecheck` | Run `tsc --noEmit` across all workspaces |
| `pnpm test` | Run Vitest unit & integration tests across all workspaces |
| `pnpm --filter @cherry/web e2e` | Run Playwright end-to-end tests |
| `pnpm --filter @cherry/web build` | Build the web app into `apps/web/dist` |
| `pnpm --filter @cherry/server db:migrate` | Run Drizzle database migrations |
| `pnpm --filter @cherry/server db:generate` | Generate Drizzle SQL migrations from schema |

> Server tests default to in-memory PGlite; set `TEST_DATABASE_URL` in `.env` to run them against Postgres.

## License

[MIT](LICENSE)
