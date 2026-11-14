# Phase 6: Collaboration & History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Several people edit one design live, see who else is in it, and use a version history to name versions, restore them, branch from them and compare them with the current design.

**Architecture:**
- **Live server.** A Hocuspocus server is mounted on the existing Fastify app as a websocket at `/api/collab`. Each design is one Yjs document, named by its id. It loads from `designs.state` and is stored back on a debounce.
- **Validation.** Every client update is checked before it is applied: the document must stay valid, and for editors brand locks are enforced. The existing `PUT /api/designs/:id/state` stays, but it now writes through the same live document, so there is one source of truth.
- **Web client.** The editor swaps its HTTP autosave for a `HocuspocusProvider`. Presence uses Yjs awareness.
- **Versions.** Versions are snapshots in a new `design_versions` table. Restore and branch run on the server. Compare is a layer-level diff computed in `@cherry/doc`, shown on a `/d/:id/history` page.

**Tech Stack:** As in AGENTS.md, plus these (all MIT; Task 2 checks again at install):
- `@hocuspocus/server` 4.x and `@fastify/websocket` 11.x, on the server.
- `@hocuspocus/provider` 4.x, on the web.
- `ws` 8.x, a server devDependency used as the test client's WebSocket.

**Spec:** `docs/superpowers/specs/2026-11-11-cherry-berry-design.md`, Phase 6 ("live multi-user editing, presence, named versions, restore, branch, compare"). The stack section says to use Hocuspocus with Postgres persistence. The screens are `project/VersionHistory.dc.html` and the header of `project/Editor.dc.html` in the screen designs artifact.

## Global Constraints

- **Licenses.** Every dependency must be MIT, Apache-2.0, BSD, ISC or MPL-2.0.
- **Contrast and colors.** Text needs ≥ 4.5:1 contrast. `#8E1EA2` is the only palette color allowed for body text on white. `#C654C3` is only for large text and icons. `#ED96D7` and `#FFC0DE` are only for backgrounds.
  - Neutrals: ink `#22142A`, muted `#5D4E66`, line `#E9DFEC`, surface `#FBF7FC`.
  - Status: success `#1E7A46`, warning `#B45309`, error `#B3261E`.
- **Fonts.** Space Grotesk for headings, Inter for body.
- **No AI features.**
- **Server structure.** Server routes do auth and Zod parsing only; logic lives in `service.ts`. Errors are `HttpError`/`WorkspaceError` codes sent as `{ error }`.
- **Web errors.** Web errors go through the `errorMessage()` copy in `apps/web/src/api.ts`.
- **Generated files.** Migrations come only from `pnpm --filter @cherry/server db:generate`. Never hand-edit `drizzle/` or `pnpm-lock.yaml` (`pnpm add` updates the lockfile itself).
- **Every task ends green.** That means `pnpm typecheck`, `pnpm test`, and the task's own e2e spec (`cd apps/web && npx playwright test <spec>`). Never touch ports 3000/5173, because e2e uses 3101/5181.

## Decisions made for this plan

These are my calls; the user reviews them with the plan.

1. **One live document per design, served by Hocuspocus at `/api/collab`.**
   - The document name is the design id.
   - Auth uses the session cookie sent with the websocket upgrade. Non-members are refused, and viewers connect read-only.
   - Roles are checked when someone connects. A member removed mid-session keeps their open connection until it closes.
2. **The server checks every incoming update** with the same function the HTTP save uses: the document must still parse, and for editors brand locks are enforced. A rejected update is not applied. The sender's connection is closed with the reason `invalid_document` or `brand_locked`, and the editor shows the existing copy and the Reload button.
3. **Persistence.** The live document is written to `designs.state` (plus title, size, unit and colour mode) at most every 2 s, at least every 10 s while it is changing, and immediately when the last person leaves.
   - Server code that needs the current state reads the live document when it is loaded. That covers open, publish template, PUT state, versions, restore and branch.
   - Hocuspocus keeps documents in memory, so this assumes one server process. Running several needs Hocuspocus's Redis extension; that is out of scope.
