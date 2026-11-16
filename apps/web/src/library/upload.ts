import type { License, Visibility } from "../api";

const MB = 1024 * 1024;
const EXT = ["png", "jpg", "jpeg", "webp", "gif", "svg"];
const ext = (name: string) => /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase() ?? "";

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Courtesy check before reading the file against the server's upload limit (`maxMb`); the server decides. */
export function precheck(file: { name: string; size: number; type: string }, maxMb = 50): "ok" | "too_large" | "unsupported_type" {
  const e = ext(file.name);
  if (!EXT.includes(e)) return "unsupported_type";
  return file.size > maxMb * MB || (e === "svg" && file.size > 2 * MB) ? "too_large" : "ok";
}

export function titleFromName(name: string): string {
  const t = name.replace(/\.[^.]*$/, "").replace(/[-_]/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export type Details = {
  title: string; tags: string; license: License | ""; visibility: Visibility; attribution: string; confirmed: boolean;
};

export function validate(d: Pick<Details, "license" | "attribution" | "visibility" | "confirmed">): string | null {
  if (!d.license) return "Choose a license.";
  if (d.license === "cc-by" && !d.attribution.trim()) return "CC-BY needs an attribution.";
  if (d.license === "workspace-only" && d.visibility !== "workspace") return "Workspace-only visuals must be shared with this workspace.";
  if (!d.confirmed) return "Confirm you have the right to share this file.";
  return null;
}
