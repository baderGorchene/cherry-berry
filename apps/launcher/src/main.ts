import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/space-grotesk/latin-700.css";
import "./launcher.css";
import { checkServer, normalizeServer, STORAGE_KEY } from "./server";

export type View =
  | { view: "picker"; value: string; error?: string }
  | { view: "go"; origin: string }
  | { view: "unreachable"; host: string; origin: string };
type Check = (origin: string) => Promise<"ok" | "not_cherry" | "unreachable">;

const INVALID = "Enter an address like design.your-company.com.";

/** Normalizes and checks an address, deciding where it leads. */
export async function connect(input: string, check: Check = checkServer): Promise<View> {
  const n = normalizeServer(input);
  if ("error" in n) return { view: "picker", value: input, error: INVALID };
  const host = new URL(n.origin).host;
  const r = await check(n.origin);
  if (r === "ok") return { view: "go", origin: n.origin };
  if (r === "unreachable") return { view: "unreachable", host, origin: n.origin };
  return { view: "picker", value: input, error: `${host} isn't a Cherry Berry server.` };
}

/** First view: `?server=X` connects to X, `?change=1` or nothing remembered shows the picker, else the remembered server. */
export async function boot(state: { search: string; stored: string | null }, deps: { check: Check } = { check: checkServer }): Promise<View> {
  const p = new URLSearchParams(state.search);
  const server = p.get("server");
  if (server !== null) return connect(server, deps.check);
  if (p.has("change") || !state.stored) return { view: "picker", value: state.stored ?? "" };
  return connect(state.stored, deps.check);
}

// --- DOM (skipped under the unit tests, which run without a document) ---

const configured = normalizeServer(import.meta.env.VITE_CLOUD_URL ?? "");
const CLOUD = "origin" in configured ? configured.origin : null;

function stored(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function mount(html: string): HTMLElement {
  const app = document.getElementById("app")!;
  app.innerHTML = html;
  return app;
}

async function run(next: Promise<View>, label = "Connecting…") {
  mount(`<p class="status" role="status"></p>`).querySelector(".status")!.textContent = label;
  show(await next);
}

function show(v: View) {
  if (v.view === "go") {
    try { localStorage.setItem(STORAGE_KEY, v.origin); } catch { /* storage unavailable: ask again next launch */ }
    location.replace(v.origin);
    return;
  }
  if (v.view === "unreachable") {
    const app = mount(`
      <section class="card" aria-labelledby="t">
        <h1 id="t"></h1>
        <p class="muted">Check your connection, or choose another server.</p>
        <div class="actions">
          <button type="button" class="btn btn-p" data-retry>Retry</button>
          <button type="button" class="btn" data-change>Change server</button>
        </div>
      </section>`);
    app.querySelector("h1")!.textContent = `Can't reach ${v.host}.`;
    app.querySelector<HTMLButtonElement>("[data-retry]")!.onclick = () => run(connect(v.origin), `Connecting to ${v.host}…`);
    app.querySelector<HTMLButtonElement>("[data-change]")!.onclick = () => show({ view: "picker", value: v.origin });
    app.querySelector<HTMLButtonElement>("[data-retry]")!.focus();
    return;
  }
  picker(v.value, v.error);
}

function picker(value: string, error?: string) {
  const app = mount(`
    <form class="card" novalidate>
      <h1>Choose where your designs live.</h1>
      <fieldset class="opts">
        <legend class="sr-only">Server</legend>
        ${CLOUD ? `<label class="opt"><input type="radio" name="kind" value="cloud" /><span><strong>Cherry Berry Cloud</strong><span class="muted">The central instance, nothing to install.</span></span></label>` : ""}
        <label class="opt"><input type="radio" name="kind" value="self" /><span><strong>Self-hosted server</strong><span class="muted">Your organization's own instance.</span></span></label>
      </fieldset>
      <div class="addr">
        <label class="lbl" for="address">Server address</label>
        <input id="address" class="inp" type="text" inputmode="url" autocomplete="url" autocapitalize="off" spellcheck="false"
          placeholder="https://design.your-company.com" aria-describedby="note err" />
        <p id="note" class="warn" hidden>Not secure: this address uses http.</p>
        <p id="err" class="field-error" role="alert"></p>
      </div>
      <button type="submit" class="btn btn-p">Continue</button>
    </form>`);
  const form = app.querySelector("form")!;
  const input = form.querySelector<HTMLInputElement>("#address")!;
  const addr = form.querySelector<HTMLElement>(".addr")!;
  const note = form.querySelector<HTMLElement>("#note")!;
  const isCloud = () => form.querySelector<HTMLInputElement>('input[value="cloud"]')?.checked ?? false;
  const sync = () => {
    addr.hidden = isCloud();
    const n = normalizeServer(input.value);
    note.hidden = !("insecure" in n && n.insecure);
  };
  const cloudPicked = CLOUD !== null && (value === "" || value === CLOUD);
  form.querySelector<HTMLInputElement>(`input[value="${cloudPicked ? "cloud" : "self"}"]`)!.checked = true;
  input.value = cloudPicked ? "" : value;
  form.querySelector("#err")!.textContent = error ?? "";
  form.onchange = sync;
  input.oninput = sync;
  sync();
  form.onsubmit = (e) => {
    e.preventDefault();
    const target = isCloud() ? CLOUD! : input.value;
    run(connect(target));
  };
  (isCloud() ? form.querySelector<HTMLInputElement>('input[value="cloud"]')! : input).focus();
}

if (typeof document !== "undefined") run(boot({ search: location.search, stored: stored() }));
