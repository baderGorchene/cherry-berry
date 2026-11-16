import { expect, test } from "vitest";
import type { Design } from "../api";
import { edited, searchHome } from "./Home";

test("edited shows a relative time", () => {
  const now = Date.parse("2026-11-11T12:00:00Z");
  const ago = (s: number) => edited(new Date(now - s * 1000).toISOString(), now);
  expect(ago(5)).toBe("Edited just now");
  expect(ago(120)).toBe("Edited 2 minutes ago");
  expect(ago(3 * 3600)).toBe("Edited 3 hours ago");
  expect(ago(86400)).toBe("Edited yesterday");
  expect(ago(400 * 86400)).toBe("Edited last year");
});

const design = (id: string, title: string) => ({ id, title }) as Design;

test("searchHome matches designs and templates separately, ignoring case", () => {
  const designs = [design("1", "Summer Poster"), design("2", "Logo")];
  const templates = [{ id: "a", name: "Jazz POSTER night" }, { id: "b", name: "Market" }];
  const r = searchHome("poster", designs, templates);
  expect(r.designs.map((d) => d.id)).toEqual(["1"]);
  expect(r.templates.map((t) => t.id)).toEqual(["a"]);
  expect(searchHome("LOGO", designs, templates)).toEqual({ designs: [designs[1]], templates: [] });
});

test("searchHome finds nothing for an empty query", () => {
  expect(searchHome("  ", [design("1", "x")], [{ id: "a", name: "x" }])).toEqual({ designs: [], templates: [] });
});
