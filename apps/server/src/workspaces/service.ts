import { hash, verify } from "@node-rs/argon2";
import { and, asc, eq, ilike, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import type { Db } from "../db/client";
import { invitations, memberships, workspaces } from "../db/schema";
import { WorkspaceError } from "./errors";
import { makeWorkspacePublicId, normalizePublicId } from "./ids";

export type Role = "owner" | "admin" | "editor" | "viewer";
export type AccessMode = "invite" | "password" | "open";
export type WorkspaceSummary = { id: string; name: string; publicId: string; accessMode: AccessMode; role?: Role };

type WorkspaceRow = typeof workspaces.$inferSelect;
const summary = (w: WorkspaceRow, role?: string): WorkspaceSummary => ({
  id: w.id, name: w.name, publicId: w.publicId, accessMode: w.accessMode as AccessMode,
  ...(role ? { role: role as Role } : {}),
});
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const isUniqueViolation = (e: unknown): boolean => {
  const err = e as { code?: string; cause?: unknown };
  return err?.code === "23505" || (err?.cause !== undefined && isUniqueViolation(err.cause));
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findById(db: Db, id: string): Promise<WorkspaceRow> {
  if (!UUID.test(id)) throw new WorkspaceError("not_found");
  const [w] = await db.select().from(workspaces).where(eq(workspaces.id, id));
  if (!w) throw new WorkspaceError("not_found");
  return w;
}

async function roleOf(db: Db, workspaceId: string, userId: string): Promise<Role | undefined> {
  const [m] = await db.select({ role: memberships.role }).from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)));
  return m?.role as Role | undefined;
}

/** Adds the member unless already present; returns the workspace with the member's actual role. */
async function addMember(db: Db, w: WorkspaceRow, userId: string, role: Role, joinedVia: string) {
  await db.insert(memberships).values({ workspaceId: w.id, userId, role, joinedVia }).onConflictDoNothing();
  return summary(w, await roleOf(db, w.id, userId));
}

export async function createWorkspace(
  db: Db, userId: string, input: { name: string; accessMode: AccessMode; password?: string },
): Promise<WorkspaceSummary> {
  let passwordHash: string | null = null;
  if (input.accessMode === "password") {
    if (!input.password || input.password.length < 8) throw new WorkspaceError("password_required");
    passwordHash = await hash(input.password);
  }
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const [w] = await tx.insert(workspaces).values({
          name: input.name, publicId: makeWorkspacePublicId(input.name),
          accessMode: input.accessMode, passwordHash, createdBy: userId,
        }).returning();
        await tx.insert(memberships).values({ workspaceId: w!.id, userId, role: "owner", joinedVia: "created" });
        return summary(w!, "owner");
      });
    } catch (e) {
      if (attempt >= 5 || !isUniqueViolation(e)) throw e;
    }
  }
}

export async function joinWithPassword(db: Db, userId: string, publicIdInput: string, password: string): Promise<WorkspaceSummary> {
  const [w] = await db.select().from(workspaces).where(eq(workspaces.publicId, normalizePublicId(publicIdInput)));
  if (!w) throw new WorkspaceError("not_found");
  if (w.accessMode !== "password" || !w.passwordHash) throw new WorkspaceError("wrong_mode");
  if (!(await verify(w.passwordHash, password))) throw new WorkspaceError("wrong_password");
  return addMember(db, w, userId, "editor", "password");
}

export async function joinOpen(db: Db, userId: string, workspaceId: string): Promise<WorkspaceSummary> {
  const w = await findById(db, workspaceId);
  if (w.accessMode !== "open") throw new WorkspaceError("wrong_mode");
  return addMember(db, w, userId, "editor", "open");
}

export async function createInvitation(
  db: Db, inviterId: string, workspaceId: string, input: { email: string; role: "admin" | "editor" | "viewer" },
): Promise<{ token: string; expiresAt: Date }> {
  await findById(db, workspaceId);
  const role = await roleOf(db, workspaceId, inviterId);
  if (role !== "owner" && role !== "admin") throw new WorkspaceError("forbidden");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  await db.insert(invitations).values({
    workspaceId, email: input.email.trim().toLowerCase(), role: input.role,
    tokenHash: sha256(token), invitedBy: inviterId, expiresAt,
  });
  return { token, expiresAt };
}

export async function acceptInvitation(
  db: Db, userId: string, userEmail: string, token: string, now: Date = new Date(),
): Promise<WorkspaceSummary> {
  const [inv] = await db.select().from(invitations).where(eq(invitations.tokenHash, sha256(token)));
  if (!inv) throw new WorkspaceError("invitation_invalid");
  if (inv.acceptedAt) throw new WorkspaceError("invitation_used");
  if (inv.expiresAt <= now) throw new WorkspaceError("invitation_invalid");
  if (inv.email !== userEmail.trim().toLowerCase()) throw new WorkspaceError("invitation_wrong_email");
  const w = await findById(db, inv.workspaceId);
  return db.transaction(async (tx) => {
    const claimed = await tx.update(invitations).set({ acceptedAt: now })
      .where(and(eq(invitations.id, inv.id), isNull(invitations.acceptedAt)))
      .returning({ id: invitations.id });
    if (!claimed.length) throw new WorkspaceError("invitation_used");
    return addMember(tx as unknown as Db, w, userId, inv.role as Role, "invite");
  });
}

export async function listMyWorkspaces(db: Db, userId: string): Promise<WorkspaceSummary[]> {
  const rows = await db.select({ w: workspaces, role: memberships.role }).from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(eq(memberships.userId, userId)).orderBy(asc(workspaces.name));
  return rows.map((r) => summary(r.w, r.role));
}

export async function listOpenWorkspaces(db: Db, opts: { q?: string; limit?: number }): Promise<WorkspaceSummary[]> {
  const q = opts.q?.trim();
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const escaped = q?.replace(/[\\%_]/g, (c) => `\\${c}`);
  const rows = await db.select().from(workspaces)
    .where(and(eq(workspaces.accessMode, "open"), escaped ? ilike(workspaces.name, `%${escaped}%`) : undefined))
    .orderBy(asc(workspaces.name)).limit(limit);
  return rows.map((w) => summary(w));
}
