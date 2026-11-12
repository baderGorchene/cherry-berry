import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupTestApp, signUp } from "./helpers";

let t: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => { t = await setupTestApp(); });
beforeEach(async () => {
  await t.reset();
  for (const k of t.storage.keys()) await t.storage.delete(k);
});
afterAll(() => t.close());

const png = (color = "#8E1EA2") =>
  sharp({ create: { width: 64, height: 32, channels: 3, background: color } }).png().toBuffer();
const SVG_HOSTILE = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><script>alert(1)</script><rect width="40" height="20" fill="#8E1EA2"/></svg>`;

const FIELDS = { title: "Berry", tags: "fruit,red", license: "cc0", attribution: "", visibility: "private", confirmed: "true" };

/** Hand-built multipart body: text fields plus one `file` part. */
function form(file: Buffer | null, fields: Record<string, string | undefined> = {}) {
  const b = "----cherry" + Math.random().toString(16).slice(2);
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries({ ...FIELDS, ...fields })) {
    if (v !== undefined) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  if (file) {
    parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="x.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`), file, Buffer.from("\r\n"));
  }
  parts.push(Buffer.from(`--${b}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${b}` } };
}
const upload = (cookie: string, file: Buffer | null, fields?: Record<string, string | undefined>) => {
  const f = form(file, fields);
  return t.app.inject({ method: "POST", url: "/api/assets", payload: f.payload, headers: { ...f.headers, cookie } });
};
const call = (method: "GET" | "PATCH", url: string, cookie: string, payload?: object) =>
  t.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });

async function workspaceWith(role: "viewer" | "editor") {
  const ada = await signUp(t.app, "ada@example.com", "Ada");
  const bo = await signUp(t.app, "bo@example.com", "Bo");
  const { workspace } = (await t.app.inject({ method: "POST", url: "/api/workspaces", headers: { cookie: ada.cookie }, payload: { name: "North", accessMode: "invite" } })).json();
  const inv = await t.app.inject({ method: "POST", url: `/api/workspaces/${workspace.id}/invitations`, headers: { cookie: ada.cookie }, payload: { email: "bo@example.com", role } });
  await t.app.inject({ method: "POST", url: `/api/invitations/${inv.json().token}/accept`, headers: { cookie: bo.cookie } });
  return { ada, bo, ws: workspace.id as string };
}

describe("upload and serve", () => {
  it("stores a png, echoes fields and serves file and thumb", async () => {
    const ada = await signUp(t.app, "ada@example.com", "Ada");
    const bytes = await png();
    const res = await upload(ada.cookie, bytes);
    expect(res.statusCode).toBe(201);
    const { asset, duplicate } = res.json();
    expect(duplicate).toBe(false);
    expect(asset).toMatchObject({
      title: "Berry", tags: ["fruit", "red"], kind: "image", format: "png", width: 64, height: 32, license: "cc0",
      visibility: "private", workspaceId: null, workspaceName: null, uploaderName: "Ada", mine: true, bytes: bytes.length,
    });
    const file = await call("GET", `/api/assets/${asset.id}/file`, ada.cookie);
    expect(file.statusCode).toBe(200);
    expect(file.headers["content-type"]).toBe("image/png");
    expect(file.headers["x-content-type-options"]).toBe("nosniff");
    expect(file.headers["content-security-policy"]).toBe("default-src 'none'; style-src 'unsafe-inline'; sandbox");
    expect(file.headers["cache-control"]).toBe("private, max-age=31536000, immutable");
    expect(file.rawPayload.equals(bytes)).toBe(true);
    const thumb = await call("GET", `/api/assets/${asset.id}/thumb`, ada.cookie);
    expect(thumb.headers["content-type"]).toBe("image/webp");
    expect((await sharp(thumb.rawPayload).metadata()).format).toBe("webp");
  });

  it("serves a gif with the same security headers, even with html appended", async () => {
    const ada = await signUp(t.app, "ada@example.com");
    const g = Buffer.concat([await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } }).gif().toBuffer(), Buffer.from("<html><script>alert(1)</script></html>")]);
    const res = await upload(ada.cookie, g);
    expect(res.statusCode).toBe(201);
    const file = await call("GET", `/api/assets/${res.json().asset.id}/file`, ada.cookie);
    expect(file.headers["content-type"]).toBe("image/gif");
    expect(file.headers["x-content-type-options"]).toBe("nosniff");
    expect(file.headers["content-security-policy"]).toBe("default-src 'none'; style-src 'unsafe-inline'; sandbox");
  });

  it("serves svg sanitized", async () => {
    const ada = await signUp(t.app, "ada@example.com");
    const res = await upload(ada.cookie, Buffer.from(SVG_HOSTILE));
    expect(res.statusCode).toBe(201);
    const file = await call("GET", `/api/assets/${res.json().asset.id}/file`, ada.cookie);
    expect(file.headers["content-type"]).toBe("image/svg+xml");
    expect(file.body).not.toMatch(/script/i);
    expect(file.body).toContain("<rect");
  });

  it("requires a session", async () => {
    expect((await t.app.inject({ method: "GET", url: "/api/assets?scope=public" })).statusCode).toBe(401);
  });
});

