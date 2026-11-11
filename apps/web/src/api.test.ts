import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("maps error body to ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "wrong_password" }), { status: 401 })));
    const err = await api("/api/workspaces/join", { method: "POST", body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 401, code: "wrong_password" });
  });

  it("falls back to http code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>oops</html>", { status: 500 })));
    const err = await api("/api/health").catch((e) => e);
    expect(err).toMatchObject({ status: 500, code: "http_500" });
  });
});
