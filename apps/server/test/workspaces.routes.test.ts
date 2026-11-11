import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupTestApp, signUp } from "./helpers";

let t: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => { t = await setupTestApp(); });
beforeEach(() => t.reset());
afterAll(() => t.close());

const call = (method: "GET" | "POST", url: string, cookie?: string, payload?: object) =>
  t.app.inject({ method, url, headers: cookie ? { cookie } : {}, ...(payload ? { payload } : {}) });

describe("workspace routes", () => {
  it("requires a session", async () => {
    const res = await call("GET", "/api/workspaces/mine");
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized" });
  });

  it("create then list mine", async () => {
    const { cookie } = await signUp(t.app, "ada@example.com");
    const c = await call("POST", "/api/workspaces", cookie, { name: "North Studio", accessMode: "invite" });
    expect(c.statusCode).toBe(201);
    const mine = await call("GET", "/api/workspaces/mine", cookie);
    expect(mine.json().workspaces).toEqual([expect.objectContaining({ name: "North Studio", role: "owner" })]);
  });

  it("invalid body", async () => {
    const { cookie } = await signUp(t.app, "ada@example.com");
    const res = await call("POST", "/api/workspaces", cookie, { name: "", accessMode: "secret" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_body" });
  });

  it("wrong password, then rate limits password guessing", async () => {
    const ada = await signUp(t.app, "ada@example.com");
    const bo = await signUp(t.app, "bo@example.com");
    const { workspace } = (await call("POST", "/api/workspaces", ada.cookie, {
      name: "North", accessMode: "password", password: "berrypass1",
    })).json();
    for (let i = 0; i < 10; i++) {
      const res = await call("POST", "/api/workspaces/join", bo.cookie, { publicId: workspace.publicId, password: "wrong-pass" });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: "wrong_password" });
    }
    const blocked = await call("POST", "/api/workspaces/join", bo.cookie, { publicId: workspace.publicId, password: "berrypass1" });
    expect(blocked.statusCode).toBe(429);
  });

  it("invite and accept flow", async () => {
    const ada = await signUp(t.app, "ada@example.com");
    const bo = await signUp(t.app, "bo@example.com");
    const { workspace } = (await call("POST", "/api/workspaces", ada.cookie, { name: "Private", accessMode: "invite" })).json();
    const inv = await call("POST", `/api/workspaces/${workspace.id}/invitations`, ada.cookie, { email: "bo@example.com", role: "viewer" });
    expect(inv.statusCode).toBe(201);
    const acc = await call("POST", `/api/invitations/${inv.json().token}/accept`, bo.cookie);
    expect(acc.statusCode).toBe(200);
    const mine = (await call("GET", "/api/workspaces/mine", bo.cookie)).json();
    expect(mine.workspaces).toEqual([expect.objectContaining({ id: workspace.id, role: "viewer" })]);
  });

  it("open workspaces are listed and joinable", async () => {
    const ada = await signUp(t.app, "ada@example.com");
    const bo = await signUp(t.app, "bo@example.com");
    const { workspace } = (await call("POST", "/api/workspaces", ada.cookie, { name: "Open Berry", accessMode: "open" })).json();
    const list = (await call("GET", "/api/workspaces/open?q=berry", bo.cookie)).json();
    expect(list.workspaces.map((w: { id: string }) => w.id)).toEqual([workspace.id]);
    const j = await call("POST", `/api/workspaces/${workspace.id}/join-open`, bo.cookie);
    expect(j.json().workspace.role).toBe("editor");
  });
});
