# Phase 3 — Vectors & Custom Shapes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the canvas, a person draws paths with the pen and edits their points and curves, combines shapes with union, subtract, intersect and exclude, and turns shapes into editable paths. They save any path to a shape library, privately, for their workspace or publicly, import SVGs into the library or straight into a design, and drop library shapes into any design.

**Architecture:** A new package, `@cherry/vector`, wraps Paper.js and does all path geometry on SVG path-data strings: parsing to an editable anchor model, serializing, bounds, transforms, booleans and SVG import. The `.cherry` schema does not change, because a path is still a `path` node with `d` in node-local coordinates. The editor's path-edit mode and boolean actions call `@cherry/vector`, then write ordinary `updateNode`/`addNode`/`removeNodes` ops inside `act()`, so undo, autosave and merge work unchanged. The shape library is a server table with its own routes. The server re-serializes every incoming path through `@cherry/vector`, so only normalized path data is ever stored. No SVG markup is stored or served.

**Tech Stack:** paper 0.17 (MIT), plus the Phase 1 and 2 stack.

**Spec:** `docs/superpowers/specs/2026-11-11-cherry-berry-design.md` (Phase 3 line; "No real vector control" row). Screen designs: `project/VectorEdit.dc.html` and `project/ShapeLibrary.dc.html` in the design artifact linked from the spec.

**Base:** Phase 2 (`docs/superpowers/plans/2026-11-11-02-editor-core.md`) on branch `phase-2-editor`. Cut `phase-3-vectors` from `phase-2-editor`, or from `main` once Phase 2 is merged.

## Global Constraints

- Everything in the Phase 1 and Phase 2 Global Constraints still applies:
  - MIT-compatible dependencies only.
  - Palette and text-contrast rules.
  - Fonts: Space Grotesk and Inter.
  - Routes under `/api`, errors as `{ "error": "<code>" }`.
  - Units, rotation and child-order conventions.
  - Transaction origins: `LOCAL` and `REMOTE`.
  - Roles: viewers are read-only; non-members get `404 not_found`.
  - Every committed editor action goes through `act()`, so it is exactly one undo step.
