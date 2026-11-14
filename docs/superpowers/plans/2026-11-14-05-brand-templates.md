# Phase 5: Brand Kits & Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Workspaces get brand kits (colors with roles and contrast ratings, fonts including uploads, four logo slots, brand rules), a printable style guide, brand-locked layers, and templates that users publish from a design and start new designs from.

**Architecture:** The pure logic lives in `@cherry/doc/brand.ts`: the kit schema, contrast math, brand checks and the brand-lock comparison. The server adds three feature modules:
- `brand/`: kits, fonts and the design↔kit link.
- `templates/`: publish, list, use, approve and delete.
- An extension of `reports/` so templates can be reported.

The web app adds two pages, `/brand` (plus `/brand/:id/guide`) and `/templates`. The editor gets a Brand tab, a Publish dialog and brand-lock behaviour. Rules are applied in the editor. The server enforces one thing: an editor's save cannot change brand-locked layers.

**Tech Stack:** As in AGENTS.md. No new dependencies: fonts are checked by magic bytes, template thumbnails are re-encoded with the already-installed `sharp`, and the style guide uses the browser's print-to-PDF.

**Spec:** `docs/superpowers/specs/2026-11-11-cherry-berry-design.md`, Phase 5. The brand kit and templates screens are `project/BrandKit.dc.html` and `project/Templates.dc.html` in the screen designs artifact.

## Global Constraints

- Every dependency must be MIT, Apache-2.0, BSD, ISC or MPL-2.0. This plan adds none.
- Contrast: text ≥ 4.5:1. `#8E1EA2` is the only palette color allowed for body text on white; `#C654C3` only for large text and icons; `#ED96D7` and `#FFC0DE` are backgrounds only. Neutrals: ink `#22142A`, muted `#5D4E66`, line `#E9DFEC`, surface `#FBF7FC`. Status: success `#1E7A46`, warning `#B45309`, error `#B3261E`.
- Fonts: Space Grotesk for headings, Inter for body.
- No AI features. Cherry Berry gets no logo of its own: the kit's logo slots start empty.
- Server routes do auth and Zod parsing only; logic lives in `service.ts`. Errors are `HttpError`/`WorkspaceError` codes sent as `{ error }`. Web errors go through `errorMessage()` copy in `apps/web/src/api.ts`.
- Migrations come only from `pnpm --filter @cherry/server db:generate` after editing `schema.ts`. Never hand-edit `drizzle/`, and never edit `pnpm-lock.yaml`.
- Every task ends green: `pnpm typecheck`, `pnpm test`, and its own e2e spec (`cd apps/web && npx playwright test <spec>`).

## Decisions made for this plan

These are my calls; the user reviews them with the plan.

1. **Who manages kits.** Kits belong to a workspace; it can have several. Owners and admins edit them; everyone else in the workspace can read them.
2. **Rules are applied in the editor, apart from locks.** The rules only matter in a design linked to a kit, and the editor shows them there (swatches, warnings, the Brand checks list). The server enforces only brand locks.
3. **Brand locks.** Each layer has a lock level: `"none"`, `"content"` (only the text of a text layer or the picture of an image layer may change) or `"fixed"`. Owners and admins set it and are never blocked by it. When an editor saves, the server rejects any change to a locked layer with `403 brand_locked`.
4. **No CMYK values and no spot colors on swatches.** Both need ICC profiles and print plates, which belong to Phase 9.
5. **Font family names are typed in.** Reading the name from inside the font file would need a parser dependency, so the name defaults to the file name and the user can change it.
6. **Style guide export uses the browser.** `/brand/:id/guide` is a print-styled page with a "Print or save as PDF" button that calls `window.print()`. Server-side PDF waits for the Phase 7 export worker.
7. **Kit files instead of "Share kit".** Instead of the screen's "Share kit" button, a kit can be downloaded as a `.cherrykit.json` file and imported into another workspace. The file holds colors, typography and rules; logos and font files stay behind.
8. **Templates.**
   - Published from the editor (which also takes the thumbnail).
   - Visible to the workspace, or public.
   - Brand templates are workspace templates linked to a kit.
   - Public templates need CC0 or CC-BY.
   - Every image in a template must be visible wherever the template is visible, or publishing fails with `template_private_assets`.
   - Starting from a template copies its document into a new design and records which visuals it uses.
9. **Approval.** With the "Require approval before publishing" rule on, a brand template published by an editor stays `pending` until an owner or admin approves it.
10. **Public templates can be reported**, like visuals and shapes (the same 3-report hiding rule).

## Review Focus

1. **An editor deletes a brand-locked layer**, or the page that holds it, or swaps the picture of a `"fixed"` image. The save is rejected and the stored design is unchanged. Test in Task 2: `rejects deleting a locked layer's page`.
2. **A public template contains a private or workspace-only visual.** Publishing fails, so nobody starts from a template with images they can't load. Test in Task 4: `refuses a public template with a workspace visual`.
3. **A template is used in a different workspace from the one it was published in.**
   - A workspace template can't be used elsewhere (404).
   - A public template can; the new design opens, its visuals load, and it has no kit.
   - Test in Task 4: `public template used in another workspace drops the kit and links its visuals`.
4. **A file that isn't a font, or is oversized, is uploaded as a font.** It is refused with `invalid_font` or `413`, and nothing is stored. Test in Task 3: `refuses non-font bytes and oversize files`.
5. **A kit is deleted while designs and templates still point at it.**
   - The designs keep working and simply lose their kit; the templates stay.
   - The editor falls back to "Link a brand kit" without crashing.
   - Tests in Task 2 (`deleting a kit unlinks designs`) and Task 7 (e2e `kit deleted while linked`).

---

### Task 1: Brand logic in `@cherry/doc`

