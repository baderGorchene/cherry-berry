import { and, desc, eq, sql } from "drizzle-orm";
import * as Y from "yjs";
import { brandLockViolation, createDocument, docToY, yToDoc } from "@cherry/doc";
import type { Collab } from "../collab/server";
import type { Db } from "../db/client";
import { brandKits, designs } from "../db/schema";
import { HttpError } from "../errors";
import { WorkspaceError } from "../workspaces/errors";
import { getRole, UUID, type Role } from "../workspaces/service";

export type DesignSummary = {
  id: string; workspaceId: string; title: string; width: number; height: number;
  unit: string; colorMode: string; updatedAt: string; createdBy: string; kitId: string | null;
};
export const summaryColumns = {
  id: designs.id, workspaceId: designs.workspaceId, title: designs.title, width: designs.width,
  height: designs.height, unit: designs.unit, colorMode: designs.colorMode,
  updatedAt: designs.updatedAt, createdBy: designs.createdBy, kitId: designs.kitId,
};
type Row = Omit<typeof designs.$inferSelect, "state" | "createdAt" | "parentDesignId" | "parentVersionId">;
export const summary = (d: Row): DesignSummary => ({
  id: d.id, workspaceId: d.workspaceId, title: d.title, width: d.width, height: d.height,
  unit: d.unit, colorMode: d.colorMode, updatedAt: d.updatedAt.toISOString(), createdBy: d.createdBy, kitId: d.kitId,
});
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

async function memberRole(db: Db, workspaceId: string, userId: string): Promise<Role> {
  if (!UUID.test(workspaceId)) throw new WorkspaceError("not_found");
  const role = await getRole(db, workspaceId, userId);
  if (!role) throw new WorkspaceError("not_found");
  return role;
}

export async function loadWithRole(db: Db, id: string, userId: string): Promise<{ design: Row; role: Role }> {
  if (!UUID.test(id)) throw new WorkspaceError("not_found");
  const [design] = await db.select(summaryColumns).from(designs).where(eq(designs.id, id));
  if (!design) throw new WorkspaceError("not_found");
  return { design, role: await memberRole(db, design.workspaceId, userId) };
}

export async function createDesign(
  db: Db, userId: string, workspaceId: string,
  input: { title: string; width: number; height: number; unit: "px" | "mm" | "in"; colorMode: "rgb" | "cmyk"; bleed?: number },
): Promise<DesignSummary> {
  if ((await memberRole(db, workspaceId, userId)) === "viewer") throw new WorkspaceError("forbidden");
  const state = Y.encodeStateAsUpdate(docToY(createDocument(input)));
  const [d] = await db.insert(designs).values({
    workspaceId, title: input.title, width: input.width, height: input.height,
    unit: input.unit, colorMode: input.colorMode, state, createdBy: userId,
  }).returning(summaryColumns);
  return summary(d!);
}

export async function listDesigns(db: Db, userId: string, workspaceId: string): Promise<DesignSummary[]> {
  await memberRole(db, workspaceId, userId);
  const rows = await db.select(summaryColumns).from(designs).where(eq(designs.workspaceId, workspaceId))
    .orderBy(desc(designs.updatedAt)).limit(50);
  return rows.map(summary);
}

export async function openDesign(db: Db, collab: Collab, userId: string, id: string) {
  const { design, role } = await loadWithRole(db, id, userId);
  const live = collab.liveState(id);
  const [row] = live ? [{ state: live }] : await db.select({ state: designs.state }).from(designs).where(eq(designs.id, id));
  if (!row) throw new WorkspaceError("not_found");
  return { design: summary(design), role, state: b64(row.state) };
}

/**
 * Throws unless applying `update` to `current` leaves a valid Cherry document that `role` may produce:
 * `invalid_document` for anything that fails to apply or parse, `brand_locked` for an editor touching a locked layer,
 * `forbidden` for viewers. `current` itself is never changed.
 */
export function checkUpdate(current: Y.Doc, update: Uint8Array, role: Role): void {
  if (role === "viewer") throw new WorkspaceError("forbidden");
  // ponytail: clones the whole document per incoming update (O(document size)); check against a diff if large docs make this slow.
  const next = new Y.Doc();
  Y.applyUpdate(next, Y.encodeStateAsUpdate(current));
  // Owners and admins are never checked, so only editors need the document before the update.
  const before = role === "editor" ? yToDoc(next) : undefined;
  try { Y.applyUpdate(next, update); } catch { throw new HttpError(400, "invalid_document"); }
  const after = yToDoc(next);
  if (!after.ok) throw new HttpError(400, "invalid_document");
  if (before?.ok && brandLockViolation(before.doc, after.doc)) throw new WorkspaceError("brand_locked");
}

/** Writes the live document's state and the metadata derived from it (title, page size, unit, colour mode). */
export async function persistState(db: Db, id: string, ydoc: Y.Doc): Promise<DesignSummary> {
  const parsed = yToDoc(ydoc);
  if (!parsed.ok) throw new HttpError(400, "invalid_document");
  const page = parsed.doc.pages[0]!;
  const title = parsed.doc.title.trim().slice(0, 120) || "Untitled design";
  const [d] = await db.update(designs).set({
    state: Y.encodeStateAsUpdate(ydoc), title, width: page.width, height: page.height,
    unit: page.unit, colorMode: page.colorMode, updatedAt: sql`now()`,
  }).where(eq(designs.id, id)).returning(summaryColumns);
  if (!d) throw new WorkspaceError("not_found");
  return summary(d);
}

/** Merges the client's Yjs update into the live document (so connected editors see it); rejects anything `checkUpdate` refuses. */
export async function saveDesignState(db: Db, collab: Collab, userId: string, id: string, incoming: Uint8Array) {
  const { role } = await loadWithRole(db, id, userId);
  if (role === "viewer") throw new WorkspaceError("forbidden");
  // Leaving the direct connection stores the document immediately, so the row below is current.
  await collab.withDocument(id, (doc) => { checkUpdate(doc, incoming, role); Y.applyUpdate(doc, incoming); }, userId);
  const [row] = await db.select({ ...summaryColumns, state: designs.state }).from(designs).where(eq(designs.id, id));
  if (!row) throw new WorkspaceError("not_found");
  return { design: summary(row), state: b64(collab.liveState(id) ?? row.state) };
}

/** Links a design to a brand kit of its own workspace, or unlinks it with null. */
export async function setDesignKit(db: Db, userId: string, id: string, kitId: string | null): Promise<DesignSummary> {
  const { design, role } = await loadWithRole(db, id, userId);
  if (role === "viewer") throw new WorkspaceError("forbidden");
  if (kitId !== null) {
    const [kit] = UUID.test(kitId)
      ? await db.select({ id: brandKits.id }).from(brandKits).where(and(eq(brandKits.id, kitId), eq(brandKits.workspaceId, design.workspaceId)))
      : [];
    if (!kit) throw new WorkspaceError("not_found");
  }
  const [d] = await db.update(designs).set({ kitId }).where(eq(designs.id, id)).returning(summaryColumns);
  return summary(d!);
}