4. **The HTTP `PUT /api/designs/:id/state` stays** for non-realtime clients and the existing tests. It merges into the live document, so connected editors see the change.
5. **"Saved" means the server has the change.** The editor's status reads "Saved" when the provider has no unsynced changes. A disconnect shows "Offline", and edits made offline sync on reconnect while the tab stays open. Offline storage that survives a reload is not in this phase.
6. **Versions.** There are four kinds:
   - `auto`: taken on store when the newest version is ≥ 10 minutes old and the content changed.
   - `named`: "Name this version", or naming an existing version.
   - `restore`: "Before restore", taken automatically before every restore.
   - `branch`: a marker in the source design's history pointing at the new design.

   Each version stores the full Yjs state and a one-line summary built from the layer diff against the previous version, e.g. "Added Berry cluster, changed Headline".
7. **Restore** replaces the live document's content in one transaction, so everyone connected sees it. It is not on anyone's undo stack: the "Before restore" version is the way back. Editors are subject to brand locks, so restoring over a locked layer fails with `brand_locked`.
8. **Branch** copies a version into a new design in the same workspace, titled `<title> — <branch name>`, with the same kit, and links it to its parent design and version. Merging a branch back is not in the spec, so it is not built.
9. **Compare is by layer, not by pixel.** Nodes are matched by id across all pages and reported as added, removed or changed. The history page shows the three screen modes: Single, Side by side (with changed layers outlined on the current design), and Overlay diff (the version at 40 % opacity over the current design, plus the outlines).
10. **Presence.**
    - Header avatars: initials, up to 4 plus "+N", with `aria-label` "N people editing".
    - Other people's selections get an outline in their colour, labelled "<Name> is editing".
    - Other people's cursors are shown on the same page.
    - Colours are assigned from a fixed list by a hash of the user id: `#8E1EA2`, `#1E7A46`, `#B45309`, `#1D4ED8`, `#9D174D`, `#22142A`. All six pass 4.5:1 with white label text.
    - "Share" opens a popover with the design link, a Copy button and the line "People in <workspace> can open this link." Sharing outside the workspace is not part of this phase.

## Review Focus

1. **Two people change the same layer at the same moment.** Both editors converge on the same valid document; neither connection is closed, and nothing is lost except the losing value of the same property. Test in Task 2: `concurrent edits to one node converge`.
2. **A connection drops mid-edit, the person keeps editing, then reconnects.** The status goes Offline → Saved, and the edits made offline reach the other editor and the database. Test in Task 3: e2e `offline edits sync on reconnect`.
3. **A viewer, or anyone with a hand-built client, sends updates over the raw websocket.** They are not applied: the stored and live documents are unchanged and other clients never see them. Test in Task 2: `viewer updates are ignored` and `editor update that breaks a brand lock closes the connection`.
4. **Someone restores a version, or deletes layers, while another person has those layers selected.** The other editor drops the vanished ids from its selection and keeps working: no crash and no transformer on a missing node. Test in Task 4: e2e `a remote delete clears my selection`.
5. **The server stops between debounced stores.** At most the last 10 s of a still-connected session is lost. When the last person leaves, the document is stored at once. Test in Task 2: `last disconnect stores immediately`.

---

### Task 1: Document diff, summary and replace

**Files:**
- Create: `packages/doc/src/diff.ts`, exported from `packages/doc/src/index.ts`
- Modify: `packages/doc/src/ops.ts`: add `replaceDocument`
- Test: `packages/doc/test/diff.test.ts`, `packages/doc/test/ops.test.ts`