**Files:**
- Create: `packages/doc/src/brand.ts`
- Create: `packages/doc/test/brand.test.ts` (match the existing test location in `packages/doc`)
- Modify: `packages/doc/src/schema.ts`: add `brandLock` to `base`
- Modify: `packages/doc/src/index.ts`: export `./brand`

**Interfaces:**
- Produces:
  - **Node field.** `base.brandLock: z.enum(["none","content","fixed"]).default("none")`, so every `CherryNode` has `brandLock`. `CHERRY_FORMAT_VERSION` stays 1, because older documents parse with the default.
  - **Roles.** `ColorRole = z.enum(["primary","secondary","accent","highlight","surface","text","other"])`.
  - **Kit color.** `KitColor = z.object({ id: z.string().min(1).max(40), name: z.string().trim().min(1).max(40), role: ColorRole, hex: /^#[0-9A-Fa-f]{6}$/ })`.
  - **Text style.** `TextStyle = z.object({ fontFamily: z.string().trim().min(1).max(60), fontWeight: z.number().int().min(100).max(900), fontSize: z.number().positive().max(500), lineHeight: z.number().min(0.5).max(4) })`, with `fontSize` in pt.
  - **Kit content.** `BrandKitContent = z.object({ colors: z.array(KitColor).max(40), typography: z.object({ heading, subheading, body }) /* TextStyle each */, logos: z.object({ primary, onDark, mark, wordmark }) /* z.string().nullable() each */, rules: z.object({ kitColorsOnly, warnOffBrandFonts, lockLogos, flagContrast, requireApproval }) /* z.boolean() each */ })`. Export it with `export type BrandKitContent`.
  - **Defaults.** `defaultKitContent(): BrandKitContent` returns:
    - no colors and all logos `null`;
    - heading Space Grotesk 700 32pt / 1.1;
    - subheading Space Grotesk 500 20pt / 1.2;
    - body Inter 400 12pt / 1.5;
    - every rule `true` except `requireApproval: false`.
  - **Contrast.** `contrast(a: string, b: string): number` is the WCAG 2.x ratio of two `#RRGGBB` colors.
  - **Badges.** `colorBadge(hex: string): "AAA text" | "AA text" | "Large text only" | "Background only"`, measured against white: ≥7, ≥4.5, ≥3, otherwise background.
  - **Large text.** `isLargeText(fontSizePt: number, fontWeight: number): boolean` is true for `size >= 18 || (size >= 14 && weight >= 700)`.
  - **Brand issues.** `type BrandIssue = { nodeId: string; kind: "off_kit_color" | "off_brand_font" | "low_contrast"; message: string }` and `brandIssues(page: Page, kit: BrandKitContent): BrandIssue[]`.
    - It walks group children too.
    - `off_kit_color` (only if `rules.kitColorsOnly` is on, and only when the kit has at least one color): a fill or stroke whose hex is not a kit color (case-insensitive).
    - `off_brand_font` (only if `rules.warnOffBrandFonts` is on): a text layer whose `fontFamily` is not one of the three typography families.
    - `low_contrast` (only if `rules.flagContrast` is on): a text layer whose fill, blended with the page background at the layer's opacity × fill opacity, falls below 4.5 (3 for large text) against `page.background.color`.
  - **Brand-lock check.** `brandLockViolation(before: CherryDocument, after: CherryDocument): boolean`. For every node in `before` (any page, any depth) with `brandLock !== "none"`, it finds the node with the same id anywhere in `after`. It returns true if:
    - the node is missing;
    - its `brandLock` changed;
    - it is `"fixed"` and differs at all;
    - it is `"content"` and differs in anything except `name` plus `text` (text layers) or `assetId` (image layers).

    Compare with a deep-equality helper written here (no dependency). Z-order and page order are not compared.
  - **Kit files.** `serializeKitFile(name: string, content: BrandKitContent): string` writes `{ format: "cherry-kit", version: 1, name, colors, typography, rules }`. `parseKitFile(text: string): { ok: true; name: string; content: BrandKitContent } | { ok: false }` validates with Zod and fills in null logos.

- [ ] **Step 1: Write the failing tests** in `brand.test.ts`. Each one fails if the function is missing or wrong.

```ts
it("rates colors against white", () => {
  expect(contrast("#8E1EA2", "#FFFFFF")).toBeCloseTo(7.3, 1);
  expect(colorBadge("#8E1EA2")).toBe("AAA text");
  expect(colorBadge("#C654C3")).toBe("Large text only");
  expect(colorBadge("#FFC0DE")).toBe("Background only");
  expect(colorBadge("#22142A")).toBe("AAA text");
});
it("old documents get brandLock none", () => { /* CherryNode.parse of a rect without brandLock → brandLock "none" */ });
it("flags low-contrast text, honouring large text and opacity", () => {
  // #ED96D7 text on white at 12pt → low_contrast; #C654C3 at 24pt → none; #8E1EA2 at opacity 0.3 → low_contrast
});
it("flags off-kit colors and off-brand fonts only when their rule is on", () => { /* toggle each rule */ });
it("skips the color check for a kit with no colors", () => {});
it("finds issues inside groups", () => {});
it("lets content-locked text and images change content but nothing else", () => {
  // text change → false; x change → true; fill change → true; assetId change on image → false
});
it("blocks any change, removal or unlock of a fixed node, at any depth", () => {
  // fixed rect moved → true; removed → true; brandLock set to "none" → true; fixed child inside a group moved → true
});
it("ignores unlocked nodes and z-order", () => {});
it("round-trips a kit file and rejects junk", () => {
  // parseKitFile(serializeKitFile("Acme", c)) → ok with logos all null; parseKitFile("{}") → ok:false; parseKitFile("nope") → ok:false
});
```

