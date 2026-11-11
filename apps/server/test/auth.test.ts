import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupTestApp } from "./helpers";

let t: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => { t = await setupTestApp(); });
beforeEach(() => t.reset());
afterAll(() => t.close());

describe("auth", () => {
  it("signs up and reads session", async () => {
    const res = await t.app.inject({
      method: "POST", url: "/api/auth/sign-up/email",
      payload: { email: "ada@example.com", password: "berrypass1", name: "Ada" },
    });
    expect(res.statusCode).toBe(200);
    const cookie = [res.headers["set-cookie"]].flat().map((c) => String(c).split(";")[0]).join("; ");
    const s = await t.app.inject({ method: "GET", url: "/api/auth/get-session", headers: { cookie } });
    expect(s.json().user.email).toBe("ada@example.com");
  });
  it("rejects short password", async () => {
    const res = await t.app.inject({
      method: "POST", url: "/api/auth/sign-up/email",
      payload: { email: "bo@example.com", password: "short", name: "Bo" },
    });
    expect(res.statusCode).toBe(400);
  });
});
