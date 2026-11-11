import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** `postgres://…` uses node-postgres; `pglite:memory` or `pglite:<dir>` uses embedded PGlite. */
export function createDb(url: string): { db: Db; close(): Promise<void> } {
  if (url.startsWith("pglite:")) {
    const target = url.slice("pglite:".length);
    const client = target === "memory" ? new PGlite() : new PGlite(target);
    return { db: drizzlePglite(client, { schema }) as unknown as Db, close: () => client.close() };
  }
  const pool = new pg.Pool({ connectionString: url });
  // Without a listener, an idle client dropped by a Postgres restart crashes the process.
  pool.on("error", (err) => console.error("postgres pool error", err));
  return { db: drizzlePg(pool, { schema }) as unknown as Db, close: () => pool.end() };
}
