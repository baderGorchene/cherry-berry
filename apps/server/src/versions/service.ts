import { desc, eq } from "drizzle-orm";
import * as Y from "yjs";
import { brandLockViolation, diffDocs, replaceDocument, summarizeDiff, yToDoc, type CherryDocument } from "@cherry/doc";
import type { Collab } from "../collab/server";
import type { Db } from "../db/client";
import { designs, designVersions, user } from "../db/schema";
import { HttpError } from "../errors";
import { loadWithRole, summary, summaryColumns, type DesignSummary } from "../designs/service";
import { WorkspaceError } from "../workspaces/errors";
import { UUID, type Role } from "../workspaces/service";

export const AUTO_VERSION_MS = 10 * 60_000;

export type VersionSummary = {
  id: string; kind: string; name: string | null; summary: string; createdAt: string;
  createdBy: { id: string; name: string } | null; branchDesignId: string | null;
};
type Kind = "auto" | "named" | "restore" | "branch";

const columns = {
  id: designVersions.id, kind: designVersions.kind, name: designVersions.name, summary: designVersions.summary,
  createdAt: designVersions.createdAt, createdById: designVersions.createdBy, createdByName: user.name,
  branchDesignId: designVersions.branchDesignId,
};
const toSummary = (r: {
  id: string; kind: string; name: string | null; summary: string; createdAt: Date;
  createdById: string | null; createdByName: string | null; branchDesignId: string | null;
}): VersionSummary => ({
  id: r.id, kind: r.kind, name: r.name, summary: r.summary, createdAt: r.createdAt.toISOString(),
  createdBy: r.createdById && r.createdByName !== null ? { id: r.createdById, name: r.createdByName } : null,
  branchDesignId: r.branchDesignId,
});
const withAuthor = (db: Db) => db.select(columns).from(designVersions).leftJoin(user, eq(user.id, designVersions.createdBy));

const parseState = (state: Uint8Array): CherryDocument => {
  const y = new Y.Doc();
  Y.applyUpdate(y, state);
  const r = yToDoc(y);
  if (!r.ok) throw new HttpError(400, "invalid_document");
  return r.doc;
};
/** The state before anything was drawn: the same pages with no layers. */
const bare = (d: CherryDocument): CherryDocument => ({ ...d, pages: d.pages.map((p) => ({ ...p, nodes: [] })) });
const label = (v: { name: string | null; createdAt: Date }) => v.name ?? v.createdAt.toISOString();

async function newest(db: Db, designId: string) {
  const [v] = await db.select({ state: designVersions.state, createdAt: designVersions.createdAt })
    .from(designVersions).where(eq(designVersions.designId, designId)).orderBy(desc(designVersions.createdAt)).limit(1);
  return v;
}
async function currentState(db: Db, collab: Collab, designId: string): Promise<Uint8Array> {
  const live = collab.liveState(designId);
  if (live) return live;
  const [row] = await db.select({ state: designs.state }).from(designs).where(eq(designs.id, designId));
  if (!row) throw new WorkspaceError("not_found");
  return row.state;
}
async function insertVersion(db: Db, v: {
  designId: string; kind: Kind; name?: string | null; summary: string; state: Uint8Array;
  createdBy: string | null; branchDesignId?: string;
}) {
  const [row] = await db.insert(designVersions).values({ ...v, name: v.name ?? null }).returning({ id: designVersions.id });
  const [out] = await withAuthor(db).where(eq(designVersions.id, row!.id));
  return toSummary(out!);
}

/** Loads a version and the caller's role in its design's workspace; 404 outside it. */
async function loadVersion(db: Db, userId: string, versionId: string) {
  if (!UUID.test(versionId)) throw new WorkspaceError("not_found");
  const [v] = await db.select().from(designVersions).where(eq(designVersions.id, versionId));
  if (!v) throw new WorkspaceError("not_found");
  const { design, role } = await loadWithRole(db, v.designId, userId);
  return { v, design, role };
}
const needEditor = (role: Role) => { if (role === "viewer") throw new WorkspaceError("forbidden"); };

export async function listVersions(db: Db, userId: string, designId: string): Promise<VersionSummary[]> {
  await loadWithRole(db, designId, userId);
  const rows = await withAuthor(db).where(eq(designVersions.designId, designId)).orderBy(desc(designVersions.createdAt)).limit(200);
  return rows.map(toSummary);
}

