# AGENTS.md

## Project Overview
- **Name:** Cherry Berry (`cherry-berry`)
- **Stack:** TypeScript (strict), pnpm workspaces, Fastify 5, Drizzle ORM, PostgreSQL 17 / PGlite, Better Auth, S3 (RustFS in dev), React 19, Vite 8, Konva (`react-konva`), Yjs, Paper.js, Zod, Vitest, Playwright
- **Role:** Open-source design studio monorepo with a collaborative `.cherry` vector document engine, a Fastify API/asset server, and a React + Konva web editor.

## Architecture & Directory Map
```
cherry-berry/
├── apps/
│   ├── server/          # Fastify API, Better Auth, Drizzle DB & S3 storage
│   │   ├── drizzle/     # SQL migrations and snapshots
│   │   ├── src/         # Feature modules: assets/, designs/, reports/, shapes/, workspaces/, db/
│   │   └── test/        # Vitest integration & unit tests
│   └── web/             # React 19 + Vite SPA
│       ├── src/         # editor/ (Konva canvas & panels), library/ (assets/uploads), routes/, api.ts
│       └── e2e/         # Playwright end-to-end specs & fixtures
├── packages/
│   ├── doc/             # @cherry/doc: Zod schemas, Yjs sync, units, .cherry I/O & ops
│   └── vector/          # @cherry/vector: Paper.js boolean ops, SVG & path editing
└── docker/              # Postgres init scripts (docker-compose.yml in root)
```

## Essential Commands
| Purpose | Command | Notes |
| :--- | :--- | :--- |
| **Install** | `pnpm i` | Node `>=22`, pnpm workspaces (`pnpm-lock.yaml`) |
| **Dev Run** | `pnpm db:up && pnpm dev` | Starts Postgres/RustFS, server, and Vite (`http://localhost:5173`) |
| **Typecheck** | `pnpm typecheck` | Runs `tsc --noEmit` across all workspaces (no linter configured) |
| **Test** | `pnpm test` | Runs `vitest run` across all workspaces (`pnpm --filter @cherry/web e2e` for Playwright) |
| **Build** | `pnpm --filter @cherry/web build` | Builds `@cherry/web` with Vite (`dist/`) |

## Coding Standards & Conventions
- **Typing:** Strict TypeScript (`strict: true`, `noUncheckedIndexedAccess: true` in `tsconfig.base.json`); runtime inputs and document models are validated with Zod (`parse()` helper in `apps/server/src/http.ts`, schemas in `@cherry/doc`).
- **Architecture Boundaries:** Server routes (`*/routes.ts`) handle auth (`requireUser`) and Zod request parsing only, delegating business logic and Drizzle queries to `*/service.ts`; shared document and vector logic live in `@cherry/doc` and `@cherry/vector`.
- **Error Handling:** Throw `HttpError` (or domain subclasses like `WorkspaceError` mapping codes to HTTP statuses) on the server, caught by Fastify's central error handler returning `{ error: code }`; on the web, `api()` throws `ApiError(status, code)`.

## Agent Guardrails
- Keep edits localized strictly to the assigned feature or bug.
- Verify tests and `pnpm typecheck` pass locally before completing any task.
- Never edit lockfiles (`pnpm-lock.yaml`) or generated build/migration artifacts directly.
