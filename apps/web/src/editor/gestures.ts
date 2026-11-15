import { clampZoom } from "./geometry";

export type Pt = { x: number; y: number };

const mid = ([a, b]: [Pt, Pt]): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = ([a, b]: [Pt, Pt]) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Two-finger zoom and pan. Points are screen px relative to the canvas centre (where pan {0,0} centres the page).
 * Zoom scales by the finger distance ratio (clamped); what was under the start midpoint follows the current midpoint.
 */
export function pinch(start: [Pt, Pt], now: [Pt, Pt], zoom: number, pan: Pt): { zoom: number; pan: Pt } {
  const z = clampZoom((zoom * dist(now)) / (dist(start) || 1));
  const m0 = mid(start), m1 = mid(now), k = z / zoom;
  return { zoom: z, pan: { x: m1.x - (m0.x - pan.x) * k, y: m1.y - (m0.y - pan.y) * k } };
}
