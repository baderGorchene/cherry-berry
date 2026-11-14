import { useEffect, useState } from "react";

export const PRESENCE_COLORS = ["#8E1EA2", "#1E7A46", "#B45309", "#1D4ED8", "#9D174D", "#22142A"] as const;

export function colorFor(userId: string): string {
  let h = 0;
  for (const c of userId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PRESENCE_COLORS[h % PRESENCE_COLORS.length]!;
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]!.toUpperCase()).join("");
}

export type PresenceUser = { id: string; name: string; color: string };
export type Peer = {
  clientId: number; user: PresenceUser; pageId: string | null; selection: string[]; cursor: { x: number; y: number } | null;
};

/** The slice of y-protocols' Awareness used here. */
export type AwarenessLike = {
  clientID: number;
  getStates(): Map<number, Record<string, unknown>>;
  setLocalStateField(field: string, value: unknown): void;
  on(event: "change", cb: () => void): void;
  off(event: "change", cb: () => void): void;
};

const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Awareness comes from other clients: peers with malformed state are skipped. */
export const read = (a: AwarenessLike): Peer[] =>
  [...a.getStates()]
    .flatMap(([clientId, s]): Peer[] => {
      const u = s.user as Record<string, unknown> | undefined, c = s.cursor as Record<string, unknown> | null | undefined;
      if (clientId === a.clientID || !u || !isStr(u.id) || !isStr(u.name) || !isStr(u.color)) return [];
      if (s.selection != null && !(Array.isArray(s.selection) && s.selection.every(isStr))) return [];
      if (s.pageId != null && !isStr(s.pageId)) return [];
      if (c != null && !(isNum(c.x) && isNum(c.y))) return [];
      return [{
        clientId, user: { id: u.id, name: u.name, color: u.color }, pageId: (s.pageId as string | null | undefined) ?? null,
        selection: (s.selection as string[] | undefined) ?? [], cursor: c ? { x: c.x as number, y: c.y as number } : null,
      }];
    })
    .sort((x, y) => x.user.name.localeCompare(y.user.name) || x.clientId - y.clientId);

/** Everyone connected except me, sorted by name. */
export function usePeers(awareness: AwarenessLike): Peer[] {
  const [peers, setPeers] = useState(() => read(awareness));
  useEffect(() => {
    const update = () => setPeers(read(awareness));
    update();
    awareness.on("change", update);
    return () => awareness.off("change", update);
  }, [awareness]);
  return peers;
}
