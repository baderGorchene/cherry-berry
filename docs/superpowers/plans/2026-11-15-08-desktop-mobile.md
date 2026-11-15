# Desktop & Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cherry Berry runs as a Tauri desktop app and a Capacitor mobile app that connect to Cherry Berry Cloud or a self-hosted server chosen by URL, and the web app gets the phone layouts from the screen designs.

**Architecture:** The native shells do not bundle the editor. Each shell ships one tiny local page, the **launcher**, which remembers the chosen server, checks that it is a Cherry Berry server, and then navigates the window to that server's own web app. Every request is then same-origin, so cookies, the collab websocket's origin check, asset URLs and downloads all work exactly as on the web, and the app always matches its server's version. To make one URL serve both the UI and the API, the server can serve the built web app. The web app detects the shell from a user-agent marker, shows the server choice on the sign-in screen, and sends "Switch server" back to the launcher. Phone layouts are CSS and a few phone-only components in the existing web app (below 760 px).

**Tech Stack:** Tauri 2 (MIT/Apache-2.0), Capacitor 8 with `@capacitor/android` and `@capacitor/ios` (MIT), `@fastify/static` (MIT), Vite for the launcher, React for the web layouts, Playwright mobile emulation.

**Spec:** `docs/superpowers/specs/2026-11-11-cherry-berry-design.md` (Phase 8: "Tauri and Capacitor packaging, server picker (cloud vs self-hosted URL), mobile layouts"). Screens: "Sign in" (Server: Cherry Berry Cloud / Self-hosted server + address field), "Mobile · Sign in", "Mobile · Home", "Mobile · Editor", "Mobile · Library" in the design canvas.

## Decisions

1. **Remote UI, local launcher.** Shells load the server's web app rather than a bundled copy. Bundling would make every request cross-origin: third-party cookies are blocked in iOS WKWebView, `<img src>` asset URLs can't carry a bearer token, and the websocket origin check would need loosening. Cost: no UI when the server is unreachable (the launcher says so), and the server must serve the web app (Task 1).
2. **The Cloud address is a build setting**, `CHERRY_CLOUD_URL` (read by the launcher build as `VITE_CLOUD_URL`). With no value, the launcher and the sign-in picker offer only "Self-hosted server". No real cloud domain is hard-coded.
3. **Shell detection by user agent.** Desktop appends `CherryBerryDesktop/<version>`, mobile appends `CherryBerryMobile/<version>`. The launcher origin is fixed per platform: Windows desktop `http://tauri.localhost`, macOS/Linux desktop `tauri://localhost`, Android `https://localhost`, iOS `capacitor://localhost`.
4. **`http://` self-hosted addresses are allowed** (LAN servers), with a "Not secure" note under the address. Android cleartext and iOS ATS exceptions are enabled for that reason.
5. **Links to other origins open in the system browser** (desktop: Tauri navigation handler + opener plugin; mobile: Capacitor's default for hosts outside `allowNavigation`, plus the web app adds `target="_blank" rel="noopener"` to off-origin links). Navigation between the launcher and any server stays in the window.
6. **Downloads.** Desktop relies on the webview's own download handling (WebView2 / WKWebView via Tauri's download handler, saving to the Downloads folder). On mobile, Android WebView ignores `blob:` anchor downloads, so `exportFile`'s save step uses `@capacitor/filesystem` + `@capacitor/share` through `window.Capacitor` when present (writes to the cache directory, then opens the share sheet), else the existing anchor download.
7. **Identifiers and icons.** Bundle id `org.cherryberry.studio`, product name "Cherry Berry". There is no logo (spec non-goal): icons are generated from a plain `#8E1EA2` square with no mark (`tauri icon`, `@capacitor/assets`).
8. **Generated native projects are committed** (`apps/desktop/src-tauri`, `apps/mobile/android`, `apps/mobile/ios`), as is normal for Tauri and Capacitor; build outputs (`target/`, `build/`, `Pods/`) are git-ignored. If `cap add ios` cannot run on Windows, the iOS project is left for a macOS run and the README says so.
9. **Phone layouts are the web app's**, below 760 px, in every browser and both shells; the desktop app uses the normal layouts.

## Global Constraints

