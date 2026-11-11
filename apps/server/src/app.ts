import Fastify, { type FastifyInstance } from "fastify";
import type { Config } from "./config";
import type { Db } from "./db/client";

export async function buildApp(config: Config, deps: { db: Db }): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.get("/api/health", async () => ({ status: "ok" }));
  return app;
}
