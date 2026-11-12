# Phase 4 — Visual Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person uploads images, GIFs and SVGs with a required license, finds them again in a searchable library shared privately, with a workspace or publicly, drops them into designs as real images, and reports content that shouldn't be there.

**Architecture:** Uploaded bytes go through one ingest function on the server (type sniffing, SVG sanitizing, thumbnail, sha256) and are stored in object storage behind a three-method `Storage` interface (S3-compatible in production, in-memory in tests and e2e). Metadata lives in an `assets` table that follows the shapes library's visibility model. Files are never public URLs: the app serves them after an access check, and a design's viewers reach a private asset only through a recorded use of it in that design. The `.cherry` schema does not change: an `image` node already carries `assetId`.

**Tech Stack:** sharp (Apache-2.0), dompurify (MPL-2.0 OR Apache-2.0) with jsdom (MIT), @fastify/multipart (MIT), aws4fetch (MIT), plus the Phase 1–3 stack. MinIO (AGPL) runs only as a separate container in `docker-compose.yml` and is never linked into the code.

**Spec:** `docs/superpowers/specs/2026-11-11-cherry-berry-design.md` (Phase 4 line; "Licensing traps" row; "Uploads" stack line). Screen designs: `project/AssetLibrary.dc.html` and `project/Upload.dc.html` in the design artifact linked from the spec. They are not in the repo; the copy and fields they fix are written into the tasks below.

**Base:** `main` (Phases 1–3). Branch: `phase-4-library`.

## Global Constraints

- Everything in the Phase 1–3 Global Constraints still applies:
  - MIT, Apache-2.0, BSD, ISC or MPL-2.0 dependencies only.
  - Palette and text-contrast rules; fonts Space Grotesk and Inter.
  - Routes under `/api`, errors as `{ "error": "<code>" }`.
  - Roles: viewers are read-only in designs; non-members get `404 not_found`, never a hint that something exists.
  - Every committed editor action goes through `act()`, so it is exactly one undo step.
- No user-facing AI features.
- Visibility values are exactly `private`, `workspace` and `public`, with UI labels "Only me", "This workspace" and "Everyone (public)" (same as shapes).
- License values are exactly `cc0`, `cc-by`, `own` and `workspace-only`. UI labels: "CC0 · public domain", "CC-BY · credit required", "Own work · all rights", "Workspace only". Short badge labels: "CC0", "CC-BY", "Own work", "Workspace only".
  - A license is required on every asset.
  - `cc-by` requires a non-empty attribution.
  - `workspace-only` requires visibility `workspace`.
- Accepted uploads: PNG, JPEG, WEBP, GIF and SVG, detected from the bytes, never from the file name or the client's content type. Limits: 50 MB per file, 2 MB per SVG, 100 megapixels.
- Asset `kind` is `image` (PNG, JPEG, WEBP, non-animated GIF), `gif` (animated GIF) or `svg`.
- Uploaded files are served only by the app's own routes after an access check, with `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`. The web app renders them only through `<img>` or a canvas image, never inline markup.
- Out of scope this phase: collections ("Save to collection"), DPI display, animated GIF playback on the canvas (the first frame shows), background jobs (ingest runs inside the upload request; pg-boss arrives with export in Phase 7), the instance moderation queue (Phase 9), surfacing attribution at export (Phase 7), cropping and photo editing.

## Review Focus

1. **Hostile SVG upload.** A file with `<script>`, `onload`, `<foreignObject>`, an external `<image href>`, and CSS `url()` written with escapes (`u\72l(`). The stored file contains none of them, the thumbnail is produced without any network request, and the file response carries the CSP header. (Tasks 2, 3)
2. **Files that lie or are broken.** HTML renamed to `.png`, a zero-byte file, a truncated JPEG, a 200-megapixel PNG. Each gets a clear `400` code and nothing is stored. (Task 2)
3. **Library privacy.** A private asset is never listed or served to anyone else. Workspace assets are listed and served to members only. Uploading a file someone else holds privately does not reveal that it exists. A design's viewer can load an asset used in that design and nothing else. (Tasks 3, 4)
4. **Deleting an asset that designs use.** The designs keep showing the image; the asset leaves the library. An unused asset is removed completely, and its stored file too unless another asset has the same bytes. (Task 4)
5. **A multi-file upload where one file fails.** The others are still added, the failed one shows why, and trying again does not create duplicates. (Task 7)

---

### Task 1: Object storage

