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

const read = (a: AwarenessLike): Peer[] =>
  [...a.getStates()]
    .filter(([id, s]) => id !== a.clientID && s.user)
    .map(([clientId, s]) => ({
      clientId, user: s.user as PresenceUser, pageId: (s.pageId as string | null) ?? null,
      selection: (s.selection as string[] | undefined) ?? [], cursor: (s.cursor as Peer["cursor"]) ?? null,
    }))
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
