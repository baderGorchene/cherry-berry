# Phase 4 (Visual library): rulings and deferred minors

Decisions taken during subagent-driven execution of `docs/superpowers/plans/2026-11-12-04-visual-library.md`, in order. Each ruling is: what was decided — why — what it costs if wrong. Later rulings that reverse earlier ones say so.

## Rulings

- Ruling: the user said "proceed with the next phases" — I start execution without a separate plan-approval pause; subagent-driven as in Phases 2 and 3 — cost if wrong: the user redirects the plan mid-flight
- Ruling: ingest runs inside the upload request, no pg-boss queue yet (spec lists pg-boss) — thumbnails take milliseconds and the queue is needed first by export in Phase 7 — cost if wrong: slow uploads of very large files
- Ruling: SVG sanitizing uses DOMPurify as the spec says, plus a hook removing external href/url() and any style containing a backslash, since Phase 3 showed url() escapes get past filters; files are served with a CSP and only shown through <img> — cost if wrong: some styled SVGs lose their CSS
- Ruling: private assets reach a design's viewers through an asset_uses table (design ↔ asset), not public URLs — keeps privacy and gives "Used in N designs" and Phase 7 attribution for free — cost if wrong: an extra call when inserting
- Ruling: a public item with open reports from 3+ users is hidden from public listings until the Phase 9 moderation queue exists — reports must have some effect — cost if wrong: brigading can hide an item (uploader still sees it)
- Ruling: collections, DPI, "Templates/Brand kits/Workspace" nav links in the design are out of scope for Phase 4 — not in the spec's Phase 4 line — cost if wrong: later additions
- T7 onDone signature: called with an asset for "Use existing" and without one after uploads — Ruling: onDone(asset?: Asset) receives the newest added or chosen asset — cost if wrong: one signature change |
- Task 2: Ruling: tree walk instead of DOMPurify hooks, and XML parsing, are accepted — the brief fixes the rules, not the mechanism, and XML parsing matches what librsvg and browsers see — cost if wrong: none if the rules hold (reviewer verifies)
- Task 2: Ruling: sharp stays although its prebuilt binary bundles libvips (LGPL-3.0-or-later) — the spec names sharp for thumbnails, and libvips ships as a separate dynamically loaded binary, not code linked into the MIT sources — cost if wrong: swap the thumbnailer; surfaced to the user in the final message
- Task 2: Ruling: the circular import minor joins the fix round — one-line move while the files are open — cost if wrong: none
- Task 2: Ruling: input caps stand in for a render time bound in Phase 4 — a killable render process is an architecture change that belongs with the Phase 7 export worker — cost if wrong: text-heavy SVGs (over 2 000 characters) are refused as too large
- Task 2: Ruling: an SVG with no width, height or viewBox reports whatever size librsvg renders, replacing the brief's 300×150 fallback — one renderer decides the size everywhere — cost if wrong: odd reported sizes for size-less SVGs
- Ruling: SVG thumbnail rendering moves to a child process killed after 5 s → too_large; text/use input caps removed — reverses the earlier "input caps until Phase 7" ruling: measured >10 min renders under every cap make it a live DoS — cost if wrong: one process spawn per SVG upload (~100 ms)
- Ruling: accept the depth check and the 5 s ceiling for text-heavy SVGs — bounded time beats unbounded; 5 000-char text in one SVG is rare for library visuals — cost if wrong: such SVGs rejected as too_large, raise the kill limit
- Ruling: fix entity expansion inside Task 2 (reject <!ENTITY and internal DTD subsets, check clean size after sanitizing) — same trust boundary, outside the diff only by line — cost if wrong: one more fix round
- Ruling: render concurrency limit (2) fixed now despite Minor — a few lines that close a CPU-exhaustion path — cost if wrong: SVG uploads queue under load
- Ruling: move all SVG parse/sanitize/metadata/render into the killable child; the parent keeps only linear checks — third main-thread parser blow-up, so close the class instead of adding caps — cost if wrong: about 0.5 s jsdom start per SVG upload
- Ruling: accept one warm idle child (~80–100 MB resident after the first SVG upload) — hides the 1.5 s jsdom start; a pool is a later upgrade — cost if wrong: memory on small self-hosted boxes
- Ruling: accept the one retry for crash-without-output (a hostile crash can cost 2 × 5 s) — it is indistinguishable from a dead spare, and both runs are bounded — cost if wrong: 2× work for crash-inducing files
- Ruling: unbounded render queue stays deferred — Task 3's per-user upload rate limit (60/min) is the bound for now; the final review revisits it before public exposure — cost if wrong: legit SVG uploads wait about 2.8 s per hostile job ahead
- Ruling: accept `escape '!'` for every ILIKE — explicit and portable across PGlite and Postgres — cost if wrong: none functional
- Ruling: dedupe returning your private asset when you upload the same bytes into a workspace stays as briefed; Task 7's "Use existing" flow is where the person sees it — cost if wrong: the person expects a workspace copy and must change the visibility by hand
- Ruling: no re-review for the 8-line fix — the controller read the diff and the test covers it — cost if wrong: an escaping slip in workspace search
- Ruling: use grants read on get, /file and /thumb only, not on list or by-hash — design viewers must see the images without browsing someone's library — cost if wrong: one SQL clause to widen later
- Ruling: advisory lock per sha256 around create and delete (re-checking usedIn inside the lock) — closes both races without new tables — cost if wrong: serializes same-hash uploads and deletes (rare)
- Ruling: workspace-visibility assets can only be used in designs of their own workspace; private (owner only) and public assets can be used anywhere — keeps workspace-only licenses inside the workspace — cost if wrong: people must copy a visual to use it in another workspace
- Ruling: insert under the lock and commit, then put, deleting the row if the put fails; storage-delete errors are logged, not thrown — race-safe and no connection held across S3 — cost if wrong: /file returns 404 for a moment between commit and put
- Ruling: open reports filed while an item was workspace-visible stay as hide votes after it goes public — Phase 9's moderation queue is where public reports get resolved — cost if wrong: an item made public after 3 workspace reports is hidden at once with no way to clear it until Phase 9
- Ruling: keep "1 design" singular, not the brief's literal "N designs" — correct English — cost if wrong: none
- Ruling: link first, then insert — deviates from the brief's insert-then-link; the brief's order is unsafe with a shared undo stack — cost if wrong: the node appears a request-latency later
- Final: Ruling: dedupe only against assets usable in the target placement (own private, public, or the same workspace), with by-hash taking workspaceId — resolves the conflict between the dedupe ruling and the workspace-only ruling — cost if wrong: more duplicate rows (storage is still shared by sha)
- Final: Ruling: reverse the "rate limit bounds the queue" ruling — over 8 waiting SVG jobs → 503 busy — measured instance-wide stall — cost if wrong: legit SVG uploads see busy under load and retry

