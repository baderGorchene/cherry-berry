import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { Paint, Stroke } from "@cherry/doc";
import type { SessionUser } from "../auth";
import type { Db } from "../db/client";
import { HttpError } from "../errors";
import * as svc from "./service";

const parse = <T>(schema: z.ZodType<T>, data: unknown): T => {
  const r = schema.safeParse(data ?? {});
  if (!r.success) throw new HttpError(400, "invalid_body");
  return r.data;
};

const CreateBody = z.object({
  name: z.string().trim().min(1).max(80),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(10).default([])
    .transform((t) => [...new Set(t)]),
  visibility: z.enum(["private", "workspace", "public"]),
  workspaceId: z.string().optional(),
  d: z.string(),
  fillRule: z.enum(["nonzero", "evenodd"]),
  fill: Paint.optional(),
  stroke: Stroke.optional(),
});
const ListQuery = z.object({
  scope: z.enum(["mine", "workspace", "public"]),
  workspaceId: z.string().optional(),
  q: z.string().max(100).optional(),
}).refine((v) => v.scope !== "workspace" || v.workspaceId);
const IdParams = z.object({ id: z.string() });

export function registerShapeRoutes(
  app: FastifyInstance, db: Db, requireUser: (req: FastifyRequest) => Promise<SessionUser>,
) {
  // Keyed by session cookie (falling back to IP) so the limit is per user, not per address.
  const limit = { max: 30, timeWindow: "1 minute", keyGenerator: (req: FastifyRequest) => req.headers.cookie ?? req.ip };

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
