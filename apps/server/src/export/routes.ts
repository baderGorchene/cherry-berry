import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { SessionUser } from "../auth";
import type { Collab } from "../collab/server";
import type { Db } from "../db/client";
import { parse } from "../http";
import type { Storage } from "../storage";
import * as svc from "./service";

const IdParams = z.object({ id: z.string() });
const Body = z.object({
  format: z.enum(["pdf-print", "pdf-x", "plates", "pdf", "png", "jpg", "svg", "gif", "pptx"]),
  pageIds: z.array(z.string().max(100)).min(1), // more than 100 pages is export_too_large (service)
  scale: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  transparent: z.boolean().optional(),
  cropMarks: z.boolean().optional(),
  secondsPerPage: z.number().int().min(1).max(10).optional(),
});

/** `attachment` with an ASCII fallback and the exact UTF-8 name (RFC 6266 / 5987). */
export const contentDisposition = (name: string) => {
  const ascii = name.replace(/[^\x20-\x7e]/gu, "_").replace(/["\\]/g, "_");
  const exact = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${exact}`;
};

export function registerExportRoutes(
  app: FastifyInstance, db: Db, storage: Storage, collab: Collab, printUrl: string | undefined, requireUser: (req: FastifyRequest) => Promise<SessionUser>,
) {
  // Keyed by the authenticated user id (IP only when there is no session).
  const limit = {
    max: 20, timeWindow: "1 minute",
    keyGenerator: async (req: FastifyRequest) => {
      try { return (await requireUser(req)).id; } catch { return req.ip; }
    },
  };

  app.get("/api/designs/:id/export/info", async (req) => {
    const user = await requireUser(req);
    return svc.exportInfo(db, storage, collab, user.id, parse(IdParams, req.params).id, !!printUrl);
  });

  app.post("/api/designs/:id/export", { config: { rateLimit: limit } }, async (req, reply) => {
    const user = await requireUser(req);
    const id = parse(IdParams, req.params).id;
    const ac = new AbortController();
    const onClose = () => { if (!req.raw.complete) ac.abort(); };
    req.raw.on("close", onClose);
    try {
      const out = await svc.exportDesign(db, storage, collab, user.id, id, parse(Body, req.body), printUrl, ac.signal);
      return reply.header("content-type", out.mime).header("content-disposition", contentDisposition(out.filename))
        .send(Buffer.from(out.bytes.buffer, out.bytes.byteOffset, out.bytes.byteLength));
    } finally {
      req.raw.off("close", onClose);
    }
  });
}
