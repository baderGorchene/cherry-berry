import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { isAdmin } from "../auth";
import { deleteAssetAsAdmin } from "../assets/service";
import type { Config } from "../config";
import type { Db } from "../db/client";
import { assets, reports, shapes, templates, user } from "../db/schema";
import { HttpError } from "../errors";
import { deleteTemplateAsAdmin } from "../templates/service";
import type { Storage } from "../storage";
import { WorkspaceError } from "../workspaces/errors";
import { UUID } from "../workspaces/service";
import { suspendUser } from "./service";

type Uploader = { id: string; name: string };
export type QueueItem =
  | { kind: "report"; targetType: "asset" | "shape" | "template"; targetId: string; title: string; uploader: Uploader;
      visibility: "public"; license: string; reason: "copyright" | "inappropriate" | "spam" | "other"; note: string; count: number; createdAt: string }
  | { kind: "sanitized"; targetType: "asset"; targetId: string; title: string; uploader: Uploader; createdAt: string };
type Target = { targetType: "asset" | "shape" | "template"; targetId: string };

/** Reports on public targets (one row per target, by newest report), then public SVGs the sanitizer changed and nobody reviewed. */
export async function listQueue(db: Db): Promise<QueueItem[]> {
  const owner = sql<string>`coalesce(${assets.createdBy}, ${shapes.createdBy}, ${templates.createdBy})`;
  const rows = await db.select({
    targetType: reports.targetType, targetId: reports.targetId, reason: reports.reason, note: reports.note, createdAt: reports.createdAt,
    title: sql<string>`coalesce(${assets.title}, ${shapes.name}, ${templates.name})`,
    license: sql<string>`coalesce(${assets.license}, ${templates.license}, 'n/a')`,
    uploaderId: user.id, uploaderName: user.name,
  }).from(reports)
    .leftJoin(assets, and(eq(reports.targetType, "asset"), eq(assets.id, reports.targetId), eq(assets.visibility, "public"), isNull(assets.deletedAt)))
    .leftJoin(shapes, and(eq(reports.targetType, "shape"), eq(shapes.id, reports.targetId), eq(shapes.visibility, "public")))
    .leftJoin(templates, and(eq(reports.targetType, "template"), eq(templates.id, reports.targetId), eq(templates.visibility, "public")))
    .innerJoin(user, eq(user.id, owner))
    .where(and(eq(reports.status, "open"), sql`(${assets.id} is not null or ${shapes.id} is not null or ${templates.id} is not null)`))
    .orderBy(desc(reports.createdAt), desc(reports.id));
  // Newest first, so the first row per target carries its newest reason and note.
  const byTarget = new Map<string, Extract<QueueItem, { kind: "report" }>>();
  for (const r of rows) {
    const key = `${r.targetType}:${r.targetId}`;
    const seen = byTarget.get(key);
    if (seen) seen.count++;
    else byTarget.set(key, {
      kind: "report", targetType: r.targetType as "asset", targetId: r.targetId, title: r.title,
      uploader: { id: r.uploaderId, name: r.uploaderName }, visibility: "public", license: r.license,
      reason: r.reason as "spam", note: r.note, count: 1, createdAt: r.createdAt.toISOString(),
    });
  }
  const svgs = await db.select({ id: assets.id, title: assets.title, createdAt: assets.createdAt, uploaderId: user.id, uploaderName: user.name })
    .from(assets).innerJoin(user, eq(user.id, assets.createdBy))
    .where(and(eq(assets.visibility, "public"), eq(assets.sanitized, true), isNull(assets.reviewedAt), isNull(assets.deletedAt)))
    .orderBy(desc(assets.createdAt), desc(assets.id));
  return [
    ...byTarget.values(),
    ...svgs.map((a): QueueItem => ({
      kind: "sanitized", targetType: "asset", targetId: a.id, title: a.title,
      uploader: { id: a.uploaderId, name: a.uploaderName }, createdAt: a.createdAt.toISOString(),
    })),
  ];
}

async function load({ targetType, targetId }: Target, db: Db) {
  if (!UUID.test(targetId)) throw new WorkspaceError("not_found");
  const [t] = targetType === "asset"
    ? await db.select({ by: assets.createdBy, visibility: assets.visibility, sanitized: assets.sanitized, reviewed: assets.reviewedAt, gone: assets.deletedAt }).from(assets).where(eq(assets.id, targetId))
    : targetType === "shape"
      ? await db.select({ by: shapes.createdBy, visibility: shapes.visibility, sanitized: sql<boolean>`false`, reviewed: sql<null>`null`, gone: sql<null>`null` }).from(shapes).where(eq(shapes.id, targetId))
      : await db.select({ by: templates.createdBy, visibility: templates.visibility, sanitized: sql<boolean>`false`, reviewed: sql<null>`null`, gone: sql<null>`null` }).from(templates).where(eq(templates.id, targetId));
  // The instance queue only covers public content; private and workspace items are not an admin's to touch here.
  if (!t || t.gone || t.visibility !== "public") throw new WorkspaceError("not_found");
  return t;
}

/**
 * Acts on a queue target. `keep` dismisses its open reports; `remove` deletes it and closes them as removed;
 * `suspend` is `remove` plus suspending the uploader (never an admin); `approve` clears a sanitized SVG.
 * `onSuspend` lets the route close the uploader's live sockets.
 */
export async function actOnQueue(
  db: Db, storage: Storage, config: Config, adminId: string, item: Target,
  action: "keep" | "remove" | "suspend" | "approve", onSuspend?: (userId: string) => void,
): Promise<void> {
  const t = await load(item, db);
  const [open] = await db.select({ n: sql<number>`count(*)::int` }).from(reports).where(and(
    eq(reports.targetType, item.targetType), eq(reports.targetId, item.targetId), eq(reports.status, "open")));
  if (action === "approve" && !(item.targetType === "asset" && t.sanitized && !t.reviewed)) throw new HttpError(400, "invalid_body");
  if (action === "keep" && !open!.n) throw new HttpError(400, "invalid_body");
  const close = (status: "dismissed" | "removed") =>
    db.update(reports).set({ status, resolvedBy: adminId, resolvedAt: sql`now()` }).where(and(
      eq(reports.targetType, item.targetType), eq(reports.targetId, item.targetId), eq(reports.status, "open")));

  if (action === "approve") { await db.update(assets).set({ reviewedAt: sql`now()` }).where(eq(assets.id, item.targetId)); return; }
  if (action === "keep") { await close("dismissed"); return; }
  if (action === "suspend") {
    const [u] = await db.select({ email: user.email }).from(user).where(eq(user.id, t.by));
    if (u && isAdmin(config, u.email)) throw new HttpError(400, "invalid_body"); // refuse before changing anything
  }
  await db.transaction(async (tx) => {
    const tdb = tx as unknown as Db;
    if (action === "suspend") await suspendUser(tdb, config, t.by);
    if (item.targetType === "asset") await deleteAssetAsAdmin(tdb, storage, item.targetId);
    else if (item.targetType === "shape") await tx.delete(shapes).where(eq(shapes.id, item.targetId));
    else await deleteTemplateAsAdmin(tdb, storage, item.targetId);
    await tx.update(reports).set({ status: "removed", resolvedBy: adminId, resolvedAt: sql`now()` }).where(and(
      eq(reports.targetType, item.targetType), eq(reports.targetId, item.targetId), eq(reports.status, "open")));
  });
  if (action === "suspend") onSuspend?.(t.by);
}
