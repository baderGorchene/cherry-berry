# Cherry Berry — Design

## Intent

Cherry Berry is an open-source (MIT) design studio in the spirit of Canva, built to fix Canva's drawbacks: real vector editing, honest print output, full brand kits for free, no lock-in (open `.cherry` file format, self-hostable), and no paywall. It runs on web, desktop and mobile, against either the central Cherry Berry Cloud instance or a self-hosted server.

Screen designs: https://claude.ai/artifact/DLKav3Szy52ziDcYfHcN5C (19 screens: sign in, join/create workspace, home, new design, editor, pen & boolean ops, version history, export & preflight, visual library, upload, shapes, brand kit, templates, workspace settings, instance admin, 4 mobile screens).

## Goals (decided by the user)

- Open source, **MIT license**.
- Runs as **web, desktop and mobile** apps.
- Works both **self-hosted** and as a **central instance**.
- **Workspaces** that users join by **invitation**, by **workspace ID + password**, or that are **open** to anyone.
- **Visual stock is user-contributed**: every image, GIF or SVG a user adds is saved in the database and becomes reusable library content.
- **Basic shapes plus user-made custom shapes.**
- **All branding features** (brand kits: colors, fonts, logos, locked brand templates, brand rules).
- Fix Canva's drawbacks (see "How each drawback is fixed").
- Palette: `#8E1EA2`, `#C654C3`, `#ED96D7`, `#FFC0DE`.

## Non-goals / anti-goals (decided by the user)

- **No AI features available to the user.**
- **No logo is created** for Cherry Berry for now; the brand kit has empty logo slots only.
- No mascot.

## How each Canva drawback is fixed

| Drawback | Fix |
|---|---|
| No real vector control | Pen tool, bezier editing, boolean ops (union/subtract/intersect/exclude), SVG output |
| Weak print | CMYK documents, bleed/crop marks, preflight; full PDF/X + ICC in a separate print service |
| Generic look | Deep editing tools; templates are starting points |
| Licensing traps | Every uploaded asset carries a required license + attribution, surfaced at export |
| Lock-in | Open documented `.cherry` JSON format, export everything, self-host |
| Typography | Kerning, tracking, OpenType toggles, text on path |
| Performance | Canvas renderer, lazy assets |
| Pricing | Free, open source, nothing gated |
| Handoff/collab | Real-time collaboration, version history with branches |

## Stack (Claude's call, accepted by the user)

- TypeScript everywhere, pnpm monorepo.
- Web app: React + Vite. Desktop: Tauri 2 wrapping the web build. Mobile: Capacitor wrapping the web build with mobile layouts.
- Editor: Konva (rendering, hit testing, transforms) + Paper.js (path geometry, boolean ops, SVG import). Document model: own JSON schema (`.cherry`) validated with zod.
- Collaboration and versions: Yjs; server-side Hocuspocus with Postgres persistence.
- Server: Node.js + Fastify, PostgreSQL via Drizzle ORM, pg-boss job queue (no Redis), S3-compatible object storage (MinIO for self-host).
- Auth: Better Auth (email + password, sessions) for users; workspaces and memberships are Cherry Berry's own tables.
- Uploads: DOMPurify (server-side) sanitizes SVG; sharp makes thumbnails; sha256 of file bytes de-duplicates.
- Export: worker using skia-canvas (PNG, JPG, SVG, PDF) and the `.cherry` serializer.
- Print (later): CMYK/PDF-X via Ghostscript, which is **AGPL** — it runs only as a separate optional container, never linked into MIT code.
- Self-host: one `docker-compose.yml` (app, worker, postgres, minio). The central instance runs the same images.

## Constraints

- Every dependency must be MIT, Apache-2.0, BSD, ISC or MPL-2.0; check before adding.
- Text color contrast ≥ 4.5:1. `#8E1EA2` is the only palette color allowed for body text on white (≈7.3:1); `#C654C3` only for large text and icons; `#ED96D7` and `#FFC0DE` are backgrounds only. Neutrals: ink `#22142A`, muted `#5D4E66`, line `#E9DFEC`, surface `#FBF7FC`; status: success `#1E7A46`, warning `#B45309`, error `#B3261E`.
- Fonts: Space Grotesk (headings), Inter (body).

## Phases (one implementation plan each)

1. **Foundation** — monorepo, `.cherry` document format, server with auth + workspaces (3 join modes), Docker Compose, web shell (sign in, join/create workspace, home).
2. **Editor core** — Yjs-backed document, canvas render, select/move/resize/rotate, text, basic shapes, layers, pages, undo/redo, autosave.
3. **Vectors & custom shapes** — pen, point editing, boolean ops, save/import custom shapes, shape library with private/workspace/public visibility.
4. **Visual library** — upload (image/GIF/SVG), sanitize, dedupe, license + attribution, visibility, search/filter, reports.
5. **Brand kits & templates** — kits (colors with roles + contrast, fonts incl. upload, logo slots), locked templates, brand rules, style-guide export, template publishing.
6. **Collaboration & history** — live multi-user editing, presence, named versions, restore, branch, compare.
7. **Export** — PNG/JPG/SVG/PDF/GIF/PPTX/`.cherry`, preflight checks, attribution notes.
8. **Desktop & mobile** — Tauri and Capacitor packaging, server picker (cloud vs self-hosted URL), mobile layouts.
9. **Instance admin & print** — registration policy, storage, moderation queue; optional print service (CMYK, ICC, spot plates).

## Left to the builder

Internal module layout beyond what each plan fixes, styling details not in the screen designs, and library minor versions (use the latest stable at install time).
