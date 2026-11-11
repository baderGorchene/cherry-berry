import { randomInt } from "node:crypto";

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const randomSuffix = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

export function makeWorkspacePublicId(name: string, rand: () => string = randomSuffix): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 20).replace(/-+$/, "");
  return `${slug || "workspace"}-${rand()}`;
}

export function normalizePublicId(input: string): string {
  const s = input.trim();
  const i = s.lastIndexOf("-");
  return i < 0 ? s.toUpperCase() : `${s.slice(0, i).toLowerCase()}-${s.slice(i + 1).toUpperCase()}`;
}