describe("validation", () => {
  it.each([
    ["missing license", { license: undefined }],
    ["cc-by without attribution", { license: "cc-by" }],
    ["workspace-only when public", { license: "workspace-only", visibility: "public" }],
    ["missing title", { title: "" }],
    ["too many tags", { tags: "a,b,c,d,e,f,g,h,i,j,k" }],
    ["workspace without id", { visibility: "workspace" }],
  ])("%s is a 400", async (_n, fields) => {
    const ada = await signUp(t.app, "ada@example.com");
    const res = await upload(ada.cookie, await png(), fields);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_body");
    expect(t.storage.keys()).toEqual([]);
  });

  it("accepts cc-by with attribution", async () => {
    const ada = await signUp(t.app, "ada@example.com");
    const res = await upload(ada.cookie, await png(), { license: "cc-by", attribution: "Jo, 2024" });
    expect(res.json().asset).toMatchObject({ license: "cc-by", attribution: "Jo, 2024" });
  });

  it("needs rights confirmation", async () => {
    const ada = await signUp(t.app, "ada@example.com");
    for (const confirmed of [undefined, "false"]) {
      const res = await upload(ada.cookie, await png(), { confirmed });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("rights_not_confirmed");
    }
  });

  it("rejects html bytes and stores nothing", async () => {
    const ada = await signUp(t.app, "ada@example.com");
    const res = await upload(ada.cookie, Buffer.from("<html><script>alert(1)</script></html>"));
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("unsupported_type");
    expect(t.storage.keys()).toEqual([]);
    expect((await call("GET", "/api/assets?scope=mine", ada.cookie)).json().assets).toEqual([]);
  });

  it("rejects a request with no file", async () => {
    const ada = await signUp(t.app, "ada@example.com");
    expect((await upload(ada.cookie, null)).statusCode).toBe(400);
  });
});

describe("dedupe", () => {
  it("returns the first asset for the same bytes and finds it by hash", async () => {
    const ada = await signUp(t.app, "ada@example.com");
    const bytes = await png();
    const first = (await upload(ada.cookie, bytes)).json().asset;
    const again = await upload(ada.cookie, bytes, { title: "Other" });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ duplicate: true, asset: { id: first.id, title: "Berry" } });
    expect(t.storage.keys().sort()).toHaveLength(2);
    const sha = (await import("node:crypto")).createHash("sha256").update(bytes).digest("hex");
    const found = await call("GET", `/api/assets/by-hash/${sha}`, ada.cookie);
    expect(found.json().asset.id).toBe(first.id);
    expect((await call("GET", `/api/assets/by-hash/${"0".repeat(64)}`, ada.cookie)).statusCode).toBe(404);
  });
});