- Every dependency must be MIT, Apache-2.0, BSD, ISC or MPL-2.0; check before adding (Rust crates included).
- Text color contrast ≥ 4.5:1. `#8E1EA2` is the only palette color allowed for body text on white; `#C654C3` only for large text and icons; `#ED96D7` and `#FFC0DE` are backgrounds only. Neutrals: ink `#22142A`, muted `#5D4E66`, line `#E9DFEC`, surface `#FBF7FC`; status: success `#1E7A46`, warning `#B45309`, error `#B3261E`.
- Fonts: Space Grotesk (headings), Inter (body). Touch targets ≥ 44 px.
- No AI features available to the user. No logo, no mascot.
- Errors: `HttpError(status, code)` on the server, `ApiError` on the web; never a 500 for bad input.
- AGENTS.md: routes parse and authorize only, logic in `service.ts`; never hand-edit `pnpm-lock.yaml` (use `pnpm add`); `pnpm typecheck` and `pnpm test` pass before each commit. E2E runs on ports 3101/5181 only; never touch 3000/5173.

## Review Focus

1. **A sloppy self-hosted address** (`design.acme.com`, `https://design.acme.com/`, `https://design.acme.com/login`, a site that isn't Cherry Berry, a host that doesn't answer). The launcher normalizes it to an origin, and refuses the others with a plain message; it never navigates to a white screen. Test in Task 2: `normalizes and validates server addresses`.
2. **The remembered server is down when the app starts.** The launcher shows "Can't reach {host}" with Retry and Change server instead of the webview's error page. Test in Task 2: `unreachable remembered server shows retry`.
3. **Exporting on a phone.** The file reaches the user (share sheet on mobile, Downloads on desktop, anchor elsewhere). Test in Task 4: `save uses share on capacitor`; manual check listed in Task 4.
4. **Touch on the mobile canvas.** One finger on a layer moves it, one finger on empty canvas pans, two fingers pinch-zoom around their midpoint, and a pinch never moves a layer. Test in Task 6: `pinch zooms without moving the layer`.
5. **A link to another site inside a shell** (an attribution URL, the share link) does not trap the user in the app window. Test in Task 3: `off-origin links open in a new browsing context`.

---

### Task 1: Server serves the web app; public health check

**Files:**
- Modify: `apps/server/src/config.ts` (`WEB_DIST` optional path), `apps/server/src/app.ts`, `apps/server/package.json` (`@fastify/static`), `.env.example`, `README.md` (production section)
- Test: `apps/server/test/web.test.ts`

**Interfaces:**
- Produces: `GET /api/health` → `{ status: "ok", app: "cherry-berry" }` with `access-control-allow-origin: *` (no credentials header). When `config.webDist` is set: files under it are served at `/`; `/assets/*` with `cache-control: public, max-age=31536000, immutable`; any other GET that is not `/api/*` and has no file falls back to `index.html` with `cache-control: no-cache`; unknown `/api/*` still 404 `{error:"not_found"}`.

- [ ] **Step 1: Write failing tests** in `web.test.ts` (temp dir with `index.html` and `assets/a.js`):
  - `health is public and identifies the app` — body `{status:"ok",app:"cherry-berry"}`, `access-control-allow-origin` `*`.
  - `serves the web build with spa fallback` — `/` and `/d/123` return `index.html` (no-cache); `/assets/a.js` immutable.
  - `api paths never fall back` — `GET /api/nope` → 404 JSON.
  - `no web dist, no static routes` — without `WEB_DIST`, `/` → 404.
- [ ] **Step 2:** `pnpm --filter @cherry/server test web` → FAIL.
- [ ] **Step 3:** Implement; README: "Production: `pnpm --filter @cherry/web build`, set `WEB_DIST=apps/web/dist` and `PUBLIC_URL` to the address people use; one origin serves app and API."
- [ ] **Step 4:** Tests PASS; `pnpm typecheck`.
- [ ] **Step 5:** Commit `feat(server): serve the web app and a public health check`.

---

### Task 2: Launcher and the server picker

**Files:**
- Create: `apps/launcher/` (`package.json` `@cherry/launcher`, `index.html`, `src/main.ts`, `src/server.ts`, `src/server.test.ts`, `src/launcher.css`, `vite.config.ts`), `apps/web/src/native.ts`, `apps/web/src/native.test.ts`, `apps/web/e2e/server-picker.spec.ts`
- Modify: `apps/web/src/routes/SignIn.tsx`, `apps/web/src/AppShell.tsx` (account menu "Switch server", shell only), `apps/web/src/theme.css`

