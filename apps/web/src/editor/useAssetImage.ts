import { useEffect, useState } from "react";
import { assetUrl } from "../api";

type State = { image: HTMLImageElement | null; status: "loading" | "ready" | "error" };
type Entry = { state: State; subs: Set<(s: State) => void> };
const cache = new Map<string, Entry>();

/** One shared Image per asset id; a failed one is dropped so the next mount tries again. */
function load(id: string): Entry {
  const hit = cache.get(id);
  if (hit && hit.state.status !== "error") return hit;
  const img = new Image();
  const e: Entry = { state: { image: null, status: "loading" }, subs: new Set() };
  const done = (state: State) => { e.state = state; e.subs.forEach((f) => f(state)); };
  img.onload = () => done({ image: img, status: "ready" });
  img.onerror = () => done({ image: null, status: "error" });
  img.src = assetUrl(id, "file");
  cache.set(id, e);
  return e;
}

export function useAssetImage(assetId: string): State {
  const [s, setS] = useState<{ id: string; state: State }>(() => ({ id: assetId, state: load(assetId).state }));
  useEffect(() => {
    const e = load(assetId);
    setS({ id: assetId, state: e.state });
    const f = (state: State) => setS({ id: assetId, state });
    e.subs.add(f);
    return () => { e.subs.delete(f); };
  }, [assetId]);
  return s.id === assetId ? s.state : { image: null, status: "loading" };
}
