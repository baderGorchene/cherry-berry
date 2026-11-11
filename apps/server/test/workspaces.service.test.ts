import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { memberships } from "../src/db/schema";
import { WorkspaceError } from "../src/workspaces/errors";
import {
  acceptInvitation, createInvitation, createWorkspace, joinOpen, joinWithPassword,
  listMyWorkspaces, listOpenWorkspaces,
} from "../src/workspaces/service";
import { setupTestApp, signUp } from "./helpers";

let t: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => { t = await setupTestApp(); });
beforeEach(() => t.reset());
afterAll(() => t.close());

const code = (p: Promise<unknown>) =>
  p.then(() => "resolved", (e) => (e instanceof WorkspaceError ? e.code : `other: ${e}`));
const users = async () => ({
  ada: (await signUp(t.app, "ada@example.com")).userId,
  bo: (await signUp(t.app, "bo@example.com")).userId,
});

describe("workspace service", () => {
  it("creator becomes owner", async () => {
    const { ada } = await users();
    const w = await createWorkspace(t.db, ada, { name: "North Studio", accessMode: "invite" });
    expect(w.role).toBe("owner");
    expect(w.publicId).toMatch(/^north-studio-[A-Z0-9]{4}$/);
    expect(await listMyWorkspaces(t.db, ada)).toEqual([w]);
  });

  it("password mode requires an 8+ char password", async () => {
    const { ada } = await users();
    expect(await code(createWorkspace(t.db, ada, { name: "X", accessMode: "password", password: "short" }))).toBe("password_required");
    expect(await code(createWorkspace(t.db, ada, { name: "X", accessMode: "password" }))).toBe("password_required");
  });

  it("joins with correct password as editor", async () => {
    const { ada, bo } = await users();
    const w = await createWorkspace(t.db, ada, { name: "North", accessMode: "password", password: "berrypass1" });
    const j = await joinWithPassword(t.db, bo, ` ${w.publicId.toUpperCase()} `, "berrypass1");
    expect(j).toMatchObject({ id: w.id, role: "editor" });
  });

  it("wrong password, unknown id and wrong mode are rejected", async () => {
    const { ada, bo } = await users();
    const w = await createWorkspace(t.db, ada, { name: "North", accessMode: "password", password: "berrypass1" });
    const open = await createWorkspace(t.db, ada, { name: "Open", accessMode: "open" });
    expect(await code(joinWithPassword(t.db, bo, w.publicId, "nope-nope"))).toBe("wrong_password");
    expect(await code(joinWithPassword(t.db, bo, "missing-AAAA", "berrypass1"))).toBe("not_found");
    expect(await code(joinWithPassword(t.db, bo, open.publicId, "berrypass1"))).toBe("wrong_mode");
  });

  it("rejoining keeps role", async () => {
    const { ada } = await users();
    const w = await createWorkspace(t.db, ada, { name: "North", accessMode: "password", password: "berrypass1" });
    const j = await joinWithPassword(t.db, ada, w.publicId, "berrypass1");
    expect(j.role).toBe("owner");
    expect(await t.db.select().from(memberships).where(eq(memberships.workspaceId, w.id))).toHaveLength(1);
  });

  it("open join works and invite-only open join fails", async () => {
    const { ada, bo } = await users();
    const open = await createWorkspace(t.db, ada, { name: "Open", accessMode: "open" });
    const inv = await createWorkspace(t.db, ada, { name: "Private", accessMode: "invite" });
    expect((await joinOpen(t.db, bo, open.id)).role).toBe("editor");
    expect(await code(joinOpen(t.db, bo, inv.id))).toBe("wrong_mode");
  });

  it("editor cannot invite", async () => {
    const { ada, bo } = await users();
    const open = await createWorkspace(t.db, ada, { name: "Open", accessMode: "open" });
    await joinOpen(t.db, bo, open.id);
    expect(await code(createInvitation(t.db, bo, open.id, { email: "c@example.com", role: "viewer" }))).toBe("forbidden");
  });

  it("invitation accepted once", async () => {
    const { ada, bo } = await users();
    const w = await createWorkspace(t.db, ada, { name: "Private", accessMode: "invite" });
    const { token } = await createInvitation(t.db, ada, w.id, { email: "bo@example.com", role: "viewer" });
    expect((await acceptInvitation(t.db, bo, "bo@example.com", token)).role).toBe("viewer");
    expect(await code(acceptInvitation(t.db, bo, "bo@example.com", token))).toBe("invitation_used");
  });

  it("expired invitation", async () => {
    const { ada, bo } = await users();
    const w = await createWorkspace(t.db, ada, { name: "Private", accessMode: "invite" });
    const { token } = await createInvitation(t.db, ada, w.id, { email: "bo@example.com", role: "viewer" });
    expect(await code(acceptInvitation(t.db, bo, "bo@example.com", token, new Date(Date.now() + 8 * 86400000)))).toBe("invitation_invalid");
    expect(await code(acceptInvitation(t.db, bo, "bo@example.com", "not-a-token"))).toBe("invitation_invalid");
  });

  it("invitation for other email; email match is case-insensitive", async () => {
    const { ada, bo } = await users();
    const w = await createWorkspace(t.db, ada, { name: "Private", accessMode: "invite" });
    const other = await createInvitation(t.db, ada, w.id, { email: "zed@example.com", role: "editor" });
    expect(await code(acceptInvitation(t.db, bo, "bo@example.com", other.token))).toBe("invitation_wrong_email");
    const mine = await createInvitation(t.db, ada, w.id, { email: "BO@example.com", role: "admin" });
    expect((await acceptInvitation(t.db, bo, "bo@example.com", mine.token)).role).toBe("admin");
  });

  it("lists only open workspaces matching q", async () => {
    const { ada } = await users();
    await createWorkspace(t.db, ada, { name: "Open Berry", accessMode: "open" });
    await createWorkspace(t.db, ada, { name: "Open Cherry", accessMode: "open" });
    await createWorkspace(t.db, ada, { name: "Secret Berry", accessMode: "invite" });
    expect((await listOpenWorkspaces(t.db, { q: "berry" })).map((w) => w.name)).toEqual(["Open Berry"]);
    expect(await listOpenWorkspaces(t.db, {})).toHaveLength(2);
  });
});