- [ ] **Step 2: Run** `pnpm --filter @cherry/doc test`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `brand.ts` and the schema field as specified above.
- [ ] **Step 4: Run** `pnpm --filter @cherry/doc test && pnpm typecheck`. Expected: PASS. The web code creates nodes in `PathEditor.tsx` and `ShapesPanel.tsx`; if typecheck now fails there, add `brandLock: "none"`.
- [ ] **Step 5: Commit** `feat(doc): brand kit schema, contrast, brand checks and brand-lock comparison`.

---

### Task 2: Server: brand kits, the design↔kit link and brand-lock enforcement

**Files:**
- Modify: `apps/server/src/db/schema.ts`
  - Add `brandKits`: `id` uuid pk; `workspaceId` (fk cascade); `name` text; `content` jsonb not null; `createdBy` fk user; `createdAt`; `updatedAt`; index on `workspaceId`.
  - Add `designs.kitId`: uuid, nullable, fk `brandKits.id` on delete set null.
- Generate: `pnpm --filter @cherry/server db:generate`
- Create: `apps/server/src/brand/service.ts`, `apps/server/src/brand/routes.ts`; register them in `app.ts`
- Modify: `apps/server/src/designs/service.ts`: add `kitId` to `DesignSummary`, `setDesignKit`, and the brand-lock check in `saveDesignState`
- Modify: `apps/server/src/designs/routes.ts`: add `PATCH /api/designs/:id`
- Modify: `apps/server/src/workspaces/errors.ts`: add `brand_locked: 403`
- Test: `apps/server/test/brand.test.ts`

**Interfaces:**
- Consumes: `BrandKitContent`, `defaultKitContent`, `brandLockViolation` (Task 1).
- Produces:
  - **Kit type.** `type BrandKit = { id; workspaceId; name; content: BrandKitContent; fonts: Font[]; updatedAt: string }`. `fonts` is `[]` until Task 3 fills it in.
  - **Routes.** All require membership; otherwise `404 not_found`. Writes need owner or admin; otherwise `403 forbidden`.
    - `GET /api/workspaces/:id/brand-kits` returns `{ kits: BrandKit[] }`, oldest first.
    - `POST /api/workspaces/:id/brand-kits` takes `{ name: 1–60 chars trimmed, content?: BrandKitContent }` and returns `201 { kit }`. A missing `content` means `defaultKitContent()`.
    - `GET /api/brand-kits/:id` returns `{ kit }`.
    - `PUT /api/brand-kits/:id` takes `{ name, content }` and returns `{ kit }`.
    - `DELETE /api/brand-kits/:id` returns `204`.
  - **Logo check.** On create and update, every non-null logo id must be an asset that is not deleted and is either public or a workspace asset of this kit's workspace. Otherwise reply `400 invalid_logo`.
  - **Design link.** `PATCH /api/designs/:id` takes `{ kitId: string | null }`. It needs a non-viewer role; the kit must be in the design's workspace, otherwise `404`. It returns `{ design }` with `kitId`. `GET /api/designs/:id` and the design list include `kitId`.
  - **Brand locks.** In `saveDesignState`, when `role` is `"editor"` and `brandLockViolation(storedDoc, mergedDoc)` is true, throw `WorkspaceError("brand_locked")` before writing. Viewers are already refused; owners and admins are never checked.

- [ ] **Step 1: Write the failing tests** in `brand.test.ts`. Follow `shapes.test.ts` (`setupTestApp`, `signUp`, `workspaceWith(role)`).
  - `creates a kit with defaults and lists it to members`: an admin creates the kit; an editor sees it in `GET`.
  - `only owners and admins change kits`: editor `POST`/`PUT`/`DELETE` returns 403; an outsider gets 404 on all routes.
  - `rejects invalid content`: bad hex, 41 colors, or an unknown role return 400 `invalid_body`.
  - `rejects a logo the workspace can't see`: another user's private asset, or an asset from another workspace, returns 400 `invalid_logo`. A public asset gives 200.
  - `links a design to a kit in its workspace only`: a kit in another workspace returns 404; `null` unlinks.
  - `deleting a kit unlinks designs`: after `DELETE`, `GET /api/designs/:id` has `design.kitId === null`.
  - Brand-lock tests. Build the stored state with `docToY` from a document holding a `"fixed"` rect and a `"content"` text, then save Yjs updates as the editor:
    - `editor may change locked text content`: 200.
    - `editor can't move a fixed layer`: 403 `brand_locked`, and `GET` returns the original state.
    - `rejects deleting a locked layer's page`: 403.
    - `admin may change locked layers`: 200.
- [ ] **Step 2: Run** `pnpm --filter @cherry/server test brand`. Expected: FAIL.
- [ ] **Step 3: Implement.** Edit the schema, generate the migration, then write the service, routes and design changes as specified above. Use the existing `getRole` and `UUID`.
- [ ] **Step 4: Run** `pnpm --filter @cherry/server test && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): brand kits, design kit link and brand-lock enforcement`.

---

### Task 3: Server: kit fonts

**Files:**
- Modify: `apps/server/src/db/schema.ts`
  - Add `brandFonts`: `id` uuid pk; `kitId` (fk brandKits cascade); `family` text; `weight` int; `style` text (`'normal'`/`'italic'`, as a check constraint); `format` text (`'woff2','woff','ttf','otf'`); `sha256`; `bytes` int; `createdBy` fk user cascade; `createdAt`; index on `kitId`.
- Generate the migration.
- Create: `apps/server/src/brand/fonts.ts`, which holds `sniffFont`.
- Modify: `apps/server/src/brand/service.ts`, `routes.ts`. The `BrandKit.fonts` field is now filled in.
- Test: `apps/server/test/fonts.test.ts`

