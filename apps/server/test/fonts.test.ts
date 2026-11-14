import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sniffFont } from "../src/brand/fonts";
import { setupTestApp, signUp } from "./helpers";

let t: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => { t = await setupTestApp(); });
beforeEach(async () => {
  await t.reset();
  for (const k of t.storage.keys()) await t.storage.delete(k);
});
afterAll(() => t.close());

const FIELDS = { family: "Sora", weight: "400", style: "normal", confirmed: "true" };
const woff2 = (pad = 16, fill = 0) => Buffer.concat([Buffer.from("wOF2"), Buffer.alloc(pad, fill)]);
const fontKeys = () => t.storage.keys().filter((k) => k.startsWith("fonts/"));

function form(file: Buffer | null, fields: Record<string, string | undefined> = {}) {
  const b = "----cherry" + Math.random().toString(16).slice(2);
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries({ ...FIELDS, ...fields })) {
    if (v !== undefined) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  if (file) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="x.woff2"\r\nContent-Type: application/octet-stream\r\n\r\n`), file, Buffer.from("\r\n"));
  parts.push(Buffer.from(`--${b}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${b}` } };
}
const upload = (cookie: string, kit: string, file: Buffer | null, fields?: Record<string, string | undefined>) => {
  const f = form(file, fields);
  return t.app.inject({ method: "POST", url: `/api/brand-kits/${kit}/fonts`, payload: f.payload, headers: { ...f.headers, cookie } });
};
const call = (method: "GET" | "POST" | "DELETE", url: string, cookie: string, payload?: object) =>
  t.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });

async function setup(role: "viewer" | "editor" = "editor") {
  const ada = await signUp(t.app, "ada@example.com", "Ada");
  const bo = await signUp(t.app, "bo@example.com", "Bo");
  const eve = await signUp(t.app, "eve@example.com", "Eve");
  const { workspace } = (await call("POST", "/api/workspaces", ada.cookie, { name: "North", accessMode: "invite" })).json();
  const inv = await call("POST", `/api/workspaces/${workspace.id}/invitations`, ada.cookie, { email: "bo@example.com", role });
  await call("POST", `/api/invitations/${inv.json().token}/accept`, bo.cookie);
  const kit = (await call("POST", `/api/workspaces/${workspace.id}/brand-kits`, ada.cookie, { name: "Berry" })).json().kit.id as string;
  return { ada, bo, eve, ws: workspace.id as string, kit };
}

describe("brand fonts", () => {
  it("sniffs the four font signatures", () => {
    expect(sniffFont(Buffer.from("wOF2xxxx"))).toBe("woff2");
    expect(sniffFont(Buffer.from("wOFFxxxx"))).toBe("woff");
    expect(sniffFont(Buffer.from([0, 1, 0, 0, 9]))).toBe("ttf");
    expect(sniffFont(Buffer.from("truexxxx"))).toBe("ttf");
    expect(sniffFont(Buffer.from("OTTOxxxx"))).toBe("otf");
    expect(sniffFont(Buffer.from("\x89PNG"))).toBeNull();
    expect(sniffFont(new Uint8Array(2))).toBeNull();
  });

  it("uploads a woff2 and serves it to members only", async () => {
    const { ada, bo, eve, kit } = await setup();
    const res = await upload(ada.cookie, kit, woff2());
    expect(res.statusCode).toBe(201);
    const font = res.json().font;
    expect(font).toMatchObject({ kitId: kit, family: "Sora", weight: 400, style: "normal", format: "woff2", bytes: 20 });
    expect(fontKeys()).toHaveLength(1);
    const file = await call("GET", `/api/fonts/${font.id}/file`, bo.cookie);
    expect(file.statusCode).toBe(200);
    expect(file.headers["content-type"]).toBe("font/woff2");
    expect(file.headers["x-content-type-options"]).toBe("nosniff");
    expect(file.rawPayload.subarray(0, 4).toString()).toBe("wOF2");
    expect((await call("GET", `/api/fonts/${font.id}/file`, eve.cookie)).statusCode).toBe(404);
  });

  it("refuses non-font bytes and oversize files", async () => {
    const { ada, kit } = await setup();
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(32)]);
    const bad = await upload(ada.cookie, kit, png);
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBe("invalid_font");
    const big = await upload(ada.cookie, kit, woff2(6 * 1024 * 1024));
    expect(big.statusCode).toBe(413);
    expect(fontKeys()).toEqual([]);
  });

  it("validates fields and requires rights confirmation", async () => {
    const { ada, kit } = await setup();
    const res = await upload(ada.cookie, kit, woff2(), { confirmed: undefined });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("rights_not_confirmed");
    expect((await upload(ada.cookie, kit, woff2(), { weight: "450" })).statusCode).toBe(400);
    expect((await upload(ada.cookie, kit, woff2(), { style: "oblique" })).statusCode).toBe(400);
    expect((await upload(ada.cookie, kit, woff2(), { family: "" })).statusCode).toBe(400);
    expect(fontKeys()).toEqual([]);
  });

  it("editors can't upload or delete fonts", async () => {
    const { ada, bo, kit } = await setup("editor");
    expect((await upload(bo.cookie, kit, woff2())).statusCode).toBe(403);
    const font = (await upload(ada.cookie, kit, woff2())).json().font;
    expect((await call("DELETE", `/api/fonts/${font.id}`, bo.cookie)).statusCode).toBe(403);
    expect(fontKeys()).toHaveLength(1);
  });

  it("outsiders get 404 on upload", async () => {
    const { eve, kit } = await setup();
    expect((await upload(eve.cookie, kit, woff2())).statusCode).toBe(404);
  });

  it("kit GET lists its fonts", async () => {
    const { ada, bo, kit } = await setup();
    const font = (await upload(ada.cookie, kit, woff2())).json().font;
    const got = (await call("GET", `/api/brand-kits/${kit}`, bo.cookie)).json().kit;
    expect(got.fonts).toEqual([font]);
  });

  it("deleting the last font with those bytes removes the object; a second copy keeps it", async () => {
    const { ada, kit } = await setup();
    const a = (await upload(ada.cookie, kit, woff2())).json().font;
    const b = (await upload(ada.cookie, kit, woff2(), { weight: "700" })).json().font;
    expect(fontKeys()).toHaveLength(1);
    expect((await call("DELETE", `/api/fonts/${a.id}`, ada.cookie)).statusCode).toBe(204);
    expect(fontKeys()).toHaveLength(1);
    expect((await call("DELETE", `/api/fonts/${b.id}`, ada.cookie)).statusCode).toBe(204);
    expect(fontKeys()).toEqual([]);
    expect((await call("GET", `/api/fonts/${b.id}/file`, ada.cookie)).statusCode).toBe(404);
  });

  it("deleting a kit deletes its font rows and unshared objects", async () => {
    const { ada, ws, kit } = await setup();
    const kit2 = (await call("POST", `/api/workspaces/${ws}/brand-kits`, ada.cookie, { name: "Two" })).json().kit.id as string;
    const font = (await upload(ada.cookie, kit, woff2())).json().font;
    await upload(ada.cookie, kit, woff2(8, 1), { weight: "700" });
    await upload(ada.cookie, kit2, woff2()); // same bytes as the first font, other kit
    expect(fontKeys()).toHaveLength(2);
    expect((await call("DELETE", `/api/brand-kits/${kit}`, ada.cookie)).statusCode).toBe(204);
    expect((await call("GET", `/api/fonts/${font.id}/file`, ada.cookie)).statusCode).toBe(404);
    expect(fontKeys()).toHaveLength(1); // the shared object stays, the unshared one goes
    expect((await call("GET", `/api/brand-kits/${kit2}`, ada.cookie)).json().kit.fonts).toHaveLength(1);
    const f2 = (await call("GET", `/api/brand-kits/${kit2}`, ada.cookie)).json().kit.fonts[0];
    expect((await call("GET", `/api/fonts/${f2.id}/file`, ada.cookie)).statusCode).toBe(200);
  });
});
