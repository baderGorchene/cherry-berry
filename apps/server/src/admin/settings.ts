import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";
import { instanceSettings, invitations } from "../db/schema";

export type InstanceSettings = {
  registration: "open" | "invited" | "domains"; allowedDomains: string[];
  workspaceCreation: "anyone" | "admins"; maxUploadMb: 20 | 50 | 100; storageQuotaGb: number | null;
};

const DEFAULTS: InstanceSettings = { registration: "open", allowedDomains: [], workspaceCreation: "anyone", maxUploadMb: 50, storageQuotaGb: null };

const Domain = z.string().transform((d) => d.trim().replace(/^@/, "").toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/));
export const SettingsBody = z.object({
  registration: z.enum(["open", "invited", "domains"]),
  allowedDomains: z.array(Domain).max(100).transform((d) => [...new Set(d)]),
  workspaceCreation: z.enum(["anyone", "admins"]),
  maxUploadMb: z.union([z.literal(20), z.literal(50), z.literal(100)]),
  storageQuotaGb: z.number().int().min(1).nullable(),
});

export async function getSettings(db: Db): Promise<InstanceSettings> {
  const [r] = await db.select().from(instanceSettings).where(eq(instanceSettings.id, 1));
  return r ? {
    registration: r.registration as InstanceSettings["registration"], allowedDomains: r.allowedDomains,
    workspaceCreation: r.workspaceCreation as InstanceSettings["workspaceCreation"],
    maxUploadMb: r.maxUploadMb as InstanceSettings["maxUploadMb"], storageQuotaGb: r.storageQuotaGb,
  } : { ...DEFAULTS };
}

export async function saveSettings(db: Db, s: InstanceSettings): Promise<InstanceSettings> {
  const v = SettingsBody.parse(s); // normalises allowedDomains
  await db.insert(instanceSettings).values({ id: 1, ...v })
    .onConflictDoUpdate({ target: instanceSettings.id, set: v });
  return getSettings(db);
}

export async function mayRegister(db: Db, email: string, s: InstanceSettings, adminEmails: string[]): Promise<boolean> {
  const e = email.trim().toLowerCase();
  if (s.registration === "open" || adminEmails.includes(e)) return true;
  if (s.registration === "domains") return s.allowedDomains.includes(e.slice(e.lastIndexOf("@") + 1));
  const [inv] = await db.select({ id: invitations.id }).from(invitations).where(and(
    sql`lower(${invitations.email}) = ${e}`, isNull(invitations.acceptedAt), gt(invitations.expiresAt, sql`now()`),
  )).limit(1);
  return !!inv;
}
