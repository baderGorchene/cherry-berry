import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { buildApp } from "../src/app";
import { loadConfig, type Config } from "../src/config";
import { createDb, type Db } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";

export function testConfig(): Config {
  return loadConfig({
    DATABASE_URL: process.env.TEST_DATABASE_URL ?? "pglite:memory",
    AUTH_SECRET: "test-secret-test-secret-test-secret-123",
    PUBLIC_URL: "http://localhost:3000",
  });
}

export async function setupTestApp(): Promise<{
  app: FastifyInstance; db: Db; reset(): Promise<void>; close(): Promise<void>;
}> {
  const config = testConfig();
  const { db, close } = createDb(config.databaseUrl);
  await runMigrations(db);
  const app = await buildApp(config, { db });
  await app.ready();
  return {
    app, db,
    async reset() {
      type Row = { tablename: string };
      const res = (await db.execute(
        sql`select tablename from pg_tables where schemaname = 'public'`,
      )) as unknown as { rows: Row[] };
      const names = res.rows.map((r) => `"${r.tablename}"`);
      if (names.length) await db.execute(sql.raw(`truncate ${names.join(", ")} restart identity cascade`));
    },
    async close() { await app.close(); await close(); },
  };
}
