import { describe, expect, it } from "vitest";
import { FORMATS, formatsFor, downloadName, parsePageRange } from "./exportOptions";

describe("parsePageRange", () => {
  it("reads ranges and single pages, zero-based", () => {
    expect(parsePageRange("1-3, 5", 5)).toEqual([0, 1, 2, 4]);
    expect(parsePageRange(" 2 ", 5)).toEqual([1]);
  });
  it("collapses duplicates and sorts", () => {
    expect(parsePageRange("4, 1-2, 2, 1", 5)).toEqual([0, 1, 3]);
  });
  it("rejects reversed, zero, out of range, garbage and empty", () => {
    expect(parsePageRange("3-1", 5)).toBeNull();
    expect(parsePageRange("0", 5)).toBeNull();
    expect(parsePageRange("6", 5)).toBeNull();
    expect(parsePageRange("1-6", 5)).toBeNull();
    expect(parsePageRange("a", 5)).toBeNull();
    expect(parsePageRange("1,,2", 5)).toBeNull();
    expect(parsePageRange("1.5", 5)).toBeNull();
    expect(parsePageRange("", 5)).toBeNull();
    expect(parsePageRange("  ", 5)).toBeNull();
  });
});

describe("downloadName", () => {
  it("sanitises like the server", () => {
    expect(downloadName('  a/b "c" ü ', "cherry")).toBe("a-b -c- ü.cherry");
    expect(downloadName("x\\y:z*?<>|\u0007", "cherry")).toBe("x-y-z------.cherry");
    expect(downloadName("   ", "cherry")).toBe("design.cherry");
    expect(downloadName("a\uD800b", "cherry")).toBe("a-b.cherry");
  });
  it("cuts to 100 code points without splitting emoji", () => {
    expect(downloadName("🍒".repeat(150), "cherry")).toBe(`${"🍒".repeat(100)}.cherry`);
  });
});

it("print formats only when info.print", () => {
  const ids = (print: boolean) => formatsFor(print).map((f) => f.id);
  expect(ids(false)).toEqual(FORMATS.map((f) => f.id));
  expect(ids(true)).toEqual(["pdf-print", "pdf-x", "plates", "pdf", "png", "jpg", "svg", "gif", "pptx", "cherry"]);
  expect(formatsFor(true).filter((f) => f.id === "pdf-x" || f.id === "plates").map((f) => f.label))
    .toEqual(["PDF/X (CMYK, for print)", "Colour plates (PNG per ink)"]);
});

it("lists formats in mock order", () => {
  expect(FORMATS.map((f) => f.id)).toEqual(["pdf-print", "pdf", "png", "jpg", "svg", "gif", "pptx", "cherry"]);
  expect(FORMATS[0]).toEqual({ id: "pdf-print", label: "PDF · Print", hint: "Bleed, crop marks" });
});