## Deferred minors

- Task 1: minor (deferred): s3 get/delete treat a NoSuchBucket 404 as a missing key (a wrong bucket looks like missing assets)
- Task 1: minor (deferred): 404/delete response bodies are never consumed (connection pool pressure at volume)
- Task 1: minor (deferred): minio and mc images unpinned; minio-init may race startup on newer mc
- Task 1: minor (deferred): S3_ENDPOINT accepts a URL without a scheme
- Task 1: minor (deferred): s3 round-trip test key lacks signing-sensitive characters
- Task 2: minor (deferred): `url( #g)` with a space is removed as external (over-removal)
- Task 2: minor (deferred): harmless CDATA <style> content is lost (Inkscape/Illustrator exports lose CSS styling)
- Task 2: minor (deferred): "renders without network" test asserts only that a WEBP came back; RED not captured
- Task 2: minor (deferred): depth estimate counts < in CDATA/<style> (SVG with >256 such < rejected); deep non-ASCII nesting returns invalid_image not too_large
- Task 2: minor (deferred): prescan rejects an SVG that mentions "<!DOCTYPE x [" in a comment; render queue has no length or wait limit (rate limit is the only bound)
- Task 2: minor (deferred): Linux orphan child if the parent is SIGKILLed (unverified); text-heavy SVG (>~4 500 chars) → too_large; ~1.6 s cold child start; CDATA <style> dropped; `url( #g)` with a space removed; no-network thumbnail test proves nothing
- Task 3: minor (deferred): rate-limit keyGenerator does a second session lookup; placement runs twice per upload; tests are missing for outsider by-hash on a workspace asset and for soft-delete hiding
- Task 4: minor (deferred): use-based readers see workspaceName, uploaderName and usedIn of the source workspace
- Task 4: minor (deferred): the race test can't prove the lock under PGlite (it serializes everything); concurrent same-user dedupe can insert a duplicate row
- Task 4: minor (deferred): a process crash between the row commit and the put leaves a row with no file, and re-upload dedupes onto it (Phase 9 sweep, or re-put on dedupe if storage is missing)
- Task 5: minor (deferred): hiding stops discovery only (get, /file and design use still work by id); stale "SQL twin" comment on visibleTo; rate-limit keyGenerator copied 3×; tests missing for one user reporting repeatedly, a cross-workspace resolve, and dedupe against a hidden asset
- Task 6: minor (deferred): ReportDialog has no focus move/trap/return; edit form doesn't pre-validate CC-BY attribution or workspace-only visibility; Sidebar fetches workspaces a second time; test 3 relies on the default public listing instead of search
- Task 6: minor (deferred): shape reports also say "visual" on 403/404
- Task 7: minor (deferred): drop zone and Remove stay live while busy (a removed row still uploads; files dropped mid-upload can be discarded on close); all files hashed at once (memory spike with many 50 MB files); unused dot2.png fixture; row status not announced to screen readers
- Task 8: minor (deferred): no viewer e2e test; the missing-visual e2e test only proves no crash; CSS rule order
- Task 8: minor (deferred): the insert after await uses the page captured at click (if that page is deleted meanwhile, the insert lands nowhere)
- Final: minor (deferred): a zero-byte file says unsupported_type rather than invalid_image; long filenames or too many tags fail with a vague invalid_body; editing visibility after use gets around the workspace rule (own assets only); assets.created_by ON DELETE CASCADE will break designs once account deletion exists; no retry button on a failed upload row; generic link error copy in VisualsPanel
- Final: minor (deferred): the UploadDialog dup-check ignores the chosen visibility; a busy row has no retry; one account can keep SVG uploads busy for everyone (no per-user fairness)

## Not verified

- MinIO compose services and `s3Storage` against real S3 (no Docker on the dev machine); every run used in-memory storage.
- Linux behaviour of the SVG render child when the server is SIGKILLed (Windows verified clean).
