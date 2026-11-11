import { desc, eq } from "drizzle-orm";
import * as Y from "yjs";
import { createDocument, docToY, yToDoc } from "@cherry/doc";
import type { Db } from "../db/client";
import { designs } from "../db/schema";
import { HttpError } from "../errors";
import { WorkspaceError } from "../workspaces/errors";
import { getRole, UUID, type Role } from "../workspaces/service";

export type DesignSummary = {
  id: string; workspaceId: string; title: string; width: number; height: number;
  unit: string; colorMode: string; updatedAt: string; createdBy: string;
};
type Row = typeof designs.$inferSelect;
const summary = (d: Row): DesignSummary => ({
  id: d.id, workspaceId: d.workspaceId, title: d.title, width: d.width, height: d.height,
  unit: d.unit, colorMode: d.colorMode, updatedAt: d.updatedAt.toISOString(), createdBy: d.createdBy,
});
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

async function memberRole(db: Db, workspaceId: string, userId: string): Promise<Role> {
  if (!UUID.test(workspaceId)) throw new WorkspaceError("not_found");
  const role = await getRole(db, workspaceId, userId);
  if (!role) throw new WorkspaceError("not_found");
  return role;
}

async function loadWithRole(db: Db, id: string, userId: string): Promise<{ design: Row; role: Role }> {
  if (!UUID.test(id)) throw new WorkspaceError("not_found");
  const [design] = await db.select().from(designs).where(eq(designs.id, id));
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
  }).returning();
  return summary(d!);
}

export async function listDesigns(db: Db, userId: string, workspaceId: string): Promise<DesignSummary[]> {
  await memberRole(db, workspaceId, userId);
  const rows = await db.select().from(designs).where(eq(designs.workspaceId, workspaceId))
    .orderBy(desc(designs.updatedAt)).limit(50);
  return rows.map(summary);
}

export async function openDesign(db: Db, userId: string, id: string) {
  const { design, role } = await loadWithRole(db, id, userId);
  return { design: summary(design), role, state: b64(design.state) };
}

/** Merges the client's Yjs update into the stored state; rejects anything that is not a valid Cherry document. */
export async function saveDesignState(db: Db, userId: string, id: string, incoming: Uint8Array) {
  const { role } = await loadWithRole(db, id, userId);
  if (role === "viewer") throw new WorkspaceError("forbidden");
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(designs).where(eq(designs.id, id)).for("update");
    if (!row) throw new WorkspaceError("not_found");
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, row.state);
    try { Y.applyUpdate(ydoc, incoming); } catch { throw new HttpError(400, "invalid_document"); }
    const parsed = yToDoc(ydoc);
    if (!parsed.ok) throw new HttpError(400, "invalid_document");
    const state = Y.encodeStateAsUpdate(ydoc);
    const page = parsed.doc.pages[0]!;
    const [d] = await tx.update(designs).set({
      state, title: parsed.doc.title, width: page.width, height: page.height,
      unit: page.unit, colorMode: page.colorMode, updatedAt: new Date(),
    }).where(eq(designs.id, id)).returning();
    return { design: summary(d!), state: b64(state) };
  });
}
