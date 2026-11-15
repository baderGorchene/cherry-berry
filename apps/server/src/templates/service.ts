import { randomUUID } from "node:crypto";
import { and, desc, eq, getTableColumns, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import * as Y from "yjs";
import { type CherryNode, setTitle, yToDoc } from "@cherry/doc";
import { usableInDesign } from "../assets/service";
import { thumbnail } from "../assets/ingest";
import type { Collab } from "../collab/server";
import type { Db } from "../db/client";
import { assetUses, assets, brandKits, designs, templates, user } from "../db/schema";
import { summary, summaryColumns, loadWithRole, type DesignSummary } from "../designs/service";
import { HttpError } from "../errors";
import { escapeLike } from "../http";
import { notHidden } from "../reports/hide";
import type { Storage } from "../storage";
import { WorkspaceError } from "../workspaces/errors";
import { getRole, UUID, type Role } from "../workspaces/service";

export type Category = "social" | "print" | "presentation" | "cards" | "other";
export type TemplateLicense = "cc0" | "cc-by" | "workspace-only";
export type Template = {
  id: string; workspaceId: string; visibility: "workspace" | "public"; status: "published" | "pending";
  kitId: string | null; kitName: string | null; name: string; category: Category; license: TemplateLicense;
  attribution: string; width: number; height: number; unit: string; colorMode: string;
  createdBy: string; authorName: string; createdAt: string; mine: boolean;
};
export type PublishInput = {
  name: string; category: Category; visibility: "workspace" | "public"; license: TemplateLicense;
  attribution: string; kitId?: string | null; thumb: Uint8Array;
};
type Row = Omit<typeof templates.$inferSelect, "state">;
const { state: _state, ...rowColumns } = getTableColumns(templates);

const MAX_THUMB = 2 * 1024 * 1024;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const thumbKey = (id: string) => `template-thumbs/${id}.webp`;
const isAdmin = (role: Role | undefined) => role === "owner" || role === "admin";

// The state bytea is big; only publish and use touch it.
const base = (db: Db) => db.select({ t: rowColumns, authorName: user.name, kitName: brandKits.name }).from(templates)
  .innerJoin(user, eq(user.id, templates.createdBy)).leftJoin(brandKits, eq(brandKits.id, templates.kitId));
const toTemplate = ({ t, authorName, kitName }: { t: Row; authorName: string; kitName: string | null }, userId: string): Template => ({
  id: t.id, workspaceId: t.workspaceId, visibility: t.visibility as Template["visibility"],
  status: t.status as Template["status"], kitId: t.kitId, kitName, name: t.name, category: t.category as Category,
  license: t.license as TemplateLicense, attribution: t.attribution, width: t.width, height: t.height,
  unit: t.unit, colorMode: t.colorMode, createdBy: t.createdBy, authorName, createdAt: t.createdAt.toISOString(),
  mine: t.createdBy === userId,
});

/** Every image layer's asset id, groups included. */
export function imageAssetIds(nodes: CherryNode[], out = new Set<string>()): Set<string> {
  for (const n of nodes) {
    if (n.kind === "image") out.add(n.assetId);
    else if (n.kind === "group") imageAssetIds(n.children, out);
  }
  return out;
}

/** The template if `userId` may list it: a member of its workspace (pending only for creator, owner, admin), or public. */
async function findVisible(db: Db, userId: string, id: string) {
  if (!UUID.test(id)) return undefined;
  const [r] = await base(db).where(and(eq(templates.id, id),
    notHidden("template", templates.id, templates.visibility, templates.createdBy, userId)));
  if (!r) return undefined;
  const role = await getRole(db, r.t.workspaceId, userId);
  if (r.t.visibility === "public" && r.t.status === "published") return { ...r, role };
  if (!role) return undefined;
  if (r.t.status === "pending" && r.t.createdBy !== userId && !isAdmin(role)) return undefined;
  return { ...r, role };
}

/** A published public template the user may see; the only kind that can be reported. */
export async function findPublicTemplate(db: Db, userId: string, id: string): Promise<Row | undefined> {
  const r = await findVisible(db, userId, id);
  return r && r.t.visibility === "public" ? r.t : undefined;
}

async function reencodeThumb(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.length > MAX_THUMB || !PNG_MAGIC.every((v, i) => bytes[i] === v)) throw new HttpError(400, "invalid_image");
  try { return await thumbnail(bytes); } catch { throw new HttpError(400, "invalid_image"); }
}

