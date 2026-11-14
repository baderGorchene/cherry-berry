import { describe, expect, it } from "vitest";
import type { CherryNode } from "@cherry/doc";
import type { Role } from "../api";
import { canDelete, canEditContent, canMove } from "./brandLock";

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
