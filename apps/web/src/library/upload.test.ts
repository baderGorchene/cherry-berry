import { describe, expect, it } from "vitest";
import { precheck, sha256Hex, titleFromName, validate } from "./upload";

const MB = 1024 * 1024;
const f = (name: string, size = 1000) => ({ name, size, type: "" });

describe("precheck", () => {
  it("flags size and type", () => {
    expect(precheck(f("a.png", 51 * MB))).toBe("too_large");
    expect(precheck(f("a.svg", 3 * MB))).toBe("too_large");
    expect(precheck(f("notes.txt"))).toBe("unsupported_type");
    expect(precheck(f("a.JPG"))).toBe("ok");
    expect(precheck(f("a.svg", 1 * MB))).toBe("ok");
    expect(precheck(f("a.png", 60 * MB), 100)).toBe("ok");
    expect(precheck(f("a.png", 21 * MB), 20)).toBe("too_large");
  });
});

describe("titleFromName", () => {
  it("strips the extension and tidies", () => {
    expect(titleFromName("berry-moon.png")).toBe("Berry moon");
    expect(titleFromName("my_big-dot.final.SVG")).toBe("My big dot.final");
  });
});

describe("validate", () => {
  const ok = { license: "cc-by" as const, attribution: "Ann", visibility: "private" as const, confirmed: true };
  it("returns the first problem, in order", () => {
    expect(validate({ ...ok, license: "", confirmed: false })).toBe("Choose a license.");
    expect(validate({ ...ok, attribution: " ", confirmed: false })).toBe("CC-BY needs an attribution.");
    expect(validate({ ...ok, license: "workspace-only", confirmed: false })).toBe("Workspace-only visuals must be shared with this workspace.");
    expect(validate({ ...ok, confirmed: false })).toBe("Confirm you have the right to share this file.");
    expect(validate(ok)).toBeNull();
  });
});

describe("sha256Hex", () => {
  it("hashes abc", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc").buffer as ArrayBuffer))
      .toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
