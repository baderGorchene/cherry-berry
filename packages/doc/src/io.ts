import { CHERRY_FORMAT_VERSION, CherryDocument } from "./schema";

export type ParseResult =
  | { ok: true; doc: CherryDocument }
  | { ok: false; error: "invalid_json" | "newer_version" | "invalid_document"; detail?: string };

export function parseCherry(text: string): ParseResult {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: "invalid_json" }; }
  const v = (raw as { version?: unknown } | null)?.version;
  if (typeof v === "number" && v > CHERRY_FORMAT_VERSION) return { ok: false, error: "newer_version" };
  let r: ReturnType<typeof CherryDocument.safeParse>;
  try { r = CherryDocument.safeParse(raw); } catch {
    // Hostile input (e.g. thousands of nested groups) can exhaust the stack.
    return { ok: false, error: "invalid_document", detail: "document is too deeply nested" };
  }
  if (!r.success) {
    const i = r.error.issues[0]!;
    return { ok: false, error: "invalid_document", detail: `${i.path.join(".")}: ${i.message}` };
  }
  return { ok: true, doc: r.data };
}

export const serializeCherry = (doc: CherryDocument): string => JSON.stringify(doc, null, 2);
