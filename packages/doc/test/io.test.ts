import { describe, expect, it } from "vitest";
import { createDocument, parseCherry, serializeCherry, type CherryDocument } from "../src/index";

const poster = () =>
  createDocument({ title: "Poster", width: 297, height: 420, unit: "mm", colorMode: "cmyk", bleed: 3 });

describe(".cherry io", () => {
  it("roundtrips a created document", () => {
    const r = parseCherry(serializeCherry(poster()));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.pages[0]!.width).toBe(297);
    expect(r.doc.pages[0]!.bleed).toBe(3);
    expect(r.doc.version).toBe(1);
    expect(r.doc.format).toBe("cherry");
  });

  it("new document has one empty page with white background", () => {
    const d = poster();
    expect(d.pages.length).toBe(1);
    expect(d.pages[0]!.nodes).toEqual([]);
    expect(d.pages[0]!.background.color).toBe("#FFFFFF");
  });

  it("rejects invalid json", () => {
    expect(parseCherry("{nope")).toEqual({ ok: false, error: "invalid_json" });
  });

  it("reports newer version without loading", () => {
    const d = { ...poster(), version: 2 };
    expect(parseCherry(JSON.stringify(d))).toEqual({ ok: false, error: "newer_version" });
  });

  it("rejects bad node", () => {
    const d = poster();
    (d.pages[0]!.nodes as unknown[]).push({ kind: "rect", id: "r", name: "R", x: 0, y: 0, width: -5, height: 10 });
    const r = parseCherry(JSON.stringify(d));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("invalid_document");
    expect(r.detail).toContain("width");
  });

  it("keeps nested groups", () => {
    const d: CherryDocument = poster();
    const base = { x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1, locked: false, hidden: false };
    d.pages[0]!.nodes.push({
      ...base, kind: "group", id: "g1", name: "Outer",
      children: [{
        ...base, kind: "group", id: "g2", name: "Inner",
        children: [{
          ...base, kind: "text", id: "t", name: "Hello", text: "Hello", fontFamily: "Inter", fontSize: 24,
          fontWeight: 400, lineHeight: 1.2, letterSpacing: 0, align: "left",
        }],
      }],
    });
    const r = parseCherry(serializeCherry(d));
    expect(r.ok && r.doc).toEqual(d);
  });
});