**Interfaces:**
- Produces:
  - `type DocDiff = { added: string[]; removed: string[]; changed: string[] }`. Node ids across all pages, each list in document order.
  - `diffDocs(before: CherryDocument, after: CherryDocument): DocDiff`
    - A node is `changed` when it exists in both and differs: on any property other than `children`, on its page, or on its parent id. Group children are compared as nodes of their own.
    - Page-level changes (name, size, background) count as changed. They are reported as the page id in `changed`.
  - `summarizeDiff(diff: DocDiff, before: CherryDocument, after: CherryDocument): string`
    - Format: `"Added A, B; changed C; removed D"`, using node `name`s (page names for page ids). Groups that are empty are omitted.
    - At most 3 names per group, then `" and N more"`. Returns `"No changes"` when everything is empty.
  - `replaceDocument(ydoc: Y.Doc, doc: CherryDocument, origin?: unknown): void`
    - Within one transaction, replaces `meta` and every page so that `yToDoc(ydoc)` deep-equals `doc`. The existing Y.Doc object is kept, so providers and observers stay attached.

- [ ] **Step 1: Write the failing tests.** In `diff.test.ts`:
  - `diffDocs finds added, removed and changed nodes`: move a rect, add an ellipse, delete a text, and expect exactly those ids in the right lists.
  - `moving a node into a group or to another page is a change`
  - `page resize is reported as a page change`
  - `summarizeDiff names layers and caps at three`: 5 added layers give `"Added A, B, C and 2 more"`.
  - `identical documents summarize as "No changes"`

  In `ops.test.ts`:
  - `replaceDocument swaps content in one transaction and keeps the Y.Doc`: count `update` events (expect 1) and check that `yToDoc` deep-equals the target.
