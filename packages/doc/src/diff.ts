import { all, eq, noChildren } from "./brand";
import type { CherryDocument } from "./schema";

export type DocDiff = { added: string[]; removed: string[]; changed: string[] };

const pageMeta = (p: CherryDocument["pages"][number]) => { const { nodes: _n, ...rest } = p; return rest; };

/** Layer-level diff, matching nodes by id across all pages. Page ids appear when a page itself is added, removed or edited. */
export function diffDocs(before: CherryDocument, after: CherryDocument): DocDiff {
  const prev = all(before), next = all(after);
  const prevPages = new Map(before.pages.map((p) => [p.id, p]));
  const nextPages = new Map(after.pages.map((p) => [p.id, p]));
  const d: DocDiff = { added: [], removed: [], changed: [] };
  for (const p of before.pages) if (!nextPages.has(p.id)) d.removed.push(p.id);
  for (const id of prev.keys()) if (!next.has(id)) d.removed.push(id);
  for (const p of after.pages) {
    const old = prevPages.get(p.id);
    if (!old) d.added.push(p.id);
    else if (!eq(pageMeta(old), pageMeta(p))) d.changed.push(p.id);
  }
  for (const [id, cur] of next) {
    const old = prev.get(id);
    if (!old) d.added.push(id);
    else if (old.pageId !== cur.pageId || old.ancestors.at(-1)?.id !== cur.ancestors.at(-1)?.id || !eq(noChildren(old.node), noChildren(cur.node))) d.changed.push(id);
  }
  return d;
}

export function summarizeDiff(diff: DocDiff, before: CherryDocument, after: CherryDocument): string {
  const names = new Map<string, string>();
  for (const d of [before, after]) {
    for (const p of d.pages) names.set(p.id, p.name);
    for (const [id, { node }] of all(d)) names.set(id, node.name);
  }
  const part = (label: string, ids: string[]) =>
    ids.length ? `${label} ${ids.slice(0, 3).map((i) => names.get(i) ?? i).join(", ")}${ids.length > 3 ? ` and ${ids.length - 3} more` : ""}` : "";
  return [part("Added", diff.added), part("changed", diff.changed), part("removed", diff.removed)].filter(Boolean).join("; ") || "No changes";
}