export async function publishTemplate(
  db: Db, storage: Storage, collab: Collab, userId: string, designId: string, input: PublishInput,
): Promise<Template> {
  const { design, role } = await loadWithRole(db, designId, userId);
  if (role === "viewer") throw new WorkspaceError("forbidden");
  const workspaceOnly = input.visibility === "workspace";
  if (!workspaceOnly && (input.license === "workspace-only" || (input.license === "cc-by" && !input.attribution))) {
    throw new HttpError(400, "invalid_body");
  }
  const license: TemplateLicense = workspaceOnly ? "workspace-only" : input.license;
  const attribution = license === "cc-by" ? input.attribution : "";
  if (input.kitId) {
    const [kit] = !workspaceOnly || !UUID.test(input.kitId) ? [] : await db.select().from(brandKits)
      .where(and(eq(brandKits.id, input.kitId), eq(brandKits.workspaceId, design.workspaceId)));
    if (!kit) throw new HttpError(400, "invalid_body");
  }
  const [needsApproval] = role !== "editor" ? [] : await db.select({ id: brandKits.id }).from(brandKits)
    .where(and(eq(brandKits.workspaceId, design.workspaceId), sql`${brandKits.content}->'rules'->>'requireApproval' = 'true'`)).limit(1);
  const webp = await reencodeThumb(input.thumb);

  const state = collab.liveState(designId)
    ?? ((await db.select({ state: designs.state }).from(designs).where(eq(designs.id, designId))) as [{ state: Uint8Array }])[0].state;
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, state);
  const parsed = yToDoc(ydoc);
  if (!parsed.ok) throw new HttpError(400, "invalid_document");
  const ids = [...new Set(parsed.doc.pages.flatMap((p) => [...imageAssetIds(p.nodes)]))];
  if (ids.length) {
    const valid = ids.every((i) => UUID.test(i)) ? await db.select({ id: assets.id }).from(assets).where(and(
      inArray(assets.id, ids), isNull(assets.deletedAt),
      or(eq(assets.visibility, "public"),
        workspaceOnly ? and(eq(assets.visibility, "workspace"), eq(assets.workspaceId, design.workspaceId)) : undefined),
    )) : [];
    if (valid.length !== ids.length) throw new WorkspaceError("template_private_assets");
  }

  const id = randomUUID();
  await storage.put(thumbKey(id), webp, "image/webp");
  try {
    await db.insert(templates).values({
      id, workspaceId: design.workspaceId, visibility: input.visibility, license, attribution,
      status: needsApproval ? "pending" : "published",
      kitId: input.kitId ?? null, name: input.name, category: input.category,
      width: design.width, height: design.height, unit: design.unit, colorMode: design.colorMode,
      state, createdBy: userId,
    });
  } catch (e) {
    await storage.delete(thumbKey(id));
    throw e;
  }
  const [r] = await base(db).where(eq(templates.id, id));
  return toTemplate(r!, userId);
}

export async function listTemplates(
  db: Db, userId: string,
  f: { scope: "workspace"; workspaceId: string } | { scope: "public"; q?: string; category?: Category },
): Promise<Template[]> {
  let where: SQL | undefined;
  if (f.scope === "workspace") {
    const role = UUID.test(f.workspaceId) ? await getRole(db, f.workspaceId, userId) : undefined;
    if (!role) throw new WorkspaceError("not_found");
    where = and(eq(templates.workspaceId, f.workspaceId),
      isAdmin(role) ? undefined : or(eq(templates.status, "published"), eq(templates.createdBy, userId)),
      notHidden("template", templates.id, templates.visibility, templates.createdBy, userId));
  } else {
    const like = f.q ? `%${escapeLike(f.q)}%` : undefined;
    where = and(eq(templates.visibility, "public"), eq(templates.status, "published"),
      notHidden("template", templates.id, templates.visibility, templates.createdBy, userId),
      f.category ? eq(templates.category, f.category) : undefined,
      like ? or(sql`${templates.name} ilike ${like} escape '!'`, sql`${user.name} ilike ${like} escape '!'`) : undefined);
  }
  // ponytail: no pagination yet, capped at 200; add a created_at cursor when the gallery outgrows it
  const rows = await base(db).where(where).orderBy(desc(templates.createdAt)).limit(200);
  return rows.map((r) => toTemplate(r, userId));
}