- [ ] **Step 2: Run** `pnpm --filter @cherry/doc test`. Expected: FAIL (the exports don't exist yet).
- [ ] **Step 3: Implement** `diff.ts` and `replaceDocument`. Use the existing `flatten`-style walk from `brand.ts` if it fits, rather than writing a second one.
- [ ] **Step 4: Run** `pnpm --filter @cherry/doc test` and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(doc): document diff, change summary and replace`.

---

### Task 2: Live collaboration server

**Files:**
- Create: `apps/server/src/collab/server.ts`, `apps/server/src/collab/routes.ts`
- Modify:
  - `apps/server/src/designs/service.ts`: extract the shared check, persist through the live document, and read live state
  - `apps/server/src/app.ts`: register the websocket and collab; close it on `onClose`
  - `apps/server/src/templates/service.ts`: publish reads the live state
  - `apps/server/package.json`: add the dependencies
- Test: `apps/server/test/collab.test.ts`

**Interfaces:**
- Consumes: `brandLockViolation`, `yToDoc` and `docToY` from `@cherry/doc`; `getRole`; the Better Auth `auth.api.getSession`.
- Produces:
  - `designs/service.ts`:
    - `checkUpdate(current: Y.Doc, update: Uint8Array, role: Role): void`
      - Applies `update` to a **clone** of `current`.
      - Throws `HttpError(400, "invalid_document")` if the update fails to apply or the result fails `yToDoc`.
      - For `role === "editor"`, throws `WorkspaceError("brand_locked")` when `brandLockViolation(before, after)`.
      - Viewers throw `WorkspaceError("forbidden")`.
      - The per-message clone costs O(document size). Mark it with a `ponytail:` comment.
    - `persistState(db: Db, id: string, ydoc: Y.Doc): Promise<DesignSummary>`: writes `state`, title, width, height, unit, colorMode and `updatedAt`, using the same derivation as today.
  - `collab/server.ts`:
    - `createCollab(db: Db, auth: Auth): Collab`
    - `type Collab = { handle(socket, request): void; liveState(id: string): Uint8Array | null; withDocument<T>(id: string, fn: (doc: Y.Doc) => T | Promise<T>): Promise<T>; onStored(cb: (id: string, doc: Y.Doc, by: string | null) => Promise<void>): void; close(): Promise<void> }`
      - `withDocument` opens a direct connection (it loads the document if nobody has it open), runs `fn` inside it, and disconnects. A change made inside it is broadcast and stored.
      - `onStored` is the hook Task 5 uses to take auto versions. `by` is the last connected user to change the document.
  - The websocket route is `GET /api/collab`.
- **Hocuspocus behaviour.** Check the hook names and signatures against the installed v4 type definitions.
  - **Authenticate:** read the session from the upgrade request's headers, then `getRole` for the design's workspace (the document name is the design id). Unknown, invalid or non-member → reject. Viewer → read-only connection.
  - **Load:** start from `designs.state`.
  - **Store:** debounce 2000 ms, max debounce 10000 ms, and store immediately on the last disconnect. Call `persistState`, then the `onStored` callbacks.
  - **Before an incoming update is applied** (`beforeHandleMessage` or its v4 equivalent), extract the Yjs update from sync step 2 and update messages, run `checkUpdate` with the connection's role, and on failure close that connection with the error code as the reason. Awareness and sync step 1 messages pass through untouched.
- **Existing routes change:**
  - `saveDesignState` (`PUT /state`) becomes `collab.withDocument(id, doc => { checkUpdate(doc, incoming, role); Y.applyUpdate(doc, incoming) })`. The response shape is unchanged.
  - `openDesign` returns `liveState(id) ?? row.state`.
  - `publishTemplate` uses the live state when there is one.

- [ ] **Step 1: Add dependencies.**
  - Server: `pnpm --filter @cherry/server add @hocuspocus/server @fastify/websocket` and `pnpm --filter @cherry/server add -D ws @types/ws @hocuspocus/provider`. The provider is a test client only.
  - Check each license: `npm view <pkg> license` must be MIT, Apache-2.0, BSD, ISC or MPL-2.0.
- [ ] **Step 2: Write the failing tests** in `collab.test.ts`.
  - **Setup.** `buildApp` on PGlite, `app.listen({ port: 0 })`, and a helper `connect(cookie, designId)` that returns a `HocuspocusProvider` with its own `Y.Doc`, using `ws` as its WebSocket and sending the session cookie.
  - **Tests:**
    - `two editors see each other's changes`: A adds a rect, and B has it within 2 s.
    - `concurrent edits to one node converge`: A and B each set a different `x` on the same rect in the same tick. After sync both docs are equal, both still parse, and both connections are open.
    - `unauthenticated and non-member connections are refused`: the provider gets an authentication failure.
    - `viewer updates are ignored`: a viewer's local change never reaches the editor or the database.
    - `editor update that breaks a brand lock closes the connection`: the owner sets a node to `fixed`, the editor moves it, the editor's connection closes with reason `brand_locked`, and the live and stored documents keep the original `x`.
    - `invalid document update closes the connection`: write a junk value into a node map.
    - `last disconnect stores immediately`: after the change, close every provider, then read `designs.state` within 500 ms and expect the change, with the title column updated.
    - `PUT state merges into the live document`: a connected provider receives a rect saved through HTTP.
  - The existing `designs.test.ts` and `brand.test.ts` must keep passing unchanged.
- [ ] **Step 3: Run** `pnpm --filter @cherry/server test`. Expected: the new tests FAIL.
- [ ] **Step 4: Implement** as described.
- [ ] **Step 5: Run** `pnpm --filter @cherry/server test` and `pnpm typecheck`. Expected: PASS, including every earlier server test.
- [ ] **Step 6: Commit** `feat(server): live collaboration over Hocuspocus`.

---

### Task 3: Editor uses the live connection

**Files:**
- Modify:
  - `apps/web/src/editor/useDesign.ts`: replace `Autosave` with a provider
  - `apps/web/vite.config.ts`: proxy websockets
  - `apps/web/src/api.ts`: add COPY for `invalid_document` if it's missing
  - `apps/web/package.json`
- Delete: `apps/web/src/editor/autosave.ts`, `apps/web/src/editor/autosave.test.ts`
- Test: `apps/web/e2e/collab.spec.ts`

**Interfaces:**
- Consumes: Task 2's `/api/collab`; `GET /api/designs/:id` still provides `design` and `role`.
- Produces: `DesignState["ready"]` gains `provider: HocuspocusProvider`. `status` keeps the type `SaveStatus = "saved" | "unsaved" | "saving" | "offline" | "error"`, so the Publish dialog and header keep working.

**Behaviour:**
- **Loading.**
  - Load metadata and role with `getDesign`, then create the provider: URL `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/collab`, name the design id, and use a fresh `Y.Doc`.
  - The editor renders once the first sync completes. If the synced doc fails `yToDoc`, show "This design couldn't be opened."
  - The undo manager is created after that first sync.
- **Status mapping:**
  - unsynced changes > 0 → `"saving"`;
  - synced with no unsynced changes → `"saved"`;
  - disconnected → `"offline"`;
  - closed by the server with reason `brand_locked` or `invalid_document` → `"error"`, with that `statusCode` and `errorMessage` copy. The existing Reload button appears and calls `reload()`, which destroys the provider and loads again.
- **`beforeunload`.** Keep the guard while there are unsynced changes.
- **Teardown.** Unmount destroys the provider after unsynced changes reach 0, or immediately when discarding.
- **Proxy.** `vite.config.ts` proxies `/api` with `ws: true`.

- [ ] **Step 1: Add the dependency.** `pnpm --filter @cherry/web add @hocuspocus/provider`, after checking its license.
- [ ] **Step 2: Write the failing e2e** in `collab.spec.ts`:
  - `two people edit live`: an owner and an invited editor, in two browser contexts, open the same design. The owner adds a rectangle and the editor's Layers list shows it within 5 s. The editor renames the title and the owner's header shows the new title.
  - `offline edits sync on reconnect`: the editor's context goes offline (`context.setOffline(true)`), the status reads "Offline", and the editor adds a rect. It then goes back online. The status reaches "Saved" and the owner sees the rect.
  - `a viewer watches changes but cannot edit`: the viewer sees the owner's new rect appear.
- [ ] **Step 3: Run** `npx playwright test collab`. Expected: FAIL.
- [ ] **Step 4: Implement**, and delete `autosave.ts` and its test.
- [ ] **Step 5: Run** `pnpm --filter @cherry/web test`, `pnpm typecheck`, and `npx playwright test collab editor brand-lock brand-editor templates`. Expected: PASS. The earlier specs rely on "Saved" and `brand_locked` and must still pass.
- [ ] **Step 6: Commit** `feat(editor): edit designs live over the collaboration server`.

---

### Task 4: Presence and share

**Files:**
- Create: `apps/web/src/editor/presence.ts`, `apps/web/src/editor/Presence.tsx`
- Modify:
  - `apps/web/src/routes/Editor.tsx`: header avatars, Share popover, publish local state, prune the selection
  - `apps/web/src/editor/Canvas.tsx`: draw remote selections and cursors
  - `apps/web/src/editor/editor.css`
- Test: `apps/web/src/editor/presence.test.ts`, `apps/web/e2e/presence.spec.ts`

**Interfaces:**
- Consumes: `provider.awareness` from Task 3; the signed-in user (`useSession` or however AppShell gets it).
- Produces:
  - `presence.ts`:
    - `PRESENCE_COLORS = ["#8E1EA2", "#1E7A46", "#B45309", "#1D4ED8", "#9D174D", "#22142A"] as const`
    - `colorFor(userId: string): string`: a stable hash of the id into the list.
    - `initials(name: string): string`: up to 2 letters, uppercase.
    - `type Peer = { clientId: number; user: { id: string; name: string; color: string }; pageId: string | null; selection: string[]; cursor: { x: number; y: number } | null }`. The cursor is in page units.
    - `usePeers(awareness): Peer[]`: everyone except me, sorted by name. The same user in two tabs shows twice in the canvas but once in the avatars.
  - Local awareness fields: `user`, `pageId`, `selection` and `cursor`, updated on page change, selection change and a throttled (50 ms) pointer move over the stage. The cursor is null when the pointer leaves.

**UI:**
- **Header avatars** sit before "Publish": 32 px circles in the user's colour with white initials, overlapping by 8 px, up to 4 then a "+N" circle. The group has `aria-label` "N people editing", counting me. Each avatar has `title` = the name.
- **Share** is a header button that opens a popover with:
  - a read-only input holding `location.href` without the query string;
  - a "Copy link" button that writes it to the clipboard and changes to "Copied";
  - the line "People in <workspace name> can open this link."
- **On the canvas:**
  - Each peer's selection on the current page gets a 1.5 px outline in their colour, plus a label above its top-left: a pill in their colour with white text "<Name> is editing".
  - Each peer's cursor is a small arrow in their colour with their first name.
  - Neither one listens to events.
- **Selection pruning.** When document changes remove nodes, any selected id no longer present on the current page is dropped from the local selection, in an effect on the page's node ids.

- [ ] **Step 1: Write the failing tests.**
  - `presence.test.ts`:
    - `colorFor` is stable and in the list;
    - `initials("Ada King")` is `"AK"`, and `initials("ada")` is `"A"`.
  - `presence.spec.ts`:
    - `people see each other`: the owner and an editor open the design. The owner's header has a group labelled "2 people editing" with the editor's initials. The editor selects the rectangle, and the owner's page shows the text "<editor name> is editing".
    - `a remote delete clears my selection`: the editor selects the rect and the owner deletes it. The editor's Properties panel goes back to the no-selection state and the page has no errors (`page.on("pageerror")` collects nothing).
    - `share copies the link`: grant clipboard permissions, click Share then "Copy link", and expect the button to read "Copied" and the clipboard to hold the design URL.
- [ ] **Step 2: Run** `pnpm --filter @cherry/web test` and `npx playwright test presence`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm --filter @cherry/web test`, `pnpm typecheck`, and `npx playwright test presence collab editor`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(editor): presence, remote selections and share link`.

---

### Task 5: Versions on the server

**Files:**
- Modify:
  - `apps/server/src/db/schema.ts`: add `designVersions`, plus `designs.parentDesignId` and `designs.parentVersionId`
  - migration via `db:generate`
  - `apps/server/src/app.ts`: register the version routes and hook `collab.onStored`
- Create: `apps/server/src/versions/service.ts`, `apps/server/src/versions/routes.ts`
- Test: `apps/server/test/versions.test.ts`

**Interfaces:**
- Consumes: `Collab` (`withDocument`, `liveState`, `onStored`); `diffDocs`, `summarizeDiff` and `replaceDocument` from Task 1; `checkUpdate`-style brand-lock checking (`brandLockViolation`) for editors; `createDesign`'s insert shape.
- **The `design_versions` table:**
  - `id` uuid pk
  - `design_id` → designs, cascade on delete
  - `kind` text, with CHECK in (`auto`, `named`, `restore`, `branch`)
  - `name` text, nullable, at most 80 characters
  - `summary` text, not null
  - `state` bytea, not null
  - `created_by` → user, nullable (null for auto versions with no known author)
  - `created_at`
  - `branch_design_id` → designs, set null on delete
  - index `(design_id, created_at desc)`
- **New columns on `designs`:** `parent_design_id` (→ designs, set null) and `parent_version_id` (→ design_versions, set null).
- **Produces these routes.** Every route checks membership of the design's workspace and returns 404 outside it.
  - `GET /api/designs/:id/versions` → `{ versions: VersionSummary[] }`, newest first, without state, limited to 200.
    - `VersionSummary = { id, kind, name, summary, createdAt, createdBy: { id, name } | null, branchDesignId: string | null }`
  - `POST /api/designs/:id/versions` with `{ name }` (1–80 characters, trimmed) → 201 `{ version }`. It snapshots the current live state as `named`. Viewers get 403.
  - `PATCH /api/versions/:id` with `{ name: string | null }`. It names or un-names a version, and an `auto` version becomes `named`. Viewers get 403.
  - `GET /api/versions/:id/state` → `{ state: base64 }`. Viewers may read.
  - `POST /api/versions/:id/restore`, which works in this order:
    1. Snapshot the current state as kind `restore`, named "Before restore".
    2. Run `collab.withDocument(designId, doc => replaceDocument(doc, versionDoc, "restore"))`.
    3. Return `{ design }`.

    Viewers get 403. For editors, if `brandLockViolation(current, versionDoc)`, respond with `brand_locked` and change nothing (not even the snapshot).
  - `POST /api/versions/:id/branch` with `{ name }` (1–60 characters):
    1. Create a design in the same workspace, titled `${title} — ${name}` and cut to 120 characters, with the version's state, the same `kitId`, and the parent ids set.
    2. Insert a `branch` version in the source design: named `name`, with summary `Branched from <version label>`, where the label is the version's name or its timestamp. It has `branchDesignId` and the version's state.
    3. Return 201 `{ design }`. Viewers get 403.
  - **Auto versions:** the `onStored(id, doc, by)` hook inserts an `auto` version when the newest version for the design is missing or ≥ 10 minutes old, and its state decodes to a document that differs (`diffDocs` is non-empty). Its summary is `summarizeDiff(previous ?? the empty state at creation, current)`, and `created_by` is `by`. Put `AUTO_VERSION_MS = 10 * 60_000` in the service, and let tests override it through the `buildApp` dependencies.

- [ ] **Step 1: Write the failing tests** in `versions.test.ts`, through `app.inject` plus Task 2's provider helper where live behaviour matters:
  - `name the current version and list it`
  - `rename and un-name a version; viewers cannot`
  - `viewer can list and read but not name, restore or branch` (each gets 403)
  - `restore replaces the live document for connected editors and keeps a Before restore version`: a connected provider sees the old content, and the list starts with "Before restore" and then the named version.
  - `editor restore across a brand lock is refused and changes nothing`
  - `branch creates a linked design and a marker in the source history`: check the new design's title and kit, and its state equals the version's.
  - `auto version after the interval, with a summary`: with the interval set to 0 through the dependencies, a stored change creates an `auto` version whose summary names the added layer, and a second store with no change creates none.
  - `versions of another workspace's design are 404`
- [ ] **Step 2: Run** `pnpm --filter @cherry/server test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Edit `schema.ts`, then run `pnpm --filter @cherry/server db:generate`, then write the service and routes.
- [ ] **Step 4: Run** `pnpm --filter @cherry/server test` and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): design versions with restore, branch and auto snapshots`.

---

### Task 6: Version history page

**Files:**
- Create: `apps/web/src/routes/History.tsx`, `apps/web/src/editor/DocPreview.tsx`
- Modify:
  - `apps/web/src/App.tsx`: add the route `/d/:id/history`
  - `apps/web/src/api.ts`: add `listVersions`, `nameVersion`, `renameVersion`, `versionState`, `restoreVersion`, `branchVersion`, `type VersionSummary`, and COPY entries
  - `apps/web/src/routes/Editor.tsx`: add a "History" header button linking to the page
  - `apps/web/src/editor/Canvas.tsx`: export the node renderer `DocPreview` needs
  - `apps/web/src/theme.css`
- Test: `apps/web/e2e/history.spec.ts`

**Interfaces:**
- Consumes: the Task 5 routes; `diffDocs` from Task 1; `getDesign` plus a read-only provider for "Current". Current must be live, so it updates while others edit.
- Produces: `DocPreview({ doc, pageId, width, height, highlight?: string[], ghost?: CherryDocument })`, a non-interactive Konva stage.
  - It renders a page scaled to fit the box, using the same node renderer as the editor's Canvas (exported from `Canvas.tsx`), never a second implementation.
  - `highlight` draws a 2 px dashed `#FFC0DE` outline around each id's bounds, offset 4 px, as on the screen.
  - `ghost` draws that document's same page at 40 % opacity on top.

**Page** (`/d/:id/history`, following `VersionHistory.dc.html`):
- **Header:**
  - a back link to `/d/:id` with `aria-label` "Back to editor";
  - `<design title> · Version history`;
  - a segmented control (`role="group"`, `aria-label` "View mode") with Single, Side by side and Overlay diff. The default is Side by side, and the choice is remembered in `localStorage` inside try/catch.
- **Versions list** (`aside`, `aria-label` "Versions"):
  - A "Name this version" button for non-viewers. It opens a small dialog with a Name field, which names the current state.
  - The first row is "Current", with the avatars of people in the design now (from awareness).
  - Then one row per version:
    - the time: `ddd HH:mm` within the past 7 days, otherwise a short date;
    - a tag pill with the name, for named versions;
    - a pink tag `Branch: <name>` with an "Open branch" link, for branch markers;
    - the creator's initials avatar and their name, or "Auto-saved" when there is none;
    - the summary.
  - Clicking a row selects it.
  - The selected row shows Restore (primary) and "Branch from here" for non-viewers.
    - Restore asks "Restore this version? Everyone editing will see it. The current design is kept as “Before restore”." with buttons Restore and Cancel.
    - "Branch from here" opens a dialog with a Name field, defaulting to the version's name or "Branch". On success it navigates to the new design.
- **Main area**, for the selected version against Current, on page 1, with a page picker when there are several pages:
  - Single: the selected version, large.
  - Side by side: the version on the left, captioned `<time> · “<name>”`; Current on the right, captioned `Current · N changes outlined`, with the `diffDocs(version, current)` added and changed ids highlighted.
  - Overlay diff: Current with the version as a ghost, plus the same highlights.
  - With no versions yet: "No versions yet. Name one, or keep editing — versions are saved every 10 minutes."
- **Errors:** `errorMessage` in an alert. A restore refused for `brand_locked` shows that copy.

- [ ] **Step 1: Write the failing e2e** in `history.spec.ts`:
  - `name a version, change the design, compare side by side`:
    - Make a design with one rect, open History, name the version "Client review v1".
    - Back in the editor, add a second rect and wait for "Saved".
    - Open History, select "Client review v1", and expect the caption "Current · 1 change outlined" and both previews' canvases visible.
  - `restore brings the old design back for everyone`:
    - With a second person (an editor) in the editor, the owner restores "Client review v1" from History.
    - The editor's Layers list loses the second rect.
    - History lists "Before restore" above it.
  - `branch from a version opens a new design`: branch it as "dark variant". The editor opens with the title `<title> — dark variant` and one rect. The original's History shows "Branch: dark variant" with "Open branch".
  - `viewer sees history without actions`: a viewer has no "Name this version", no Restore and no "Branch from here".
- [ ] **Step 2: Run** `npx playwright test history`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suites:** `pnpm typecheck`, `pnpm test`, and `cd apps/web && npx playwright test`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(web): version history with compare, restore and branch`.

---

## Self-review notes

**Spec coverage:**

| Phase 6 item | Task |
|---|---|
| Live multi-user editing | 2, 3 |
| Presence | 4 |
| Named versions | 5, 6 |
| Restore | 1 (`replaceDocument`), 5, 6 |
| Branch | 5, 6 |
| Compare | 1 (`diffDocs`), 6 |
| Hocuspocus with Postgres persistence (stack) | 2 |

**Out of this phase:**
- comments (not in the spec);
- merging branches;
- pixel diffs;
- offline storage that survives a reload, which comes with Phase 8 packaging;
- running several server instances (Hocuspocus Redis);
- sharing outside the workspace.