**Interfaces:**
- Produces:
  - **Font type.** `type Font = { id; kitId; family; weight; style: "normal" | "italic"; format; bytes }`.
  - **Sniffing.** `sniffFont(bytes: Uint8Array): "woff2" | "woff" | "ttf" | "otf" | null` reads the first 4 bytes: `wOF2`, `wOFF`, `00 01 00 00` or `true`, and `OTTO`.
  - **Upload.** `POST /api/brand-kits/:id/fonts` takes a multipart upload: one `file` (≤ 5 MB) plus `family` (1–60), `weight` (100–900, a multiple of 100), `style` and `confirmed=true`.
    - It needs owner or admin and returns `201 { font }`.
    - Missing confirmation gives 400 `rights_not_confirmed`, the same code assets use. An unknown sniff gives 400 `invalid_font`. Over 5 MB gives 413.
    - The bytes are stored at `fonts/<sha256>`, which de-duplicates identical files.
    - The route registers its own size limit. The asset routes register `@fastify/multipart` at 50 MB; check whether a per-route `limits` override works, and otherwise check the length after `toBuffer()`.
  - **Delete.** `DELETE /api/fonts/:id` needs owner or admin of the kit's workspace and returns `204`. The stored object is removed when no other font row has the same `sha256`.
  - **Serve.** `GET /api/fonts/:id/file` needs workspace membership. It sends the content type `font/woff2|font/woff|font/ttf|font/otf` with the same `SECURITY_HEADERS` the asset routes use. Export them from `assets/routes.ts` rather than copying them.

- [ ] **Step 1: Write the failing tests:**
  - `uploads a woff2 and serves it to members only`: the bytes are `wOF2` followed by padding. An outsider gets 404 on `/file`. Check the content type and `x-content-type-options`.
  - `refuses non-font bytes and oversize files`: a PNG gives `invalid_font`; 6 MB of `wOF2…` gives 413; `storage` holds no new `fonts/` key either time.
  - `requires rights confirmation`.
  - `editors can't upload or delete fonts`: 403.
  - `kit GET lists its fonts`.
  - `deleting the last font with those bytes removes the object; a second copy keeps it`.
  - `deleting a kit deletes its font rows` (cascade).
- [ ] **Step 2: Run** `pnpm --filter @cherry/server test fonts`. Expected: FAIL.
- [ ] **Step 3: Implement** as specified above.
- [ ] **Step 4: Run** `pnpm --filter @cherry/server test && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): upload, serve and delete brand kit fonts`.

---

### Task 4: Server: templates

**Files:**
- Modify: `apps/server/src/db/schema.ts`
  - Add `templates`:
    - Identity and placement: `id`; `workspaceId` (fk cascade; the publishing workspace); `visibility` (`'workspace'|'public'`); `status` (`'published'|'pending'`, default `'published'`); `kitId` (nullable, fk brandKits, on delete set null).
    - Description: `name`; `category` (`'social','print','presentation','cards','other'`); `license` (`'cc0','cc-by','workspace-only'`); `attribution` (default `''`).
    - Document: `width`; `height`; `unit`; `colorMode`; `state` (bytea).
    - Authorship and indexes: `createdBy` (fk user cascade); `createdAt`; indexes `(visibility, createdAt desc)` and `workspaceId`.
    - Checks:
      - `license = 'workspace-only'` exactly when `visibility = 'workspace'`;
      - `kitId is null or visibility = 'workspace'`;
      - `cc-by` needs a non-empty attribution.
  - Widen the `reports.target_type` check to `('asset','shape','template')`.
- Generate the migration.
- Create: `apps/server/src/templates/service.ts`, `routes.ts`; register them in `app.ts`
- Modify: `apps/server/src/reports/hide.ts` (the `targetType` union), `reports/service.ts` (`visibleTarget` handles `"template"`) and `reports/routes.ts` (the enum)
- Modify: `apps/server/src/workspaces/errors.ts`: add `template_private_assets: 400`
- Test: `apps/server/test/templates.test.ts`

**Interfaces:**
- Consumes: `loadWithRole` (designs), `canSeeAsset` (assets), `getRole`, `notHidden`, `setTitle`/`yToDoc`/`docToY` (doc), `kitId` (Task 2).
- Produces:
  - **Template type.** `type Template = { id; workspaceId; visibility; status; kitId; kitName: string | null; name; category; license; attribution; width; height; unit; colorMode; createdBy; authorName; createdAt; mine: boolean }`.
  - **Publish.** `POST /api/designs/:id/template` takes `{ name 1–80, category, visibility, license, attribution ≤300, kitId?: string | null, thumb: base64 string }` and returns `201 { template }`.
    - It needs a non-viewer role on the design.
    - `kitId` must be a kit of the design's workspace and is only allowed with `visibility: "workspace"`; anything else is `400 invalid_body`.
    - Licensing:
      - A workspace template is always stored as `workspace-only`, whatever license is sent.
      - A public template needs `cc0` or `cc-by`.
      - `cc-by` needs an attribution.
    - The thumb, decoded, is at most 2 MB and must be a PNG that `sharp` reads. It is re-encoded to WebP (at most 480 px, as in `ingest.ts`) and stored at `template-thumbs/<id>.webp`. A bad thumb is `400 invalid_image`.
    - Every image layer's asset must be visible wherever the template will be: public for a public template; public or a workspace asset of the same workspace for a workspace template. Otherwise `400 template_private_assets`.
    - `status` is `pending` when `kitId` is set, that kit's `rules.requireApproval` is on, and the publisher is an editor.
    - `state` is the stored design state at publish time.
  - **List.** `GET /api/templates?scope=workspace&workspaceId=…|scope=public&q&category` returns `{ templates }`.
    - The workspace scope needs membership. It returns that workspace's templates (both visibilities). A `pending` template is shown only to its creator and to owners and admins.
    - The public scope returns published public templates filtered with `notHidden("template", …)`.
    - `q` matches the name or the author's name (`escapeLike`). The list is capped at 200, newest first.
  - **Thumbnail.** `GET /api/templates/:id/thumb` returns `image/webp` with `SECURITY_HEADERS`, to anyone who may list the template.
  - **Use.** `POST /api/templates/:id/use` takes `{ workspaceId }` and returns `201 { design }`.
    - The user must be a non-viewer of `workspaceId`.
    - The template must be published.
    - A workspace template can only be used in its own workspace (404 otherwise).
    - The new design gets the template's state with the title set to the template name, `kitId` = the template's `kitId` only when it is used in the same workspace (else null), and an `asset_uses` row for every image layer's asset.
  - **Approve.** `POST /api/templates/:id/approve` (owner or admin of its workspace) sets `published` and returns `{ template }`.
  - **Delete.** `DELETE /api/templates/:id` (the creator, or an owner or admin of its workspace) returns `204` and removes the thumbnail object.
  - **Reports.** `"template"` targets are accepted. `resolveReport` doesn't need to change: the workspace queue only covers workspace-visibility items, and templates are reported only when public.

