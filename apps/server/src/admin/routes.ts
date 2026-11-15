import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { SessionUser } from "../auth";
import type { Collab } from "../collab/server";
import type { Config } from "../config";
import type { Db } from "../db/client";
import type { Storage } from "../storage";
import { parse } from "../http";
import { actOnQueue, listQueue } from "./moderation";
import * as svc from "./service";
import { getSettings, saveSettings, SettingsBody } from "./settings";

const UsersQuery = z.object({ q: z.string().max(100).optional(), cursor: z.string().max(300).optional() });
const PageQuery = z.object({ cursor: z.string().max(300).optional() });
const QueueParams = z.object({ type: z.enum(["asset", "shape", "template"]), id: z.string() });
const QueueBody = z.object({ action: z.enum(["keep", "remove", "suspend", "approve"]) });
const IdParams = z.object({ id: z.string() });

export function registerAdminRoutes(
  app: FastifyInstance, db: Db, storage: Storage, config: Config, collab: Collab, requireAdmin: (req: FastifyRequest) => Promise<SessionUser>,
) {
  app.get("/api/admin/settings", async (req) => {
    await requireAdmin(req);
    return { settings: await getSettings(db) };
  });

  app.put("/api/admin/settings", async (req) => {
    await requireAdmin(req);
    return { settings: await saveSettings(db, parse(SettingsBody, req.body)) };
  });

  app.get("/api/admin/overview", async (req) => { await requireAdmin(req); return svc.overview(db, config); });

  app.get("/api/admin/users", async (req) => {
    await requireAdmin(req);
    const q = parse(UsersQuery, req.query);
    return svc.listUsers(db, config, q.q, q.cursor);
  });

  app.post("/api/admin/users/:id/suspend", async (req, reply) => {
    await requireAdmin(req);
    const { id } = parse(IdParams, req.params);
    await svc.suspendUser(db, config, id);
    collab.disconnectUser(id); // sessions are gone; this closes the sockets that were already open
    return reply.status(204).send();
  });

  app.post("/api/admin/users/:id/unsuspend", async (req, reply) => {
    await requireAdmin(req);
    await svc.unsuspendUser(db, parse(IdParams, req.params).id);
    return reply.status(204).send();
  });

  app.get("/api/admin/workspaces", async (req) => {
    await requireAdmin(req);
    return svc.listWorkspaces(db, parse(PageQuery, req.query).cursor);
  });

  app.get("/api/admin/moderation", async (req) => { await requireAdmin(req); return { items: await listQueue(db) }; });

  app.post("/api/admin/moderation/:type/:id", async (req, reply) => {
    const admin = await requireAdmin(req);
    const p = parse(QueueParams, req.params);
    await actOnQueue(db, storage, config, admin.id, { targetType: p.type, targetId: p.id }, parse(QueueBody, req.body).action,
      (id) => collab.disconnectUser(id));
    return reply.status(204).send();
  });

  app.get("/api/admin/storage", async (req) => { await requireAdmin(req); return svc.storageReport(db); });
}
