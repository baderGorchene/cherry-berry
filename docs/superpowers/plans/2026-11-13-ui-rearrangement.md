# UI Rearrangement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rearrange the existing web screens (shell, Home, Library, Shapes, Sign in, Workspaces, New design, Editor) to match the user's screen designs, without adding features.

**Architecture:** One shared `AppShell` (icon sidebar on wide screens, bottom tab bar under 760px) wraps every app page. Shared page/section classes move into `theme.css` and replace the heaviest inline styles. The editor gets one tabbed left panel (Layers · Shapes · Visuals) instead of stacked panels, icon actions for layers and pages, and sectioned properties.

**Tech Stack:** React 19, react-router, plain CSS (`apps/web/src/theme.css`, `apps/web/src/editor/editor.css`), Playwright e2e (Edge), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-11-cherry-berry-design.md` (visual identity, accessibility). Screen designs: the user's Design canvas (Home, Editor, AssetLibrary, ShapeLibrary, NewDesign, JoinWorkspace, Main/sign in, MobileHome); the layout notes each task needs are copied into that task.

## Global Constraints

- Palette `#8E1EA2` berry, `#C654C3` orchid, `#ED96D7` blush, `#FFC0DE` petal; use the existing `theme.css` tokens, no new colours except the existing `#F3ECF5` editor background.
- Text contrast ≥ 4.5:1; berry is the only palette colour used for text on white.
- Fonts: Space Grotesk for headings, Inter for body (already loaded).
- No new dependencies. Icons are inline 24×24 stroke SVGs (`stroke="currentColor"`, width 1.8, `aria-hidden="true"`), like `editor/Toolbar.tsx`.
- No logo, no mascot, no user-facing AI.
- No menu entry, tab or button for an unbuilt feature (Templates, Brand kits, History, Share, Export, workspace settings). Nothing may lead to a dead link.
- Interactive targets ≥ 44px high in app pages (editor compact controls ≥ 34px as today), visible focus ring (`outline: 3px solid var(--blush)`).
- Every existing accessible name the e2e specs use stays the same unless the task says otherwise; when a test must change, change it in the same commit and list it in the report.
- Each task ends green on: `pnpm typecheck` (repo root), `pnpm --filter @cherry/web test`, and `npx playwright test` in `apps/web` (full suite; it starts its own servers on 3101/5181 — never touch the user's 3000/5173).
- Per task, look at the result: take screenshots at 1280×800 and 390×844 with a throwaway spec (do not commit it) and say in the report what you checked.

## Review Focus

1. Phone width (390px): no horizontal page scroll on Home, Library, Shapes, Workspaces; the main nav stays reachable — pinned by `shell.spec.ts` (Task 1).
2. Switching workspace from the shell reloads the page's content for the new workspace (Home designs, Library, Shapes) — pinned by `shell.spec.ts` (Task 1).
3. Viewer role: Home's "New design" and size cards are disabled or absent, editor left-panel tabs still open but their add/import buttons stay disabled — existing viewer tests plus the Task 5 assertion.
4. Long workspace and design names (60+ chars) truncate with an ellipsis instead of pushing the layout wider — pinned in Task 1 (switcher) and Task 2 (design card).
5. Keyboard: the workspace menu opens with Enter/Space, closes with Escape and returns focus to its button; editor single-key shortcuts (V, T, R…) still work after clicking a left-panel tab — pinned in Task 1 and Task 5.

---

### Task 1: App shell, sidebar and mobile tab bar

**Files:**
- Create: `apps/web/src/AppShell.tsx` (replaces `Sidebar.tsx`; delete `Sidebar.tsx`)
- Create: `apps/web/src/icons.tsx` (shared inline SVG icons)
- Modify: `apps/web/src/theme.css` (shell, nav, page and section classes)
- Modify: `apps/web/src/routes/Home.tsx`, `Library.tsx`, `Shapes.tsx` (wrap in `AppShell` instead of `<div><Sidebar/>…`)
- Create: `apps/web/e2e/shell.spec.ts`
- Modify: e2e specs that relied on the `<select id="ws">` or the always-visible public ID

**Interfaces:**
- Produces: `export default function AppShell({ active, onSwitch, children }: { active: "home" | "library" | "shapes"; onSwitch?(id: string): void; children: ReactNode })` renders `<div class="shell">` with `<nav aria-label="Main" class="side">` and `<main class="page">{children}</main>`. Pages must not render their own `<main>`.
- Produces: `icons.tsx` exports `Icon` components `IconHome`, `IconImage`, `IconShapes`, `IconPlus`, `IconSearch`, `IconChevron`, `IconBack`, `IconUndo`, `IconRedo`, `IconLayers`, `IconEye`, `IconEyeOff`, `IconLock`, `IconUnlock`, `IconUp`, `IconDown`, `IconCopy`, `IconTrash`, `IconUpload` — each `(): JSX.Element` 20×20.
- Produces CSS classes (theme.css): `.shell`, `.side`, `.nav`, `.nav-on`, `.ws-btn`, `.ws-menu`, `.page`, `.page-head`, `.page-title` (h1 28px), `.page-sub` (muted 14px), `.sec` (section, column, gap 16), `.sec-title` (h2 22px), `.ph` (uppercase 12px muted label), `.tabs-u` + `.tab-u` (underline tabs, `[aria-selected="true"]` gets berry 2px bottom border and berry text), `.aside` (right detail panel), `.ell` (single-line ellipsis).

Layout (from the designs):
- `.side`: white, `flex: 0 0 240px`, border-right, padding 20px 14px, column gap 6. Brand "Cherry Berry" (`.brand`) at top. Then the workspace switcher button `.ws-btn`: full width, 52px, petal `.av` with initials (`initials()` from `routes/Workspaces.tsx`), workspace name (`.ell`, 600 14px) over the role (muted 12px), chevron. Then nav items. Sign out at the bottom as a `.nav` button.
- `.nav`: 44px, radius 10, padding 0 12px, gap 12, muted 500 14px, 20px icon, no underline; hover `var(--tint)`; `.nav-on` (also `aria-current="page"`) tint bg, berry 600. Items: Home (`/`), Visual library (`/library`), Shapes (`/shapes`) — keep these exact link names.
- Switcher menu `.ws-menu` (a popover under the button, `role="menu"` not required — use a plain list of buttons): one button per workspace (current one marked with `aria-current="true"`), the line `ID <code data-testid="workspace-public-id">…</code>` with role text for the current workspace, and a "Join or create another workspace" link to `/workspaces`. Button has `aria-expanded` and `aria-haspopup="true"`, accessible name "Workspace: <name>". Escape or clicking outside closes it and returns focus to the button.
- Under 760px (`@media (max-width: 759px)`): `.side` becomes a fixed bottom bar (64px, white, border-top) showing only the three nav items as icon-over-label (12px) columns; brand, switcher and sign out move into a top bar inside `.shell` (brand left, switcher button compact (avatar + chevron) right, sign out inside the switcher menu). `.page` gets `padding-bottom: 88px`.
- `.page`: `flex: 1; min-width: 0; padding: 28px clamp(16px, 4vw, 40px) 48px; display: flex; flex-direction: column; gap: 32px`.

- [ ] **Step 1: Write `e2e/shell.spec.ts` (failing)**
  - `"main nav links have icons and mark the current page"`: sign up + create workspace; `nav[aria-label=Main]` link "Home" has `aria-current="page"`; click link "Shapes" → its `aria-current="page"`.
  - `"workspace menu switches workspace and shows its ID"`: create two workspaces "Alpha <unique>" and "Beta <unique>"; on Home, open button `/^Workspace: /`; expect `getByTestId("workspace-public-id")` visible; click "Alpha…" entry; expect switcher button name to contain "Alpha"; press button again, press Escape → menu hidden and button focused.
  - `"phone width has a bottom nav and no horizontal scroll"`: `page.setViewportSize({ width: 390, height: 844 })`; for `/`, `/library`, `/shapes`: `expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)` and link "Visual library" visible.
  - `"long workspace names truncate"`: workspace named 70 × "W"; at 1280 width the switcher button's `scrollWidth` > `clientWidth` on its name span is fine, but `document.documentElement.scrollWidth` ≤ 1280 and the `.side` width ≤ 260.
- [ ] **Step 2: Run** `npx playwright test e2e/shell.spec.ts` — Expected: FAIL (no switcher button, no `aria-current` on mobile etc.).
- [ ] **Step 3: Implement** `icons.tsx`, `AppShell.tsx`, theme classes; swap Home/Library/Shapes to `AppShell` (each page drops its outer flex wrapper and its own `<main>`); delete `Sidebar.tsx`. Switching keeps today's behaviour: `currentWorkspace.set(id)` then `onSwitch?.(id)`.
- [ ] **Step 4: Fix other specs** that used the old select or the always-visible ID (open the menu first). Run the full e2e suite — Expected: all pass.
- [ ] **Step 5: Typecheck + unit tests**, screenshots at 1280 and 390, commit `feat(web): shared app shell with icon nav and mobile tab bar`.

### Task 2: Home

**Files:** Modify `apps/web/src/routes/Home.tsx`, `apps/web/src/theme.css`; Test: `apps/web/e2e/onboarding.spec.ts` (+ one new test there).

**Interfaces:** Consumes `AppShell`, icons, `.page-head`, `.sec`, `.sec-title`, `.ell` from Task 1.

Layout: `.page-head` = search input (`type="search"`, label "Search designs", placeholder "Search designs", `max-width: 560px`, leading search icon), spacer, "New design" `.btn-p` with plus icon linking to `/new` (hidden for viewers), 40px round berry account avatar (as today). Under it `<h1 class="page-title">Start something</h1>` with the size-card grid (`minmax(170px, 1fr)`, 84px tint preview, as today) and the "Custom size" card. Then `<h2 class="sec-title">Recent designs</h2>` with design cards: thumb box 160px tall, `overflow: hidden`, the white page preview sized with `max-width: 80%; max-height: 80%` and `aspect-ratio` so it never spills out; title `.ell`.
- Search filters the recent designs client-side by title (case-insensitive); with no match show "No designs match “<q>”." Search is not a page-wide search: label and placeholder say designs only.
- The workspace name is no longer a page heading (the switcher shows it). Ruling for the tests: `onboarding.spec.ts` checks `getByRole("button", { name: /^Workspace: North Studio/ })` instead of heading "North Studio" (same for "Berry Lab").
- Skipped from the design: Mine/Shared toggle and "From your brand kit" (no data / unbuilt).

- [ ] **Step 1: Failing tests** in `onboarding.spec.ts`: update the two heading assertions as above; add `"home search filters recent designs and long titles stay inside the card"`: create two designs via the "Social post" card (return home with the back link), rename one to `"Poster " + "x".repeat(80)` via the editor's "Design title" input; on Home type "poster" → one card; type "zzz" → text "No designs match"; the long title card's bounding box width ≤ its list item's width.
- [ ] **Step 2: Run** `npx playwright test e2e/onboarding.spec.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the layout above.
- [ ] **Step 4: Full e2e + typecheck + unit tests** — Expected: pass. Screenshots 1280/390.
- [ ] **Step 5: Commit** `feat(web): home header with search and new design, fix recent thumbnails`.

### Task 3: Visual library and Shapes pages

**Files:** Modify `apps/web/src/routes/Library.tsx`, `apps/web/src/routes/Shapes.tsx`, `apps/web/src/theme.css`.

**Interfaces:** Consumes `.page-head`, `.page-title`, `.page-sub`, `.ph`, `.tabs-u`/`.tab-u`, `.aside` from Task 1.

Layout (AssetLibrary / ShapeLibrary designs):
- Both pages: inside `AppShell`, a two-column split — content column (`flex: 1; min-width: 0`) and the right `.aside` (`flex: 0 0 320px`, white, border-left, padding 24, sticky top 0, height 100vh, scrolls). Under 1000px the aside stacks below the content at full width. To get the aside flush right, `AppShell` accepts the page's own padding: add prop `bleed?: boolean` to `AppShell` that removes `.page` padding (pages then pad their content column themselves).
- Header: `.page-title` ("Visual library" / "Shapes") + `.page-sub` one line of muted help ("Images, GIFs and SVGs you can use in any design." / "Basic shapes and the shapes your team saved.") + primary action on the right ("Upload visuals" `.btn-p` with upload icon in Library — keep that exact name; Shapes keeps its existing primary action if it has one).
- Library filter rows: each row is a `.ph` label 70px wide then `.chips`. Chip pressed style unchanged.
- Shapes: the source tabs become `.tabs-u` underline tabs (`role="tablist"`, each `role="tab"`, `aria-selected`) — names unchanged ("My shapes", "Workspace", "Public", …). Shape grid tiles square (`aspect-ratio: 1`), `minmax(96px, 1fr)`.
- Aside names stay "Selected visual" (Library); Shapes' detail/new-shape area moves into its `.aside` with the same accessible names it has today.

- [ ] **Step 1: Failing test** in `shell.spec.ts`: `"library and shapes keep the detail panel beside the grid on wide screens"` — at 1280×800 on `/library` with one uploaded visual (reuse `uniquePng` + the upload flow from `library.spec.ts`), select it; `complementary "Selected visual"` box `x` > the first tile's `x + width`. On `/shapes`, `getByRole("tablist")` exists and tab "Public" has `aria-selected="false"` before click, `"true"` after.
- [ ] **Step 2: Run** it — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Full e2e + typecheck + unit tests**; screenshots 1280/390.
- [ ] **Step 5: Commit** `feat(web): library and shapes page layout with side panel and underline tabs`.

### Task 4: Sign in, Workspaces and New design

**Files:** Modify `apps/web/src/routes/SignIn.tsx`, `Workspaces.tsx`, `NewDesign.tsx`, `apps/web/src/theme.css`.

Layout:
- Sign in (Main design): split screen. Left panel (`flex: 1 1 420px`, berry background, white text, padding 48, hidden under 900px) with the brand, the heading "Design freely. Own every file." (40px Space Grotesk) and three pill badges: "Open source", "Self-hostable", "Print-ready PDF". Right: the existing form centred, max-width 420. Form fields, labels and button names unchanged.
- Workspaces (JoinWorkspace design): centred column max 1180, padding 48 clamp; `<h1>` "Pick a workspace" 40px + muted subline; the existing join/accept/list sections as `.card`s in a grid `repeat(auto-fit, minmax(300px, 1fr))`; "Or create your own" card below, full width, keeping its `.opt` radios. All labels and button names unchanged ("Workspace name", "Invitation only", "Create workspace", "Invitation link", "Accept invitation", "Join workspace", "Workspace password").
- New design (NewDesign design): the page renders as a centred dialog-styled card (max 1000, radius 20, shadow) over the `--surface` page, with a "Close" icon link back to `/`; left column lists the same presets as Home's size cards (reuse by exporting `PRESETS` from `Home.tsx`), right column the existing custom-size form. Existing form labels unchanged.

- [ ] **Step 1: Failing test** in `shell.spec.ts`: `"sign in shows the welcome panel on wide screens only"` — at 1280 heading "Design freely. Own every file." visible; at 390 hidden; and `"new design lists presets beside the custom form"` — signed in, `/new` shows button `/Social post/` and the "Width" field, and link "Close" goes to `/`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Full e2e + typecheck + unit tests**; screenshots 1280/390.
- [ ] **Step 5: Commit** `feat(web): sign in, workspaces and new design layouts`.

### Task 5: Editor chrome and tabbed left panel

**Files:** Modify `apps/web/src/routes/Editor.tsx`, `apps/web/src/editor/Toolbar.tsx`, `ShapesPanel.tsx`, `VisualsPanel.tsx`, `editor.css`; Test: `apps/web/e2e/editor.spec.ts`.

**Interfaces:**
- `Editor.tsx` state `panel: "layers" | "shapes" | "visuals"` (default `"layers"`) replaces `"shapes" | "visuals" | null`. `Toolbar` prop `panel` and `onPanel(p: "shapes" | "visuals")` stay; clicking the rail's Shapes/Visuals button when already active goes back to `"layers"`.
- New left `<aside className="ed-left">` holds a tab strip (`role="tablist"`, tabs "Layers", "Shapes", "Visuals" as `.ed-tab` underline tabs, `aria-selected`) and the active panel. Each panel keeps its own aside label: the Layers tab content stays inside `aside[aria-label="Layers"]`; `ShapesPanel` and `VisualsPanel` keep `aria-label="Shapes panel"` / `"Visuals panel"` but drop their own outer width/border (`.ed-shapes` becomes a plain column, no `flex-basis`, no border). Ruling: nested `<aside>` inside the left aside is fine; the left wrapper is a `<div className="ed-left">`, not an aside, so the Layers aside label still resolves uniquely.
- Path edit mode still replaces the left panel content with the Layers tab (shapes/visuals hidden as today).
- Tab buttons call `e.currentTarget.blur()` after click so single-key tool shortcuts keep working (they already ignore inputs only).

Header (Editor design): back `.ed-ib`, title block (title input over "W × H unit · RGB · Saved" line, as today), undo/redo, editing pill, spacer, zoom group, Done. No History/Share/Export. Make the title line `.ell`.

Rail: tools keep their names and titles; add a thin divider (`<hr className="ed-sep">`) between the drawing tools and the Shapes/Visuals panel buttons.

- [ ] **Step 1: Failing test** in `editor.spec.ts`: `"left panel tabs switch between layers, shapes and visuals"` — open a new design; tab "Layers" `aria-selected="true"`; click rail button "Shapes" → tab "Shapes" selected and `complementary "Shapes panel"` visible and `complementary "Layers"` not visible; click tab "Visuals" → `"Visuals panel"` visible; click tab "Layers" then press `r` → rail button "Rectangle (R)" has `aria-pressed="true"`. Viewer: in the existing viewer test, open tab "Shapes" and expect button "Import SVG…" disabled.
- [ ] **Step 2: Run** `npx playwright test e2e/editor.spec.ts` — Expected: the new test FAILS.
- [ ] **Step 3: Implement.** Existing specs that open Shapes/Visuals through the rail keep working; any that expected Layers visible at the same time as a panel get the Layers tab clicked first (list them in the report).
- [ ] **Step 4: Full e2e + typecheck + unit tests**; screenshots of the editor at 1280×800 with each tab.
- [ ] **Step 5: Commit** `feat(web): editor tabbed left panel and tidier header`.

### Task 6: Editor layers, pages and properties

**Files:** Modify `apps/web/src/editor/Layers.tsx`, `Pages.tsx`, `Properties.tsx`, `editor.css`; Test: `apps/web/e2e/editor.spec.ts`.

**Interfaces:** Consumes icons from `apps/web/src/icons.tsx` (Task 1).

- Layers: row = kind glyph, name (`.ed-lay`), then hide/lock as 28px icon buttons (`IconEye`/`IconEyeOff`, `IconLock`/`IconUnlock`) that show on row hover/focus and always when active (hidden/locked); accessible names unchanged (`Show <name>`, `Hide <name>`, `Lock …`, `Unlock …`). "Bring forward" / "Send backward" become icon buttons (`IconUp`, `IconDown`) in the section heading row, `aria-label` and `title` keep the old text.
- Pages: section heading "Pages" (`.ed-ph`); each page row shows its actions as icon buttons (`IconCopy` "Duplicate", `IconTrash` "Delete", `IconUp` "Move up", `IconDown` "Move down") only on the current page row; accessible names unchanged. "+ Add page" button unchanged in name.
- Properties: sections with `.ed-ph` headings in this order: "Layout" (X/Y/W/H/rotation/corner radius in `.ed-grid`), the kind-specific section (Text / Visual / Path …, existing content), "Fill", "Stroke", then actions (combine, convert, save shape, delete). Existing labels unchanged ("X", "W", "Corner radius", heading "Visual").
- Empty state (nothing selected): heading "Page" with the page size (`W × H unit`), colour mode, and the hint "Select a layer to edit it, or pick a tool on the left." — replaces the lone sentence. Read-only users see the same block without the tool hint ("Select a layer to see its properties.").

- [ ] **Step 1: Failing test** in `editor.spec.ts`: `"properties show page info when nothing is selected"` — new Social post design: `complementary "Properties"` contains text "1080 × 1080 px" and heading "Page"; draw a rectangle → heading "Layout" visible inside Properties. And `"page actions show only on the current page"`: add a page; exactly one button named "Duplicate" visible.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Full e2e + typecheck + unit tests**; screenshots with a rectangle selected, a text selected and nothing selected.
- [ ] **Step 5: Commit** `feat(web): icon layer and page actions, sectioned properties with page empty state`.