- [ ] **Step 1: Write the failing tests:**
  - `publishes a workspace template with a thumbnail` (the thumb is `uniquePng`-style bytes; create a PNG in the test with `sharp`).
  - `viewers can't publish; outsiders get 404`.
  - `refuses a public template with a workspace visual`: put an image layer into the design state with a workspace asset → `template_private_assets`. With a public asset → 201.
  - `public templates need cc0 or cc-by with attribution`.
  - `brand templates must be workspace templates of the same workspace's kit`.
  - `requireApproval keeps an editor's brand template pending until an admin approves`: other editors don't see it; the creator and the admin do; after approval it is used normally; using it while pending gives 404.
  - `use creates a design with the template's content and title`: decode the returned design's state and check the nodes.
  - `public template used in another workspace drops the kit and links its visuals`: `kitId` is null and the asset is readable by a member of the new workspace (`GET /api/assets/:id`).
  - `workspace template can't be used in another workspace`: 404.
  - `three reports hide a public template from others but not its author`.
  - `creator or admin can delete; the thumb object goes too`.
  - `search and category filter the public list`.
- [ ] **Step 2: Run** `pnpm --filter @cherry/server test templates`. Expected: FAIL.
- [ ] **Step 3: Implement** as specified above.
- [ ] **Step 4: Run** `pnpm --filter @cherry/server test && pnpm typecheck`. Expected: PASS, with the existing reports tests unchanged.
- [ ] **Step 5: Commit** `feat(server): publish, list, use, approve and report templates`.

---

### Task 5: Web: Brand kits page

**Files:**
- Modify: `apps/web/src/api.ts`: kit, font and template-list client calls and types; `COPY` entries for `brand_locked`, `invalid_logo`, `invalid_font`, `template_private_assets`
- Modify: `apps/web/src/AppShell.tsx`, `icons.tsx`
  - Add the nav links "Templates" (`/templates`) and "Brand kits" (`/brand`), in the screen-design order: Home, Templates, Visual library, Shapes, Brand kits.
  - Widen `active` to include `"templates" | "brand"`.
  - Add `IconTemplate` and `IconBrand` (stroke SVGs, matching the existing icons).
- Modify: `apps/web/src/App.tsx`: routes `/brand`, `/templates` (a placeholder until Task 9 is fine) and `/brand/:id/guide` (Task 6)
- Create: `apps/web/src/routes/Brand.tsx`
- Create: `apps/web/src/brand/fonts.ts`
- Create: `apps/web/src/brand/fonts.test.ts`
- Modify: `apps/web/src/theme.css`: classes for swatches, slots and toggles. Follow the screen's `.sw`, `.slot` and `.tgl`, using existing tokens.
- Test: `apps/web/e2e/brand.spec.ts`

**Interfaces:**
- Consumes: Task 1 (`colorBadge`, `serializeKitFile`, `parseKitFile`, `defaultKitContent`) and the Task 2 and 3 routes.
- Produces (used by Tasks 6–8):
  - `api.ts` calls: `listKits(workspaceId)`, `createKit(workspaceId, { name, content? })`, `getKit(id)`, `saveKit(id, { name, content })`, `deleteKit(id)`, `uploadFont(kitId, file, { family, weight, style })`, `deleteFont(id)`, `fontUrl(id)`, `setDesignKit(designId, kitId | null)`, plus types `BrandKit` and `Font`; `Design` gains `kitId: string | null`.
  - `brand/fonts.ts`:
    - `BUILT_IN_FONTS = ["Inter", "Space Grotesk", "Georgia", "Arial", "Times New Roman", "Courier New"]`, moved here from `Properties.tsx`, which then imports it.
    - `kitFamilies(kit: BrandKit): string[]`: the built-in fonts plus the families of uploaded fonts, without duplicates.
    - `useKitFonts(kit: BrandKit | null): number`: loads each uploaded font once per page session, by fetching it with credentials and passing the bytes to `new FontFace(family, buffer, { weight, style })`, then `document.fonts.add`. It returns a counter that increases after each font loads. A font that fails to load is skipped silently, and the text falls back to another font.

