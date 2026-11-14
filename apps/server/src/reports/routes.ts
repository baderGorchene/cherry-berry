import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { SessionUser } from "../auth";
import type { Db } from "../db/client";
import { parse } from "../http";
import type { Storage } from "../storage";
import * as svc from "./service";

const CreateBody = z.object({
  targetType: z.enum(["asset", "shape", "template"]),
  targetId: z.string(),
  reason: z.enum(["copyright", "inappropriate", "spam", "other"]),
  note: z.string().trim().max(500).default(""),
});
const ResolveBody = z.object({ action: z.enum(["dismiss", "remove"]) });
const IdParams = z.object({ id: z.string() });

export function registerReportRoutes(
  app: FastifyInstance, db: Db, storage: Storage, requireUser: (req: FastifyRequest) => Promise<SessionUser>,
) {
  // Keyed by the authenticated user id (IP only when there is no session), so extra cookies can't mint a new bucket.
  const limit = {
    max: 20, timeWindow: "1 minute",
    keyGenerator: async (req: FastifyRequest) => {
      try { return (await requireUser(req)).id; } catch { return req.ip; }
    },
  };

  app.post("/api/reports", { config: { rateLimit: limit } }, async (req, reply) => {
    const user = await requireUser(req);
    const { id, created } = await svc.createReport(db, user.id, parse(CreateBody, req.body));
    return reply.status(created ? 201 : 200).send({ report: { id } });
  });

  app.get("/api/workspaces/:id/reports", async (req) => {
    const user = await requireUser(req);
    return { reports: await svc.listWorkspaceReports(db, user.id, parse(IdParams, req.params).id) };
  });

  app.post("/api/reports/:id/resolve", async (req, reply) => {
    const user = await requireUser(req);
    await svc.resolveReport(db, storage, user.id, parse(IdParams, req.params).id, parse(ResolveBody, req.body).action);
    return reply.status(204).send();
  });
}
