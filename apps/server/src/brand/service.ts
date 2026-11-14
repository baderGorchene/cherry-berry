import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { type BrandKitContent, defaultKitContent } from "@cherry/doc";
import type { Db } from "../db/client";
import { assets, brandKits } from "../db/schema";
import { HttpError } from "../errors";
import { WorkspaceError } from "../workspaces/errors";
import { getRole, UUID, type Role } from "../workspaces/service";

// Filled in by the fonts task; the shape is fixed now so clients don't change later.
export type Font = { id: string; family: string; weight: number; style: string };
export type BrandKit = { id: string; workspaceId: string; name: string; content: BrandKitContent; fonts: Font[]; updatedAt: string };
type Row = typeof brandKits.$inferSelect;
const toKit = (r: Row): BrandKit => ({
  id: r.id, workspaceId: r.workspaceId, name: r.name, content: r.content as BrandKitContent, fonts: [],
  updatedAt: r.updatedAt.toISOString(),
});

async function memberRole(db: Db, workspaceId: string, userId: string): Promise<Role> {
  const role = UUID.test(workspaceId) ? await getRole(db, workspaceId, userId) : undefined;
  if (!role) throw new WorkspaceError("not_found");
  return role;
}
const canWrite = (role: Role) => role === "owner" || role === "admin";

async function loadKit(db: Db, id: string, userId: string): Promise<{ row: Row; role: Role }> {
  if (!UUID.test(id)) throw new WorkspaceError("not_found");
  const [row] = await db.select().from(brandKits).where(eq(brandKits.id, id));
  if (!row) throw new WorkspaceError("not_found");
  return { row, role: await memberRole(db, row.workspaceId, userId) };
}

/** Every logo must be a live asset the kit's workspace can see: public, or a workspace asset of this workspace. */
async function checkLogos(db: Db, workspaceId: string, content: BrandKitContent) {
  const ids = [...new Set(Object.values(content.logos).filter((v): v is string => v !== null))];
  if (!ids.length) return;
  if (!ids.every((i) => UUID.test(i))) throw new HttpError(400, "invalid_logo");
  const ok = await db.select({ id: assets.id }).from(assets).where(and(
    inArray(assets.id, ids), isNull(assets.deletedAt),
    or(eq(assets.visibility, "public"), and(eq(assets.visibility, "workspace"), eq(assets.workspaceId, workspaceId))),
  ));
  if (ok.length !== ids.length) throw new HttpError(400, "invalid_logo");
}

export async function listKits(db: Db, userId: string, workspaceId: string): Promise<BrandKit[]> {
  await memberRole(db, workspaceId, userId);
  const rows = await db.select().from(brandKits).where(eq(brandKits.workspaceId, workspaceId)).orderBy(asc(brandKits.createdAt));
  return rows.map(toKit);
}

export async function createKit(
  db: Db, userId: string, workspaceId: string, input: { name: string; content?: BrandKitContent },
): Promise<BrandKit> {
  if (!canWrite(await memberRole(db, workspaceId, userId))) throw new WorkspaceError("forbidden");
  const content = input.content ?? defaultKitContent();
  await checkLogos(db, workspaceId, content);
  const [row] = await db.insert(brandKits).values({ workspaceId, name: input.name, content, createdBy: userId }).returning();
  return toKit(row!);
}

export async function getKit(db: Db, userId: string, id: string): Promise<BrandKit> {
  return toKit((await loadKit(db, id, userId)).row);
}

export async function updateKit(
  db: Db, userId: string, id: string, input: { name: string; content: BrandKitContent },
): Promise<BrandKit> {
  const { row, role } = await loadKit(db, id, userId);
  if (!canWrite(role)) throw new WorkspaceError("forbidden");
  await checkLogos(db, row.workspaceId, input.content);
  const [updated] = await db.update(brandKits).set({ name: input.name, content: input.content, updatedAt: new Date() })
    .where(eq(brandKits.id, id)).returning();
  return toKit(updated!);
}

export async function deleteKit(db: Db, userId: string, id: string): Promise<void> {
  const { row, role } = await loadKit(db, id, userId);
  if (!canWrite(role)) throw new WorkspaceError("forbidden");
  await db.delete(brandKits).where(eq(brandKits.id, row.id));
}
