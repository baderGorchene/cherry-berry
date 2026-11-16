import multipart from "@fastify/multipart";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { SessionUser } from "../auth";
import { storageUsed } from "../admin/service";
import { getSettings } from "../admin/settings";
import type { Db } from "../db/client";
import { HttpError } from "../errors";
import { parse } from "../http";
import type { Storage } from "../storage";
import { WorkspaceError } from "../workspaces/errors";
import { IngestError, ingest } from "./ingest";
import * as svc from "./service";

const MAX_FILE = 100 * 1024 * 1024; // the largest max_upload_mb; the instance setting is checked after reading
const CONTENT_TYPES: Record<string, string> = {
  png: "image/png", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml",
};

const Fields = z.object({
  title: z.string().trim().min(1).max(120),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(10)
    .transform((t) => [...new Set(t)]),
  license: z.enum(["cc0", "cc-by", "own", "workspace-only"]),
  attribution: z.string().trim().max(300),
  visibility: z.enum(["private", "workspace", "public"]),
  workspaceId: z.string().optional(),
});
const rules = (v: z.infer<typeof Fields>) =>
  (v.visibility !== "workspace" || !!v.workspaceId) &&
  (v.license !== "workspace-only" || v.visibility === "workspace") &&
  (v.license !== "cc-by" || v.attribution !== "");
const Meta = Fields.refine(rules);
const PatchBody = Fields.partial();
const ListQuery = z.object({
  scope: z.enum(["mine", "workspace", "public"]),
  workspaceId: z.string().optional(),
  kind: z.enum(["image", "gif", "svg"]).optional(),
  license: z.enum(["cc0", "cc-by", "own", "workspace-only"]).optional(),
  q: z.string().max(100).optional(),
}).refine((v) => v.scope !== "workspace" || v.workspaceId);
const UseBody = z.object({ assetId: z.string() });
const IdParams = z.object({ id: z.string() });
const HashParams = z.object({ sha256: z.string() });
const HashQuery = z.object({ workspaceId: z.string().uuid().optional() });

// Everything an uploaded file is served with; the bytes are never trusted to be inert.
export const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  "cache-control": "private, max-age=31536000, immutable",
};

export function registerAssetRoutes(
  app: FastifyInstance, db: Db, storage: Storage, requireUser: (req: FastifyRequest) => Promise<SessionUser>,
) {
  app.register(multipart, { limits: { files: 1, fileSize: MAX_FILE, fields: 10, fieldSize: 4096 } });

  // Keyed by the authenticated user id (IP only when there is no session), so extra cookies can't mint a new bucket.
  const limit = {
    max: 60, timeWindow: "1 minute",
    keyGenerator: async (req: FastifyRequest) => {
      try { return (await requireUser(req)).id; } catch { return req.ip; }
    },
  };

  app.post("/api/assets", { config: { rateLimit: limit } }, async (req, reply) => {
    const user = await requireUser(req);
    if (!req.isMultipart()) throw new HttpError(400, "invalid_body");
    // Read the settings first so the multipart limit is the admin's cap, not the 100 MB ceiling: nothing larger is buffered.
    const settings = await getSettings(db);
    const maxBytes = settings.maxUploadMb * 1024 * 1024;
    const fields: Record<string, string> = {};
    let file: Uint8Array | undefined;
    for await (const part of req.parts({ limits: { fileSize: maxBytes } })) {
      if (part.type === "file") {
        if (part.fieldname !== "file" || file) throw new HttpError(400, "invalid_body");
        file = await part.toBuffer(); // throws a 413 when over the limit
      } else if (typeof part.value === "string") fields[part.fieldname] = part.value;
    }
    if (fields.confirmed !== "true") throw new HttpError(400, "rights_not_confirmed");
    if (!file) throw new HttpError(400, "invalid_body");
    if (file.byteLength > maxBytes) throw new HttpError(413, "too_large");
    if (settings.storageQuotaGb !== null && (await storageUsed(db)) + file.byteLength > settings.storageQuotaGb * 1024 ** 3) {
      throw new HttpError(507, "storage_full");
    }
    const tags = fields.tags ? fields.tags.split(",") : [];
    const meta = parse(Meta, { ...fields, tags, attribution: fields.attribution ?? "", workspaceId: fields.workspaceId || undefined });
    await svc.placement(db, user.id, meta); // cheap permission check before the expensive ingest
    let img;
    try { img = await ingest(file); }
    catch (e) {
      if (e instanceof IngestError && e.code === "busy") return reply.status(503).header("retry-after", "5").send({ error: "busy" });
      throw e instanceof IngestError ? new HttpError(400, e.code) : e;
    }
    const { asset, duplicate } = await svc.createAsset(db, storage, user.id, img, meta);
    return reply.status(duplicate ? 200 : 201).send({ asset, duplicate });
  });

  app.get("/api/assets", async (req) => {
    const user = await requireUser(req);
    const q = parse(ListQuery, req.query);
    return { assets: await svc.listAssets(db, user.id, q.scope, q.workspaceId, q) };
  });

  // Registered before /:id so the static segment can never be read as an id.
  app.get("/api/assets/by-hash/:sha256", async (req) => {
    const user = await requireUser(req);
    const { workspaceId } = parse(HashQuery, req.query);
    const asset = await svc.findByHash(db, user.id, parse(HashParams, req.params).sha256.toLowerCase(), workspaceId ?? null);
    if (!asset) throw new WorkspaceError("not_found");
    return { asset };
  });

  app.get("/api/assets/:id", async (req) => {
    const user = await requireUser(req);
    const asset = await svc.getAsset(db, user.id, parse(IdParams, req.params).id);
    if (!asset) throw new WorkspaceError("not_found");
    return { asset };
  });

  app.patch("/api/assets/:id", async (req) => {
    const user = await requireUser(req);
    const id = parse(IdParams, req.params).id;
    const body = parse(PatchBody, req.body);
    const asset = await svc.updateAsset(db, user.id, id, (cur) => parse(Meta, { ...cur, ...body }));
    return { asset };
  });

  app.delete("/api/assets/:id", async (req, reply) => {
    const user = await requireUser(req);
    await svc.deleteAsset(db, storage, user.id, parse(IdParams, req.params).id);
    return reply.status(204).send();
  });

  app.post("/api/designs/:id/assets", async (req, reply) => {
    const user = await requireUser(req);
    await svc.recordUse(db, user.id, parse(IdParams, req.params).id, parse(UseBody, req.body).assetId);
    return reply.status(204).send();
  });

  const serve = (thumb: boolean) => async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await requireUser(req);
    const a = await svc.getAssetRow(db, user.id, parse(IdParams, req.params).id);
    const bytes = a && await storage.get(thumb ? `thumbs/${a.sha256}.webp` : `files/${a.sha256}`);
    if (!a || !bytes) throw new WorkspaceError("not_found");
    return reply.headers({ ...SECURITY_HEADERS, "content-type": thumb ? "image/webp" : CONTENT_TYPES[a.format] })
      .send(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  };
  app.get("/api/assets/:id/file", serve(false));
  app.get("/api/assets/:id/thumb", serve(true));
}
