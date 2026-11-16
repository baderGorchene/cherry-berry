import { describe, expect, it } from "vitest";
import type { CherryNode } from "@cherry/doc";
import type { Role } from "../api";
import { canDelete, canEditContent, canMove, groupBlock, hasBrandLock } from "./brandLock";

const node = (brandLock: "none" | "content" | "fixed") => ({ brandLock }) as CherryNode;
const ROLES: Role[] = ["owner", "admin", "editor", "viewer"];

describe("brand lock predicates", () => {
  for (const role of ROLES) {
    for (const lock of ["none", "content", "fixed"] as const) {
      const restricted = role === "editor";
      it(`${role} / ${lock}`, () => {
        expect(canMove(node(lock), role)).toBe(!restricted || lock === "none");
        expect(canDelete(node(lock), role)).toBe(!restricted || lock === "none");
        expect(canEditContent(node(lock), role)).toBe(!restricted || lock !== "fixed");
      });
    }
  }
});

describe("groups holding a locked layer", () => {
  const group = (...children: CherryNode[]) => ({ kind: "group", brandLock: "none", children }) as CherryNode;
  const locked = group(node("none"), group(node("content")));
  it("an editor can't move, ungroup or delete them; owners and admins can", () => {
    expect(canMove(locked, "editor")).toBe(false);
    expect(canDelete(locked, "editor")).toBe(false);
    expect(canMove(group(node("none")), "editor")).toBe(true);
    for (const role of ["owner", "admin"] as Role[]) expect([canMove(locked, role), canDelete(locked, role)]).toEqual([true, true]);
  });
  it("an editor can't group a selection holding a locked layer", () => {
    expect(groupBlock([node("none"), node("fixed")], "editor")).toBe("Brand-locked layers can't be grouped");
    expect(groupBlock([node("none"), locked], "editor")).not.toBe("");
    expect(groupBlock([node("none"), node("none")], "editor")).toBe("");
    expect(groupBlock([node("fixed"), node("content")], "owner")).toBe("");
    expect(groupBlock([node("fixed"), node("content")], "admin")).toBe("");
  });
});

describe("hasBrandLock", () => {
  const group = (...children: CherryNode[]) => ({ kind: "group", brandLock: "none", children }) as CherryNode;
  it("looks through groups", () => {
    expect(hasBrandLock([])).toBe(false);
    expect(hasBrandLock([node("none"), group(node("none"))])).toBe(false);
    expect(hasBrandLock([node("none"), group(group(node("content")))])).toBe(true);
    expect(hasBrandLock([node("fixed")])).toBe(true);
  });
});

describe("canDelete on groups", () => {
  const g = { kind: "group", brandLock: "none", children: [node("fixed")] } as CherryNode;
  it("blocks editors when a descendant is locked", () => {
    expect(canDelete(g, "editor")).toBe(false);
    expect(canDelete(g, "admin")).toBe(true);
  });
});