**Page behaviour** (`/brand`, `AppShell active="brand"`, current workspace via `currentWorkspace.pick`):
- **Header.**
  - A "Brand kit" `<select>` of the workspace's kits, plus "+ New brand kit" for owners and admins, which prompts for a name.
  - Buttons:
    - "Style guide", a link to `/brand/:id/guide`.
    - "Download kit", which saves `serializeKitFile` output as `<name>.cherrykit.json`.
    - "Import kit", a file input; on `parseKitFile`, it creates a new kit from the file; a bad file shows "That file isn't a Cherry Berry kit."
    - "Delete kit", which asks for confirmation.
- **Empty state.** "No brand kit yet." Owners and admins also get a "Create a brand kit" button. Others see: "Ask a workspace owner or admin to create one."
- **Colors card.**
  - Each swatch shows the name · role, the hex, and its `colorBadge`, with the badge colors from the screen design.
  - Owners and admins can add a color (name, role select, `<input type="color">` plus a hex text field) and edit or remove each swatch.
- **Typography card.**
  - Three rows (Heading, Subheading, Body), each with a sample line in that style.
  - Owners and admins edit the family (`kitFamilies`), the weight (100–900) and the size in pt.
  - "Upload font" opens a dialog with the file (`.woff2,.woff,.ttf,.otf`), the family (prefilled from the file name), the weight, italic, and a rights checkbox: "I have the right to use this font in this workspace."
  - Uploaded fonts are listed with "Remove".
- **Logos card.**
  - Four slots with the screen's copy: Primary "SVG or PNG", On dark "SVG or PNG" (on a `#22142A` background), Icon / mark "Square, 512 px+", Wordmark "SVG preferred".
  - An empty slot is a button. It asks `confirm("Only upload a logo your organisation owns. Continue?")`, then opens a file picker and calls `uploadAsset(file, { title: "<kit> logo – <slot>", tags: ["logo"], license: "own", attribution: "", visibility: "workspace", workspaceId })`. Run `precheck` from `library/upload` first.
  - A filled slot shows the thumbnail with "Replace" and "Remove".
- **Brand rules card.** Five `role="switch"` buttons with the exact labels from the screen design. Only owners and admins can toggle them.
- **Brand templates card.**
  - Up to three of the workspace's templates whose `kitId` is this kit, each with a "LOCKED" badge, plus a "See all" link to `/templates`.
  - Empty state: "Publish a design as a brand template from the editor."
- **Saving.** Each change sends the whole kit with `saveKit` immediately. A failure shows `errorMessage` in a `role="alert"` and reloads the kit.
  - `// ponytail: whole-kit PUT, last write wins; add per-field patches if two admins edit at once`.
- **Read-only users.** Editors and viewers see every card without the editing controls.

- [ ] **Step 1: Write the failing tests:**
  - `fonts.test.ts`: `kitFamilies` merges and de-duplicates (`"Inter"` uploaded is listed once).
  - `brand.spec.ts`:
    - `admin builds a kit`: create a kit; add a color `#8E1EA2` ("AAA text" shows), then `#FFC0DE` ("Background only"); set the heading font; toggle a rule off; reload and check it all persisted.
    - `uploads a font and a logo`: the font is a `wOF2`+padding buffer passed to `setInputFiles` and appears in the family list; the logo is `uniquePng()` and its thumbnail shows in Primary; Remove empties it.
    - `download and import a kit file`: download, then import, and the new kit has the same colors.
    - `editor sees the kit read-only`: invite an editor; there is no "+ Add color" and the rule switches are disabled.
- [ ] **Step 2: Run** `pnpm --filter @cherry/web test fonts` and `cd apps/web && npx playwright test brand`. Expected: FAIL.
- [ ] **Step 3: Implement** as described.
- [ ] **Step 4: Run** both again, plus `npx playwright test shell` (the nav changed). Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): brand kits page with colors, typography, fonts, logos and rules`.

---

### Task 6: Web: Printable style guide

**Files:**
- Create: `apps/web/src/routes/StyleGuide.tsx`, route `/brand/:id/guide`, outside `AppShell`
- Modify: `apps/web/src/theme.css`: `@media print` rules: hide `.no-print`, set `@page { margin: 16mm }`, and avoid page breaks inside cards
- Test: add to `apps/web/e2e/brand.spec.ts`

**Interfaces:**
- Consumes: `getKit`, `useKitFonts`, `colorBadge`, `contrast`, `assetUrl`.

**Behaviour:**
- **Header.** Title "<kit name> · Style guide", the workspace name, and a "Print or save as PDF" button (`.no-print`) that calls `window.print()`.
- **Colors.** Large swatches with the name, role, hex, the contrast ratio on white (one decimal) and the badge.
- **Typography.** Each role named with its family, weight and size, and a sample sentence ("The quick brown fox jumps over the lazy dog") in that style once `useKitFonts` has loaded.
- **Logos.** The filled logo slots on their intended backgrounds. Empty slots are left out; if none are filled: "No logos yet."
- **Rules.** The rules that are on, as sentences.
- **Unknown kit.** A missing kit or a non-member gets "This brand kit isn't available." and a link home.

- [ ] **Step 1: Write the failing e2e test** `style guide shows the kit and prints`:
  - Before load, stub `window.print` with `page.addInitScript(() => { (window as any).printed = 0; window.print = () => { (window as any).printed++; }; })`.
  - Then check the heading, a swatch hex, the ratio `7.3:1` for `#8E1EA2`, and that clicking the button sets `printed` to 1.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Implement** the page.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): printable brand style guide`.

---

### Task 7: Editor: Brand tab, kit link, kit fonts and rules

**Files:**
- Create: `apps/web/src/editor/BrandPanel.tsx`
- Modify: `apps/web/src/routes/Editor.tsx`
  - Add a fourth left tab, "Brand".
  - Load the linked kit (`getKit(design.kitId)`; if it fails, treat the design as unlinked).
  - Call `useKitFonts`.
  - Pass the kit to Canvas and Properties.
