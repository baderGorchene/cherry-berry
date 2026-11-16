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

### Instance admin

List admin emails in `ADMIN_EMAILS` (comma-separated). Create the admin account first: whoever first signs up with a listed email becomes instance admin, under any registration policy. The server logs a warning for each listed email that has no account yet.

## Production

Build the web app with `pnpm --filter @cherry/web build`, set `WEB_DIST=apps/web/dist` and `PUBLIC_URL` to the address people use; one origin serves app and API. A relative `WEB_DIST` resolves against the server process working directory.

## Print service (optional)

The print service adds CMYK PDF/X-3 and per-ink colour plate exports (`pdf-x` and `plates`). It is a separate container that runs Ghostscript; without it those formats are unavailable and everything else works.

```
docker compose --profile print up --build print
```

Then set `PRINT_URL=http://localhost:8080` for the server. To embed your own output profile, mount an ICC file into the container and set `PRINT_ICC_PROFILE` to its path there; otherwise Ghostscript's bundled default CMYK profile is used. See `apps/print/README.md`.

Ghostscript is licensed under the AGPL. That is why it lives in its own container and is only called as a command-line process: Cherry Berry (MIT) never links to it, and `apps/print` has no npm dependencies. If you distribute the image or run it as a service for others, the AGPL's terms for Ghostscript apply to you.

## Desktop app

`apps/desktop` (`@cherry/desktop`) is a Tauri 2 shell. It opens the launcher (`apps/launcher`), which picks a server, then loads that server's web app in the window; links to other sites open in the system browser and downloads go to your Downloads folder. Requires Rust (stable) and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform (WebView2 ships with Windows 11).

```bash
pnpm --filter @cherry/desktop dev:app                       # run it
pnpm --filter @cherry/desktop build                         # installers in apps/desktop/src-tauri/target/release/bundle
pnpm --filter @cherry/desktop build --debug --no-bundle     # just the executable, in src-tauri/target/debug
pnpm --filter @cherry/desktop test:rust                     # Rust unit tests
```

## Mobile app

`apps/mobile` (`@cherry/mobile`) is a Capacitor 8 shell for Android and iOS. Like the desktop app it ships only the launcher and then loads the chosen server's web app; `http://` servers on your network are allowed. Exports open the share sheet, and links that open a new window go to the system browser. Only the launcher can reach Capacitor's native bridge; the server's page gets just a `cherryNative` export handler. Icons and splash are plain colors (`apps/mobile/assets`); there is no logo. `pnpm --filter @cherry/mobile sync` builds the launcher and copies it into both projects; run it after a fresh clone.

```bash
pnpm --filter @cherry/mobile sync android          # or ios
cd apps/mobile/android && ./gradlew assembleDebug  # APK in app/build/outputs/apk/debug (needs JDK 21 and the Android SDK)
pnpm --filter @cherry/mobile cap open ios          # macOS with Xcode only
```

## Workspace structure

- `apps/server` (`@cherry/server`) — Fastify 5 API, Better Auth, Drizzle ORM (PostgreSQL / PGlite), and S3-compatible asset storage
- `apps/web` (`@cherry/web`) — React 19 + Vite 8 + Konva (`react-konva`) web editor
- `apps/print` (`@cherry/print`) — optional Ghostscript print service container (CMYK PDF/X, colour plates)
- `apps/desktop` (`@cherry/desktop`) — Tauri 2 desktop shell around the launcher and the server's web app
- `apps/mobile` (`@cherry/mobile`) — Capacitor 8 Android and iOS shell around the launcher and the server's web app
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
