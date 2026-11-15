/** Native shells (Tauri desktop, Capacitor mobile) mark their user agent and load a local launcher page that picks the server. */
export type Shell = "desktop" | "mobile" | null;

const agent = () => (typeof navigator === "undefined" ? "" : navigator.userAgent);

export function shell(ua = agent()): Shell {
  return /\bCherryBerryDesktop\//.test(ua) ? "desktop" : /\bCherryBerryMobile\//.test(ua) ? "mobile" : null;
}

/** The launcher's fixed origin per platform, or null in a plain browser. */
export function launcherUrl(ua = agent()): string | null {
  const s = shell(ua);
  if (s === "desktop") return /Windows NT/.test(ua) ? "http://tauri.localhost/" : "tauri://localhost/";
  if (s === "mobile") return /Android/.test(ua) ? "https://localhost/" : "capacitor://localhost/";
  return null;
}

/** Launcher URL that connects to `target`, or (null) opens its picker. */
export function switchServerUrl(target: string | null, ua = agent()): string | null {
  const l = launcherUrl(ua);
  if (!l) return null;
  return target === null ? `${l}?change=1` : `${l}?server=${encodeURIComponent(target)}`;
}
