import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupTestApp, signUp } from "./helpers";

let t: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => { t = await setupTestApp(); });
beforeEach(() => t.reset());
afterAll(() => t.close());

type Method = "GET" | "POST" | "DELETE";
const call = (method: Method, url: string, cookie?: string, payload?: object) =>
  t.app.inject({ method, url, headers: cookie ? { cookie } : {}, ...(payload !== undefined ? { payload } : {}) });
const SQUARE = "m10 10 h20 v20 h-20 z";
const body = (over: object = {}) => ({ name: "Box", visibility: "private", d: SQUARE, fillRule: "nonzero", ...over });

async function workspaceWith(role: "viewer" | "editor" | "admin") {
  const ada = await signUp(t.app, "ada@example.com");
  const bo = await signUp(t.app, "bo@example.com");
  const { workspace } = (await call("POST", "/api/workspaces", ada.cookie, { name: "North", accessMode: "invite" })).json();
  const inv = await call("POST", `/api/workspaces/${workspace.id}/invitations`, ada.cookie, { email: "bo@example.com", role });
  await call("POST", `/api/invitations/${inv.json().token}/accept`, bo.cookie);
  return { ada, bo, ws: workspace.id as string };
}

describe("shapes", () => {
  it("saves normalized path data", async () => {
    const ada = await signUp(t.app, "ada@example.com");
    const res = await call("POST", "/api/shapes", ada.cookie, body({ tags: [" Fruit ", "fruit"] }));
    expect(res.statusCode).toBe(201);
    expect(res.json().shape).toMatchObject({
      d: "M0 0 L20 0 L20 20 L0 20 L0 0 Z", width: 20, height: 20, tags: ["fruit"], mine: true, workspaceId: null,
    });
  });

  it("rejects forged path data", async () => {
    const ada = await signUp(t.app, "ada@example.com");
    for (const d of ["<script>", "", "M0 0"]) {
      const res = await call("POST", "/api/shapes", ada.cookie, body({ d }));
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("invalid_shape");
    }
  });

  it("private shapes stay private", async () => {
    const ada = await signUp(t.app, "ada@example.com");
    const bo = await signUp(t.app, "bo@example.com");
    const { shape } = (await call("POST", "/api/shapes", ada.cookie, body())).json();
    expect((await call("GET", "/api/shapes?scope=public", bo.cookie)).json().shapes).toEqual([]);
    expect((await call("GET", "/api/shapes?scope=mine", ada.cookie)).json().shapes).toHaveLength(1);
    expect((await call("DELETE", `/api/shapes/${shape.id}`, bo.cookie)).statusCode).toBe(404);
  });

  it("workspace shapes need membership", async () => {
    const { ada, bo, ws } = await workspaceWith("viewer");
    const cy = await signUp(t.app, "cy@example.com");
    expect((await call("GET", `/api/shapes?scope=workspace&workspaceId=${ws}`, cy.cookie)).statusCode).toBe(404);
    expect((await call("GET", `/api/shapes?scope=workspace&workspaceId=${ws}`, bo.cookie)).statusCode).toBe(200);
    const denied = await call("POST", "/api/shapes", bo.cookie, body({ visibility: "workspace", workspaceId: ws }));
    expect(denied.statusCode).toBe(403);
    expect((await call("POST", "/api/shapes", cy.cookie, body({ visibility: "workspace", workspaceId: ws }))).statusCode).toBe(404);
    const ok = await call("POST", "/api/shapes", ada.cookie, body({ visibility: "workspace", workspaceId: ws }));
    expect(ok.statusCode).toBe(201);
    expect((await call("GET", `/api/shapes?scope=workspace&workspaceId=${ws}`, bo.cookie)).json().shapes).toHaveLength(1);
  });

  it("an editor's workspace shape appears for a member", async () => {
    const { ada, bo, ws } = await workspaceWith("editor");
    expect((await call("POST", "/api/shapes", bo.cookie, body({ visibility: "workspace", workspaceId: ws }))).statusCode).toBe(201);
    const list = (await call("GET", `/api/shapes?scope=workspace&workspaceId=${ws}`, ada.cookie)).json();
    expect(list.shapes).toEqual([expect.objectContaining({ mine: false, workspaceId: ws })]);
  });

  it("public shapes are listed for everyone; only the creator deletes", async () => {
    const ada = await signUp(t.app, "ada@example.com");
    const bo = await signUp(t.app, "bo@example.com");
    const { shape } = (await call("POST", "/api/shapes", ada.cookie, body({ visibility: "public", workspaceId: "ignored" }))).json();
    expect(shape.workspaceId).toBeNull();
    expect((await call("GET", "/api/shapes?scope=public", bo.cookie)).json().shapes).toHaveLength(1);
    expect((await call("DELETE", `/api/shapes/${shape.id}`, bo.cookie)).statusCode).toBe(403);
    const del = await call("DELETE", `/api/shapes/${shape.id}`, ada.cookie);
    expect(del.statusCode).toBe(204);
    expect(del.body).toBe("");
  });

  it("workspace admin can delete a member's workspace shape", async () => {
    const { ada, bo, ws } = await workspaceWith("admin");
    const { shape } = (await call("POST", "/api/shapes", ada.cookie, body({ visibility: "workspace", workspaceId: ws }))).json();
    expect((await call("DELETE", `/api/shapes/${shape.id}`, bo.cookie)).statusCode).toBe(204);
  });

  it("an editor cannot delete another member's workspace shape", async () => {
    const { ada, bo, ws } = await workspaceWith("editor");
    const { shape } = (await call("POST", "/api/shapes", ada.cookie, body({ visibility: "workspace", workspaceId: ws }))).json();
    expect((await call("DELETE", `/api/shapes/${shape.id}`, bo.cookie)).statusCode).toBe(403);
  });

  it("workspace visibility without a workspaceId is invalid_body", async () => {
    const ada = await signUp(t.app, "ada@example.com");
    const res = await call("POST", "/api/shapes", ada.cookie, body({ visibility: "workspace" }));
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_body");
  });

  it("rejects paths whose normalized form exceeds the cap", async () => {
    const ada = await signUp(t.app, "ada@example.com");
    const d = "M0 0" + " h9".repeat(33000);
    expect(d.length).toBeLessThanOrEqual(100_000);
    const res = await call("POST", "/api/shapes", ada.cookie, body({ d }));
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_shape");
    const big = await call("POST", "/api/shapes", ada.cookie, body({ d: "M0 0" + " h9".repeat(40000) }));
    expect(big.json().error).toBe("invalid_body");
  });

  it("rate-limits per user, not per cookie header", async () => {
    const ada = await signUp(t.app, "ada@example.com");
    const bo = await signUp(t.app, "bo@example.com");
    const post = (cookie: string, i: number) => call("POST", "/api/shapes", `${cookie}; junk=${i}`, body());
    for (let i = 0; i < 30; i++) expect((await post(ada.cookie, i)).statusCode).toBe(201);
    const over = await post(ada.cookie, 99);
    expect(over.statusCode).toBe(429);
    expect(over.json().error).toBe("rate_limited");
    expect((await post(bo.cookie, 0)).statusCode).toBe(201);
  });

  it("search by name or tag", async () => {
    const ada = await signUp(t.app, "ada@example.com");
    await call("POST", "/api/shapes", ada.cookie, body({ name: "Berry", tags: ["fruit"] }));
    await call("POST", "/api/shapes", ada.cookie, body({ name: "Ticket" }));
    const names = async (q: string) =>
      (await call("GET", `/api/shapes?scope=mine&q=${encodeURIComponent(q)}`, ada.cookie)).json().shapes.map((s: { name: string }) => s.name);
    expect(await names("FRU")).toEqual(["Berry"]);
    expect(await names("tick")).toEqual(["Ticket"]);
    expect(await names("%")).toEqual([]);
  });

  it("validates the query", async () => {
    const ada = await signUp(t.app, "ada@example.com");
    expect((await call("GET", "/api/shapes?scope=nope", ada.cookie)).json().error).toBe("invalid_body");
    expect((await call("GET", "/api/shapes?scope=workspace", ada.cookie)).json().error).toBe("invalid_body");
    expect((await call("DELETE", "/api/shapes/not-a-uuid", ada.cookie)).statusCode).toBe(404);
  });

  it("rejects overflowing coordinates that produce Infinity bounds", async () => {
    const ada = await signUp(t.app, "ada@example.com");
    const res = await call("POST", "/api/shapes", ada.cookie, body({ d: "M 0 0 L 1e308 0 M 0 0 L -1e308 0" }));
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_shape");
  });

  it("requires a session", async () => {
    expect((await call("GET", "/api/shapes?scope=public")).statusCode).toBe(401);
    expect((await call("POST", "/api/shapes", undefined, body())).statusCode).toBe(401);
  });
});
