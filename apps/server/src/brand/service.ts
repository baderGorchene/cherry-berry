import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { type BrandKitContent, defaultKitContent } from "@cherry/doc";
import type { Db } from "../db/client";
import { assets, brandFonts, brandKits } from "../db/schema";
import { HttpError } from "../errors";
import type { Storage } from "../storage";
import { WorkspaceError } from "../workspaces/errors";
import { getRole, UUID, type Role } from "../workspaces/service";
import { type FontFormat, sniffFont } from "./fonts";

export type Font = {
  id: string; kitId: string; family: string; weight: number; style: "normal" | "italic"; format: FontFormat; bytes: number;
};
export type BrandKit = { id: string; workspaceId: string; name: string; content: BrandKitContent; fonts: Font[]; updatedAt: string };
type Row = typeof brandKits.$inferSelect;
type FontRow = typeof brandFonts.$inferSelect;
const toFont = (f: FontRow): Font => ({
  id: f.id, kitId: f.kitId, family: f.family, weight: f.weight, style: f.style as Font["style"],
  format: f.format as FontFormat, bytes: f.bytes,
});
const toKit = (r: Row, fonts: Font[]): BrandKit => ({
  id: r.id, workspaceId: r.workspaceId, name: r.name, content: r.content as BrandKitContent, fonts,
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

async function kitFonts(db: Db, kitIds: string[]): Promise<Map<string, Font[]>> {
  const byKit = new Map<string, Font[]>();
  if (!kitIds.length) return byKit;
  const rows = await db.select().from(brandFonts).where(inArray(brandFonts.kitId, kitIds)).orderBy(asc(brandFonts.createdAt));
  for (const f of rows) byKit.set(f.kitId, [...(byKit.get(f.kitId) ?? []), toFont(f)]);
  return byKit;
}

export async function listKits(db: Db, userId: string, workspaceId: string): Promise<BrandKit[]> {
  await memberRole(db, workspaceId, userId);
  const rows = await db.select().from(brandKits).where(eq(brandKits.workspaceId, workspaceId)).orderBy(asc(brandKits.createdAt));
  const fonts = await kitFonts(db, rows.map((r) => r.id));
  return rows.map((r) => toKit(r, fonts.get(r.id) ?? []));
}

export async function createKit(
  db: Db, userId: string, workspaceId: string, input: { name: string; content?: BrandKitContent },
): Promise<BrandKit> {
  if (!canWrite(await memberRole(db, workspaceId, userId))) throw new WorkspaceError("forbidden");
  const content = input.content ?? defaultKitContent();
  await checkLogos(db, workspaceId, content);
  const [row] = await db.insert(brandKits).values({ workspaceId, name: input.name, content, createdBy: userId }).returning();
  return toKit(row!, []);
}

export async function getKit(db: Db, userId: string, id: string): Promise<BrandKit> {
  const { row } = await loadKit(db, id, userId);
  return toKit(row, (await kitFonts(db, [row.id])).get(row.id) ?? []);
}

export async function updateKit(
  db: Db, userId: string, id: string, input: { name: string; content: BrandKitContent },
): Promise<BrandKit> {
  const { row, role } = await loadKit(db, id, userId);
  if (!canWrite(role)) throw new WorkspaceError("forbidden");
  await checkLogos(db, row.workspaceId, input.content);
  const [updated] = await db.update(brandKits).set({ name: input.name, content: input.content, updatedAt: new Date() })
    .where(eq(brandKits.id, id)).returning();
  return toKit(updated!, (await kitFonts(db, [id])).get(id) ?? []);
}

export async function deleteKit(db: Db, storage: Storage, userId: string, id: string): Promise<void> {
  const { row, role } = await loadKit(db, id, userId);
  if (!canWrite(role)) throw new WorkspaceError("forbidden");
  const shas = (await db.selectDistinct({ sha: brandFonts.sha256 }).from(brandFonts).where(eq(brandFonts.kitId, row.id))).map((r) => r.sha);
  await db.delete(brandKits).where(eq(brandKits.id, row.id)); // font rows go with it (FK cascade)
  // ponytail: font objects orphaned by workspace/user deletion cascades are swept in Phase 9
  for (const sha of shas) await removeFontObjectIfUnused(db, storage, sha);
}

const FONT_LOCK = (sha256: string) => sql`select pg_advisory_xact_lock(hashtext(${"font:" + sha256}))`;

/** Removes `fonts/<sha>` when no font row uses it; takes the lock addFont holds across its put and insert. */
async function removeFontObjectIfUnused(db: Db, storage: Storage, sha256: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(FONT_LOCK(sha256));
    const [other] = await tx.select({ id: brandFonts.id }).from(brandFonts).where(eq(brandFonts.sha256, sha256)).limit(1);
    if (!other) await storage.delete(`fonts/${sha256}`).catch((e) => console.error("font delete: could not remove object", e));
  });
}

/** Owner/admin only. The caller has already size-limited the bytes; the format comes from the bytes, never the filename. */
export async function addFont(
  db: Db, storage: Storage, userId: string, kitId: string, file: Uint8Array,
  meta: { family: string; weight: number; style: "normal" | "italic" },
): Promise<Font> {
  const { role } = await loadKit(db, kitId, userId);
  if (!canWrite(role)) throw new WorkspaceError("forbidden");
  const format = sniffFont(file);
  if (!format) throw new HttpError(400, "invalid_font");
  const sha256 = createHash("sha256").update(file).digest("hex");
  // The lock is shared with deleteFont, so the object can't be removed between our put and our insert.
  return db.transaction(async (tx) => {
    await tx.execute(FONT_LOCK(sha256));
    await storage.put(`fonts/${sha256}`, file, "application/octet-stream");
    const [row] = await tx.insert(brandFonts).values({
      kitId, ...meta, format, sha256, bytes: file.length, createdBy: userId,
    }).returning();
    return toFont(row!);
  });
}

async function loadFont(db: Db, id: string, userId: string): Promise<{ font: FontRow; role: Role }> {
  if (!UUID.test(id)) throw new WorkspaceError("not_found");
  const [font] = await db.select().from(brandFonts).where(eq(brandFonts.id, id));
  if (!font) throw new WorkspaceError("not_found");
  return { font, role: (await loadKit(db, font.kitId, userId)).role };
}

export async function deleteFont(db: Db, storage: Storage, userId: string, id: string): Promise<void> {
  const { font, role } = await loadFont(db, id, userId);
  if (!canWrite(role)) throw new WorkspaceError("forbidden");
  await db.delete(brandFonts).where(eq(brandFonts.id, id));
  await removeFontObjectIfUnused(db, storage, font.sha256);
}

/** Any workspace member. */
export async function getFontFile(db: Db, storage: Storage, userId: string, id: string): Promise<{ format: FontFormat; bytes: Uint8Array }> {
  const { font } = await loadFont(db, id, userId);
  const bytes = await storage.get(`fonts/${font.sha256}`);
  if (!bytes) throw new WorkspaceError("not_found");
  return { format: font.format as FontFormat, bytes };
}