export async function getThumb(db: Db, storage: Storage, userId: string, id: string): Promise<Uint8Array> {
  const found = await findVisible(db, userId, id);
  const bytes = found && await storage.get(thumbKey(id));
  if (!bytes) throw new WorkspaceError("not_found");
  return bytes;
}

export async function useTemplate(db: Db, userId: string, id: string, workspaceId: string): Promise<DesignSummary> {
  const found = await findVisible(db, userId, id);
  const role = UUID.test(workspaceId) ? await getRole(db, workspaceId, userId) : undefined;
  if (!found || !role || found.t.status !== "published") throw new WorkspaceError("not_found");
  const t = found.t;
  const [{ state }] = (await db.select({ state: templates.state }).from(templates).where(eq(templates.id, id))) as [{ state: Uint8Array }];
  if (t.visibility === "workspace" && t.workspaceId !== workspaceId) throw new WorkspaceError("not_found");
  if (role === "viewer") throw new WorkspaceError("forbidden");
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, state);
  const parsed = yToDoc(ydoc);
  if (!parsed.ok) throw new HttpError(400, "invalid_document");
  setTitle(ydoc, t.name);
  const ids = [...new Set(parsed.doc.pages.flatMap((p) => [...imageAssetIds(p.nodes)]))].filter((i) => UUID.test(i));
  return db.transaction(async (tx) => {
    const [d] = await tx.insert(designs).values({
      workspaceId, title: t.name, width: t.width, height: t.height, unit: t.unit, colorMode: t.colorMode,
      state: Y.encodeStateAsUpdate(ydoc), kitId: t.workspaceId === workspaceId ? t.kitId : null, createdBy: userId,
    }).returning(summaryColumns);
    if (ids.length) {
      // Assets deleted or made private since publishing are skipped; the layer then shows as missing.
      const live = await tx.select({ id: assets.id }).from(assets).where(and(inArray(assets.id, ids), usableInDesign(userId, workspaceId)));
      if (live.length) await tx.insert(assetUses).values(live.map((a) => ({ designId: d!.id, assetId: a.id }))).onConflictDoNothing();
    }
    return summary(d!);
  });
}

export async function approveTemplate(db: Db, userId: string, id: string): Promise<Template> {
  const found = await findVisible(db, userId, id);
  if (!found?.role) throw new WorkspaceError("not_found");
  if (!isAdmin(found.role)) throw new WorkspaceError("forbidden");
  await db.update(templates).set({ status: "published" }).where(eq(templates.id, id));
  return toTemplate((await base(db).where(eq(templates.id, id)))[0]!, userId);
}

export async function deleteTemplate(db: Db, storage: Storage, userId: string, id: string): Promise<void> {
  const found = await findVisible(db, userId, id);
  if (!found) throw new WorkspaceError("not_found");
  if (found.t.createdBy !== userId && !isAdmin(found.role)) throw new WorkspaceError(found.role ? "forbidden" : "not_found");
  await db.delete(templates).where(eq(templates.id, id));
  await storage.delete(thumbKey(id));
}

/** Instance-moderation delete: no membership or existence check (the caller has already loaded the template), so only the admin module may call it. */
export async function deleteTemplateAsAdmin(db: Db, storage: Storage, id: string): Promise<void> {
  await db.delete(templates).where(eq(templates.id, id));
  await storage.delete(thumbKey(id));
}