describe("privacy", () => {
  it("hides a private asset from everyone else", async () => {
    const ada = await signUp(t.app, "ada@example.com");
    const bo = await signUp(t.app, "bo@example.com");
    const bytes = await png();
    const mine = (await upload(ada.cookie, bytes)).json().asset;
    const sha = (await import("node:crypto")).createHash("sha256").update(bytes).digest("hex");
    for (const url of [`/api/assets/${mine.id}`, `/api/assets/${mine.id}/file`, `/api/assets/${mine.id}/thumb`, `/api/assets/by-hash/${sha}`]) {
      const res = await call("GET", url, bo.cookie);
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "not_found" });
    }
    expect((await call("PATCH", `/api/assets/${mine.id}`, bo.cookie, { title: "x" })).statusCode).toBe(404);
    expect((await call("GET", "/api/assets?scope=public", bo.cookie)).json().assets).toEqual([]);
    expect((await call("GET", "/api/assets?scope=mine", bo.cookie)).json().assets).toEqual([]);
    const theirs = await upload(bo.cookie, bytes);
    expect(theirs.statusCode).toBe(201);
    expect(theirs.json()).toMatchObject({ duplicate: false });
    expect(theirs.json().asset.id).not.toBe(mine.id);
    expect(t.storage.keys()).toHaveLength(2);
  });

  it("shares public assets", async () => {
    const ada = await signUp(t.app, "ada@example.com");
    const bo = await signUp(t.app, "bo@example.com");
    const a = (await upload(ada.cookie, await png(), { visibility: "public" })).json().asset;
    expect((await call("GET", "/api/assets?scope=public", bo.cookie)).json().assets.map((x: { id: string }) => x.id)).toEqual([a.id]);
    expect((await call("GET", `/api/assets/${a.id}/file`, bo.cookie)).statusCode).toBe(200);
  });

  it("workspace assets are for members only; viewers cannot upload", async () => {
    const { ada, bo, ws } = await workspaceWith("viewer");
    const cy = await signUp(t.app, "cy@example.com");
    const res = await upload(ada.cookie, await png(), { visibility: "workspace", workspaceId: ws });
    expect(res.statusCode).toBe(201);
    const a = res.json().asset;
    expect(a).toMatchObject({ workspaceId: ws, workspaceName: "North" });
    expect((await call("GET", `/api/assets?scope=workspace&workspaceId=${ws}`, bo.cookie)).json().assets).toHaveLength(1);
    expect((await call("GET", `/api/assets/${a.id}/file`, bo.cookie)).statusCode).toBe(200);
    expect((await call("GET", `/api/assets?scope=workspace&workspaceId=${ws}`, cy.cookie)).statusCode).toBe(404);
    expect((await call("GET", `/api/assets/${a.id}/file`, cy.cookie)).statusCode).toBe(404);
    const denied = await upload(bo.cookie, await png("#112233"), { visibility: "workspace", workspaceId: ws });
    expect(denied.statusCode).toBe(403);
    const outsider = await upload(cy.cookie, await png("#112233"), { visibility: "workspace", workspaceId: ws });
    expect(outsider.statusCode).toBe(404);
  });

  it("an editor can upload to the workspace", async () => {
    const { bo, ws } = await workspaceWith("editor");
    expect((await upload(bo.cookie, await png(), { visibility: "workspace", workspaceId: ws })).statusCode).toBe(201);
  });
});

describe("list", () => {
  it("filters by kind, license and q", async () => {
    const ada = await signUp(t.app, "ada@example.com", "Ada Lovelace");
    await upload(ada.cookie, await png("#111111"), { title: "Sale 100% off", tags: "promo" });
    await upload(ada.cookie, await png("#222222"), { title: "Sale 100 off", tags: "Sunset", license: "own" });
    await upload(ada.cookie, Buffer.from(SVG_HOSTILE), { title: "Logo", tags: "brand" });
    const titles = async (qs: string) => (await call("GET", `/api/assets?scope=mine&${qs}`, ada.cookie)).json().assets.map((a: { title: string }) => a.title).sort();
    expect(await titles("")).toHaveLength(3);
    expect(await titles("kind=svg")).toEqual(["Logo"]);
    expect(await titles("kind=image")).toEqual(["Sale 100 off", "Sale 100% off"]);
    expect(await titles("license=own")).toEqual(["Sale 100 off"]);
    expect(await titles("q=sunset")).toEqual(["Sale 100 off"]);
    expect(await titles("q=lovelace")).toHaveLength(3);
    expect(await titles("q=100%25")).toEqual(["Sale 100% off"]);
    expect(await titles("q=100_")).toEqual([]);
    expect(await titles("q=100%5C")).toEqual([]);
    expect((await call("GET", "/api/assets?scope=mine&kind=video", ada.cookie)).statusCode).toBe(400);
  });
});

describe("patch", () => {
  it("lets the uploader edit; other members get 403", async () => {
    const { ada, bo, ws } = await workspaceWith("editor");
    const a = (await upload(ada.cookie, await png(), { visibility: "workspace", workspaceId: ws })).json().asset;
    expect((await call("PATCH", `/api/assets/${a.id}`, bo.cookie, { title: "Mine now" })).statusCode).toBe(403);
    const res = await call("PATCH", `/api/assets/${a.id}`, ada.cookie, { title: "Renamed", visibility: "public" });
    expect(res.statusCode).toBe(200);
    expect(res.json().asset).toMatchObject({ title: "Renamed", visibility: "public", workspaceId: null, workspaceName: null });
    expect((await call("PATCH", `/api/assets/${a.id}`, ada.cookie, { license: "workspace-only" })).statusCode).toBe(400);
    expect((await call("PATCH", `/api/assets/${a.id}`, ada.cookie, { license: "cc-by" })).statusCode).toBe(400);
    expect((await call("PATCH", `/api/assets/${a.id}`, ada.cookie, { license: "cc-by", attribution: "Jo" })).json().asset.license).toBe("cc-by");
  });
});