- Modify: `apps/web/src/editor/Canvas.tsx`
  - Key the layer that holds the content on `fontsVersion`, so text re-measures once fonts load.
  - Logo layers keep their aspect ratio when resized (`Transformer` `keepRatio`) when `kit.content.rules.lockLogos` is on and the image's `assetId` is one of the kit's logos.
- Modify: `apps/web/src/editor/Properties.tsx`
  - The font list comes from `kitFamilies(kit)` when a kit is linked.
  - With `kitColorsOnly` on and kit colors present, the fill and stroke color inputs become a row of kit swatch buttons (`aria-label` = color name) instead of the free picker.
  - The Page section gets a "Brand kit" select (non-viewers) that calls `setDesignKit`.
- Modify: `apps/web/src/editor/VisualsPanel.tsx`: export its `insert` logic as `placeAsset(ydoc, page, designId, asset, act, onSelect): Promise<string | null>` (returns an error message or null), so BrandPanel can reuse it.
- Test: `apps/web/e2e/brand-editor.spec.ts`

**Interfaces:**
- Consumes: `brandIssues`, `kitFamilies`, `useKitFonts`, `setDesignKit`, `listKits`, `getKit`.
- Produces: `BrandPanel({ ydoc, page, kit, designId, workspaceId, readOnly, act, selected, onSelect, onLinked(kitId) })`.

**BrandPanel behaviour:**
- **No kit linked.** "This design isn't linked to a brand kit." For non-viewers, a select of the workspace's kits ("Link a brand kit") that calls `setDesignKit`. If there are no kits, a link to `/brand`.
- **Colors.** Clicking a swatch sets the solid fill of every selected layer that is unlocked and has a fill (rect, ellipse, path, text), as one undo step. With nothing selected it does nothing and says "Select a layer first".
- **Text styles.** Clicking Heading, Subheading or Body applies that style's family, weight, size and line height to the selected text layers. With no text layer selected, it adds a text layer "Heading" (or the role name) in that style, centred on the page, and selects it.
- **Logos.** Filled slots as thumbnails; clicking one places it with `placeAsset`.
- **Brand checks.**
  - The list of `brandIssues(page, kit.content)`. Each row is a button that selects that layer.
  - Empty state: "No brand issues on this page."
  - A live count shows on the tab, e.g. "Brand (2)".

- [ ] **Step 1: Write the failing e2e tests:**
  - `links a kit and applies its styles`:
    - Through the API, create a kit with colors `#8E1EA2` and `#22142A`, then create a design.
    - In the Brand tab, link the kit, add a heading via the Heading style, and check the text layer exists in Layers.
    - Select a rect and click the "Ink" swatch; the Properties fill hex reads `#22142A`.
  - `flags low contrast and off-brand fonts`:
    - Add text with fill `#FFC0DE`; the checks list shows a low-contrast issue.
    - Clicking the issue selects that layer.
    - Change the font to Georgia and an off-brand font issue appears.
  - `kit colors only replaces the picker`: with the rule on, Properties shows swatch buttons and no color input.
  - `kit deleted while linked`: delete the kit through the API, reload the editor, and the Brand tab shows "Link a brand kit" with no error.
- [ ] **Step 2: Run** `npx playwright test brand-editor`. Expected: FAIL.
- [ ] **Step 3: Implement** as described.
- [ ] **Step 4: Run** `npx playwright test brand-editor editor visuals`, plus `pnpm --filter @cherry/web test`. Expected: PASS, with the existing editor specs unchanged.
- [ ] **Step 5: Commit** `feat(editor): brand tab with kit colors, text styles, logos and brand checks`.

---

### Task 8: Editor: Brand locks

**Files:**
- Modify: `apps/web/src/editor/Properties.tsx`: owners and admins get a "Brand lock" select (`Off` / `Content editable` / `Fixed`) on any selected layer, which sets `brandLock`.
- Modify: `apps/web/src/editor/Canvas.tsx`, `Layers.tsx`, `routes/Editor.tsx`, `VisualsPanel.tsx`, `BrandPanel.tsx`
- Create: `apps/web/src/editor/brandLock.ts`
- Create: `apps/web/src/editor/brandLock.test.ts`
- Test: `apps/web/e2e/brand-lock.spec.ts`

**Interfaces:**
- Consumes: `role` from `useDesign` (`d.role`), `brandLock` (Task 1).
- Produces:
  - `canMove(n: CherryNode, role: Role): boolean`: false for an editor when `n.brandLock !== "none"`.
  - `canEditContent(n, role): boolean`: false for an editor when `n.brandLock === "fixed"`.
  - `canDelete(n, role): boolean`: false for an editor when `n.brandLock !== "none"`.
  - All three are always true for owners and admins.

**Behaviour for editors:**
- **Fixed layers** behave like locked ones: they can't be selected on the canvas, and the Layers lock toggle is disabled with the title "Locked by the brand template".
- **Content layers** can be selected but not dragged or transformed. Delete, nudge, Ctrl+D, Ctrl+[/], the Layers lock and hide toggles, Properties geometry and style fields, and BrandPanel's color and style buttons all skip them.
- **Text in a content layer** can still be edited by double-clicking.
- **Images in a content layer.** If exactly one is selected, clicking a visual in the Visuals panel or a logo in the Brand tab replaces its `assetId` (keeping its box) instead of adding a new layer.
- **Layers list.** Locked layers show a small "Brand" badge.
- **If the server still refuses** a save with `brand_locked`, the existing status line shows the `COPY` text "This layer is locked by the brand template." and the existing reload button appears.