**Interfaces:**
- Produces:
  ```ts
  // apps/launcher/src/server.ts
  export function normalizeServer(input: string): { origin: string; insecure: boolean } | { error: "empty" | "invalid" };
  //  adds https:// when no scheme; keeps only scheme+host+port; insecure = http:
  export async function checkServer(origin: string, f?: typeof fetch): Promise<"ok" | "not_cherry" | "unreachable">;
  //  GET {origin}/api/health with a 8 s timeout; ok only when JSON app === "cherry-berry"
  export const STORAGE_KEY = "cherry.server";
  // apps/web/src/native.ts
  export type Shell = "desktop" | "mobile" | null;
  export function shell(ua?: string): Shell;
  export function launcherUrl(ua?: string): string | null;   // Decision 3 origins + "/"; null on the web
  export function switchServerUrl(target: string | null, ua?: string): string | null; // `${launcher}?server=${encodeURIComponent(target)}` or `?change=1`
  ```
- Launcher behavior (`main.ts`): `?server=X` → normalize, check, store, navigate; `?change=1` → show the picker with the stored value; otherwise a stored server → check then `location.replace(origin)`; nothing stored → the picker. Picker copy from the "Sign in" screen: heading "Choose where your designs live.", radio cards "Cherry Berry Cloud" / "The central instance, nothing to install." (only when `VITE_CLOUD_URL` is set) and "Self-hosted server" / "Your organization's own instance.", address input placeholder `https://design.your-company.com`, button "Continue". Messages: `invalid` → "Enter an address like design.your-company.com."; `not_cherry` → "{host} isn't a Cherry Berry server."; `unreachable` → "Can't reach {host}." with buttons Retry and Change server; insecure → "Not secure: this address uses http." in `#B45309`. Same palette and fonts as the app (fonts bundled via `@fontsource` woff2, no network).
- Web sign-in (shell only): the "Server" segmented control from "Mobile · Sign in" / the radio cards from "Sign in", showing the current origin; choosing another sends `location.href = switchServerUrl(...)`. Hidden on the web.

- [ ] **Step 1: Failing tests** — `server.test.ts`: `normalizes and validates server addresses` (`design.acme.com` → `https://design.acme.com`; `http://10.0.0.5:3000/x/` → origin + insecure; `""` → empty; `ht!tp://` → invalid); `checkServer` with a fake fetch: ok / `not_cherry` (200 HTML or other JSON) / `unreachable` (reject or timeout). `unreachable remembered server shows retry` — jsdom-free: export a `boot(state, deps)` from `main.ts` returning the view to render, and assert it yields `{view:"unreachable", host}`. `native.test.ts`: `shell` and `launcherUrl` for the four UA/platform combos and plain Chrome → null.
- [ ] **Step 2:** e2e `server-picker.spec.ts` — `picker shows only in a shell`: default UA → no "Server" field; with `userAgent` containing `CherryBerryDesktop/1` (Windows) → field present, choosing self-hosted + typing an address navigates to `http://tauri.localhost/?server=…` (assert via `page.route` intercept).
- [ ] **Step 3:** Run them → FAIL. Implement. Root `pnpm test` must include the launcher (`"test": "vitest run src"`).
- [ ] **Step 4:** Unit + `server-picker.spec.ts` PASS; `pnpm --filter @cherry/launcher build` emits `dist/index.html`; typecheck clean.
- [ ] **Step 5:** Commit `feat: launcher and server picker for the native apps`.

---

### Task 3: Desktop app (Tauri 2)

**Files:**
- Create: `apps/desktop/package.json` (`@cherry/desktop`, scripts `dev`, `build`, `test` → `cargo test --manifest-path src-tauri/Cargo.toml`), `apps/desktop/src-tauri/{Cargo.toml,build.rs,tauri.conf.json,src/main.rs,src/lib.rs,capabilities/default.json,icons/*}`, `apps/desktop/.gitignore` (`src-tauri/target`)
- Modify: `apps/web/src/main.tsx` or a small `apps/web/src/links.ts` (off-origin links get `target="_blank" rel="noopener noreferrer"`), `README.md` (desktop section)
- Test: `apps/desktop/src-tauri/src/lib.rs` unit tests, `apps/web/src/links.test.ts`

