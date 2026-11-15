import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { eq, sql, type SQL } from "drizzle-orm";
import type { Config } from "../config";
import type { Db } from "../db/client";
import { designs, session, user, workspaces } from "../db/schema";
import { HttpError } from "../errors";
import { isAdmin } from "../auth";
import { listQueue } from "./moderation";
import { getSettings } from "./settings";

const PAGE = 50;
const version = (JSON.parse(readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8")) as { version: string }).version;

type Rows<T> = { rows: T[] };
const rows = async <T>(db: Db, q: SQL) => ((await db.execute(q)) as unknown as Rows<T>).rows;
const num = (v: unknown) => Number(v ?? 0);

// Non-deleted asset bytes, and brand font bytes (Decision 5: fonts count towards usage but are never blocked).
const ASSET_BYTES = sql`coalesce((select sum(bytes) from assets where deleted_at is null), 0)`;
const FONT_BYTES = sql`coalesce((select sum(bytes) from brand_fonts), 0)`;

export async function storageUsed(db: Db): Promise<number> {
  const [r] = await rows<{ n: string }>(db, sql`select (${ASSET_BYTES} + ${FONT_BYTES})::text as n`);
  return num(r?.n);
}

export async function suspendUser(db: Db, config: Config, userId: string): Promise<void> {
  const [u] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId));
  if (!u) throw new HttpError(404, "not_found");
  if (isAdmin(config, u.email)) throw new HttpError(400, "invalid_body");
  await db.transaction(async (tx) => {
    await tx.update(user).set({ suspendedAt: new Date() }).where(eq(user.id, userId));
    await tx.delete(session).where(eq(session.userId, userId));
  });
}

export async function unsuspendUser(db: Db, userId: string): Promise<void> {
  const r = await db.update(user).set({ suspendedAt: null }).where(eq(user.id, userId)).returning({ id: user.id });
  if (!r.length) throw new HttpError(404, "not_found");
}

export async function overview(db: Db, config: Config) {
  const [c] = await rows<Record<string, string>>(db, sql`select
    (select count(*) from "user") as users, (select count(*) from ${workspaces}) as workspaces, (select count(*) from ${designs}) as designs`);
  const quotaGb = (await getSettings(db)).storageQuotaGb;
  return {
    version,
    database: config.databaseUrl.startsWith("pglite:") ? "PGlite" : "PostgreSQL",
    storage: config.s3.endpoint === "memory:" ? "In memory (testing)" : "S3-compatible bucket",
    usedBytes: await storageUsed(db),
    quotaBytes: quotaGb === null ? null : quotaGb * 1024 ** 3,
    users: num(c?.users), workspaces: num(c?.workspaces), designs: num(c?.designs),
    queue: (await listQueue(db)).length,
  };
}

// Keyset cursor over (created_at desc, id desc). created_at travels as Postgres text so microseconds survive.
const encode = (ck: string, id: string) => Buffer.from(JSON.stringify([ck, id])).toString("base64url");
function decode(cursor: string | undefined): [string, string] | null {
  if (!cursor) return null;
  try {
    const v = JSON.parse(Buffer.from(cursor, "base64url").toString());
    if (Array.isArray(v) && typeof v[0] === "string" && typeof v[1] === "string") return [v[0], v[1]];
  } catch { /* fall through */ }
  throw new HttpError(400, "invalid_body");
}

export async function listUsers(db: Db, config: Config, q: string | undefined, cursor: string | undefined) {
  const c = decode(cursor);
  const like = q ? `%${q.replace(/[\\%_]/g, "\\$&")}%` : null;
  const r = await rows<{ id: string; name: string; email: string; ck: string; created_at: string; suspended: boolean; workspaces: number; used: string }>(db, sql`
    select u.id, u.name, u.email, u.created_at::text as ck, u.created_at, u.suspended_at is not null as suspended,
      (select count(*)::int from memberships m where m.user_id = u.id) as workspaces,
      ((select coalesce(sum(bytes), 0) from assets a where a.created_by = u.id and a.deleted_at is null)
        + (select coalesce(sum(bytes), 0) from brand_fonts f where f.created_by = u.id))::text as used
    from "user" u
    where (${like}::text is null or u.name ilike ${like} or u.email ilike ${like})
      and (${c?.[0] ?? null}::text is null or (u.created_at, u.id) < (${c?.[0] ?? null}::timestamptz, ${c?.[1] ?? null}::text))
    order by u.created_at desc, u.id desc limit ${PAGE + 1}`);
  const page = r.slice(0, PAGE);
  const last = page.at(-1);
  return {
    users: page.map((u) => ({
      id: u.id, name: u.name, email: u.email, createdAt: new Date(u.created_at).toISOString(), suspended: u.suspended,
      admin: isAdmin(config, u.email), workspaces: u.workspaces, usedBytes: num(u.used),
    })),
    next: r.length > PAGE && last ? encode(last.ck, last.id) : null,
  };
}

// Bytes a workspace holds: its assets plus the fonts of its brand kits.
const WS_USED = sql`((select coalesce(sum(a.bytes), 0) from assets a where a.workspace_id = w.id and a.deleted_at is null)
  + (select coalesce(sum(f.bytes), 0) from brand_fonts f join brand_kits k on k.id = f.kit_id where k.workspace_id = w.id))::text`;

export async function listWorkspaces(db: Db, cursor: string | undefined) {
  const c = decode(cursor);
  const r = await rows<{ id: string; name: string; join_mode: string; ck: string; members: number; designs: number; used: string }>(db, sql`
    select w.id, w.name, w.access_mode as join_mode, w.created_at::text as ck,
      (select count(*)::int from memberships m where m.workspace_id = w.id) as members,
      (select count(*)::int from designs d where d.workspace_id = w.id) as designs, ${WS_USED} as used
    from workspaces w
    where (${c?.[0] ?? null}::text is null or (w.created_at, w.id) < (${c?.[0] ?? null}::timestamptz, ${c?.[1] ?? null}::uuid))
    order by w.created_at desc, w.id desc limit ${PAGE + 1}`);
  const page = r.slice(0, PAGE);
  const last = page.at(-1);
  return {
    workspaces: page.map((w) => ({ id: w.id, name: w.name, joinMode: w.join_mode, members: w.members, designs: w.designs, usedBytes: num(w.used) })),
    next: r.length > PAGE && last ? encode(last.ck, last.id) : null,
  };
}

export async function storageReport(db: Db) {
  const quotaGb = (await getSettings(db)).storageQuotaGb;
  const by = await rows<{ id: string; name: string; used: string }>(db, sql`
    select w.id, w.name, ${WS_USED} as used from workspaces w order by (${WS_USED})::bigint desc, w.id limit 20`);
  const [p] = await rows<{ n: string }>(db, sql`select coalesce(sum(bytes), 0)::text as n from assets where workspace_id is null and deleted_at is null`);
  return {
    usedBytes: await storageUsed(db),
    quotaBytes: quotaGb === null ? null : quotaGb * 1024 ** 3,
    byWorkspace: by.map((w) => ({ id: w.id, name: w.name, usedBytes: num(w.used) })),
    personalBytes: num(p?.n),
  };
}
