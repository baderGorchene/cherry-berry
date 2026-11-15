import { describe, expect, it } from "vitest";
import { MAX_ZOOM, MIN_ZOOM } from "./geometry";
import { pinch, type Pt } from "./gestures";

/** Screen point (relative to the canvas centre) of the content point `q` (content units at zoom 1). */
const screen = (q: Pt, zoom: number, pan: Pt) => ({ x: pan.x + q.x * zoom, y: pan.y + q.y * zoom });
const content = (s: Pt, zoom: number, pan: Pt) => ({ x: (s.x - pan.x) / zoom, y: (s.y - pan.y) / zoom });

describe("pinch", () => {
  it("pinch doubles zoom when fingers spread twice as far", () => {
    const r = pinch([{ x: -10, y: 0 }, { x: 10, y: 0 }], [{ x: -20, y: 0 }, { x: 20, y: 0 }], 0.5, { x: 0, y: 0 });
    expect(r.zoom).toBeCloseTo(1);
  });

  it("midpoint stays fixed", () => {
    const pan = { x: 30, y: -12 }, zoom = 0.8;
    const start: [Pt, Pt] = [{ x: 40, y: 50 }, { x: 120, y: 110 }];
    const now: [Pt, Pt] = [{ x: 0, y: 30 }, { x: 160, y: 130 }]; // same midpoint (80, 80), spread further
    const under = content({ x: 80, y: 80 }, zoom, pan);
    const r = pinch(start, now, zoom, pan);
    expect(r.zoom).toBeGreaterThan(zoom);
    const s = screen(under, r.zoom, r.pan);
    expect(s.x).toBeCloseTo(80);
    expect(s.y).toBeCloseTo(80);

    // a two-finger drag carries the start midpoint along with the fingers
    const moved = pinch(start, [{ x: 50, y: 60 }, { x: 130, y: 120 }], zoom, pan);
    expect(moved.zoom).toBeCloseTo(zoom);
    expect(screen(under, moved.zoom, moved.pan)).toEqual({ x: 90, y: 90 });
  });

  it("clamps zoom", () => {
    const close: [Pt, Pt] = [{ x: -1, y: 0 }, { x: 1, y: 0 }], far: [Pt, Pt] = [{ x: -500, y: 0 }, { x: 500, y: 0 }];
    expect(pinch(close, far, 1, { x: 0, y: 0 }).zoom).toBe(MAX_ZOOM);
    expect(pinch(far, close, 1, { x: 0, y: 0 }).zoom).toBe(MIN_ZOOM);
  });
});
