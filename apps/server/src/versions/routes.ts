import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { SessionUser } from "../auth";
import type { Collab } from "../collab/server";
import type { Db } from "../db/client";
import { parse } from "../http";
import * as svc from "./service";

const IdParams = z.object({ id: z.string() });
const NameBody = z.object({ name: z.string().trim().min(1).max(80) });
const PatchBody = z.object({ name: z.string().trim().min(1).max(80).nullable() });
const BranchBody = z.object({ name: z.string().trim().min(1).max(60) });

export function registerVersionRoutes(
  app: FastifyInstance, db: Db, collab: Collab, requireUser: (req: FastifyRequest) => Promise<SessionUser>,
) {
  app.get("/api/designs/:id/versions", async (req) => {
    const user = await requireUser(req);
    return { versions: await svc.listVersions(db, user.id, parse(IdParams, req.params).id) };
  });

  app.post("/api/designs/:id/versions", async (req, reply) => {
    const user = await requireUser(req);
    const version = await svc.nameCurrent(db, collab, user.id, parse(IdParams, req.params).id, parse(NameBody, req.body).name);
    return reply.status(201).send({ version });
  });

  app.patch("/api/versions/:id", async (req) => {
    const user = await requireUser(req);
    return { version: await svc.renameVersion(db, user.id, parse(IdParams, req.params).id, parse(PatchBody, req.body).name) };
  });

  app.get("/api/versions/:id/state", async (req) => {
    const user = await requireUser(req);
    return { state: Buffer.from(await svc.versionState(db, user.id, parse(IdParams, req.params).id)).toString("base64") };
  });

  app.post("/api/versions/:id/restore", async (req) => {
    const user = await requireUser(req);
    return { design: await svc.restoreVersion(db, collab, user.id, parse(IdParams, req.params).id) };
  });

  app.post("/api/versions/:id/branch", async (req, reply) => {
    const user = await requireUser(req);
    const design = await svc.branchVersion(db, user.id, parse(IdParams, req.params).id, parse(BranchBody, req.body).name);
    return reply.status(201).send({ design });
  });
}
