import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { createAuth, createRequireUser } from "./auth";
import type { Config } from "./config";
import type { Db } from "./db/client";
import { HttpError } from "./errors";
import { registerDesignRoutes } from "./designs/routes";
import { registerWorkspaceRoutes } from "./workspaces/routes";
import rateLimit from "@fastify/rate-limit";

export async function buildApp(config: Config, deps: { db: Db }): Promise<FastifyInstance> {
  const options: FastifyServerOptions = {
    logger: { level: config.logLevel },
    // Fastify accepts a hop count at runtime; its types omit number.
    trustProxy: config.trustProxy as boolean | string,
  };
  const app = Fastify(options);
  const auth = createAuth(config, deps.db);
  const requireUser = createRequireUser(auth);

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

  app.get("/api/health", async () => ({ status: "ok" }));

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
  registerWorkspaceRoutes(app, deps.db, requireUser);
  registerDesignRoutes(app, deps.db, requireUser);
  return app;
}