- [ ] **Step 1: Write the failing tests:**
  - `brandLock.test.ts`: the three predicates across the four roles and three lock levels.
  - `brand-lock.spec.ts`. An owner sets a rect to Fixed and a text to Content editable, then invites an editor. The editor:
    - can't select the rect by clicking it;
    - can't delete or move the text (pressing Delete leaves it in Layers);
    - can change the text by double-clicking, and the change is saved ("Saved");
    - sees an image placed into a content-locked image layer replace that layer's picture: the layer count is unchanged.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** the predicates and wire them into each place listed above.
- [ ] **Step 4: Run** `pnpm --filter @cherry/web test`, `npx playwright test brand-lock editor`, and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(editor): brand-locked layers for editors`.

---

### Task 9: Web: Templates page and publishing

**Files:**
- Create: `apps/web/src/routes/Templates.tsx`, which replaces the Task 5 placeholder
- Create: `apps/web/src/editor/PublishDialog.tsx`
- Modify: `apps/web/src/editor/Canvas.tsx`
  - Add a prop `snapRef: MutableRefObject<(() => string) | null>`, which Canvas sets to a function returning a PNG data URL of the page area only: background plus layers, no selection or transformer, longest side ≤ 600 px.
- Modify: `apps/web/src/routes/Editor.tsx`
  - Add a "Publish" header button for non-viewers, which opens `PublishDialog`.
  - Open the dialog automatically when the URL has `?publish=1`.
- Modify: `apps/web/src/api.ts`: `publishTemplate`, `listTemplates`, `useTemplate` (name it `startFromTemplate`, so it doesn't look like a React hook), `approveTemplate`, `deleteTemplate`, `templateThumbUrl`
- Modify: `apps/web/src/library/ReportDialog.tsx`: accept `targetType: "template"`
- Test: `apps/web/e2e/templates.spec.ts`

**Interfaces:**
- Consumes: the Task 4 routes and `snapRef`.

**PublishDialog:**
- Fields:
  - Name (defaults to the design title).
  - Category, with these labels: Social, Print, Presentations, Cards & invites, Other.
  - Where: "This workspace" or "Everyone (public)".
  - For public: License (CC0 / CC-BY, plus attribution when CC-BY) and the checkbox "I have the right to share everything in this design."
  - For "This workspace": "Brand kit" (none or a kit), defaulting to the design's kit.
- Submit is disabled with the text "Waiting for changes to save…" until `d.status === "saved"`.
- When the result is pending, it says "Sent for approval. An owner or admin will review it."; otherwise "Published", with a link to `/templates`.
- Errors go through `errorMessage`.

**Templates page** (`AppShell active="templates"`):
- **Header.** "Templates", the subtitle "Made and shared by the community and your workspace.", and "Publish a template". That button opens a dialog listing the workspace's designs; picking one navigates to `/d/:id?publish=1`.
- **Filters.** Search (debounced, as the Shapes page does) and category chips: All, Social, Print, Presentations, Cards & invites, Brand templates. "Brand templates" means `kitId !== null`.
- **Sections:**
  - "Waiting for approval", shown only when non-empty. Each card has Approve and Delete for owners and admins.
  - "<workspace name>": the workspace templates.
  - "Community": the public templates.
- **Card.**
  - The thumbnail and name.
  - A "LOCKED LAYOUT" badge when it has a kit.
  - A meta line: "<w × h unit>", plus "· <kit name>" for brand templates, or "by <author> · CC0/CC-BY" for community templates.
  - The whole card is a button "Use <name>" that calls `startFromTemplate` with the current workspace and navigates to `/d/:id`.
  - For viewers the button is disabled with the note "Viewers can't create designs".
  - A Delete button for the author, owners and admins; a Report button on community cards that aren't the user's own.
- **Empty states.** "No templates here yet." and "No templates match your search."

- [ ] **Step 1: Write the failing e2e tests:**
  - `publish a workspace template and start from it`:
    - Make a design with a rect, then Publish to "This workspace" as Social.
    - On `/templates` the card shows with a thumbnail whose `naturalWidth > 0`.
    - Using it opens the editor with the rect and the template's name as the title.
  - `brand template keeps its locks`:
    - The owner locks a layer as Fixed, links a kit, and publishes it as a brand template.
    - An editor starts from it; the badge "LOCKED LAYOUT" was shown, and the rect can't be selected.
  - `requires approval when the kit says so`: with `requireApproval` on, an editor publishes and sees "Sent for approval"; the owner sees it under "Waiting for approval" and approves it; the editor then sees it in the workspace section.
  - `public template with a workspace visual is refused`: the dialog shows the `template_private_assets` copy, "Every visual in a public template must be public. Make them public or publish to this workspace."
  - `community template from another workspace`: user B uses user A's public template in B's own workspace, and the design opens.
  - `viewer can browse but not use`.
- [ ] **Step 2: Run** `npx playwright test templates`. Expected: FAIL.
- [ ] **Step 3: Implement** as described.
- [ ] **Step 4: Run** the full suites: `pnpm typecheck`, `pnpm test`, `cd apps/web && npx playwright test`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(web): templates page and publish from the editor`.

---

## Self-review notes

**Spec coverage:**
| Spec item | Task |
|---|---|
| Kits: colors with roles and contrast | 1, 5 |
| Fonts, including uploads | 3, 5, 7 |
| Logo slots | 2, 5, 7 |
| Locked templates | 1, 2, 8, 9 |
| Brand rules | 1, 5, 7, plus the approval rule in 4 and 9 |
| Style-guide export | 6 |
| Template publishing | 4, 9 |

The screen's CMYK values, spot color and "Share kit" are covered by decisions 4 and 7.

**Out of this phase:**
- The Home page has no "start from template" shortcut; the Templates page covers it.
- There is no workspace-level setting for who may publish public templates; Phase 9's instance admin covers that.
