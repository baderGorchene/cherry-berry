import { and, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/client";
import { assetUses, assets, designs, memberships, reports, user, workspaces } from "../db/schema";
import { escapeLike } from "../http";
import { notHidden } from "../reports/hide";
import type { Storage } from "../storage";
import { loadWithRole } from "../designs/service";
import { WorkspaceError } from "../workspaces/errors";
import { getRole, UUID } from "../workspaces/service";
import type { Ingested } from "./ingest";

export type Visibility = "private" | "workspace" | "public";
export type License = "cc0" | "cc-by" | "own" | "workspace-only";
export type Asset = {
  id: string; title: string; tags: string[]; kind: "image" | "gif" | "svg"; format: string;
  width: number; height: number; bytes: number; license: License; attribution: string;
  visibility: Visibility; workspaceId: string | null; workspaceName: string | null;
  createdBy: string; uploaderName: string; createdAt: string; mine: boolean; usedIn: number;
};
export type AssetMeta = {
  title: string; tags: string[]; license: License; attribution: string; visibility: Visibility; workspaceId?: string;
};
type Row = typeof assets.$inferSelect;
type Joined = { a: Row; uploaderName: string; workspaceName: string | null; usedIn: number };

const toAsset = ({ a, uploaderName, workspaceName, usedIn }: Joined, userId: string): Asset => ({
  id: a.id, title: a.title, tags: a.tags, kind: a.kind as Asset["kind"], format: a.format,
  width: a.width, height: a.height, bytes: a.bytes, license: a.license as License, attribution: a.attribution,
  visibility: a.visibility as Visibility, workspaceId: a.workspaceId, workspaceName,
  createdBy: a.createdBy, uploaderName, createdAt: a.createdAt.toISOString(), mine: a.createdBy === userId, usedIn,
});

const base = (db: Db) => db.select({ a: assets, uploaderName: user.name, workspaceName: workspaces.name,
  usedIn: sql<number>`(select count(*)::int from ${assetUses} where ${assetUses.assetId} = ${assets.id})`.mapWith(Number) })
  .from(assets).innerJoin(user, eq(user.id, assets.createdBy)).leftJoin(workspaces, eq(workspaces.id, assets.workspaceId));

/** SQL twin of canReadAsset: own, public, or workspace in a workspace the user belongs to; never deleted. */
const visibleTo = (userId: string): SQL => and(
  sql`${assets.deletedAt} is null`,
  notHidden("asset", assets.id, assets.visibility, assets.createdBy, userId),
  or(
    eq(assets.createdBy, userId),
    eq(assets.visibility, "public"),
    and(eq(assets.visibility, "workspace"), sql`exists (select 1 from ${memberships}
      where ${memberships.workspaceId} = ${assets.workspaceId} and ${memberships.userId} = ${userId})`),
  ),
)!;

type Access = Pick<Row, "id" | "createdBy" | "visibility" | "workspaceId" | "deletedAt">;

/** Own, public (unless hidden by 3+ open reports), or workspace in a workspace the user belongs to; never deleted. */
export async function canSeeAsset(db: Db, userId: string, asset: Access): Promise<boolean> {
  if (asset.deletedAt) return false;
  if (asset.createdBy === userId) return true;
  if (asset.visibility === "public") {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(reports)
      .where(and(eq(reports.targetType, "asset"), eq(reports.targetId, asset.id), eq(reports.status, "open"))) as [{ n: number }];
    return r.n < 3;
  }
  return asset.visibility === "workspace" && !!asset.workspaceId && !!(await getRole(db, asset.workspaceId, userId));
}

/** canSeeAsset, or the asset is used in a design the user can open (even after the asset was deleted). */
export async function canReadAsset(db: Db, userId: string, asset: Access): Promise<boolean> {
  if (await canSeeAsset(db, userId, asset)) return true;
  const [hit] = await db.select({ one: sql`1` }).from(assetUses)
    .innerJoin(designs, eq(designs.id, assetUses.designId))
    .innerJoin(memberships, and(eq(memberships.workspaceId, designs.workspaceId), eq(memberships.userId, userId)))
    .where(eq(assetUses.assetId, asset.id)).limit(1);
  return !!hit;
}

/** Assets a design in `workspaceId` may use for `userId`: not deleted, not hidden, and public, the user's own, or visible in that workspace. */
export const usableInDesign = (userId: string, workspaceId: string): SQL | undefined => and(
  isNull(assets.deletedAt),
  notHidden("asset", assets.id, assets.visibility, assets.createdBy, userId),
  or(eq(assets.visibility, "public"), eq(assets.createdBy, userId),
    and(eq(assets.visibility, "workspace"), eq(assets.workspaceId, workspaceId))),
);

/** Serializes create, delete and recordUse for one set of bytes; released at commit. */
const lockBytes = (tx: Pick<Db, "execute">, sha256: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${sha256}))`);

async function memberRole(db: Db, workspaceId: string, userId: string) {
  const role = UUID.test(workspaceId) ? await getRole(db, workspaceId, userId) : null;
  if (!role) throw new WorkspaceError("not_found");
  return role;
}

/** Resolves where an asset lives; saving to a workspace needs owner, admin or editor. */
export async function placement(db: Db, userId: string, m: Pick<AssetMeta, "visibility" | "workspaceId">) {
  if (m.visibility !== "workspace") return null;
  if (!m.workspaceId) throw new WorkspaceError("not_found");
  if ((await memberRole(db, m.workspaceId, userId)) === "viewer") throw new WorkspaceError("forbidden");
  return m.workspaceId;
}

/**
 * Newest asset with these bytes that could be used where a new upload would land (the caller's own first):
 * the caller's private assets, public ones, or workspace assets of `workspaceId` (null: a private or public upload).
 * Same rule as recordUse, so a duplicate is always one the caller can place.
 */
export async function findByHash(db: Db, userId: string, sha256: string, workspaceId: string | null): Promise<Asset | null> {
  const usable = or(
    and(eq(assets.createdBy, userId), eq(assets.visibility, "private")),
    eq(assets.visibility, "public"),
    workspaceId ? and(eq(assets.visibility, "workspace"), eq(assets.workspaceId, workspaceId)) : undefined,
  );
  const [r] = await base(db).where(and(eq(assets.sha256, sha256), visibleTo(userId), usable))
    .orderBy(desc(sql`${assets.createdBy} = ${userId}`), desc(assets.createdAt)).limit(1);
  return r ? toAsset(r, userId) : null;
}

export async function createAsset(
  db: Db, storage: Storage, userId: string, img: Ingested, meta: AssetMeta,
): Promise<{ asset: Asset; duplicate: boolean }> {
  const workspaceId = await placement(db, userId, meta);
  // Dedupe check + row insert share the advisory lock so concurrent identical uploads don't create duplicate rows.
  // No DB connection is held across the S3 upload; if the put fails, the row (and any partial file) is cleaned up.
  const res = await db.transaction(async (tx) => {
    await lockBytes(tx, img.sha256);
    const existing = await findByHash(tx as unknown as Db, userId, img.sha256, workspaceId);
    if (existing) return { duplicate: true as const, asset: existing };
    const [r] = await tx.insert(assets).values({
      createdBy: userId, workspaceId, visibility: meta.visibility, title: meta.title, tags: meta.tags,
      license: meta.license, attribution: meta.attribution, kind: img.kind, format: img.format,
      width: img.width, height: img.height, bytes: img.file.length, sha256: img.sha256, sanitized: img.sanitized,
    }).returning({ id: assets.id });
    return { duplicate: false as const, id: r!.id };
  });
  if (res.duplicate) return { asset: res.asset, duplicate: true };
  try {
    await storage.put(`files/${img.sha256}`, img.file, img.contentType);
    await storage.put(`thumbs/${img.sha256}.webp`, img.thumb, "image/webp");
  } catch (e) {
    await db.transaction(async (tx) => {
      await lockBytes(tx, img.sha256);
      await tx.delete(assets).where(eq(assets.id, res.id));
      const [other] = await tx.select({ id: assets.id }).from(assets).where(eq(assets.sha256, img.sha256)).limit(1);
      if (!other) {
        await storage.delete(`files/${img.sha256}`).catch(() => {});
        await storage.delete(`thumbs/${img.sha256}.webp`).catch(() => {});
      }
    });
    throw e;
  }
  return { asset: (await getAsset(db, userId, res.id))!, duplicate: false };
}

export async function listAssets(
  db: Db, userId: string, scope: "mine" | "workspace" | "public", workspaceId: string | undefined,
  f: { kind?: Asset["kind"]; license?: License; q?: string },
): Promise<Asset[]> {
  let where: SQL | undefined = sql`${assets.deletedAt} is null`;
  if (scope === "mine") where = and(where, eq(assets.createdBy, userId));
  else if (scope === "public") where = and(where, eq(assets.visibility, "public"), notHidden("asset", assets.id, assets.visibility, assets.createdBy, userId));
  else {
    await memberRole(db, workspaceId!, userId);
    where = and(where, eq(assets.visibility, "workspace"), eq(assets.workspaceId, workspaceId!));
  }
  if (f.kind) where = and(where, eq(assets.kind, f.kind));
  if (f.license) where = and(where, eq(assets.license, f.license));
  if (f.q) {
    const like = `%${escapeLike(f.q)}%`;
    where = and(where, or(
      sql`${assets.title} ilike ${like} escape '!'`,
      sql`${user.name} ilike ${like} escape '!'`,
      sql`exists (select 1 from unnest(${assets.tags}) as t(tag) where t.tag ilike ${like} escape '!')`,
    ));
  }
  // ponytail: no pagination yet, capped at 200; add a created_at cursor when libraries outgrow it
  const rows = await base(db).where(where).orderBy(desc(assets.createdAt)).limit(200);
  return rows.map((r) => toAsset(r, userId));
}

async function loadRow(db: Db, id: string): Promise<Joined | undefined> {
  if (!UUID.test(id)) return undefined;
  return (await base(db).where(eq(assets.id, id)))[0];
}

/** The asset if the user may see it, else null. */
export async function getAsset(db: Db, userId: string, id: string): Promise<Asset | null> {
  const r = await loadRow(db, id);
  return r && (await canReadAsset(db, userId, r.a)) ? toAsset(r, userId) : null;
}

/** The raw row if the user may see it, for serving bytes. */
export async function getAssetRow(db: Db, userId: string, id: string): Promise<Row | null> {
  const r = await loadRow(db, id);
  return r && (await canReadAsset(db, userId, r.a)) ? r.a : null;
}

/** Uploader-only edit; `merge` applies the patch to the current metadata and validates the result. */
export async function updateAsset(
  db: Db, userId: string, id: string, merge: (cur: AssetMeta) => AssetMeta,
): Promise<Asset> {
  const r = await loadRow(db, id);
  if (!r || !(await canSeeAsset(db, userId, r.a))) throw new WorkspaceError("not_found");
  const cur = r.a;
  if (cur.createdBy !== userId) throw new WorkspaceError("forbidden");
  const next = merge({
    title: cur.title, tags: cur.tags, license: cur.license as License, attribution: cur.attribution,
    visibility: cur.visibility as Visibility, workspaceId: cur.workspaceId ?? undefined,
  });
  const workspaceId = await placement(db, userId, next);
  await db.update(assets).set({
    title: next.title, tags: next.tags, license: next.license, attribution: next.attribution,
    visibility: next.visibility, workspaceId,
  }).where(eq(assets.id, id));
  return (await getAsset(db, userId, id))!;
}

/** Records that a design uses an asset the caller can see; needs edit rights on the design. Idempotent. */
export async function recordUse(db: Db, userId: string, designId: string, assetId: string): Promise<void> {
  const { design, role } = await loadWithRole(db, designId, userId);
  if (role === "viewer") throw new WorkspaceError("forbidden");
  const r = await loadRow(db, assetId);
  if (!r) throw new WorkspaceError("not_found");
  await db.transaction(async (tx) => {
    await lockBytes(tx, r.a.sha256);
    const [live] = await tx.select({ id: assets.id }).from(assets)
      .where(and(eq(assets.id, assetId), usableInDesign(userId, design.workspaceId)));
    if (!live) throw new WorkspaceError("not_found");
    await tx.insert(assetUses).values({ designId, assetId }).onConflictDoNothing();
  });
}

/** Uploader, or owner/admin of the asset's workspace. Used assets are soft-deleted so designs keep loading them. */
export async function deleteAsset(db: Db, storage: Storage, userId: string, id: string): Promise<void> {
  const r = await loadRow(db, id);
  if (!r || !(await canSeeAsset(db, userId, r.a))) throw new WorkspaceError("not_found");
  const a = r.a;
  if (a.createdBy !== userId) {
    const role = a.visibility === "workspace" && a.workspaceId ? await getRole(db, a.workspaceId, userId) : undefined;
    if (role !== "owner" && role !== "admin") throw new WorkspaceError("forbidden");
  }
  await removeAsset(db, storage, a);
}

/** Instance-moderation delete: no membership check, so only the admin module may call it. 404 when gone. */
export async function deleteAssetAsAdmin(db: Db, storage: Storage, id: string): Promise<void> {
  const r = await loadRow(db, id);
  if (!r || r.a.deletedAt) throw new WorkspaceError("not_found");
  await removeAsset(db, storage, r.a);
}

async function removeAsset(db: Db, storage: Storage, a: Row): Promise<void> {
  const id = a.id;
  await db.transaction(async (tx) => {
    await lockBytes(tx, a.sha256);
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(assetUses).where(eq(assetUses.assetId, id)) as [{ n: number }];
    if (n > 0) {
      // ponytail: soft-deleted assets whose last use is gone, and objects orphaned by a failed storage delete, are purged by the Phase 9 sweep
      await tx.update(assets).set({ deletedAt: sql`now()` }).where(eq(assets.id, id));
      return;
    }
    await tx.delete(assets).where(eq(assets.id, id));
    const [other] = await tx.select({ id: assets.id }).from(assets).where(eq(assets.sha256, a.sha256)).limit(1);
    if (!other) {
      for (const key of [`files/${a.sha256}`, `thumbs/${a.sha256}.webp`]) {
        await storage.delete(key).catch((e) => console.error(`asset delete: could not remove ${key}`, e));
      }
    }
  });
}
