import { PGlite } from "@electric-sql/pglite";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import type { Db } from "./client";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export async function runMigrations(db: Db): Promise<void> {
  if (!existsSync(`${migrationsFolder}/meta/_journal.json`)) return;
  const client = (db as unknown as { $client: unknown }).$client;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (client instanceof PGlite) await migratePglite(db as any, { migrationsFolder });
  else await migratePg(db as any, { migrationsFolder });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { config } = await import("dotenv");
  config({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)), quiet: true });
  const { createDb } = await import("./client");
  const { db, close } = createDb(process.env.DATABASE_URL!);
  await runMigrations(db);
  await close();
  console.log("migrations applied");
}
