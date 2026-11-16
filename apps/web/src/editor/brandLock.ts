import type { CherryNode } from "@cherry/doc";
import type { Role } from "../api";

// Only editors are held back by a brand lock; owners and admins set it, and viewers are read-only elsewhere.
// A group holding a locked layer at any depth counts as locked: moving, ungrouping or deleting it would move or drop that layer.
export const canMove = (n: CherryNode, role: Role) => role !== "editor" || !hasBrandLock([n]);
export const canEditContent = (n: CherryNode, role: Role) => role !== "editor" || n.brandLock !== "fixed";

type ImageNode = Extract<CherryNode, { kind: "image" }>;

/** The one selected image layer whose picture an editor may swap (content-locked), if that is the selection. */
export function imageSlot(nodes: CherryNode[], selected: string[], role: Role): ImageNode | undefined {
  const flat = (l: CherryNode[]): CherryNode[] => l.flatMap((n) => (n.kind === "group" ? [n, ...flat(n.children)] : [n]));
  const one = selected.length === 1 ? flat(nodes).find((n) => n.id === selected[0]) : undefined;
  return one?.kind === "image" && one.brandLock === "content" && role === "editor" ? one : undefined;
}

// Deleting a group removes its locked descendants too, which the server rejects for editors.
export const canDelete = (n: CherryNode, role: Role) => role !== "editor" || !hasBrandLock([n]);

/** Why `nodes` can't be grouped by `role`, or "" when they can: a group would hide its members' locks from the editor's checks. */
export const groupBlock = (nodes: CherryNode[], role: Role): string =>
  role === "editor" && hasBrandLock(nodes) ? "Brand-locked layers can't be grouped" : "";

/** True when any node, at any depth, carries a brand lock. */
export const hasBrandLock = (nodes: CherryNode[]): boolean =>
  nodes.some((n) => n.brandLock !== "none" || (n.kind === "group" && hasBrandLock(n.children)));
