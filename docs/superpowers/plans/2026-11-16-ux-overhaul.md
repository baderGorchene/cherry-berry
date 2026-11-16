# UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Cherry Berry feel as good as Canva or better (without copying it): starter content, more fonts, a new Home and Create dialog, an editor where the design gets the space and settings live in a context toolbar, and tidier asset pages.

**Architecture:**
- **Starter templates and font catalogue:** pure data in `@cherry/doc`, shared by the web app and the server's export renderer.
- **One new server endpoint:** it imports a `.cherry` document as a new design. Both "Open a .cherry file" and "Use" on a starter template go through it, so starters need no database rows.
- **Web:** the Create dialog becomes a component over Home. The editor's left side becomes one icon rail with one wide panel. The right-hand Properties panel is replaced by a context toolbar, a Position popover, a selection mini-menu and a colour popover.

**Tech Stack:** React 19, react-router, Konva, Yjs, plain CSS (`theme.css`, `editor/editor.css`), Fastify, Zod, `@fontsource/*`, skia-canvas, Vitest, Playwright (Edge).

**Spec:** `docs/superpowers/specs/2026-11-16-ux-overhaul-design.md` (approved; Decisions 1–7 are binding). Project spec: `docs/superpowers/specs/2026-11-11-cherry-berry-design.md`.

## Global Constraints