export async function nameCurrent(db: Db, collab: Collab, userId: string, designId: string, name: string): Promise<VersionSummary> {
  const { role } = await loadWithRole(db, designId, userId);
  needEditor(role);
  const state = await currentState(db, collab, designId);
  const cur = parseState(state);
  const prev = await newest(db, designId);
  const before = prev ? parseState(prev.state) : bare(cur);
  return insertVersion(db, { designId, kind: "named", name, summary: summarizeDiff(diffDocs(before, cur), before, cur), state, createdBy: userId });
}

/** Names or un-names a version: naming an auto version makes it `named`; un-naming a `named` one makes it `auto` (ledger ruling 3). */
export async function renameVersion(db: Db, userId: string, versionId: string, name: string | null): Promise<VersionSummary> {
  const { v, role } = await loadVersion(db, userId, versionId);
  needEditor(role);
  const kind = v.kind === "auto" || v.kind === "named" ? (name === null ? "auto" : "named") : v.kind;
  await db.update(designVersions).set({ name, kind }).where(eq(designVersions.id, versionId));
  const [out] = await withAuthor(db).where(eq(designVersions.id, versionId));
  return toSummary(out!);
}

export async function versionState(db: Db, userId: string, versionId: string): Promise<Uint8Array> {
  return (await loadVersion(db, userId, versionId)).v.state;
}

export async function restoreVersion(db: Db, collab: Collab, userId: string, versionId: string): Promise<DesignSummary> {
  const { v, design, role } = await loadVersion(db, userId, versionId);
  needEditor(role);
  const state = await currentState(db, collab, design.id);
  const cur = parseState(state), target = parseState(v.state);
  // Editors may not restore across a brand lock; owners and admins may.
  if (role === "editor" && brandLockViolation(cur, target)) throw new WorkspaceError("brand_locked");
  await insertVersion(db, { designId: design.id, kind: "restore", name: "Before restore", summary: `Before restoring ${label(v)}`, state, createdBy: userId });
  // The "restore" origin keeps this off every client's undo stack.
  await collab.withDocument(design.id, (doc) => replaceDocument(doc, target, "restore"), userId);
  const [row] = await db.select(summaryColumns).from(designs).where(eq(designs.id, design.id));
  return summary(row!);
}

export async function branchVersion(db: Db, userId: string, versionId: string, name: string): Promise<DesignSummary> {
  const { v, design, role } = await loadVersion(db, userId, versionId);
  needEditor(role);
  const page = parseState(v.state).pages[0]!;
  const title = `${design.title} — ${name}`.slice(0, 120);
  // The title lives in the document too, or the first edit would write the source's title back.
  const y = new Y.Doc();
  Y.applyUpdate(y, v.state);
  y.getMap("meta").set("title", title);
  const [created] = await db.insert(designs).values({
    workspaceId: design.workspaceId, title, width: page.width, height: page.height, unit: page.unit, colorMode: page.colorMode,
    state: Y.encodeStateAsUpdate(y), kitId: design.kitId, parentDesignId: design.id, parentVersionId: v.id, createdBy: userId,
  }).returning(summaryColumns);
  await insertVersion(db, {
    designId: design.id, kind: "branch", name, summary: `Branched from ${label(v)}`, state: v.state, createdBy: userId, branchDesignId: created!.id,
  });
  return summary(created!);
}

/** Takes an `auto` version after a store when the newest one is at least `ms` old and the content has changed since. */
export function registerAutoVersions(db: Db, collab: Collab, ms: number) {
  collab.onStored(async (id, doc, by) => {
    try {
      const prev = await newest(db, id);
      if (prev && Date.now() - prev.createdAt.getTime() < ms) return;
      const state = Y.encodeStateAsUpdate(doc);
      const cur = parseState(state);
      const before = prev ? parseState(prev.state) : bare(cur);
      const diff = diffDocs(before, cur);
      if (!diff.added.length && !diff.removed.length && !diff.changed.length) return;
      await insertVersion(db, { designId: id, kind: "auto", summary: summarizeDiff(diff, before, cur), state, createdBy: by });
    } catch (e) {
      console.error(`versions: could not take an auto version of ${id}`, e);
    }
  });
}
