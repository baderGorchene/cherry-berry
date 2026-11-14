import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { BrandKitContent } from "@cherry/doc";
import type { SessionUser } from "../auth";
import type { Db } from "../db/client";
import { parse } from "../http";
import * as svc from "./service";

const Name = z.string().trim().min(1).max(60);
const CreateBody = z.object({ name: Name, content: BrandKitContent.optional() });
const UpdateBody = z.object({ name: Name, content: BrandKitContent });
const IdParams = z.object({ id: z.string() });

export function registerBrandRoutes(
  app: FastifyInstance, db: Db, requireUser: (req: FastifyRequest) => Promise<SessionUser>,
) {
  app.get("/api/workspaces/:id/brand-kits", async (req) => {
    const user = await requireUser(req);
    return { kits: await svc.listKits(db, user.id, parse(IdParams, req.params).id) };
  });

  app.post("/api/workspaces/:id/brand-kits", async (req, reply) => {
    const user = await requireUser(req);
    const kit = await svc.createKit(db, user.id, parse(IdParams, req.params).id, parse(CreateBody, req.body));
    return reply.status(201).send({ kit });
  });

  app.get("/api/brand-kits/:id", async (req) => {
    const user = await requireUser(req);
    return { kit: await svc.getKit(db, user.id, parse(IdParams, req.params).id) };
  });

  app.put("/api/brand-kits/:id", async (req) => {
    const user = await requireUser(req);
    return { kit: await svc.updateKit(db, user.id, parse(IdParams, req.params).id, parse(UpdateBody, req.body)) };
  });

  app.delete("/api/brand-kits/:id", async (req, reply) => {
    const user = await requireUser(req);
    await svc.deleteKit(db, user.id, parse(IdParams, req.params).id);
    return reply.status(204).send();
  });
}
