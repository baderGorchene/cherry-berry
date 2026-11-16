import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { assets, reports, shapes, user } from "../db/schema";
import { HttpError } from "../errors";
import { canSeeAsset, deleteAsset } from "../assets/service";
import { deleteShape, findVisibleShape } from "../shapes/service";
import { findPublicTemplate } from "../templates/service";
import type { Storage } from "../storage";
import { WorkspaceError } from "../workspaces/errors";
import { getRole, UUID } from "../workspaces/service";

export type TargetType = "asset" | "shape" | "template";
export type Reason = "copyright" | "inappropriate" | "spam" | "other";
export type QueueRow = {
  id: string; targetType: TargetType; targetId: string; title: string; reason: Reason; note: string;
  reporterName: string; createdAt: string; count: number;
};

/** The target's uploader if `userId` can see it (the base visibility rule, not design-use access). */
async function visibleTarget(db: Db, userId: string, type: TargetType, id: string) {
  if (!UUID.test(id)) return undefined;
  if (type === "template") {
    const found = await findPublicTemplate(db, userId, id);
    return found && { createdBy: found.createdBy };
  }
  if (type === "shape") {
    const found = await findVisibleShape(db, userId, id);
    return found && { createdBy: found.s.createdBy };
  }
  const [a] = await db.select().from(assets).where(eq(assets.id, id));
  return a && (await canSeeAsset(db, userId, a)) ? { createdBy: a.createdBy } : undefined;
}

/** Files a report, or returns the reporter's existing one for this target. */
export async function createReport(
  db: Db, userId: string, input: { targetType: TargetType; targetId: string; reason: Reason; note: string },
): Promise<{ id: string; created: boolean }> {
  const target = await visibleTarget(db, userId, input.targetType, input.targetId);
  if (!target) throw new WorkspaceError("not_found");
  if (target.createdBy === userId) throw new HttpError(400, "invalid_body");
  const [row] = await db.insert(reports).values({ ...input, reporterId: userId })
    .onConflictDoNothing().returning({ id: reports.id });
  if (row) return { id: row.id, created: true };
  const [existing] = await db.select({ id: reports.id }).from(reports).where(and(
    eq(reports.targetType, input.targetType), eq(reports.targetId, input.targetId), eq(reports.reporterId, userId)));
  return { id: existing!.id, created: false };
}

async function requireModerator(db: Db, workspaceId: string, userId: string) {
  const role = await getRole(db, workspaceId, userId);
  if (!role) throw new WorkspaceError("not_found");
  if (role !== "owner" && role !== "admin") throw new WorkspaceError("forbidden");
}

/** Open reports on the workspace's own workspace-visibility assets and shapes, one row per target, newest first. */
export async function listWorkspaceReports(db: Db, userId: string, workspaceId: string): Promise<QueueRow[]> {
  if (!UUID.test(workspaceId)) throw new WorkspaceError("not_found");
  await requireModerator(db, workspaceId, userId);
  const rows = await db.select({
    id: reports.id, targetType: reports.targetType, targetId: reports.targetId, reason: reports.reason,
    note: reports.note, reporterName: user.name, createdAt: reports.createdAt,
    title: sql<string>`coalesce(${assets.title}, ${shapes.name})`,
  }).from(reports)
    .innerJoin(user, eq(user.id, reports.reporterId))
    .leftJoin(assets, and(eq(reports.targetType, "asset"), eq(assets.id, reports.targetId),
      eq(assets.visibility, "workspace"), eq(assets.workspaceId, workspaceId), sql`${assets.deletedAt} is null`))
    .leftJoin(shapes, and(eq(reports.targetType, "shape"), eq(shapes.id, reports.targetId),
      eq(shapes.visibility, "workspace"), eq(shapes.workspaceId, workspaceId)))
    .where(and(eq(reports.status, "open"), sql`(${assets.id} is not null or ${shapes.id} is not null)`))
    .orderBy(sql`${reports.createdAt} desc, ${reports.id} desc`);
  // Rows arrive newest first, so the first row seen per target is its newest report.
  const byTarget = new Map<string, QueueRow>();
  for (const r of rows) {
    const key = `${r.targetType}:${r.targetId}`;
    const seen = byTarget.get(key);
    if (seen) seen.count++;
    else byTarget.set(key, {
      id: r.id, targetType: r.targetType as TargetType, targetId: r.targetId, title: r.title, reason: r.reason as Reason,
      note: r.note, reporterName: r.reporterName, createdAt: r.createdAt.toISOString(), count: 1,
    });
  }
  return [...byTarget.values()];
}

/** Owner or admin of the target's workspace only; `remove` deletes the target, either way every open report on it closes. */
export async function resolveReport(
  db: Db, storage: Storage, userId: string, id: string, action: "dismiss" | "remove",
): Promise<void> {
  if (!UUID.test(id)) throw new WorkspaceError("not_found");
  const [rep] = await db.select().from(reports).where(and(eq(reports.id, id), eq(reports.status, "open")));
  if (!rep) throw new WorkspaceError("not_found");
  const [target] = rep.targetType === "asset"
    ? await db.select({ workspaceId: assets.workspaceId, visibility: assets.visibility, gone: assets.deletedAt })
      .from(assets).where(eq(assets.id, rep.targetId))
    : await db.select({ workspaceId: shapes.workspaceId, visibility: shapes.visibility, gone: sql<null>`null` })
      .from(shapes).where(eq(shapes.id, rep.targetId));
  // Only workspace-visibility items have a queue; anything else is not this user's to resolve.
  if (!target || target.gone || target.visibility !== "workspace" || !target.workspaceId) throw new WorkspaceError("not_found");
  await requireModerator(db, target.workspaceId, userId);
  await db.transaction(async (tx) => {
    const tdb = tx as unknown as Db;
    if (action === "remove") {
      // An owner or admin passes the same checks as the uploader, so the existing deletes (and their cleanup) do the work.
      if (rep.targetType === "asset") await deleteAsset(tdb, storage, userId, rep.targetId);
      else await deleteShape(tdb, userId, rep.targetId);
    }
    await tx.update(reports).set({ status: action === "remove" ? "removed" : "dismissed", resolvedBy: userId, resolvedAt: sql`now()` })
      .where(and(eq(reports.targetType, rep.targetType), eq(reports.targetId, rep.targetId), eq(reports.status, "open")));
  });
}
