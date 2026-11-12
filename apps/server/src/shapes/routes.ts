import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { Paint, Stroke } from "@cherry/doc";
import type { SessionUser } from "../auth";
import type { Db } from "../db/client";
import { parse } from "../http";
import * as svc from "./service";

const CreateBody = z.object({
  name: z.string().trim().min(1).max(80),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(10).default([])
    .transform((t) => [...new Set(t)]),
  visibility: z.enum(["private", "workspace", "public"]),
  workspaceId: z.string().optional(),
  d: z.string().max(100_000),
  fillRule: z.enum(["nonzero", "evenodd"]),
  fill: Paint.optional(),
  stroke: Stroke.optional(),
}).refine((v) => v.visibility !== "workspace" || v.workspaceId);
const ListQuery = z.object({
  scope: z.enum(["mine", "workspace", "public"]),
  workspaceId: z.string().optional(),
  q: z.string().max(100).optional(),
}).refine((v) => v.scope !== "workspace" || v.workspaceId);
const IdParams = z.object({ id: z.string() });

export function registerShapeRoutes(
  app: FastifyInstance, db: Db, requireUser: (req: FastifyRequest) => Promise<SessionUser>,
) {
  // Keyed by the authenticated user id (IP only when there is no session), so extra cookies can't mint a new bucket.
  const limit = {
    max: 30, timeWindow: "1 minute",
    keyGenerator: async (req: FastifyRequest) => {
      try { return (await requireUser(req)).id; } catch { return req.ip; }
    },
  };

  app.post("/api/shapes", { config: { rateLimit: limit } }, async (req, reply) => {
    const user = await requireUser(req);
    const shape = await svc.createShape(db, user.id, parse(CreateBody, req.body));
    return reply.status(201).send({ shape });
  });

  app.get("/api/shapes", async (req) => {
    const user = await requireUser(req);
    const q = parse(ListQuery, req.query);
    return { shapes: await svc.listShapes(db, user.id, q.scope, q.workspaceId, q.q) };
  });

  app.delete("/api/shapes/:id", async (req, reply) => {
    const user = await requireUser(req);
    await svc.deleteShape(db, user.id, parse(IdParams, req.params).id);
    return reply.status(204).send();
  });
}