**Interfaces:**
- Consumes: Task 2 launcher build (`apps/launcher/dist`) as `frontendDist`; `beforeBuildCommand` `pnpm --filter @cherry/launcher build`.
- `tauri.conf.json`: identifier `org.cherryberry.studio`, productName "Cherry Berry", one window "main" titled "Cherry Berry", 1440×900, min 1024×640, `userAgent` = the platform default plus ` CherryBerryDesktop/<version>`, no remote IPC capabilities. Window navigation handler (`lib.rs`): allow the launcher origin and any `http`/`https` origin the window navigates to by itself; `window.open`/`target=_blank` requests open in the system browser via `tauri-plugin-opener`. Downloads saved to the Downloads folder (Tauri download handler) with the server's filename.
- `lib.rs` exports `fn is_launcher(url: &Url) -> bool` used by the handler.

- [ ] **Step 1: Failing tests** — Rust: `is_launcher` true for `http://tauri.localhost/` and `tauri://localhost/`, false for `https://tauri.localhost.evil.com/`. Web `links.test.ts`: `off-origin links open in a new browsing context` (a document click handler or a render helper — implementer's choice — makes `https://elsewhere.org` links `_blank` and leaves same-origin links alone).
- [ ] **Step 2:** Run → FAIL. Implement; add `@tauri-apps/cli` as a devDependency (`pnpm --filter @cherry/desktop add -D @tauri-apps/cli`), check crate licenses (`cargo metadata` or `cargo license` if available).
- [ ] **Step 3:** `pnpm --filter @cherry/desktop test` PASS; `pnpm --filter @cherry/desktop build -- --debug --no-bundle` produces the executable on Windows (report its path). Do not launch it in the background and leave it running.
- [ ] **Step 4:** Commit `feat: desktop app with Tauri`.

---

### Task 4: Mobile app (Capacitor)

**Files:**
- Create: `apps/mobile/package.json` (`@cherry/mobile`), `apps/mobile/capacitor.config.ts`, `apps/mobile/android/**` (from `npx cap add android`), `apps/mobile/ios/**` (from `npx cap add ios`, see Decision 8), `apps/mobile/assets/` icon source, `apps/mobile/.gitignore`
- Modify: `apps/web/src/api.ts` (`saveFile`), `apps/web/src/editor/ExportDialog.tsx` (use it), `README.md` (mobile section)
- Test: `apps/web/src/api.test.ts`

**Interfaces:**
- `capacitor.config.ts`: `appId` `org.cherryberry.studio`, `appName` "Cherry Berry", `webDir` `../launcher/dist`, `appendUserAgent` `CherryBerryMobile/<version>`, `server.androidScheme` `https`, `server.allowNavigation` `["*"]` (verify Capacitor honours the wildcard; if not, record the alternative used), `server.cleartext` true (Decision 4); iOS `NSAppTransportSecurity` → `NSAllowsArbitraryLoads` true.
- Produces: `export async function saveFile(blob: Blob, filename: string): Promise<void>` in `api.ts` — with `window.Capacitor?.isNativePlatform()` and the `Filesystem`/`Share` plugins available: write base64 to `Directory.Cache`, then `Share.share({ files: [uri], title: filename })`; otherwise the existing anchor download. Dependencies `@capacitor/filesystem`, `@capacitor/share` go in `@cherry/mobile` (native side); the web app reaches them only through `window.Capacitor.Plugins`, never by importing them.

- [ ] **Step 1: Failing test** `save uses share on capacitor` — stub `window.Capacitor` with fake `Filesystem.writeFile` / `Share.share`; assert both called with the filename; without `window.Capacitor` an anchor with `download=filename` is clicked.
- [ ] **Step 2:** Run → FAIL. Implement `saveFile`, switch the dialog to it.
- [ ] **Step 3:** Scaffold the Capacitor project, generate icons (Decision 7), `npx cap sync`. `cd apps/mobile/android && ./gradlew assembleDebug` succeeds (report the APK path). iOS: commit the project if `cap add ios` works here, otherwise say so in the report.
- [ ] **Step 4:** `pnpm --filter @cherry/web test`, typecheck, `e2e/export.spec.ts` still PASS.
- [ ] **Step 5:** Commit `feat: mobile app with Capacitor`. Report the manual checks a person must do on a device: pick a server, sign in, open a design, export a PNG → share sheet.

---

### Task 5: Phone layouts — sign in, home, library

**Files:**
- Modify: `apps/web/src/theme.css`, `apps/web/src/routes/SignIn.tsx`, `apps/web/src/routes/Home.tsx`, `apps/web/src/routes/Library.tsx`, `apps/web/src/AppShell.tsx`
- Test: `apps/web/e2e/mobile.spec.ts` (Playwright `viewport: {width:390,height:844}`, `hasTouch: true`, `isMobile` false on msedge)

Match the four mobile screens below 760 px:
- **Sign in:** the hero becomes a `#8E1EA2` band at the top (brand line + "Design freely. Own every file."), the form below; inputs and buttons 50 px tall; Server segmented control (shell only, Task 2).
- **Shell:** top bar with the workspace switcher (name + chevron) and the account avatar; bottom tab bar Home, Templates, Library, Brand (Shapes moves into the account menu on phones). Tab bar respects `env(safe-area-inset-bottom)`; add `viewport-fit=cover` to `index.html`.
- **Home:** search field, a horizontal row of size presets (Post, Story, A4 print, Custom → the existing new-design flow with that preset), "Recent" in a 2-column grid, a 56 px "New design" floating button above the tab bar.
- **Library:** title "Visual library", search, horizontally scrolling filter chips (Workspace, Mine, Public, SVG, GIF), a 3-column grid with kind and license badges, a floating "Upload visuals" button.

- [ ] **Step 1: Failing e2e** `mobile.spec.ts`: `phone home shows tabs, presets and recent`; `phone library shows chips and upload button`; `no horizontal scroll on phone pages` (`scrollWidth <= clientWidth` on `/`, `/library`, `/templates`, `/brand`, `/shapes`, sign-in).
- [ ] **Step 2:** Run → FAIL. Implement.
- [ ] **Step 3:** `mobile.spec.ts` PASS; full `npx playwright test` green; `pnpm --filter @cherry/web test`; typecheck.
- [ ] **Step 4:** Commit `feat(web): phone layouts for sign in, home and library`.

---

### Task 6: Phone editor and touch

**Files:**
- Create: `apps/web/src/editor/MobileEditor.css` (or a section of `editor.css`), `apps/web/src/editor/Sheet.tsx`, `apps/web/src/editor/gestures.ts`, `apps/web/src/editor/gestures.test.ts`
- Modify: `apps/web/src/routes/Editor.tsx`, `apps/web/src/editor/Canvas.tsx`, `apps/web/src/editor/Toolbar` (wherever it lives)
- Test: `apps/web/e2e/mobile-editor.spec.ts`

Below 760 px the editor follows "Mobile · Editor": header = Back, title (ellipsis), Undo, Layers, Export (primary); the canvas fills the middle; a bottom tool bar Text, Shapes, Visuals, Draw (pen), Brand. Tapping a tool that has a panel (Shapes, Visuals, Brand, Layers) opens it in a bottom `Sheet` (drag handle, `role="dialog"`, `aria-label`, Escape and a scrim tap close it, max 70% height, focus moves in and returns). Selecting a layer opens Properties in the sheet with the pill tabs from the mock (Font, Color, Spacing, Effects for text; existing sections otherwise). History, Publish, presence avatars and the zoom group move to an overflow "More" menu in the header. Desktop layout is unchanged.

**Interfaces:**
- Produces (`gestures.ts`, pure):
  ```ts
  export type Pt = { x: number; y: number };
  export function pinch(start: [Pt, Pt], now: [Pt, Pt], zoom: number, pan: Pt): { zoom: number; pan: Pt };
  // zoom scales by the distance ratio (clamped to the editor's existing min/max), keeping the start midpoint under the fingers
  ```
- Canvas: while two touches are down, the stage stops dragging nodes and applies `pinch`; one finger on empty canvas pans; one finger on a layer selects/moves it as today.

- [ ] **Step 1: Failing tests** — `gestures.test.ts`: `pinch doubles zoom when fingers spread twice as far`, `midpoint stays fixed`, `clamps zoom`. e2e `mobile-editor.spec.ts`: `phone editor shows tool bar and opens sheets` (Shapes → sheet with shapes; Escape closes); `selecting a layer opens properties in the sheet`; `pinch zooms without moving the layer` (CDP `Input.dispatchTouchEvent` two-finger spread over a rect: zoom label grows, rect x/y in the document unchanged); `export from the phone header`.
- [ ] **Step 2:** Run → FAIL. Implement.
- [ ] **Step 3:** `mobile-editor.spec.ts` PASS; full `npx playwright test` green; `pnpm test`; typecheck.
- [ ] **Step 4:** Commit `feat(web): phone editor with bottom sheets and pinch zoom`.
