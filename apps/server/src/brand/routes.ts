import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { BrandKitContent } from "@cherry/doc";
import type { SessionUser } from "../auth";
import type { Db } from "../db/client";
import { SECURITY_HEADERS } from "../assets/routes";
import { HttpError } from "../errors";
import { parse } from "../http";
import type { Storage } from "../storage";
import { FONT_TYPES } from "./fonts";
import * as svc from "./service";

const Name = z.string().trim().min(1).max(60);
const CreateBody = z.object({ name: Name, content: BrandKitContent.optional() });
const UpdateBody = z.object({ name: Name, content: BrandKitContent });
const MAX_FONT = 5 * 1024 * 1024;
const FontMeta = z.object({
  family: z.string().trim().min(1).max(60),
  weight: z.coerce.number().int().min(100).max(900).refine((n) => n % 100 === 0),
  style: z.enum(["normal", "italic"]),
});
const IdParams = z.object({ id: z.string() });

export function registerBrandRoutes(
  app: FastifyInstance, db: Db, storage: Storage, requireUser: (req: FastifyRequest) => Promise<SessionUser>,
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

  // @fastify/multipart is registered by registerAssetRoutes with fastify-plugin semantics (root scope), so these routes
  // see it; only the size limit is overridden per request.
  app.post("/api/brand-kits/:id/fonts", async (req, reply) => {
    const user = await requireUser(req);
    const kitId = parse(IdParams, req.params).id;
    if (!req.isMultipart()) throw new HttpError(400, "invalid_body");
    const fields: Record<string, string> = {};
    let file: Uint8Array | undefined;
    for await (const part of req.parts({ limits: { fileSize: MAX_FONT } })) {
      if (part.type === "file") {
        if (part.fieldname !== "file" || file) throw new HttpError(400, "invalid_body");
        file = await part.toBuffer(); // throws a 413 when over the limit
      } else if (typeof part.value === "string") fields[part.fieldname] = part.value;
    }
    if (fields.confirmed !== "true") throw new HttpError(400, "rights_not_confirmed");
    if (!file) throw new HttpError(400, "invalid_body");
    const meta = parse(FontMeta, fields);
    return reply.status(201).send({ font: await svc.addFont(db, storage, user.id, kitId, file, meta) });
  });

  app.delete("/api/fonts/:id", async (req, reply) => {
    const user = await requireUser(req);
    await svc.deleteFont(db, storage, user.id, parse(IdParams, req.params).id);
    return reply.status(204).send();
  });

  app.get("/api/fonts/:id/file", async (req, reply) => {
    const user = await requireUser(req);
    const { format, bytes } = await svc.getFontFile(db, storage, user.id, parse(IdParams, req.params).id);
    return reply.headers({ ...SECURITY_HEADERS, "content-type": FONT_TYPES[format] }).send(Buffer.from(bytes));
  });
}
