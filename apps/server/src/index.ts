import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createDb } from "./db/client";
import { runMigrations } from "./db/migrate";

loadEnv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });
const config = loadConfig(process.env);
const { db } = createDb(config.databaseUrl);
await runMigrations(db);
const app = await buildApp(config, { db });
await app.listen({ port: config.port, host: "0.0.0.0" });
console.log(`Cherry Berry server on :${config.port}`);
