import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { SessionUser } from "../auth";
import type { Collab } from "../collab/server";
import type { Db } from "../db/client";
import { SECURITY_HEADERS } from "../assets/routes";
import { parse } from "../http";
import type { Storage } from "../storage";
import * as svc from "./service";

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const PublishBody = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.enum(["social", "print", "presentation", "cards", "other"]),
  visibility: z.enum(["workspace", "public"]),
  license: z.enum(["cc0", "cc-by", "workspace-only"]),
  attribution: z.string().trim().max(300),
  kitId: z.string().uuid().nullable().optional(),
  // A 2 MB image is about 2.8 MB of base64; the service checks the decoded size.
  thumb: z.string().max(3_000_000).refine((s) => s.length % 4 === 0 && BASE64.test(s)),
});
const ListQuery = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("workspace"), workspaceId: z.string() }),
  z.object({
    scope: z.literal("public"), q: z.string().max(100).optional(),
    category: z.enum(["social", "print", "presentation", "cards", "other"]).optional(),
  }),
]);
const UseBody = z.object({ workspaceId: z.string() });
const IdParams = z.object({ id: z.string() });

export function registerTemplateRoutes(
  app: FastifyInstance, db: Db, storage: Storage, collab: Collab, requireUser: (req: FastifyRequest) => Promise<SessionUser>,
) {
  app.post("/api/designs/:id/template", { bodyLimit: 4 * 1024 * 1024 }, async (req, reply) => {
    const user = await requireUser(req);
    const id = parse(IdParams, req.params).id;
    const { thumb, ...rest } = parse(PublishBody, req.body);
    const template = await svc.publishTemplate(db, storage, collab, user.id, id, { ...rest, thumb: Buffer.from(thumb, "base64") });
    return reply.status(201).send({ template });
  });

  app.get("/api/templates", async (req) => {
    const user = await requireUser(req);
    return { templates: await svc.listTemplates(db, user.id, parse(ListQuery, req.query)) };
  });

  app.get("/api/templates/:id/thumb", async (req, reply) => {
    const user = await requireUser(req);
    const bytes = await svc.getThumb(db, storage, user.id, parse(IdParams, req.params).id);
    return reply.headers({ ...SECURITY_HEADERS, "content-type": "image/webp" })
      .send(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  });

  app.get("/api/templates/:id/doc", async (req) => {
    const user = await requireUser(req);
    return { doc: await svc.templateDoc(db, user.id, parse(IdParams, req.params).id, parse(UseBody, req.query).workspaceId) };
  });

  app.post("/api/templates/:id/use", async (req, reply) => {
    const user = await requireUser(req);
    const design = await svc.useTemplate(db, user.id, parse(IdParams, req.params).id, parse(UseBody, req.body).workspaceId);
    return reply.status(201).send({ design });
  });

  app.post("/api/templates/:id/approve", async (req) => {
    const user = await requireUser(req);
    return { template: await svc.approveTemplate(db, user.id, parse(IdParams, req.params).id) };
  });

  app.delete("/api/templates/:id", async (req, reply) => {
    const user = await requireUser(req);
    await svc.deleteTemplate(db, storage, user.id, parse(IdParams, req.params).id);
    return reply.status(204).send();
  });
}
