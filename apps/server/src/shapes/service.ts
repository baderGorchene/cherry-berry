import { and, desc, eq, or, sql } from "drizzle-orm";
import type { Paint, Stroke } from "@cherry/doc";
import { parsePath, pathBounds, toPathData, transformPath } from "@cherry/vector";
import type { Db } from "../db/client";
import { escapeLike } from "../http";
import { notHidden } from "../reports/hide";
import { shapes } from "../db/schema";
import { WorkspaceError } from "../workspaces/errors";
import { getRole, UUID } from "../workspaces/service";

export type Visibility = "private" | "workspace" | "public";
export type Shape = {
  id: string; name: string; tags: string[]; visibility: Visibility; workspaceId: string | null;
  d: string; width: number; height: number; fillRule: "nonzero" | "evenodd";
  fill: Paint | null; stroke: Stroke | null; createdBy: string; createdAt: string; mine: boolean;
};
type Row = typeof shapes.$inferSelect;
const toShape = (r: Row, userId: string): Shape => ({
  id: r.id, name: r.name, tags: r.tags, visibility: r.visibility as Visibility, workspaceId: r.workspaceId,
  d: r.d, width: r.width, height: r.height, fillRule: r.fillRule as Shape["fillRule"],
  fill: r.fill as Paint | null, stroke: r.stroke as Stroke | null,
  createdBy: r.createdBy, createdAt: r.createdAt.toISOString(), mine: r.createdBy === userId,
});

const MAX_NORMALIZED_D = 200_000;

/** Re-serializes `d`, moves its bounds to the origin and measures it; the client never supplies a size. */
function normalize(d: string): { d: string; width: number; height: number } {
  try {
    const m = parsePath(d);
    const b = pathBounds(m);
    const out = transformPath(toPathData(m), [1, 0, 0, 1, -b.x, -b.y]);
    const { width, height } = pathBounds(parsePath(out));
    if (!(width > 0 || height > 0) || out.length > MAX_NORMALIZED_D) throw new Error("invalid");
    return { d: out, width, height };
  } catch {
    throw new WorkspaceError("invalid_shape");
  }
}

async function memberRole(db: Db, workspaceId: string, userId: string) {
  const role = UUID.test(workspaceId) ? await getRole(db, workspaceId, userId) : null;
  if (!role) throw new WorkspaceError("not_found");
  return role;
}

export async function createShape(
  db: Db, userId: string,
  input: {
    name: string; tags: string[]; visibility: Visibility; workspaceId?: string; d: string;
    fillRule: "nonzero" | "evenodd"; fill?: Paint; stroke?: Stroke;
  },
): Promise<Shape> {
  let workspaceId: string | null = null;
  if (input.visibility === "workspace") {
    if (!input.workspaceId) throw new WorkspaceError("not_found");
    if ((await memberRole(db, input.workspaceId, userId)) === "viewer") throw new WorkspaceError("forbidden");
    workspaceId = input.workspaceId;
  }
  const n = normalize(input.d);
  const [row] = await db.insert(shapes).values({
    createdBy: userId, workspaceId, visibility: input.visibility, name: input.name, tags: input.tags,
    d: n.d, width: n.width, height: n.height, fillRule: input.fillRule,
    fill: input.fill ?? null, stroke: input.stroke ?? null,
  }).returning();
  return toShape(row!, userId);
}

export async function listShapes(
  db: Db, userId: string, scope: "mine" | "workspace" | "public", workspaceId: string | undefined, q: string | undefined,
): Promise<Shape[]> {
  let where;
  if (scope === "mine") where = eq(shapes.createdBy, userId);
  else if (scope === "public") where = and(eq(shapes.visibility, "public"), notHidden("shape", shapes.id, shapes.visibility, shapes.createdBy, userId));
  else {
    await memberRole(db, workspaceId!, userId);
    where = and(eq(shapes.visibility, "workspace"), eq(shapes.workspaceId, workspaceId!));
  }
  if (q) {
    const like = `%${escapeLike(q)}%`;
    where = and(where, or(
      sql`${shapes.name} ilike ${like} escape '!'`,
      sql`exists (select 1 from unnest(${shapes.tags}) as t(tag) where t.tag ilike ${like} escape '!')`,
    ));
  }
  // ponytail: no pagination yet, capped at 200; add a created_at cursor when libraries outgrow it
  const rows = await db.select().from(shapes).where(where).orderBy(desc(shapes.createdAt)).limit(200);
  return rows.map((r) => toShape(r, userId));
}

/** The shape row if the user may see it (own, public, or workspace in a workspace they belong to), else undefined. */
export async function findVisibleShape(db: Db, userId: string, id: string) {
  if (!UUID.test(id)) return undefined;
  const [s] = await db.select().from(shapes).where(eq(shapes.id, id));
  if (!s) return undefined;
  const role = s.workspaceId ? await getRole(db, s.workspaceId, userId) : undefined;
  const visible = s.createdBy === userId || s.visibility === "public" || (s.visibility === "workspace" && role);
  return visible ? { s, role } : undefined;
}

export async function deleteShape(db: Db, userId: string, id: string): Promise<void> {
  const found = await findVisibleShape(db, userId, id);
  if (!found) throw new WorkspaceError("not_found");
  const { s, role } = found;
  if (s.createdBy !== userId && !(s.visibility === "workspace" && (role === "owner" || role === "admin"))) {
    throw new WorkspaceError("forbidden");
  }
  await db.delete(shapes).where(eq(shapes.id, id));
}
