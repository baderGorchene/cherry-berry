import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, exportFile } from "./api";

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

describe("exportFile", () => {
  const body = { format: "png" as const, pageIds: ["p"] };
  it("prefers the UTF-8 filename", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", {
      headers: { "content-disposition": `attachment; filename="a-b _.png"; filename*=UTF-8''a-b%20%C3%BC.png` },
    })));
    const out = await exportFile("d", body);
    expect(out.filename).toBe("a-b ü.png");
    expect(await out.blob.text()).toBe("x");
  });
  it("falls back to the ascii filename", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { headers: { "content-disposition": `attachment; filename="plain.png"` } })));
    expect((await exportFile("d", body)).filename).toBe("plain.png");
  });
  it("maps errors to ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "export_too_large" }), { status: 400 })));
    expect(await exportFile("d", body).catch((e) => e)).toMatchObject({ status: 400, code: "export_too_large" });
  });
});
