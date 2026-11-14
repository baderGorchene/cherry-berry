import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { SessionUser } from "../auth";
import type { Collab } from "../collab/server";
import type { Db } from "../db/client";
import { parse } from "../http";
import * as svc from "./service";

const CreateBody = z.object({
  title: z.string().trim().min(1).max(120),
  width: z.number().positive(),
  height: z.number().positive(),
  unit: z.enum(["px", "mm", "in"]),
  colorMode: z.enum(["rgb", "cmyk"]),
  bleed: z.number().min(0).optional(),
});
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const StateBody = z.object({ state: z.string().refine((s) => s.length % 4 === 0 && BASE64.test(s)) });
const KitBody = z.object({ kitId: z.string().nullable() });
const IdParams = z.object({ id: z.string() });

export function registerDesignRoutes(
  app: FastifyInstance, db: Db, collab: Collab, requireUser: (req: FastifyRequest) => Promise<SessionUser>,
) {
  app.post("/api/workspaces/:id/designs", async (req, reply) => {
    const user = await requireUser(req);
    const design = await svc.createDesign(db, user.id, parse(IdParams, req.params).id, parse(CreateBody, req.body));
    return reply.status(201).send({ design });
  });

  app.get("/api/workspaces/:id/designs", async (req) => {
    const user = await requireUser(req);
    return { designs: await svc.listDesigns(db, user.id, parse(IdParams, req.params).id) };
  });

  app.get("/api/designs/:id", async (req) => {
    const user = await requireUser(req);
    return svc.openDesign(db, collab, user.id, parse(IdParams, req.params).id);
  });

  app.patch("/api/designs/:id", async (req) => {
    const user = await requireUser(req);
    const id = parse(IdParams, req.params).id;
    return { design: await svc.setDesignKit(db, user.id, id, parse(KitBody, req.body).kitId) };
  });

  app.put("/api/designs/:id/state", { bodyLimit: 10 * 1024 * 1024 }, async (req) => {
    const user = await requireUser(req);
    const id = parse(IdParams, req.params).id;
    const state = Buffer.from(parse(StateBody, req.body).state, "base64");
    return svc.saveDesignState(db, collab, user.id, id, state);
  });
}
