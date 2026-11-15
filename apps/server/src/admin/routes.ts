import type { FastifyInstance, FastifyRequest } from "fastify";
import type { SessionUser } from "../auth";
import type { Db } from "../db/client";
import { parse } from "../http";
import { getSettings, saveSettings, SettingsBody } from "./settings";

export function registerAdminRoutes(
  app: FastifyInstance, db: Db, requireAdmin: (req: FastifyRequest) => Promise<SessionUser>,
) {
  app.get("/api/admin/settings", async (req) => {
    await requireAdmin(req);
    return { settings: await getSettings(db) };
  });

  app.put("/api/admin/settings", async (req) => {
    await requireAdmin(req);
    return { settings: await saveSettings(db, parse(SettingsBody, req.body)) };
  });
}