- **Palette:** `#8E1EA2` berry, `#C654C3` orchid, `#ED96D7` blush, `#FFC0DE` petal, through the `theme.css` tokens. Text contrast ≥ 4.5:1.
- **Type:** Space Grotesk headings, Inter body. Light theme only.
- **Not a copy of Canva.** No Canva wording, no platform brand logos as icons (generic icons; sizes may be named "Instagram post"). No logo, no mascot, no user-facing AI, no upsell surfaces.
- **No dead ends:** nothing may lead to an unbuilt feature. No video, whiteboard, sheet, website, code or email types.
- **Document features:** no new ones beyond what the toolbar exposes from the existing `.cherry` model (no italic, underline, lists, effects, animation or crop).
- **Dependencies:** new ones only via `pnpm add`. Fonts are OFL and come from `@fontsource/*`. No colour-picker library. Never hand-edit `pnpm-lock.yaml` or migrations.
- **Keyboard:** every toolbar control, popover, panel and dialog can be reached and closed by keyboard. Escape closes a popover or dialog and returns focus to its opener. Editor single-key shortcuts (V, T, R, O, L, P, A, Delete, arrows, Ctrl+Z…) keep working whenever focus is not in a text field.
- **Viewer role:** every control that edits stays disabled or absent exactly as today. Panels still open for browsing.
- **Targets and focus:** interactive targets ≥ 44px on app pages and ≥ 34px for compact editor controls. Visible focus ring `outline: 3px solid var(--blush)`.
- **Phone:** the breakpoint stays `max-width: 759px`. At 375×812 there is no horizontal page scroll.
- **Tests:** accessible names used by e2e specs change only where a task says so, and the specs change in the same commit.
- **Every task ends green on:**
  - `pnpm typecheck` (repo root);
  - `pnpm test`;
  - `cd apps/web && npx playwright test` (full suite on its own ports 3101/5181; never touch the user's 3000/5173).
  - Don't run Playwright at the same time as the server unit suite.
- **Screenshots:** each UI task takes screenshots at 1280×800 and 375×812 with a throwaway spec (not committed) and says in the report what was checked.

## Review Focus

1. **Mixed page sizes.** Insert a 1080×1920 px story template into an A4 mm design. Both pages keep their own size, unit and colour mode; Fit zooms correctly on each page; the page strip shows both; export of all pages succeeds. Pinned in Task 6 (unit test for `insertPages` plus an e2e).
2. **Hostile or broken `.cherry` import.** Invalid JSON, a newer `version`, a schema violation, 3,000 nested groups, a body over the limit, and unknown asset ids. Each gives a plain error or a missing-image placeholder, never a 500 and never a half-created design. Pinned in Task 2 (server) and Task 4 (dialog message).
3. **Viewer role** in the new surfaces:
   - the rail panels open;
   - the insert buttons in Templates, Elements, Text and Uploads are disabled;
   - the context toolbar is read-only or absent;
   - the Create dialog's size cards and Open file are disabled.
   Pinned in Tasks 4, 6 and 7.
4. **Keyboard and focus with the new popovers.** The File menu, colour popover, Position popover and spacing popover open with Enter, close with Escape and return focus. Typing in the toolbar's font-size field does not trigger single-key shortcuts. Pinned in Task 7.
5. **Phone at 375×812:**
   - Home, the Create dialog and the editor have no horizontal page scroll;
   - the context toolbar scrolls within itself;
   - panels open as bottom sheets.
   Pinned in Tasks 5, 6 and 7.

---

### Task 1: Font catalogue (web + export)

**Files:**
- Create: `packages/doc/src/fonts.ts`; export it from `packages/doc/src/index.ts`
- Modify: `apps/server/src/export/fonts.ts` (register every catalogue family; today only Inter and Space Grotesk)
- Modify: `apps/web/src/brand/fonts.ts` (`BUILT_IN_FONTS` derives from the catalogue), `apps/web/src/main.tsx` or a new `apps/web/src/fonts.css` (import the `@fontsource` CSS for each family and weight)
- Modify: `apps/server/package.json`, `apps/web/package.json` via `pnpm add`
- Test: `packages/doc/test/fonts.test.ts`, `apps/server/test/export.fonts.test.ts` (or extend the existing export font test), `apps/web/src/brand/fonts.test.ts`

**Interfaces:**
- Produces:
  - `export type FontRole = "sans" | "serif" | "display" | "script" | "mono"`
  - `export type CatalogueFont = { family: string; role: FontRole; weights: number[]; pkg: string }`
  - `export const FONTS: CatalogueFont[]`
  - `BUILT_IN_FONTS` (web) = `FONTS` families, then `"Georgia", "Arial", "Times New Roman", "Courier New"`.

- [ ] **Step 1: Write failing tests**
  - `fonts.test.ts`: `FONTS` has ≥ 12 entries; it includes `Inter` and `Space Grotesk`; it has at least one of each role; family names are unique; every `weights` array is non-empty and a subset of `[400, 500, 600, 700]`.
  - Server: after the existing `loadBuiltInFonts()` (or whatever registers Inter today), `FontLibrary.has(f.family)` is true for every `FONTS` entry. Exporting a one-text-node design in `Playfair Display` gives a PNG different from the same design in `Inter`.
  - Web: `BUILT_IN_FONTS[0] === "Inter"`, and it contains every `FONTS` family.
- [ ] **Step 2: Run them and see them fail** (`pnpm --filter @cherry/doc test -- fonts`, `pnpm --filter @cherry/server test -- fonts`).
- [ ] **Step 3: Add the families and implement.**
  - `pnpm add` the `@fontsource` packages in both `apps/web` and `apps/server`.
  - Pick ~10 beyond the two existing families, e.g. Poppins, Montserrat, DM Sans (sans); Playfair Display, Lora (serif); Bebas Neue, Abril Fatface (display); Dancing Script, Pacifico (script); JetBrains Mono (mono).
  - Register them the same way the server registers Inter (latin + latin-ext woff2).
  - On the web, import each `@fontsource/<pkg>/<weight>.css`.
  - The editor's font picker lists the built-in families first, then the brand kit's fonts. Each family is shown in its own face.
- [ ] **Step 4: Tests pass; the font picker in the editor lists the new families.** Check by screenshot.
- [ ] **Step 5: Commit** `feat: font catalogue shared by editor and export`.

### Task 2: Import a `.cherry` document as a new design (server + api)

**Files:**
- Modify: `apps/server/src/designs/service.ts`, `apps/server/src/designs/routes.ts`, `apps/web/src/api.ts`
- Test: `apps/server/test/designs.import.test.ts`

**Interfaces:**
- Consumes: `parseCherry(text): ParseResult` and `docToY` from `@cherry/doc`; the asset-linking rule in `templates/service.ts` `useTemplate` (link only assets that are `usableInDesign`).
- Produces:
  - Route `POST /api/workspaces/:id/designs/import`, body `{ text: string }`, `bodyLimit` 10 MB → `201 { design: DesignSummary }`.
  - `importDesign(db, userId, workspaceId, doc: CherryDocument): Promise<DesignSummary>`: title from `doc.title`; width, height, unit and colour mode from page 1; a fresh document `id`.
  - Errors: 400 `{error: "invalid_json" | "newer_version" | "invalid_document"}`, 403 `forbidden` for viewers, 404 for non-members, 413 over the limit.
  - Web: `importDesign(workspaceId: string, text: string): Promise<Design>`, and `COPY` entries for the three 400 codes:
    - "That file isn't a .cherry file."
    - "This file was made with a newer Cherry Berry. Update this server to open it."
    - "This .cherry file is damaged and can't be opened."

- [ ] **Step 1: Write failing tests**
  - A valid two-page doc gives 201. Opening the design returns both pages, the same node count and the new title.
  - `"{"` → `invalid_json`; `version: 99` → `newer_version`; a missing `pages` → `invalid_document`.
  - 3,000 nested groups → `invalid_document`, not 500.
  - Viewer → 403. Non-member → 404.
  - An image node with an unknown asset id still imports (201), and no `asset_uses` row is created for it.
  - An image whose asset is usable gets an `asset_uses` row.
  - In every error case, the design count in the workspace is unchanged.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement** `importDesign` in the service and the thin route (auth plus Zod `{ text: z.string() }` only).
- [ ] **Step 4: Tests pass.**
- [ ] **Step 5: Commit** `feat: import .cherry files as new designs`.

### Task 3: Starter template module (seed set)

**Files:**
- Create: `packages/doc/src/starter/index.ts` plus one file per template (`packages/doc/src/starter/<id>.ts` returning a `CherryDocument`); export from `packages/doc/src/index.ts`
- Test: `packages/doc/test/starter.test.ts`

**Interfaces:**
- Consumes: `FONTS` (Task 1); the shape path data from `apps/web/src/editor/elements.ts`. Move the catalogue's path data into `@cherry/doc` (e.g. `packages/doc/src/elements.ts`) if a template needs it, and re-export it to the web so there is one copy.
- Produces:
  - `export type StarterCategory = "social" | "presentation" | "print" | "cards"`
  - `export type StarterTemplate = { id: string; name: string; category: StarterCategory; doc: CherryDocument }`
  - `export const STARTER_TEMPLATES: StarterTemplate[]` (ids are `starter-<slug>`)

- [ ] **Step 1: Write failing tests** that apply to every entry, so Task 9's additions are covered automatically:
  - `CherryDocument.safeParse(doc).success`.
  - No `image` nodes anywhere, including inside groups.
  - Every text node's `fontFamily` is in `FONTS`.
  - Every node's box lies within the page (bleed allowed).
  - Ids and names are unique.
  - Each template uses ≥ 2 font families.
  - Print and cards templates are CMYK with `bleed ≥ 3` mm.
  - `serializeCherry` → `parseCherry` round-trips.
  - Exactly 4 entries, one per category, for now (Task 9 changes this count).
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Author 4 templates**, one per category, at sizes from Task 4's catalogue:
  - a 1080×1350 px social post;
  - a 1920×1080 px two-page presentation;
  - an A4 CMYK flyer;
  - a 5×7 in invitation.
  Use the palette or a tasteful accent palette, catalogue shapes (blobs, sparkles, badges) and real-looking placeholder copy.
- [ ] **Step 4: Tests pass.** Render each with the export renderer (any throwaway script), look at the PNGs, and say in the report that they look finished.
- [ ] **Step 5: Commit** `feat: starter templates (seed set)`.

### Task 4: Create a design dialog

**Files:**
- Create: `apps/web/src/create/sizes.ts`, `apps/web/src/create/CreateDialog.tsx`, `apps/web/src/create/create.css` (or extend `theme.css`)
- Modify:
  - `apps/web/src/AppShell.tsx`: provide the dialog; the sidebar "Create a design" and the phone + button open it.
  - `apps/web/src/routes/NewDesign.tsx`: `/new?category=<c>` renders Home with the dialog open.
  - `apps/web/src/App.tsx`
  - `apps/web/src/routes/Home.tsx`: `PRESETS` moves out to `sizes.ts`.
- Test: `apps/web/src/create/sizes.test.ts`; e2e `apps/web/e2e/create.spec.ts`, plus updates to the specs that create designs through `/new` or the Home presets.

**Interfaces:**
- Consumes: `importDesign` (Task 2); `createDesign`.
- Produces:
  - `export type SizeCategory = "social" | "presentation" | "print" | "cards"`
  - `export type Size = { id: string; name: string; category: SizeCategory; width: number; height: number; unit: "px" | "mm" | "in"; colorMode: "rgb" | "cmyk"; bleed: number }`
  - `export const SIZES: Size[]`; `export const POPULAR: string[]`
  - `export function filterSizes(q: string): Size[]`
  - `export function recentSizes(): Size[]`; `export function rememberSize(id: string): void` (localStorage key `cb.recentSizes`, last 6, every access in try/catch)
  - `export type CreatePane = "for-you" | SizeCategory | "custom" | "open"`
  - `useCreateDialog(): { open(pane?: CreatePane): void }`, from a context in `AppShell`.
- Ruling for test stability: the 1080×1080 card is named **"Social post"** (the spec's "Square post") and A4 portrait is named **"A4 print"**. Existing specs that use `/Social post/` and "A4 print" keep working.

- [ ] **Step 1: Write failing tests**
  - `sizes.test.ts`: `SIZES` contains every size in spec Decision 4 with those exact dimensions and units. Every print and cards size is CMYK with `bleed: 3` (mm), or the in-equivalent for inch sizes. Ids are unique. `POPULAR` = Instagram post, Story, Presentation 16:9, A4 print, Business card. `filterSizes("post")` returns only names containing "post", case-insensitive. `rememberSize` dedupes, keeps 6 and survives a throwing `localStorage`.
  - e2e:
    - The sidebar "Create a design" opens `dialog` "Create a design".
    - Its categories are `tab`s named For you, Social media, Presentations, Print, Cards & invites, Custom size, Open a .cherry file.
    - Choosing "Social post" opens the editor at 1080 × 1080 px.
    - Escape closes the dialog and focus returns to the opener.
    - "Open a .cherry file" with a fixture opens the imported design; a broken file shows "This .cherry file is damaged and can't be opened."
    - A viewer sees the size cards and Open file disabled.
    - At 375×812 the dialog has no horizontal scroll.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement the dialog** per spec Decision 4:
  - a modal with a left category list and a top search;
  - size cards with a proportional generic preview, name and dimensions;
  - Custom size keeps today's form;
  - "For you" shows recents, then popular.
- [ ] **Step 4: Tests pass**, and the full suite is green. Take screenshots.
- [ ] **Step 5: Commit** `feat: create-a-design dialog with sizes and .cherry import`.

### Task 5: Home

**Files:**
- Modify: `apps/web/src/routes/Home.tsx` (split into `apps/web/src/home/*.tsx` if it passes ~250 lines), `apps/web/src/theme.css`, `apps/web/src/AppShell.tsx` (phone header)
- Test: `apps/web/src/routes/Home.test.ts`, `apps/web/e2e/shell.spec.ts`, `apps/web/e2e/onboarding.spec.ts`, plus updates where Home names change

**Interfaces:**
- Consumes: `useCreateDialog` (Task 4), `STARTER_TEMPLATES` (Task 3), `listTemplates("public")`, `importDesign` (to use a starter: `serializeCherry(t.doc)` → `importDesign`, then open the editor), `DocPreview` (live previews of starters and recents).
- Produces: `export function searchHome(q: string, designs: Design[], templates: { id: string; name: string }[]): { designs: Design[]; templates: { id: string; name: string }[] }` (client-side, case-insensitive substring).

- [ ] **Step 1: Write failing tests**
  - `Home.test.ts`: `searchHome` matches designs and templates separately and is case-insensitive; an empty query returns no results.
  - e2e:
    - The hero title is "What are you making today?".
    - One search box, named "Search designs and templates", shows grouped results.
    - The shortcut row has buttons Social post, Story, Presentation, Flyer, Poster, Business card, Invitation, Custom size, Open file, and each opens the dialog on its pane.
    - "Continue designing" lists recent designs with title and size.
    - Using a starter template from "Start from a template" opens the editor with its content.
    - A new user with no designs sees the welcome line, and the template row comes first.
    - There is exactly one "New design"/"Create a design" control per breakpoint, and exactly one avatar on the phone.
    - At 375×812 there's no horizontal scroll, and the search icon sits inside the search box (its bounding box is within the input's).
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement** spec Decision 3:
  - hero gradient band, search, shortcut row;
  - Continue designing grid with large previews and the ⋯ menu as today;
  - Start from a template row (starters first, then public);
  - Browse by category cards linking to `/templates?category=…`;
  - first-run layout;
  - remove the duplicate New design button and the workspace/role tag;
  - phone header fixes.
- [ ] **Step 4: Tests pass** and the full suite is green. Take screenshots.
- [ ] **Step 5: Commit** `feat: new home`.

### Task 6: Editor shell — top bar, icon rail with content panels, page header, bottom bar

**Files:**
- Modify: `apps/web/src/routes/Editor.tsx`, `apps/web/src/editor/editor.css`, `apps/web/src/editor/Toolbar.tsx` (removed or reduced to the Draw panel's tools), `Pages.tsx`, `Layers.tsx`, `ShapesPanel.tsx` (becomes the Elements panel), `VisualsPanel.tsx` (becomes the Uploads panel), `PathPanel.tsx` (lives in Draw)
- Create: `apps/web/src/editor/Rail.tsx`, `TemplatesPanel.tsx`, `TextPanel.tsx`, `textPresets.ts`, `BottomBar.tsx`, `PageHeader.tsx`, `FileMenu.tsx`
- Modify: `packages/doc/src/ops.ts` (`insertPages`)
- Test: `packages/doc/test/ops.test.ts`, `apps/web/src/editor/textPresets.test.ts`; e2e `editor.spec.ts`, `mobile-editor.spec.ts` and every spec using the old tab names

**Interfaces:**
- Consumes: `STARTER_TEMPLATES`; `listTemplates`; `FONTS`; the existing panels' props.
- Produces:
  - `insertPages(ydoc: Y.Doc, pages: Page[], after: string): string[]`: fresh ids for the pages and all nodes; each page keeps its own width, height, unit, colour mode and bleed; returns the new page ids; one undoable transaction.
  - `export type RailItem = "templates" | "elements" | "text" | "uploads" | "brand" | "draw" | "layers"`
  - `presetText(kind: "heading" | "subheading" | "body", page: Page, center: { x: number; y: number }, measure: (text: string, font: string, size: number, weight: number) => number): CherryNode`
    - Font height ratio of page height: heading 0.08, subheading 0.045, body 0.025, using the units convention `createText` uses.
    - Weight: heading 700, subheading 600, body 400.
    - Box width = measured text width plus a small padding, capped to the page width minus margins.
    - Centred on `center`.
  - `T`-key text and the Text tool use `presetText("body", …)` sizing at the click point.
  - **Accessible names (tests change in this commit):**
    - Rail `navigation` "Editor panels" with `button`s Templates, Elements, Text, Uploads, Brand, Draw, Layers (`aria-pressed`).
    - Each panel is a `complementary` named "<Item> panel". "Shapes panel" becomes "Elements panel"; "Visuals panel" becomes "Uploads panel"; "Layers" becomes "Layers panel".
    - Top bar: `button` "File" opens `menu` "File" with Rename, Page size and colour mode, History, Publish as template, Open a .cherry file, Export. "Export" (primary) and "Share" stay as buttons.
    - Bottom bar: `navigation` "Pages" with page thumbnails `button` "Page N", `button` "Add page", a `slider` "Zoom", `button` "Fit", `button` "Grid view".
    - Page header: the page name `textbox` "Page name", with buttons Move page up, Move page down, Duplicate page, Delete page, Add page.
- This task keeps today's right-hand Properties panel unchanged. Task 7 replaces it.

- [ ] **Step 1: Write failing tests**
  - `ops.test.ts` `insertPages`:
    - inserting a 1080×1920 px RGB page after an A4 mm CMYK page gives 2 pages with their own sizes;
    - all ids are new and differ from the source;
    - one `undo()` removes both inserted pages.
  - `textPresets.test.ts`:
    - on a 1920×1080 px page, the heading's rendered height ≈ 86.4 px (±1);
    - the box stays within the page for a 200-character body text;
    - the result is centred on `center`.
  - e2e:
    - Each rail button opens its panel, and clicking it again closes the panel.
    - Text panel "Add a heading" inserts a heading that is fully inside the page.
    - Templates panel lists "Fits this page" first. Inserting a starter of another size adds pages, and Fit works on each. (Review Focus 1: the page strip shows both pages, and export of all pages succeeds.)
    - The page name can be edited.
    - The zoom slider changes the zoom.
    - A viewer can open every panel, but its insert buttons are disabled.
    - Phone: the rail is a bottom bar, panels open in a sheet, and there's no horizontal scroll.
    - The old shortcuts V/T/R/O/L/P still work.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement** spec Decision 5's top bar, rail and panels, page header and bottom bar; the phone rail and sheets; and the new text defaults.
  - Templates panel: two groups, "Fits this page" (same unit, aspect within 2%) and "Other sizes", showing starters plus public and workspace templates.
  - Using a template calls `insertPages` after the current page and switches to the first inserted page.
  - Text panel, top to bottom:
    - "Add a heading", "Add a subheading" and "Add a little body text";
    - the linked brand kit's fonts and colours, if any;
    - about 6 font pairings from `FONTS` (heading plus body text in two fonts, inserted as a group).
- [ ] **Step 4: Tests pass**, the full suite is green, and the specs are updated for the renamed panels. Take screenshots.
- [ ] **Step 5: Commit** `feat: editor rail, content panels, page header and bottom bar`.

### Task 7: Context toolbar, Position popover, selection menu, colour popover

**Files:**
- Create: `apps/web/src/editor/ContextToolbar.tsx`, `PositionPopover.tsx`, `SelectionMenu.tsx`, `ColorPopover.tsx`, `Popover.tsx` (shared: anchored, Escape closes, focus returns)
- Delete: `apps/web/src/editor/Properties.tsx` (its pieces move per spec Decision 7)
- Modify: `apps/web/src/routes/Editor.tsx`, `editor.css`
- Test: `apps/web/src/editor/contextToolbar.test.ts` (pure helpers); e2e `editor.spec.ts`, `brand-lock.spec.ts`, `brand-editor.spec.ts`, `shapes.spec.ts`, `library.spec.ts` and every spec using `complementary "Properties"`

**Interfaces:**
- Consumes: the editor's `act`, `updateNode`, combine and convert helpers from `pathEdit`, the brand-lock helpers, and `KitSelect`. Everything Properties used today.
- Produces:
  - `toolbarKind(nodes: CherryNode[]): "none" | "text" | "shape" | "path" | "image" | "group" | "multi"`
  - `boldWeight(current: number, available: number[]): number` (toggles toward 700 or 400, falling back to the nearest available weight)
  - **Accessible names (tests change in this commit):**
    - The context bar is `toolbar` "Selection".
    - Popovers are `dialog`s named "Position", "Text spacing", "Fill colour", "Stroke colour", "Text colour", "Background colour" and "Image info".
    - Within Position, the existing field labels X, Y, W, H, Rotation, the Align buttons, Distribute H/V and bring-forward/send-back keep their names.
    - Within the toolbar, these keep today's labels: Font, Size, Weight (now a "Bold" toggle button, plus Weight in the spacing popover), Line height, Letter spacing, Opacity, Stroke width, Corner radius, Brand lock, and Combine's Union/Subtract/Intersect/Exclude and "Convert to path".
    - Selection mini-menu: `toolbar` "Selection actions" with Duplicate, Delete, Lock, and More (a `menu` with Bring forward, Send backward, Group, Ungroup, Copy, Paste).

- [ ] **Step 1: Write failing tests**
  - `contextToolbar.test.ts`: `toolbarKind` for each case; `boldWeight(400,[400,700])=700`, `boldWeight(700,[400,700])=400`, `boldWeight(400,[400])=400`.
  - e2e:
    - Selecting text shows the Selection toolbar with Font, Size, Bold, Text colour, alignment and Position. Changing them updates the canvas, and undo reverts each change.
    - Selecting a rectangle shows Fill, Stroke and Corner radius.
    - Selecting two shapes shows Combine and Distribute (in Position).
    - Selecting an image shows Image info with its license.
    - With nothing selected, the toolbar shows Background colour, page size and colour mode, and the design's Brand kit select.
    - The colour popover shows Document, Brand kit and Palette swatches, a native colour input and a hex field; a bad hex is rejected without a crash.
    - Every popover opens with Enter, closes with Escape and returns focus to its button (Review Focus 4).
    - Typing "r" in the Size field doesn't switch to the rectangle tool.
    - A viewer sees no editing controls in the toolbar and mini-menu.
    - Phone: the toolbar scrolls horizontally within itself, with no page scroll.
    - No `complementary "Properties"` exists any more; the canvas area is wider than before (assert the stage's container width ≥ viewport width − rail − panel − 40).
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement** spec Decisions 5 and 7. Move every Properties control to its new home exactly as listed in Decision 7, then delete `Properties.tsx`. The path-editing Done/Editing pill behaviour stays as today.
- [ ] **Step 4: Tests pass** and the full suite is green. Take screenshots: text selected, shape selected, nothing selected, phone.
- [ ] **Step 5: Commit** `feat: context toolbar replaces the properties panel`.

### Task 8: Library, Shapes, Templates and Brand pages

**Files:**
- Modify: `apps/web/src/routes/Library.tsx`, `Shapes.tsx`, `Templates.tsx`, `Brand.tsx`, `theme.css`
- Test: e2e `library.spec.ts`, `shapes.spec.ts`, `templates.spec.ts`, `brand.spec.ts`

**Interfaces:**
- Consumes: `STARTER_TEMPLATES`; the shape catalogue (Task 3 location); `importDesign` (to use a starter from the Templates page).
- Produces: none for other tasks.

- [ ] **Step 1: Write failing tests (e2e)**
  - Library:
    - the filters are one row of three dropdown chips, `button`s "Type: All", "Source: Workspace" and "License: Any", each opening a `menu`;
    - the empty state shows "Upload your first image" and a drop zone.
  - Shapes page: shows the catalogue groups Blobs, Sparkles, Badges and Doodles, plus basic shapes.
  - Templates page:
    - unfiltered, it shows sections per category, with built-in starters labelled "Built-in" and "See all" per section;
    - `?category=print` filters;
    - "Use" on a starter opens the editor.
  - Brand page: the empty state explains what a brand kit is and offers "Create a brand kit" and "Import kit".
  - At 375×812 there's no horizontal scroll on all four pages.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement** spec Decision 6.
- [ ] **Step 4: Tests pass** and the full suite is green. Take screenshots.
- [ ] **Step 5: Commit** `feat: tidy library, shapes, templates and brand pages`.

### Task 9: Starter content to full size

**Files:**
- Add: more `packages/doc/src/starter/<id>.ts` files
- Modify: `packages/doc/test/starter.test.ts` (the count rules)

- [ ] **Step 1: Change the count test** (failing): ≥ 16 entries in total, with ≥ 3 per category and at least 4 distinct sizes from `SIZES`. Copy the size values into the test, because `@cherry/doc` can't import from web.
- [ ] **Step 2: Run it and see it fail.**
- [ ] **Step 3: Author templates until there are 24** (minimum 16): social posts and stories, presentations, flyers and posters, business cards, invitations and greeting cards.
  - Vary the layouts and accent palettes.
  - Use at least 8 of the catalogue fonts across the set.
- [ ] **Step 4: Tests pass.** Render every template to PNG, look at all of them, and fix any that look unfinished: overlapping text, clipped text, low contrast. Contrast for body text is ≥ 4.5:1. Send a contact sheet with the report.
- [ ] **Step 5: Commit** `feat: full starter template set`.
