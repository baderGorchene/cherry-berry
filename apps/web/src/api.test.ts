import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, errorMessage, exportFile, importDesign, saveFile } from "./api";

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

describe("errorMessage", () => {
  it("explains a full server", () => {
    expect(errorMessage(new ApiError(507, "storage_full"))).toBe("This server is out of storage. Ask an admin to free space or raise the quota.");
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

describe("saveFile", () => {
  it("save posts to cherryNative on android", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("window", { cherryNative: { postMessage } });
    await saveFile(new Blob(["hi"], { type: "image/png" }), "a.png");
    expect(JSON.parse(postMessage.mock.calls[0]![0])).toEqual({ type: "save", filename: "a.png", mime: "image/png", base64: btoa("hi") });
  });
  it("save posts to the cherryNative message handler on ios", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("window", { webkit: { messageHandlers: { cherryNative: { postMessage } } } });
    await saveFile(new Blob(["hi"], { type: "image/png" }), "a.png");
    expect(JSON.parse(postMessage.mock.calls[0]![0])).toEqual({ type: "save", filename: "a.png", mime: "image/png", base64: btoa("hi") });
  });
  it("ignores Capacitor plugins on the server's page", async () => {
    const a = { href: "", download: "", click: vi.fn() };
    const writeFile = vi.fn();
    vi.stubGlobal("window", { Capacitor: { isNativePlatform: () => true, Plugins: { Filesystem: { writeFile }, Share: { share: vi.fn() } } } });
    vi.stubGlobal("document", { createElement: () => a });
    await saveFile(new Blob(["hi"]), "a.png");
    expect(writeFile).not.toHaveBeenCalled();
    expect(a.click).toHaveBeenCalled();
  });
  it("falls back to an anchor download", async () => {
    const a = { href: "", download: "", click: vi.fn() };
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { createElement: () => a });
    await saveFile(new Blob(["hi"]), "a.png");
    expect(a.download).toBe("a.png");
    expect(a.href).toMatch(/^blob:/);
    expect(a.click).toHaveBeenCalled();
  });
});

describe("importDesign", () => {
  const fail = (status: number, error: string) =>
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error }), { status })));
  it("gives file-specific codes and copy", async () => {
    fail(413, "too_large");
    const big = await importDesign("w", "x").catch((e) => e);
    expect(big).toMatchObject({ status: 413, code: "cherry_file_too_large" });
    expect(errorMessage(big)).toBe("This file is too big to open (10 MB max).");
    fail(400, "invalid_document");
    const bad = await importDesign("w", "x").catch((e) => e);
    expect(bad).toMatchObject({ code: "invalid_cherry_file" });
    expect(errorMessage(bad)).toBe("This .cherry file is damaged and can't be opened.");
  });
});