**Files:**
- Create: `apps/server/src/storage.ts`, `apps/server/test/storage.test.ts`
- Modify: `apps/server/src/config.ts`, `apps/server/src/app.ts` (deps gain `storage`), `apps/server/src/index.ts`, `apps/server/test/helpers.ts`, `apps/server/test/config.test.ts`, `apps/web/playwright.config.ts` (server env `S3_ENDPOINT: "memory:"`), `docker-compose.yml`, `.env.example`, `README.md` (storage paragraph)

**Interfaces:**
- Produces:
  - `type Storage = { put(key: string, body: Uint8Array, contentType: string): Promise<void>; get(key: string): Promise<Uint8Array | null>; delete(key: string): Promise<void> }`
  - `memoryStorage(): Storage`
  - `s3Storage(cfg: Config["s3"]): Storage`: path-style requests (`<endpoint>/<bucket>/<key>`) signed with aws4fetch; `get` returns `null` on 404 and throws on any other failure; `delete` of a missing key succeeds.
  - `createStorage(cfg: Config["s3"]): Storage`: `memory:` endpoint → `memoryStorage()`, otherwise `s3Storage`.
  - `buildApp(config, { db, storage })`. `setupTestApp()` passes a fresh `memoryStorage()` and returns it as `storage`.
  - Config: `S3_ENDPOINT` is required (`memory:` or a URL); `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` are required unless the endpoint is `memory:`. Add optional `S3_REGION` (default `us-east-1`). Remove the `ponytail:` note about Phase 4.
  - `docker-compose.yml` gains a `minio` service (ports 9000 and 9001, a volume) and a one-shot `minio-init` service that creates the `cherry` bucket with `mc`. `.env.example` values already match.

- [ ] **Step 1: Failing tests** in `storage.test.ts`:
  - `memory storage round-trips bytes`: put, get equals the bytes, delete, get is `null`, delete again doesn't throw.
  - `s3 storage round-trips bytes`: the same assertions against `s3Storage`, wrapped in `describe.skipIf(!process.env.TEST_S3_ENDPOINT)` and configured from `TEST_S3_*`.
  - In `config.test.ts`: `S3_ENDPOINT=memory:` loads with no other S3 values; a URL endpoint without a bucket fails with a message naming `S3_BUCKET`; a missing `S3_ENDPOINT` fails.
- [ ] **Step 2:** Run `pnpm --filter @cherry/server test` → FAIL (no `storage.ts`).
- [ ] **Step 3:** Implement. Add `aws4fetch` to the server.
- [ ] **Step 4:** `pnpm test`, `pnpm typecheck` and `pnpm --filter @cherry/web e2e` PASS (the e2e run proves the server boots with `memory:`).
- [ ] **Step 5:** Commit `feat(server): object storage with s3 and in-memory backends`.

### Task 2: Ingest (sniff, sanitize, thumbnail, hash)

**Files:**
- Create: `apps/server/src/assets/ingest.ts`, `apps/server/src/assets/svg.ts`, `apps/server/test/ingest.test.ts`

