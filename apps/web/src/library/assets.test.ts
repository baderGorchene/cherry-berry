import { expect, test, vi } from "vitest";
import { formatBytes, KIND_BADGE, LICENSES } from "./assets";

test("formatBytes", () => {
  expect(formatBytes(900)).toBe("900 B");
  expect(formatBytes(1536)).toBe("1.5 KB");
  expect(formatBytes(5_242_880)).toBe("5 MB");
  expect(formatBytes(1.5 * 1024 ** 3)).toBe("1.5 GB");
});

test("every license has both labels, every kind a badge", () => {
  expect(LICENSES.map((l) => l.value)).toEqual(["cc0", "cc-by", "own", "workspace-only"]);
  for (const l of LICENSES) { expect(l.label).toBeTruthy(); expect(l.badge).toBeTruthy(); }
  expect(KIND_BADGE).toEqual({ image: "IMG", gif: "GIF", svg: "SVG" });
});

test("library calls get their own 403/404 copy; design saves keep theirs", async () => {
  const { errorMessage, getAsset, saveDesign } = await import("../api");
  const reply = (status: number, error: string) =>
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error }), { status })));
  reply(404, "not_found");
  expect(errorMessage(await getAsset("x").catch((e) => e))).toBe("This visual is no longer available.");
  reply(403, "forbidden");
  expect(errorMessage(await getAsset("x").catch((e) => e))).toBe("You don't have permission to change this visual.");
  expect(errorMessage(await saveDesign("d", "s").catch((e) => e))).toBe("You have view-only access to this design.");
  vi.unstubAllGlobals();
});