- No user-facing AI features.
- Path data written by `@cherry/vector` uses only absolute `M L C Z` commands, numbers rounded to 4 decimals and space-separated (`M0 0 L10 0 C…`). Readers accept any valid SVG path data, including relative commands, `H V S Q T A` and exponents.
- A `path` node's `d` is in node-local coordinates, and its bounds are exactly `0 0 width height` after every vector edit. `normalizeEdit` (Task 2) guarantees this.
- Boolean ops accept `rect`, `ellipse` and closed `path` nodes. Text, image, group and open paths (including lines) are ignored. Nothing in the result is a group.
- Shape library visibility values are exactly `private` (only the creator), `workspace` (members of one workspace) and `public` (every signed-in user of this instance). UI labels are "Only me", "This workspace" and "Everyone (public)".
- Out of scope this phase: the pencil (freehand) tool, scissors, outline stroke, per-point corner radius, editing a library shape in place, multi-colour library shapes, and reporting public shapes (Phase 4's report flow covers this).

## Review Focus

1. **Booleans on rotated or resized shapes.** Run a boolean on a rotated rectangle and a resized star. The result must sit exactly where the operands were drawn, with no jump. (Task 3)
2. **Editing points on a rotated path.** Move one anchor of a rotated path. Every other anchor must stay where it was on the page. (Task 2)
3. **Hostile or unusual SVG import.** Import an SVG with nested `transform`s, `<rect>`/`<circle>` elements, stroke-only paths, a `<script>` and external references, or one over 1 MB.
   - Shapes land where the SVG drew them.
   - Nothing executes.
   - A file that is too large or has no shapes gets a clear message instead of a crash.
   - (Task 8)
4. **Library privacy.**
   - Private shapes never appear to anyone else.
   - Workspace shapes only appear to members.
   - Deleting someone else's shape is refused.
   - Forged or garbage path data in a save gets `400 invalid_shape`.
   - (Task 4)
5. **Undo and read-only.**
   - Creating a pen path, a point drag, a boolean op and a flatten are each one undo step.
   - A viewer can neither enter path editing nor run ops.
   - (Tasks 5, 6)

---

### Task 1: `@cherry/vector` — parse, serialize, transform, nodeToPath

**Files:**
- Create: `packages/vector/package.json` (`@cherry/vector`, deps `paper@^0.17.0`, `@cherry/doc: workspace:*`; same scripts and tsconfig as `packages/doc`), `packages/vector/tsconfig.json`, `packages/vector/src/index.ts`, `packages/vector/src/paper.ts`, `packages/vector/src/model.ts`
- Modify:
  - `packages/doc/src/shapes.ts`: delete `scalePath`.
  - `packages/doc/test/shapes.test.ts`: move its `scalePath` cases to the vector tests.
  - `apps/web/src/editor/geometry.ts` and `Properties.tsx`: import `scalePath` from `@cherry/vector`.
  - `apps/web/package.json`: add `@cherry/vector`.
- Test: `packages/vector/test/model.test.ts`

**Interfaces:**
- Consumes: `CherryNode` from `@cherry/doc`.
- Produces:
  - `paper.ts`: `scope(): paper.PaperScope`, a lazily created headless scope (`new paper.PaperScope(); s.setup(new s.Size(1, 1))`). It is shared and never inserts items into the active project; build every item with `insert: false`.
  - `type Pt = { x: number; y: number }`
  - `type Anchor = { x: number; y: number; in: Pt; out: Pt; kind: "corner" | "smooth" | "symmetric" }`. Handles are relative to the anchor, and `{0,0}` means there is no handle. Derive `kind` when parsing:
    - `corner`: either handle is zero, or the handles are not collinear within 1°.
    - `symmetric`: the handles are collinear and their lengths are equal within 1e-6.
    - `smooth`: otherwise.
  - `type SubPath = { anchors: Anchor[]; closed: boolean }`, `type PathModel = SubPath[]`
  - `class InvalidPath extends Error`
  - `parsePath(d: string): PathModel` via `new CompoundPath({ pathData: d, insert: false })`. It throws `InvalidPath` for empty data, for data with zero anchors, for any non-finite number, or when `d.length > 100_000`.
  - `toPathData(m: PathModel): string`, in the constrained format from Global Constraints. A segment whose two handles are both zero is written as `L`, otherwise as `C`. A closed subpath ends with the closing segment, then `Z`.
  - `pathBounds(m: PathModel): { x: number; y: number; width: number; height: number }`: tight curve bounds, the same as Paper's `bounds`.
  - `transformPath(d: string, m: [a: number, b: number, c: number, d: number, e: number, f: number]): string`: an affine transform, returning normalized data.
  - `scalePath(d: string, sx: number, sy: number): string` = `transformPath(d, [sx, 0, 0, sy, 0, 0])`.
  - `nodeToPath(n: CherryNode, space: "local" | "page"): { d: string; fillRule: "nonzero" | "evenodd" } | null`:
    - `rect` honours `cornerRadius`, clamped to half the smaller side.
    - `ellipse` gives 4 cubic arcs.
    - `path` gives its own `d`.
    - Anything else gives `null`.
    - `"page"` applies the node's transform (translate `x,y`, then rotate `rotation`° clockwise about the box centre).
  - Export everything above from `index.ts`.
- [ ] **Step 1: Failing tests** in `model.test.ts`:
  - `parses and re-serializes absolute data`: `toPathData(parsePath("M0 0 L10 0 L10 10 Z"))` → `"M0 0 L10 0 L10 10 L0 0 Z"`.
  - `reads relative, H/V, S/Q/A and exponents`: `pathBounds(parsePath("m0 0 h10 v1e1 h-10 z"))` → `{x:0,y:0,width:10,height:10}`, and `parsePath("M0 0 A5 5 0 0 1 10 0")` does not throw.
  - `derives anchor kinds`: for `"M0 0 C0 -5 10 -5 10 0 C10 5 0 5 0 0 Z"`, anchor 1 (10,0) is `symmetric`, and anchor 0 of `"M0 0 L10 0"` is `corner`.
  - `rejects garbage`: `""`, `"hello"`, `"M0 0 L NaN 1"` and a 100 001-character string each throw `InvalidPath`.
  - `scalePath` (moved from doc): `scalePath("M0 0 L10 20 C1 2 3 4 5 6 Z", 2, 3)` → `"M0 0 L20 60 C2 6 6 12 10 18 L0 0 Z"`. Relative input `"m0 0 l1 1"` now works: it gives `"M0 0 L2 2"`.
  - `rect to path honours corner radius`: `pathBounds(parsePath(nodeToPath(rect{w:100,h:50,cornerRadius:10}, "local")!.d))` → `0 0 100 50`, and the data contains a `C` command.
  - `page space applies rotation`: a rect at `{x:0,y:0,w:100,h:50,rotation:90}`, page bounds → `{x:25,y:-25,width:50,height:100}`, within 1e-6.
  - `text gives null`.
- [ ] **Step 2:** `pnpm install && pnpm --filter @cherry/vector test` → FAIL (modules missing). If Paper fails to load headless in Node, stop and report BLOCKED with the error. Do not add jsdom or canvas.
- [ ] **Step 3:** Implement. Update the doc tests and the web imports as listed under Files.
- [ ] **Step 4:** `pnpm test` and `pnpm typecheck` → all PASS. The web geometry tests still pass, using the new `scalePath`.
- [ ] **Step 5:** Commit `feat(vector): paper-backed path model, transforms and nodeToPath`.

---

### Task 2: Point editing geometry (`@cherry/vector`)

**Files:**
- Create: `packages/vector/src/edit.ts`
- Test: `packages/vector/test/edit.test.ts`

**Interfaces:**
- Consumes: Task 1 model functions.
- Produces (all pure; they return new models and never mutate their input):
  - `type AnchorRef = { sub: number; i: number }`
  - `moveAnchors(m: PathModel, refs: AnchorRef[], dx: number, dy: number): PathModel`. Handles move with their anchors.
  - `moveHandle(m: PathModel, ref: AnchorRef, which: "in" | "out", to: Pt, breakSymmetry: boolean): PathModel`. `to` is relative to the anchor. The opposite handle follows the anchor's kind:
    - `symmetric`: mirrored exactly.
    - `smooth`: same angle, keeps its own length.
    - `corner`: untouched.
    - `breakSymmetry` (Alt) turns the anchor into `corner` first.
  - `setAnchorKind(m: PathModel, ref: AnchorRef, kind: Anchor["kind"]): PathModel`:
    - `corner`: zero both handles.
    - `smooth` or `symmetric` from a corner: handles along the bisector of the neighbour directions, each one third of the distance to its neighbour.
    - `symmetric` from `smooth`: average the two lengths.
  - `insertAnchor(m: PathModel, sub: number, segment: number, t: number): { model: PathModel; ref: AnchorRef }`. Uses Paper's `Curve.divideAtTime`, so the curve's shape does not change.
  - `removeAnchors(m: PathModel, refs: AnchorRef[]): PathModel`. Drops subpaths left with fewer than 2 anchors, and returns `[]` when nothing remains.
  - `setClosed(m: PathModel, sub: number, closed: boolean): PathModel`
  - `hitSegment(m: PathModel, p: Pt, tolerance: number): { sub: number; segment: number; t: number } | null`. Finds the nearest curve location within `tolerance`, for the add-anchor tool.
  - `export type PathNode = Extract<CherryNode, { kind: "path" }>` (Task 3 uses it too).
  - `normalizeEdit(node: PathNode, m: PathModel): { d: string; x: number; y: number; width: number; height: number }`. It recomputes the bounds of `m` and translates `d` so the bounds start at 0,0. It then picks the new `x,y` so that every point keeps its page position under the node's unchanged `rotation`. Algorithm: for local bounds `(bx, by, bw, bh)`, the old centre `c0 = (x + w/2, y + h/2)` and the old local centre `l0 = (w/2, h/2)`, the new local centre is `l1 = (bx + bw/2, by + bh/2)`. The new page centre is `c1 = c0 + R(rotation)·(l1 − l0)`. The new `x = c1.x − bw/2` and `y = c1.y − bh/2`.
  - Export everything from `index.ts`.
- [ ] **Step 1: Failing tests** in `edit.test.ts`:
  - `symmetric handle mirrors`: on the circle from Task 1, `moveHandle(…, {sub:0,i:1}, "out", {x:0,y:8}, false)` makes `in` `{x:0,y:-8}`.
  - `smooth keeps the other length`: start from a smooth anchor with `in (−3,0)` and `out (6,0)`. Moving `out` to `(0,6)` makes `in` `(0,−3)`.
  - `alt breaks symmetry`: the same move with `breakSymmetry` true leaves `in` unchanged, and the anchor kind becomes `corner`.
  - `insertAnchor keeps the shape`: insert at `t = 0.5` on any curve. `pathBounds` is unchanged within 1e-6, and the anchor count is +1.
  - `removeAnchors to nothing`: removing both anchors of `"M0 0 L10 0"` gives `[]`.
  - `hitSegment`: on `"M0 0 L100 0"`, the point `(50,3)` with tolerance 4 gives `{sub:0, segment:0, t≈0.5}`, and the point `(50,10)` gives `null`.
  - `normalizeEdit keeps untouched points on the page (rotated)`:
    - Use a path node `{x:10,y:20,width:100,height:100,rotation:30}` with `d` = a 100×100 square.
    - Move anchor 0 by `(−20,−20)` and call `normalizeEdit`.
    - Map anchor 2 (originally local `(100,100)`) to page space with the node's transform, before and after. The two positions are equal within 1e-6.
    - The new `width` and `height` are `120`, and the returned `d`'s bounds start at `0 0`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `pnpm --filter @cherry/vector test` passes and typecheck is clean.
- [ ] **Step 5:** Commit `feat(vector): anchor and handle editing with rotation-safe normalization`.

---

### Task 3: Boolean ops and flatten (`@cherry/vector`)

**Files:**
- Create: `packages/vector/src/boolean.ts`
- Test: `packages/vector/test/boolean.test.ts`

**Interfaces:**
- Consumes: `nodeToPath`, `parsePath`, `toPathData`, `pathBounds`, `transformPath`.
- Produces:
  - `type BoolOp = "union" | "subtract" | "intersect" | "exclude"`
  - `booleanOp(op: BoolOp, nodes: CherryNode[]): PathNode | null`. `nodes` are ordered bottom → top, as on the page.
    - Use only the operands that `nodeToPath` accepts and that are closed: every subpath is closed, or the node is a rect or ellipse. Return `null` when fewer than 2 remain, or when the result is empty.
    - Compute in page space with Paper (`unite`, `subtract`, `intersect`, `exclude`), reducing left to right.
    - `subtract` takes the bottom-most operand minus the union of all the others.
    - Result:
      - A new `path` node with `id: crypto.randomUUID()`.
      - `name`: `"Union"`, `"Subtract"`, `"Intersect"` or `"Exclude"`.
      - `rotation: 0`, with `x/y/width/height` from the page bounds and `d` local (translated by −bounds).
      - `fillRule`: `"evenodd"` for `exclude`, otherwise `"nonzero"`.
      - `fill`, `stroke`, `opacity`, `locked: false` and `hidden: false` copied from the bottom-most operand.
  - `flatten(n: CherryNode): PathNode | null`. A rect, ellipse or path becomes a `path` node with the same `id`, `name`, `x/y/width/height`, `rotation`, `fill`, `stroke` and `opacity`, and `d` from `nodeToPath(n, "local")`. Anything else gives `null`.
- [ ] **Step 1: Failing tests** in `boolean.test.ts`:
  - `union of two overlapping rects`: rect A at `0,0` 100×100 and rect B at `50,50` 100×100 → bounds `{x:0,y:0,width:150,height:150}`, `name` `"Union"`, fill from A.
  - `subtract is bottom minus the rest`: same A and B → bounds `0 0 100 100`, and `pathBounds` of the result's `d` is `0 0 100 100`.
  - `intersect of disjoint shapes is null`.
  - `exclude uses evenodd`.
  - `rotated operand lands where it was drawn`: union of a rect `{x:0,y:0,w:100,h:50,rotation:90}` with an overlapping 2×1 rect at `(74,0)` → bounds `{x:25,y:-25,width:51,height:100}`, within 1e-6.
  - `text and lines are ignored`: `booleanOp("union", [rect, text])` → `null`; `[rectA, line, rectB]` → the union of A and B.
  - `flatten keeps identity and geometry`: flattening an ellipse keeps its `id` and `rotation`, and `pathBounds(parsePath(d))` is `0 0 w h`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Tests PASS, typecheck clean.
- [ ] **Step 5:** Commit `feat(vector): boolean operations and flatten`.

---

### Task 4: Shape library API (server)

**Files:**
- Create:
  - `apps/server/src/shapes/service.ts`
  - `apps/server/src/shapes/routes.ts`
  - the migration `apps/server/drizzle/0002_*.sql`, made with the repo's drizzle-kit generate script
- Modify:
  - `apps/server/src/db/schema.ts`: add the `shapes` table.
  - `apps/server/src/app.ts`: register the routes.
  - `apps/server/package.json`: add `@cherry/vector`.
  - `apps/server/src/workspaces/errors.ts`: add `invalid_shape` → 400, if the STATUS map needs it.
- Test: `apps/server/test/shapes.test.ts`

**Interfaces:**
- Consumes: `parsePath`, `toPathData` and `pathBounds` from `@cherry/vector`; the `Paint` and `Stroke` zod schemas from `@cherry/doc`; `getRole` and `UUID` from the workspaces service; `requireUser`.
- Produces:
  - Table `shapes`:
    - `id` uuid pk
    - `created_by` text, references user, cascade
    - `workspace_id` uuid null, references workspaces, cascade
    - `visibility` text, check in `('private','workspace','public')`, plus check `(visibility = 'workspace') = (workspace_id is not null)`
    - `name` text
    - `tags` text[]
    - `d` text
    - `width` real
    - `height` real
    - `fill_rule` text
    - `fill` jsonb null
    - `stroke` jsonb null
    - `created_at` timestamptz
    - indexes on `(visibility, created_at desc)`, `workspace_id` and `created_by`
  - `type Shape = { id; name; tags: string[]; visibility; workspaceId: string | null; d; width; height; fillRule; fill: Paint | null; stroke: Stroke | null; createdBy; createdAt; mine: boolean }`
  - `POST /api/shapes`, body `{ name: string 1–80 trimmed; tags: string[] ≤10, each 1–30 trimmed and lowercased, deduped; visibility; workspaceId?: string; d: string; fillRule; fill?: Paint; stroke?: Stroke }` → `201 { shape }`.
    - The server re-serializes `d` with `toPathData(parsePath(d))`, translates it so its bounds start at `0,0`, and computes `width/height` from the bounds. A client never sends width or height.
    - `InvalidPath`, or zero-area bounds (both width and height 0) → `400 invalid_shape`.
    - `workspace` visibility requires role owner, admin or editor in `workspaceId`. A non-member gets `404 not_found`; a viewer gets `403 forbidden`.
    - Rate limit: 30 per minute per user (the `@fastify/rate-limit` per-route config, same as the join route).
  - `GET /api/shapes?scope=mine|workspace|public&workspaceId=&q=` → `{ shapes: Shape[] }`, newest first, at most 200 (leave a `ponytail:` comment noting there is no pagination yet).
    - `mine`: every shape the user created, at any visibility.
    - `workspace`: shapes in `workspaceId`; requires membership, else `404`.
    - `public`: every public shape.
    - `q` matches the name or any tag, case-insensitively. Escape `%`, `_` and `\` in `q`.
  - `DELETE /api/shapes/:id` → `204`. Allowed for the creator, or a workspace owner/admin for a `workspace` shape.
    - A shape the caller can't see → `404`.
    - A visible shape the caller can't delete → `403 forbidden`.
- [ ] **Step 1: Failing tests** in `shapes.test.ts`:
  - `saves normalized path data`: posting `d: "m10 10 h20 v20 h-20 z"` gives `d: "M0 0 L20 0 L20 20 L0 20 L0 0 Z"`, `width: 20`, `height: 20`.
  - `rejects forged path data`: `d: "<script>"`, `d: ""` and `d: "M0 0"` (zero area) → `400 invalid_shape`.
  - `private shapes stay private`: Ada saves a private shape. Bo's `scope=public` doesn't list it, and Bo's `DELETE` gets `404`.
  - `workspace shapes need membership`:
    - A non-member's `GET scope=workspace` gets `404`.
    - A viewer can list but `POST` with `visibility: "workspace"` gets `403`.
    - An editor's save appears for a member.
  - `public shapes are listed for everyone; only the creator deletes`: Bo's `DELETE` on Ada's public shape gets `403`; Ada's gets `204`.
  - `workspace admin can delete a member's workspace shape`.
  - `search by name or tag`: with shapes "Berry" (tags `fruit`) and "Ticket", `q=FRU` returns only Berry, and `q=%` returns nothing.
  - `requires a session`: `401`.
- [ ] **Step 2:** `pnpm --filter @cherry/server test` → FAIL. **Step 3:** Implement and generate the migration. **Step 4:** Tests PASS, typecheck clean.
- [ ] **Step 5:** Commit `feat(server): shape library with private, workspace and public visibility`.

---

### Task 5: Pen tool and path edit mode (web)

**Files:**
- Create: `apps/web/src/editor/PathEditor.tsx` (Konva overlay for anchors, handles and the pen preview), `apps/web/src/editor/PathPanel.tsx` (Properties content while editing)
- Modify: `Canvas.tsx`, `Toolbar.tsx`, `routes/Editor.tsx`, `Properties.tsx`, `editor.css`
- Test: extend `apps/web/e2e/editor.spec.ts`

**Interfaces:**
- Consumes:
  - From Task 1: `parsePath`, `toPathData`.
  - From Task 2: `moveAnchors`, `moveHandle`, `setAnchorKind`, `insertAnchor`, `removeAnchors`, `setClosed`, `hitSegment`, `normalizeEdit`.
  - From Task 3: `flatten`.
  - From Phase 2: `act`, `addNode`, `updateNode`, `removeNodes`.
- Produces:
  - `Tool` gains `"pen"`. The `P` key and a toolbar button "Pen (P)" both arm it.
  - Editor state `editingPath: string | null`. When a path node is being edited, the header shows a pill "Editing path" and a "Done" button, and the rail shows the vector tools: "Direct select (A)", "Pen (P)", "Add anchor point (+)", "Convert anchor point (Shift+C)".
  - **Pen:**
    - A click adds a corner anchor. Press-and-drag adds a symmetric anchor whose `out` handle follows the drag.
    - Shift snaps the new segment to 45°.
    - Clicking the first anchor closes the path.
    - Enter or Escape finishes an open path. A path with fewer than 2 anchors is discarded.
    - Committing creates one path node in one `act`: `name: "Path"`, geometry from `normalizeEdit`. A closed path gets fill `#8E1EA2`. An open path gets no fill and a stroke of `#22142A` with width `fromPx(2, unit)`.
    - With `editingPath` set, the pen continues the selected open subpath from its end anchor.
  - **Entering edit mode:**
    - Double-click a `path`, or press Enter with exactly one path selected.
    - For a rect or ellipse, double-click first runs `flatten` in the same `act` as the first edit. Merely entering edit mode does not flatten.
    - Viewers can't enter. Escape or Done exits.
  - **Direct select:**
    - Click an anchor to select it; Shift toggles.
    - A marquee selects anchors.
    - Dragging selected anchors calls `moveAnchors`.
    - Dragging a handle calls `moveHandle`, with Alt passed as `breakSymmetry`.
    - Delete or Backspace calls `removeAnchors`. A path left empty is removed.
    - Arrow keys nudge the selected anchors 1 unit (Shift: 10).
    - Each drag end, nudge or delete is one `act` with `updateNode(…, normalizeEdit(node, model))`.
    - Anchors and handles are drawn in screen size: 10 px squares and 5 px handle dots, regardless of zoom. Selected anchors are filled `#8E1EA2`.
  - **Add anchor:** clicking within 6 screen px of a segment inserts an anchor there (`hitSegment` + `insertAnchor`).
  - **Convert anchor:** clicking toggles `corner` ↔ `smooth`.
  - **PathPanel** (replaces the Properties content in edit mode):
    - Selected point: X and Y in page units, with the node rotation applied.
    - Kind segmented control: Corner, Smooth, Symmetric.
    - Path section: Points (read-only count), a Closed checkbox, and a fill rule control (Non-zero, Even-odd).
- [ ] **Step 1: Failing e2e tests:**
  - `pen draws a closed path`:
    - Press `P`.
    - Click the canvas at three points, then click the first point again.
    - A layer named "Path" is listed.
    - Undo once and the layer is gone.
    - Redo, reload, and the layer is still there.
  - `editing a point is one undo step`:
    - Draw a triangle with the pen and double-click it.
    - Drag the first anchor 40 px right.
    - The Selected point X field increased.
    - Undo restores the old X, and the layer still exists.
  - `viewer cannot edit paths`: as a viewer, double-clicking a path shows no "Editing path" pill.
- [ ] **Step 2:** `pnpm --filter @cherry/web e2e` → the new tests FAIL. **Step 3:** Implement. **Step 4:** e2e, unit tests and typecheck PASS.
- [ ] **Step 5:** Commit `feat(web): pen tool and point editing`.

---

### Task 6: Boolean ops and flatten in the editor (web)

**Files:**
- Modify: `apps/web/src/editor/Properties.tsx`, `apps/web/src/routes/Editor.tsx`
- Test: extend `apps/web/e2e/editor.spec.ts`

**Interfaces:**
- Consumes: `booleanOp` and `flatten` (Task 3), `addNode`, `removeNodes`, `act`.
- Produces:
  - Properties shows a section "Combine" with the buttons "Union", "Subtract", "Intersect" and "Exclude", each with the icon from VectorEdit.dc.html. It appears when 2 or more selected top-level nodes are `rect`, `ellipse` or closed `path`.
  - Running an op:
    - Pass the eligible selected nodes in page order (bottom → top).
    - In one `act`: `removeNodes` the operands, then `addNode` the result at the bottom-most operand's index.
    - Select the result.
  - A `null` result removes nothing and shows `role="status"` text: "These shapes don't overlap."
  - Properties shows "Convert to path" for a single selected `rect` or `ellipse`. It runs `flatten` in one `act` (`updateNode` can't change `kind`, so `removeNodes` + `addNode` at the same index, keeping the id) and keeps the selection.
  - Keyboard: `Control/Meta+Alt+U/S/I/E` run union, subtract, intersect and exclude. Viewers see neither the section nor the button.
- [ ] **Step 1: Failing e2e tests:**
  - `union combines two shapes`:
    - Place two overlapping rectangles and select both (Control+A).
    - Click "Union".
    - The layers list shows exactly one layer, named "Union".
    - Undo once and two layers are back.
  - `disjoint intersect explains itself`: two separate rectangles → "Intersect" shows "These shapes don't overlap." and both layers stay.
  - `convert to path keeps the layer`: a rectangle → "Convert to path" → the layer count is unchanged, and double-clicking it shows the "Editing path" pill.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** All suites PASS.
- [ ] **Step 5:** Commit `feat(web): boolean operations and convert to path`.

---

### Task 7: Save to library and insert library shapes in the editor (web)

**Files:**
- Create: `apps/web/src/editor/ShapesPanel.tsx`, `apps/web/src/editor/SaveShapeDialog.tsx`
- Modify:
  - `apps/web/src/api.ts`: add `Shape`, `Visibility`, `saveShape`, `listShapes`, `deleteShape`, and COPY entries `invalid_shape` → "That shape couldn't be read. Try simplifying it." and `forbidden` (existing).
  - `Toolbar.tsx`, `routes/Editor.tsx`, `Properties.tsx`, `editor.css`
- Test: extend `apps/web/e2e/editor.spec.ts`

**Interfaces:**
- Consumes: the Task 4 routes, `nodeToPath` and `scalePath` from `@cherry/vector`, `addNode`, `act`, and `currentWorkspace`/the design's `workspaceId`.
- Produces:
  - `api.ts`:
    - `saveShape(body: { name: string; tags: string[]; visibility: Visibility; workspaceId?: string; d: string; fillRule: "nonzero" | "evenodd"; fill?: Paint; stroke?: Stroke }) => Promise<{ shape: Shape }>`
    - `listShapes(scope: "mine" | "workspace" | "public", opts?: { workspaceId?: string; q?: string }) => Promise<{ shapes: Shape[] }>`
    - `deleteShape(id: string) => Promise<void>`
  - Properties shows a "Reuse this shape" box with a "Save as custom shape" button for a single selected `rect`, `ellipse` or `path`. Viewers see it too: saving to the library doesn't edit the design.
    - The button opens `SaveShapeDialog` (`role="dialog"`, labelled "Save shape").
    - Fields: Name (default: the node name), Tags (comma-separated), and Share with (`Only me` / `This workspace` / `Everyone (public)`). "This workspace" is disabled for viewers.
    - Saving sends `nodeToPath(node, "local")` with the node's fill and stroke, then closes. It shows `role="status"` "Saved to your shapes". On error it shows `errorMessage(e)` in the dialog.
  - The toolbar gets a "Shapes" button that toggles `ShapesPanel`, a left-side drawer.
    - Tabs: "Basic", "My shapes", "Workspace", "Public", plus a search input (debounced 250 ms, passed as `q`).
    - "Basic" lists the six built-in shapes; clicking one arms that tool.
    - In the other tabs, clicking a shape inserts it in one `act` as a `path` node:
      - `name` = the shape name.
      - Scaled so its longer side is 25% of `min(page.width, page.height)`, aspect kept, centred on the page.
      - `d` from `scalePath`; stroke width multiplied by the same factor.
      - Then select it.
    - Thumbnails are inline `<svg viewBox="0 0 w h"><path d fill fill-rule/></svg>`, using the stored values only.
    - Loading, empty ("No shapes yet") and error (with Retry) states. Viewers can browse but not insert.
- [ ] **Step 1: Failing e2e tests:**
  - `save a shape and drop it into another design`:
    - Draw a pen triangle and click "Save as custom shape".
    - Set Name "Peak", Share with "Only me", and save. "Saved to your shapes" appears.
    - Create a new design and open Shapes → "My shapes". "Peak" is listed.
    - Click it. A layer "Peak" appears.
  - `workspace shapes are shared`:
    - The owner saves "Badge" to This workspace.
    - A second member, in their own browser context, opens Shapes → "Workspace" and sees "Badge".
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** All suites PASS.
- [ ] **Step 5:** Commit `feat(web): save shapes to the library and insert them from the shapes panel`.

---

### Task 8: SVG import and the Shapes page (web)

**Files:**
- Create: `packages/vector/src/svg.ts` (browser-only: uses `DOMParser` through Paper), `apps/web/src/routes/Shapes.tsx`
- Modify:
  - `packages/vector/src/index.ts`: re-export `svg.ts`.
  - `apps/web/src/App.tsx`: route `/shapes`.
  - `apps/web/src/routes/Home.tsx`: a nav link "Shapes".
  - `ShapesPanel.tsx`: an "Import SVG…" button.
- Test: extend `apps/web/e2e/editor.spec.ts`; create `apps/web/e2e/shapes.spec.ts` and `apps/web/e2e/fixtures/{berry.svg,hostile.svg}`

**Interfaces:**
- Consumes: `scope()`, `toPathData`, `pathBounds`, `transformPath`, Task 7's api functions and `ShapesPanel`.
- Produces:
  - `svgToPaths(svg: string): { d: string; fill?: Paint; stroke?: Stroke; fillRule: "nonzero" | "evenodd" }[]`:
    - Parse with `scope().project.importSVG(svg, { expandShapes: true, insert: false })`. Strip every `<script>`, `<foreignObject>`, `<image>`, `<use>` and `on*` attribute before parsing.
    - Walk every `Path` and `CompoundPath` with its global matrix applied. The resulting `d` is in SVG user units, normalized.
    - Fill and stroke: a solid colour comes from the item's resolved `fillColor`/`strokeColor` (hex plus alpha as `opacity`). Gradients and no-colour become `undefined`. An item with neither fill nor stroke gets fill `#22142A`.
    - Throws `InvalidSvg("too_large")` when `svg.length > 1_000_000`, `InvalidSvg("no_shapes")` when there are 0 paths, and `InvalidSvg("too_complex")` above 2 000 paths.
  - **Editor import** ("Import SVG…" in ShapesPanel, file input `accept=".svg,image/svg+xml"`):
    - All paths are added in one `act` as `path` nodes named "Imported 1…n", in document order (bottom → top).
    - The set is scaled uniformly so its combined bounds fit 60% of the page, centred on the page.
    - Errors show "That file is too large (1 MB max).", "That SVG has no shapes to import." or "That SVG has too many shapes (2,000 max)." in `role="alert"`.
  - **`/shapes` page** (ShapeLibrary.dc.html layout, signed-in only):
    - Left nav: the Home sidebar pattern, with "Shapes" active.
    - Tabs: Basic / My shapes / Workspace / Public, with search. The Workspace tab uses `currentWorkspace.pick`.
    - Grid of thumbnails. Your own shapes (`mine`) have a "Delete" button with `confirm()`.
    - A "New shape" side panel:
      - "Draw with the pen": text explaining you draw in any design, then "Save as custom shape".
      - "Import an SVG": a file input. The imported paths are combined into one compound `d` (with `fillRule` from the first path, `fill` from the first filled path) and previewed.
      - The form: Name, Tags, Share with, and a "Save shape" button calling `saveShape`.
- [ ] **Step 1: Failing e2e tests** (fixtures: `berry.svg` has a `<g transform="translate(100 50) scale(2)">` with a `<circle>` and a `<path>`; `hostile.svg` has a `<script>window.__pwned=1</script>`, an `onload`, an external `<image href="http://example.invalid/x.png">` and one `<rect>`):
  - `import an SVG into a design`: Shapes → Import SVG… with `berry.svg` → layers "Imported 1" and "Imported 2" appear. Undo once and both are gone.
  - `hostile SVG imports only its shape`: importing `hostile.svg` → exactly one layer is added, and `await page.evaluate(() => (window as any).__pwned)` is `undefined`.
  - `too-large file is refused`: a 1.1 MB generated SVG → the alert "That file is too large (1 MB max)." appears, and no layer is added.
  - `shapes page imports and saves` (`shapes.spec.ts`):
    - Open Home → Shapes.
    - Import `berry.svg`, set Name "Berry", Tags "fruit", and Share with "Everyone (public)", then save.
    - Berry appears under My shapes.
    - A second user sees it under Public, with no Delete button.
    - Searching "FRUIT" still lists it.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `pnpm test`, `pnpm typecheck` and `pnpm --filter @cherry/web e2e` all PASS.
- [ ] **Step 5:** Commit `feat: svg import and the shapes page`.

---

## Done when

From the editor, a person can:
- draw paths with the pen and edit their anchors and handles, including on rotated shapes;
- combine shapes with union, subtract, intersect and exclude, and convert rectangles and ellipses to paths;
- import an SVG into a design;
- save any shape to the library as Only me, This workspace or Everyone (public);
- find shapes again on the Shapes page or in the editor's Shapes panel and drop them into any design.

Every one of these actions is a single undo step and autosaves. `pnpm test`, `pnpm typecheck` and `pnpm --filter @cherry/web e2e` pass.

## Next plans

Phase 4 (Visual library) adds uploads with sanitization and licences, and its report flow extends to public shapes. Phase 3 leaves these for later:
- the pencil and scissors tools;
- outline stroke;
- per-point corner radius;
- editing or renaming a saved library shape;
- multi-colour library shapes.
