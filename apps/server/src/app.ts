import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { createAuth, createRequireAdmin, createRequireUser, isAdmin } from "./auth";
import { registerAdminRoutes } from "./admin/routes";
import { getSettings } from "./admin/settings";
import type { Config } from "./config";
import type { Db } from "./db/client";
import type { Storage } from "./storage";
import { HttpError } from "./errors";
import { registerAssetRoutes } from "./assets/routes";
import { registerBrandRoutes } from "./brand/routes";
import { registerDesignRoutes } from "./designs/routes";
import { registerExportRoutes } from "./export/routes";
import { registerBuiltInFonts } from "./export/fonts";
import { registerReportRoutes } from "./reports/routes";
import { registerShapeRoutes } from "./shapes/routes";
import { registerTemplateRoutes } from "./templates/routes";
import { registerWorkspaceRoutes } from "./workspaces/routes";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import { relative, resolve } from "node:path";
import { createCollab, type Collab } from "./collab/server";
import { registerCollabRoutes } from "./collab/routes";
import { registerVersionRoutes } from "./versions/routes";
import { AUTO_VERSION_MS, registerAutoVersions } from "./versions/service";

declare module "fastify" {
  interface FastifyInstance {
    /** The live documents; other modules hook `collab.onStored` or read `collab.liveState`. */
    collab: Collab;
  }
}

export async function buildApp(config: Config, deps: { db: Db; storage: Storage; autoVersionMs?: number }): Promise<FastifyInstance> {
  const options: FastifyServerOptions = {
    logger: { level: config.logLevel },
    // Fastify accepts a hop count at runtime; its types omit number.
    trustProxy: config.trustProxy as boolean | string,
  };
  const app = Fastify(options);
  const auth = createAuth(config, deps.db);
  const requireUser = createRequireUser(auth);
  const requireAdmin = createRequireAdmin(auth, config);
  const collab = createCollab(deps.db, auth, config.publicUrl);
  app.decorate("collab", collab);
  registerAutoVersions(deps.db, collab, deps.autoVersionMs ?? AUTO_VERSION_MS);
  // Stores every live document before the database closes.
  app.addHook("onClose", () => collab.close());

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.statusCode).send({ error: err.code });
    const e = err as { statusCode?: number; validation?: unknown };
    if (e.statusCode === 429) return reply.status(429).send({ error: "rate_limited" });
    if (e.validation || e.statusCode === 400) return reply.status(400).send({ error: "invalid_body" });
    if (e.statusCode === 413) return reply.status(413).send({ error: "too_large" });
    if (e.statusCode === 415) return reply.status(415).send({ error: "unsupported_media_type" });
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) return reply.status(e.statusCode).send({ error: "bad_request" });
    app.log.error(err);
    return reply.status(500).send({ error: "internal" });
  });

  // Public: native launchers on another origin probe this to confirm a Cherry Berry server.
  app.get("/api/health", async (_req, reply) => {
    reply.header("access-control-allow-origin", "*");
    return { status: "ok", app: "cherry-berry" };
  });

  // Better Auth speaks Fetch Request/Response; bridge it onto Fastify.
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      const headers = new Headers();
      for (const [k, v] of Object.entries(request.headers)) if (v !== undefined) headers.set(k, String(v));
      // Better Auth rate-limits and records sessions by this header; never trust the client's copy.
      // request.ip already honours TRUST_PROXY.
      headers.set("x-forwarded-for", request.ip);
      const res = await auth.handler(new Request(new URL(request.url, config.publicUrl), {
        method: request.method,
        headers,
        body: request.method === "GET" || request.body === undefined ? undefined : JSON.stringify(request.body),
      }));
      reply.status(res.status);
      res.headers.forEach((v, k) => { if (k !== "set-cookie") reply.header(k, v); });
      const cookies = res.headers.getSetCookie();
      if (cookies.length) reply.header("set-cookie", cookies);
      return reply.send(res.body ? await res.text() : null);
    },
  });

  await app.register(rateLimit, { global: false });
  await app.register(websocket, { options: { maxPayload: 10 * 1024 * 1024 } });
  registerCollabRoutes(app, collab);
  registerAdminRoutes(app, deps.db, config, collab, requireAdmin);
  app.get("/api/instance", async (req) => {
    const user = await requireUser(req);
    const s = await getSettings(deps.db);
    const admin = isAdmin(config, user.email);
    return { admin, canCreateWorkspace: admin || s.workspaceCreation === "anyone", maxUploadMb: s.maxUploadMb };
  });
  registerWorkspaceRoutes(app, deps.db, requireUser, config);
  registerDesignRoutes(app, deps.db, collab, requireUser);
  registerVersionRoutes(app, deps.db, collab, requireUser);
  registerBrandRoutes(app, deps.db, deps.storage, requireUser);
  registerShapeRoutes(app, deps.db, requireUser);
  registerAssetRoutes(app, deps.db, deps.storage, requireUser);
  registerReportRoutes(app, deps.db, deps.storage, requireUser);
  registerTemplateRoutes(app, deps.db, deps.storage, collab, requireUser);
  registerBuiltInFonts();
  registerExportRoutes(app, deps.db, deps.storage, collab, requireUser);
  if (config.webDist) {
    const root = resolve(config.webDist);
    await app.register(fastifyStatic, {
      root,
      setHeaders: (res, path) => {
        const hashed = /^assets[\\/]/.test(relative(root, path));
        res.header("cache-control", hashed ? "public, max-age=31536000, immutable" : "no-cache");
      },
    });
    // SPA fallback; unknown /api paths keep Fastify's JSON 404.
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/api/")) return reply.sendFile("index.html");
      return reply.status(404).send({ message: `Route ${req.method}:${req.url} not found`, error: "Not Found", statusCode: 404 });
    });
  }
  return app;
}
