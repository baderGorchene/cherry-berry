export const STORAGE_KEY = "cherry.server";

/** Turns what someone typed into a server origin: https:// when no scheme, path dropped. */
export function normalizeServer(input: string): { origin: string; insecure: boolean } | { error: "empty" | "invalid" } {
  const s = input.trim();
  if (!s) return { error: "empty" };
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
    if ((u.protocol !== "https:" && u.protocol !== "http:") || !/^([a-z0-9-]+\.)*[a-z0-9-]+$|^\[[0-9a-f:.]+\]$/.test(u.hostname)) return { error: "invalid" };
    return { origin: u.origin, insecure: u.protocol === "http:" };
  } catch {
    return { error: "invalid" };
  }
}

/** Asks the server's public health check whether it is Cherry Berry (8 s timeout). */
export async function checkServer(origin: string, f: typeof fetch = fetch): Promise<"ok" | "not_cherry" | "unreachable"> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await f(`${origin}/api/health`, { signal: ctl.signal });
    if (res.status >= 500) return "unreachable"; // a proxy (nginx, Caddy) in front of a server that is down
    if (!res.ok) return "not_cherry";
    const body: unknown = await res.json().catch(() => null);
    return (body as { app?: unknown } | null)?.app === "cherry-berry" ? "ok" : "not_cherry";
  } catch {
    return "unreachable";
  } finally {
    clearTimeout(timer);
  }
}