**Interfaces:**
- Produces:
  - `class IngestError extends Error { code: "unsupported_type" | "invalid_image" | "too_large" }`
  - `sanitizeSvg(svg: string): string` in `svg.ts`. Throws `IngestError("invalid_image")` when the result has no `<svg>` root.
    - DOMPurify on a jsdom window with `USE_PROFILES: { svg: true, svgFilters: true }` and `FORBID_TAGS: ["foreignObject", "a", "script"]`.
    - A hook then removes every `href`/`xlink:href` (any namespace prefix) whose value doesn't start with `#`, except `data:image/png|jpeg|gif|webp;base64,` on `<image>`.
    - Any `style` attribute or `<style>` element whose text contains `\`, `@import`, `image-set` or `url(` not immediately followed by `#` is removed whole. Any other attribute containing `url(` not followed by `#` is removed.
    - `<use>` is kept only with a `#` reference, and a document with more than 5 000 elements is rejected as `too_large`.
  - `ingest(bytes: Uint8Array): Promise<Ingested>` where
    `type Ingested = { kind: "image" | "gif" | "svg"; format: "png" | "jpeg" | "webp" | "gif" | "svg"; contentType: string; width: number; height: number; sha256: string; file: Uint8Array; thumb: Uint8Array }`
    - `sha256` is the lowercase hex hash of the uploaded bytes.
    - `file` is the uploaded bytes for raster formats and the sanitized text for SVG.
    - `thumb` is WEBP, fitted inside 480 × 480 without enlarging; the first frame for a GIF; rasterized from the sanitized SVG.
    - `kind` is `gif` only when the GIF has more than one frame.
    - Format detection: sharp metadata for rasters. SVG is recognized when the bytes (after an optional BOM, XML declaration, doctype and comments) start with `<svg`. Anything else is `unsupported_type`.
    - Limits: over 50 MB, an SVG over 2 MB, or more than 100 megapixels → `too_large`. sharp runs with `limitInputPixels` set to the same pixel limit and `failOn: "error"`. A decode failure is `invalid_image`. An SVG with no usable size falls back to its `viewBox`, then to 300 × 150.

- [ ] **Step 1: Failing tests** in `ingest.test.ts` (rasters are generated in the test with sharp; SVGs are inline strings):
  - `png, jpeg, webp ingest with size and a webp thumb no larger than 480`: a 1000 × 500 image of each format → `kind: "image"`, the right `format` and `contentType`, `width: 1000`, `height: 500`, thumb metadata `format: "webp"`, `width: 480`.
  - `a small image is not enlarged`: 40 × 30 → thumb is 40 × 30.
  - `animated gif is kind gif, single-frame gif is kind image`.
  - `sha256 is of the uploaded bytes` (compare with `node:crypto`).
  - `svg is sanitized` (Review Focus 1): the input has `<script>`, `onload`, `<foreignObject><iframe/></foreignObject>`, `<image href="http://example.invalid/x.png">`, `<a href="javascript:alert(1)">`, `style="fill:u\72l(http://example.invalid/a)"`, `<style>@import url(http://example.invalid/b.css);</style>`, `<rect fill="url(http://example.invalid/c)">` and one plain `<circle fill="#8E1EA2">`. The output text contains none of `script`, `onload`, `foreignObject`, `iframe`, `example.invalid`, `javascript:`, `@import`, and still contains the `circle` with its fill.
  - `svg keeps internal references`: a `linearGradient id="g"` used by `fill="url(#g)"` and a `<use href="#s">` both survive.
  - `svg thumbnail renders without network`: ingesting the hostile SVG resolves and the thumb is a non-empty WEBP.
  - `lying and broken files` (Review Focus 2): `<html>` bytes → `unsupported_type`; zero bytes → `unsupported_type`; the first 200 bytes of a real JPEG → `invalid_image`; a PNG header declaring 20 000 × 10 001 pixels → `too_large`; a 2.1 MB SVG → `too_large`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. Add `sharp`, `dompurify` and `jsdom` (plus `@types/jsdom`) to the server. **Step 4:** `pnpm test` and `pnpm typecheck` PASS.
- [ ] **Step 5:** Commit `feat(server): ingest uploads with type sniffing, svg sanitizing and thumbnails`.

### Task 3: Assets API

**Files:**
- Create: `apps/server/src/assets/service.ts`, `apps/server/src/assets/routes.ts`, `apps/server/src/http.ts`, `apps/server/test/assets.test.ts`, a Drizzle migration
- Modify: `apps/server/src/db/schema.ts`, `apps/server/src/app.ts`, `apps/server/src/shapes/{routes,service}.ts` and the other route files (use the shared helpers)

**Interfaces:**
- Consumes: `Storage` (Task 1), `ingest`, `IngestError` (Task 2), `getRole`, `requireUser`.
- Produces:
  - `http.ts`: the `parse(schema, value)` helper now copied in three route files, and `escapeLike(q)`, each defined once and imported everywhere.
  - Table `assets`: `id` uuid pk, `createdBy` → user (cascade), `workspaceId` → workspaces (cascade, nullable), `visibility`, `title`, `tags text[]`, `license`, `attribution` (text, default `''`), `kind`, `format`, `width` int, `height` int, `bytes` int, `sha256`, `createdAt`, `deletedAt` (nullable). Checks: visibility and license value lists; `(visibility = 'workspace') = (workspace_id is not null)`; `license <> 'workspace-only' or visibility = 'workspace'`; `license <> 'cc-by' or attribution <> ''`. Indexes on `sha256`, `(visibility, createdAt desc)`, `workspaceId`, `createdBy`.
  - Storage keys: `files/<sha256>` and `thumbs/<sha256>.webp`.
  - `type Asset = { id; title; tags; kind; format; width; height; bytes; license; attribution; visibility; workspaceId: string | null; workspaceName: string | null; createdBy; uploaderName; createdAt; mine: boolean }`
  - "Visible to a user" means: their own, or `public`, or `workspace` in a workspace they belong to — and `deletedAt` is null.
  - Routes (all require a session):
    - `POST /api/assets`: multipart with one `file` part and fields `title` (1–120), `tags` (comma-separated; at most 10, each 1–30), `license`, `attribution` (≤ 300), `visibility`, `workspaceId`, `confirmed` (must be `"true"`, else `400 rights_not_confirmed`).
      - `201 { asset, duplicate: false }`.
      - When an asset with the same `sha256` is already visible to the uploader: `200 { asset: <that one>, duplicate: true }` and nothing new is stored. An invisible match is ignored and a new row is created (the stored file is shared).
      - Errors: `IngestError` codes → `400`; a file part over 50 MB → `413 too_large`; saving to a workspace needs role owner, admin or editor, else `403 forbidden`; non-members `404 not_found`; the constraint rules above → `400 invalid_body`.
      - Rate limit: 60 per minute per user.
    - `GET /api/assets?scope=mine|workspace|public&workspaceId=&kind=image|gif|svg&license=cc0|cc-by|own|workspace-only&q=`: `{ assets }`, newest first, capped at 200. `q` matches title, any tag or the uploader's name, case-insensitively, with `%`, `_` and `\` treated literally. `scope=workspace` requires membership.
    - `GET /api/assets/by-hash/:sha256`: `{ asset }` for a visible match, else `404 not_found`.
    - `GET /api/assets/:id`: `{ asset }` or `404`.
    - `PATCH /api/assets/:id`: the uploader changes `title`, `tags`, `license`, `attribution`, `visibility`, `workspaceId` under the same rules; others `403` if they can see it, `404` if not.
    - `GET /api/assets/:id/file` and `GET /api/assets/:id/thumb`: the bytes with the right `Content-Type` (`image/webp` for thumbs), the two security headers from Global Constraints, and `Cache-Control: private, max-age=31536000, immutable`. `404` when the asset isn't visible or the stored object is missing.
  - `canReadAsset(db, userId, asset): Promise<boolean>` exported from the service for Task 4 to extend.

- [ ] **Step 1: Failing tests** in `assets.test.ts` (use `app.inject` with a hand-built multipart body helper in the test file):
  - upload a PNG → 201, fields echoed, `uploaderName` set; `/file` returns the same bytes with `image/png`, `nosniff` and the CSP header; `/thumb` returns WEBP.
  - upload an SVG with a `<script>` → the `/file` body has no `script` and is `image/svg+xml` (Review Focus 1).
  - validation: missing license → 400; `cc-by` without attribution → 400; `workspace-only` with `public` → 400; `confirmed` absent → `400 rights_not_confirmed`; HTML bytes → `400 unsupported_type`, and the storage has no objects afterwards (Review Focus 2).
  - dedupe: the same bytes twice by one user → second is `200 duplicate: true` with the first id; `by-hash` finds it.
  - privacy (Review Focus 3): B can't list, get, patch, fetch `/file` or `by-hash` A's private asset (all `404`, list empty); B uploading the same bytes gets `201 duplicate: false` and a different id; a workspace asset is listed and served to a member and `404` to an outsider; a viewer can't upload to the workspace (`403`).
  - list filters: `kind`, `license` and `q` (title, tag, uploader name, and `q=100%` matching only a title containing `100%`).
  - patch: the uploader renames and changes visibility; another member who can see it gets `403`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. Add `@fastify/multipart` (limits: 1 file, 50 MB). Generate the migration with drizzle-kit. **Step 4:** `pnpm test` and `pnpm typecheck` PASS.
- [ ] **Step 5:** Commit `feat(server): assets library api`.

### Task 4: Asset uses and deletion

**Files:**
- Modify: `apps/server/src/assets/{service,routes}.ts`, `apps/server/src/db/schema.ts` (+ migration), `apps/server/test/assets.test.ts`

**Interfaces:**
- Consumes: Task 3, and the designs service's access check (`openDesign` or the role lookup it uses).
- Produces:
  - Table `asset_uses`: `designId` → designs (cascade), `assetId` → assets (cascade), `createdAt`; primary key `(designId, assetId)`.
  - `POST /api/designs/:id/assets` body `{ assetId }` → `204`. Needs edit rights on the design (viewer `403`, non-member `404`) and an asset visible to the caller (`404` otherwise). Idempotent.
  - `canReadAsset` now also returns true when the asset has a use in a design the user can view. This applies to `/file`, `/thumb` and `GET /api/assets/:id` only, not to listing, `by-hash` or patching. A soft-deleted asset stays readable this way.
  - `Asset` gains `usedIn: number` (count of designs using it).
  - `DELETE /api/assets/:id` → `204`. Allowed for the uploader, and for an owner or admin of the asset's workspace when it is a workspace asset; others `403` or `404` as for patch.
    - With uses: sets `deletedAt` (it leaves every listing and `by-hash`; files stay served to those designs).
    - Without uses: deletes the row, and deletes `files/<sha>` and `thumbs/<sha>.webp` only when no other row has that `sha256`.

- [ ] **Step 1: Failing tests:**
  - `a design's viewer can load a private asset used in the design`: A uploads privately, records the use in A's workspace design; member B gets `200` on `/file` and `/thumb`, still doesn't see it in any list or by-hash, and outsider C gets `404` (Review Focus 3).
  - `recording a use needs edit rights and a visible asset`: viewer `403`; an editor recording someone else's private asset `404`; twice is `204` both times.
  - `usedIn counts designs`.
  - `deleting a used asset keeps designs working` (Review Focus 4): after delete, lists and by-hash don't have it, `/file` is still `200` for the design's members, `scope=mine` no longer lists it, and an outsider still gets `404`.
  - `deleting an unused asset removes the stored file unless another asset shares it`: two users hold the same bytes; deleting one leaves the object, deleting the second removes both keys from storage.
  - `a workspace admin can delete a member's workspace asset; an editor cannot`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `pnpm test` and `pnpm typecheck` PASS.
- [ ] **Step 5:** Commit `feat(server): asset uses, design-scoped access and deletion`.

### Task 5: Reports

**Files:**
- Create: `apps/server/src/reports/service.ts`, `apps/server/src/reports/routes.ts`, `apps/server/test/reports.test.ts`, a migration
- Modify: `apps/server/src/db/schema.ts`, `apps/server/src/app.ts`, `apps/server/src/assets/service.ts`, `apps/server/src/shapes/service.ts` (hide rule)

**Interfaces:**
- Consumes: asset and shape visibility checks, `deleteShape`, asset deletion (Task 4).
- Produces:
  - Table `reports`: `id`, `targetType` (`asset` | `shape`), `targetId` uuid, `reporterId` → user (cascade), `reason` (`copyright` | `inappropriate` | `spam` | `other`), `note` (≤ 500, default `''`), `status` (`open` | `dismissed` | `removed`), `createdAt`, `resolvedBy` (nullable), `resolvedAt` (nullable). Unique `(targetType, targetId, reporterId)`.
  - `POST /api/reports` body `{ targetType, targetId, reason, note? }` → `201 { report: { id } }`. The target must be visible to the reporter (`404` otherwise). You can't report your own item (`400 invalid_body`). Reporting the same item again returns `200` with the existing report. Rate limit: 20 per minute per user.
  - `GET /api/workspaces/:id/reports` → `{ reports: [{ id, targetType, targetId, title, reason, note, reporterName, createdAt, count }] }`: open reports on that workspace's `workspace`-visibility assets and shapes, one row per target with the newest reason and the number of reporters. Owner and admin only (`403` for others, `404` for non-members).
  - `POST /api/reports/:id/resolve` body `{ action: "dismiss" | "remove" }` → `204`. Owner or admin of the target's workspace. `remove` deletes the target (asset deletion rules from Task 4; `deleteShape`) and marks every open report on it `removed`; `dismiss` marks them `dismissed`.
  - Hide rule: a `public` asset or shape with open reports from 3 or more different users is left out of `scope=public` listings and of `by-hash`, for everyone except its uploader. Mark it with a `ponytail:` comment: the instance moderation queue in Phase 9 replaces this threshold.

- [ ] **Step 1: Failing tests** in `reports.test.ts`:
  - report a visible asset and a visible shape → 201; again → 200 same id; own item → 400; an invisible target → 404; a bad reason → 400.
  - the workspace queue lists one row per target with `count`, for an admin; an editor gets 403.
  - resolve `remove` deletes the asset and empties the queue; resolve `dismiss` keeps the asset and empties the queue; an editor can't resolve.
  - three different reporters hide a public asset from `scope=public` for a fourth user and keep it in the uploader's `scope=mine`; two reporters don't hide it; the same for a public shape.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `pnpm test` and `pnpm typecheck` PASS.
- [ ] **Step 5:** Commit `feat(server): reports on assets and shapes`.

### Task 6: Visual library page (web)

**Files:**
- Create: `apps/web/src/Sidebar.tsx`, `apps/web/src/routes/Library.tsx`, `apps/web/src/library/assets.ts` (hook and helpers), `apps/web/src/library/ReportDialog.tsx`, `apps/web/src/library/assets.test.ts`, `apps/web/e2e/library.spec.ts`, `apps/web/e2e/fixtures/dot.png` (a small real PNG)
- Modify: `apps/web/src/api.ts`, `apps/web/src/App.tsx` (route `/library`), `apps/web/src/routes/Home.tsx` and `apps/web/src/routes/Shapes.tsx` (use `Sidebar`; Shapes gets a Report action), `apps/web/src/editor/ShapesPanel.tsx` (Report action), `apps/web/src/theme.css`

**Interfaces:**
- Consumes: Tasks 3–5 routes.
- Produces:
  - `api.ts`: types `Asset`, `License`, `AssetKind`; `listAssets(scope, opts?: { workspaceId?; kind?; license?; q? })`, `getAsset(id)`, `assetByHash(sha256)` (resolves `null` on 404), `uploadAsset(file: File, fields: NewAsset) => Promise<{ asset: Asset; duplicate: boolean }>` (FormData; `api()` learns to send a `FormData` body without a JSON content type), `updateAsset(id, patch)`, `deleteAsset(id)`, `linkAssetToDesign(designId, assetId)`, `reportItem(body)`, `assetUrl(id, "file" | "thumb")`. COPY entries: `unsupported_type` → "That file type isn't supported. Use PNG, JPG, WEBP, GIF or SVG.", `invalid_image` → "That file couldn't be read as an image.", `too_large` for uploads → "That file is too large (50 MB max, 2 MB for SVG).", `rights_not_confirmed` → "Confirm you have the right to share this file."
  - `library/assets.ts`: `LICENSES` (value, long label, badge label), `KIND_BADGE` (`image` → "IMG", `gif` → "GIF", `svg` → "SVG"), `useAssetList(filters, text)` (250 ms debounce and a stale-response guard, like `useShapeList`), `formatBytes(n)`.
  - `Sidebar({ active }: { active: "home" | "library" | "shapes" })`: the brand, the workspace select, links "Home", "Visual library", "Shapes", the role and workspace ID line, and Sign out — moved out of `Home.tsx` unchanged in behaviour.
  - `ReportDialog({ target: { type: "asset" | "shape"; id: string; title: string }, onClose })`: `role="dialog"` labelled "Report", a Reason select ("Copyright or license problem", "Inappropriate", "Spam", "Something else"), an optional Note, and "Send report". On success it shows "Thanks. Your report was sent." in `role="status"`.
  - `/library` page:
    - Heading "Visual library", sub-line "Every image, GIF and SVG your community adds lands here.", and an "Upload visuals" button (Task 7 wires it to the dialog).
    - A search input labelled "Search visuals" with placeholder "Search by title, tag or uploader".
    - Three chip rows using `aria-pressed`: Type (All, Images, GIFs, SVG), Source (Mine, Workspace, Public; default Workspace, using `currentWorkspace.pick`), License (Any, CC0, CC-BY, Own work).
    - A grid of tiles: the thumb `<img>` with the title as `alt`, a kind badge and a license badge. Loading, empty ("No visuals yet. Upload the first one.") and error-with-Retry states.
    - Selecting a tile fills the aside "Selected visual": a larger thumb, title, tag chips, and rows "Uploaded by" (`uploaderName · workspaceName` when there is one), "License" (long label; plus the attribution for CC-BY), "Size" (`W × H px`), "Format", "File size", "Visible to", "Used in" (`N designs`).
    - Aside actions: "Report" (opens `ReportDialog`; hidden for your own), and for your own assets "Edit details" (inline form: Title, Tags, License, Attribution, Who can see it; Save) and "Delete" with `confirm()`.
  - Shapes page and the editor's Shapes panel: a "Report" action on shapes that aren't yours, opening `ReportDialog`.

- [ ] **Step 1: Failing tests.**
  - Unit (`assets.test.ts`): `formatBytes` (`900` → "900 B", `1536` → "1.5 KB", `5_242_880` → "5 MB"); every license value has both labels.
  - e2e (`library.spec.ts`; assets are created through `page.request.post("/api/assets", { multipart })`, since the upload dialog is Task 7):
    - `library lists, filters and shows details`: upload `dot.png` as "Berry dot" (tag `fruit`, CC0, workspace) and `berry.svg` as "Berry outline" (Own work, private). Open Home → Visual library. Source Workspace shows "Berry dot" with badges "IMG" and "CC0". Source Mine shows both. Type SVG shows only "Berry outline". License CC0 shows only "Berry dot". Searching "FRUIT" shows only "Berry dot". Selecting it shows the detail rows, including "CC0 · public domain".
    - `edit and delete your own visual`: rename to "Berry spot" → the tile updates; Delete → it is gone.
    - `report someone else's public visual`: user A uploads a public visual; user B opens Source Public, selects it, sends a report with reason "Spam" → "Thanks. Your report was sent."; B sees no Edit or Delete.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `pnpm test`, `pnpm typecheck` and `pnpm --filter @cherry/web e2e` PASS.
- [ ] **Step 5:** Commit `feat(web): visual library page with filters, details and reports`.

### Task 7: Upload dialog (web)

**Files:**
- Create: `apps/web/src/library/UploadDialog.tsx`, `apps/web/src/library/upload.ts`, `apps/web/src/library/upload.test.ts`
- Modify: `apps/web/src/routes/Library.tsx`, `apps/web/e2e/library.spec.ts`

**Interfaces:**
- Consumes: Task 6's api functions and `LICENSES`.
- Produces:
  - `upload.ts` (pure, unit-tested):
    - `sha256Hex(bytes: ArrayBuffer): Promise<string>` (Web Crypto).
    - `precheck(file: { name: string; size: number; type: string }): "ok" | "too_large" | "unsupported_type"`: over 50 MB, or over 2 MB for `.svg`, is `too_large`; an extension outside png, jpg, jpeg, webp, gif, svg is `unsupported_type`. This is a courtesy check; the server decides.
    - `titleFromName(name)`: the file name without its extension, with `-` and `_` turned into spaces and the first letter capitalized (`berry-moon.png` → "Berry moon").
    - `validate(details): string | null`: the first of "Choose a license.", "CC-BY needs an attribution.", "Workspace-only visuals must be shared with this workspace.", "Confirm you have the right to share this file.", or `null`.
  - `UploadDialog({ workspaceId, viewer, onClose, onDone })`: `role="dialog"` labelled "Upload visuals".
    - A drop zone that is also a file input (`multiple`, `accept=".png,.jpg,.jpeg,.webp,.gif,.svg"`): "Drop files or click to browse" and "PNG, JPG, WEBP, GIF, SVG · up to 50 MB each".
    - One row per file with its name and a status: "Checking…" (hashing and `assetByHash`), "Ready", "Already in library" (with "Use existing", which calls `onDone` with that asset and drops the row), "Uploading…", "Added", or an error message from `errorMessage`/`precheck` in the error colour with a "Remove" button.
    - Selecting a row shows "Details for <name>": Title (prefilled by `titleFromName`), Tags, License (required, no default), Who can see it (default "This workspace"; that option is disabled for viewers and the default becomes "Only me"), Attribution / source, and the checkbox "I created this or have the right to share it under this license."
    - "Apply to all files" copies the license, visibility, tags, attribution and confirmation of the selected row to every other row that is Ready.
    - The primary button reads "Add N visuals" (N = rows that are Ready and pass `validate`; "Add 1 visual" for one) and is disabled at 0. It uploads those rows one after another. A row that fails keeps its error and the rest continue (Review Focus 5). When at least one was added, `onDone` is called so the library reloads; the dialog closes only if no row is left in error or still needs details.
    - A server reply with `duplicate: true` marks the row "Already in library".
    - The note: "SVGs are cleaned of scripts and external links before saving. Duplicates are matched by file hash, so the library stays tidy."
  - Library page: "Upload visuals" opens the dialog; a finished upload reloads the list and selects the newest added asset.

- [ ] **Step 1: Failing tests.**
  - Unit (`upload.test.ts`): `precheck` (51 MB PNG → `too_large`; 3 MB SVG → `too_large`; `notes.txt` → `unsupported_type`; `a.JPG` → `ok`); `titleFromName`; `validate` returns each message in order and `null` for a complete CC-BY form; `sha256Hex` of "abc" is `ba7816bf…15ad`.
  - e2e:
    - `upload two visuals with details`: add `dot.png` and `berry.svg`; both reach "Ready"; fill the first (License "CC0 · public domain", tick the checkbox), "Apply to all files"; "Add 2 visuals" → both appear in the library with their badges.
    - `a duplicate is offered instead of re-uploaded`: add `dot.png` again → "Already in library" and "Use existing" selects the existing visual; the library still has one "Dot".
    - `one bad file doesn't stop the others` (Review Focus 5): add `dot.png` (different bytes: a second fixture `dot2.png`) and `hostile.html` renamed to `fake.png` (a fixture containing `<html>`); upload → the good one is "Added" and listed, the bad one shows "That file type isn't supported. Use PNG, JPG, WEBP, GIF or SVG."; pressing the button again adds nothing new.
    - `license is required`: with no license chosen the button is disabled and the row says "Choose a license."
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** all suites PASS.
- [ ] **Step 5:** Commit `feat(web): upload dialog with duplicate check and per-file details`.

### Task 8: Images in the editor (web)

**Files:**
- Create: `apps/web/src/editor/VisualsPanel.tsx`, `apps/web/src/editor/useAssetImage.ts`, `apps/web/src/editor/visuals.ts`, `apps/web/src/editor/visuals.test.ts`
- Modify: `apps/web/src/editor/Canvas.tsx` (image rendering), `apps/web/src/editor/Toolbar.tsx`, `apps/web/src/routes/Editor.tsx`, `apps/web/src/editor/Properties.tsx` (image section), `apps/web/src/editor/editor.css`, `apps/web/e2e/editor.spec.ts`

**Interfaces:**
- Consumes: `useAssetList`, `assetUrl`, `linkAssetToDesign`, `getAsset`, `UploadDialog`, `LICENSES`, `addNode`, `act`.
- Produces:
  - `visuals.ts`: `imageNode(asset: Pick<Asset, "id" | "title" | "width" | "height">, page: { width: number; height: number }): CherryNode`: an `image` node named after the asset title, scaled uniformly to fit inside 60% of the page's width and height, centred, rotation 0.
  - `useAssetImage(assetId): { image: HTMLImageElement | null; status: "loading" | "ready" | "error" }`: loads `assetUrl(id, "file")`, shares one `Image` per asset id across nodes, and retries when the id changes.
  - Canvas: an `image` node draws its asset with Konva's `Image` at the node's width and height. While loading it shows the existing grey box; on error the box reads "Image unavailable". Selection, move, resize, rotate, opacity, lock and hide behave as for other nodes.
  - Toolbar: a "Visuals" button toggling `VisualsPanel`, the same left drawer slot as the Shapes panel (opening one closes the other).
  - `VisualsPanel`: the Source chips (Mine, Workspace, Public), the Type chips, search, and a thumbnail grid from `useAssetList`. Clicking a visual, in one `act`, adds `imageNode(...)` and selects it, then calls `linkAssetToDesign(designId, asset.id)` (a failure there shows "Couldn't link this visual to the design. Try again." in `role="alert"` and undoes the insert). An "Upload…" button opens `UploadDialog`; a finished upload inserts the first added or chosen visual. Viewers can browse but not insert or upload.
  - Properties, for one selected `image` node: a "Visual" section with the asset title, the license badge label, the attribution when there is one, and "W × H px" (from `getAsset`; "Details unavailable" on failure).

- [ ] **Step 1: Failing tests.**
  - Unit (`visuals.test.ts`): a 4000 × 2000 asset on a 1080 × 1080 page → 648 × 324 at x 216, y 378; a 100 × 400 asset → 162 × 648; the node's `assetId` and `name` come from the asset.
  - e2e:
    - `insert a visual into a design`: upload `dot.png` through the API, open a design, Visuals → Workspace → click "Dot" → a layer "Dot" appears, the canvas requested `/api/assets/<id>/file` with status 200, and Properties shows "CC0". Undo once removes the layer. Reload → the layer and the image request are back.
    - `a teammate sees a private visual used in the design` (Review Focus 3): the owner inserts a private visual; a viewer opened with `openAsViewer` gets status 200 for that file request.
    - `a missing visual shows a placeholder, not a crash`: route `**/api/assets/*/file` to 404 → the editor still loads and the layer is selectable.
    - `upload from the editor`: Visuals → Upload… → add `dot2.png` with a license → it is inserted as a layer.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `pnpm test`, `pnpm typecheck` and `pnpm --filter @cherry/web e2e` all PASS.
- [ ] **Step 5:** Commit `feat(web): place library visuals in designs`.

---

## Done when

A person can upload PNG, JPG, WEBP, GIF and SVG files with a license, see duplicates caught before upload, browse and search the library by type, source and license, edit or delete their own visuals, report someone else's, and place a visual in a design where teammates can see it. Deleting a visual never breaks a design that uses it. `pnpm test`, `pnpm typecheck` and `pnpm --filter @cherry/web e2e` pass.

## Next plans

Phase 5 (Brand kits & templates) uses the asset library for logo slots. Phase 4 leaves these for later: collections, attribution surfaced at export (Phase 7), the instance moderation queue and storage clean-up (Phase 9), animated GIF playback, and vector-preserving insertion of library SVGs (today the editor's "Import SVG…" does that for files).
