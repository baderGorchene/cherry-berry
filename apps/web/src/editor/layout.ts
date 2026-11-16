export type Box = { id: string; x: number; y: number; width: number; height: number };
export type AlignOp = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type Guides = { vertical?: number; horizontal?: number };

const snapAxis = (edges: number[], stops: number[], threshold: number): { delta: number; guide?: number } => {
  let best = threshold;
  let delta = 0;
  let guide: number | undefined;
  for (const e of edges) {
    for (const s of stops) {
      const d = s - e;
      if (Math.abs(d) < best) { best = Math.abs(d); delta = d; guide = s; }
    }
  }
  return { delta, guide };
};

/** Snaps a moving box's edges/center to page and sibling edges/centers within `threshold` page units. */
export function snapBox(
  moving: Pick<Box, "x" | "y" | "width" | "height">,
  targets: Pick<Box, "x" | "y" | "width" | "height">[],
  page: { width: number; height: number },
  threshold: number,
): { dx: number; dy: number; guides: Guides } {
  const vx = [0, page.width / 2, page.width];
  const hy = [0, page.height / 2, page.height];
  for (const t of targets) {
    vx.push(t.x, t.x + t.width / 2, t.x + t.width);
    hy.push(t.y, t.y + t.height / 2, t.y + t.height);
  }
  const sx = snapAxis([moving.x, moving.x + moving.width / 2, moving.x + moving.width], vx, threshold);
  const sy = snapAxis([moving.y, moving.y + moving.height / 2, moving.y + moving.height], hy, threshold);
  return {
    dx: sx.delta, dy: sy.delta,
    guides: {
      ...(sx.guide !== undefined ? { vertical: sx.guide } : {}),
      ...(sy.guide !== undefined ? { horizontal: sy.guide } : {}),
    },
  };
}

/** Aligns 1 box to the page, or 2+ boxes to their shared bounding box. Returns id -> { x } or { y } patches. */
export function alignBoxes(
  boxes: Box[], op: AlignOp, page: { width: number; height: number },
): { id: string; x?: number; y?: number }[] {
  if (!boxes.length) return [];
  const x0 = boxes.length === 1 ? 0 : Math.min(...boxes.map((b) => b.x));
  const y0 = boxes.length === 1 ? 0 : Math.min(...boxes.map((b) => b.y));
  const x1 = boxes.length === 1 ? page.width : Math.max(...boxes.map((b) => b.x + b.width));
  const y1 = boxes.length === 1 ? page.height : Math.max(...boxes.map((b) => b.y + b.height));
  return boxes.map((b) => {
    switch (op) {
      case "left": return { id: b.id, x: x0 };
      case "center": return { id: b.id, x: (x0 + x1) / 2 - b.width / 2 };
      case "right": return { id: b.id, x: x1 - b.width };
      case "top": return { id: b.id, y: y0 };
      case "middle": return { id: b.id, y: (y0 + y1) / 2 - b.height / 2 };
      case "bottom": return { id: b.id, y: y1 - b.height };
    }
  });
}

/** Distributes 3+ boxes with equal gaps along `axis`, keeping the outer two fixed. */
export function distributeBoxes(boxes: Box[], axis: "x" | "y"): { id: string; x?: number; y?: number }[] {
  if (boxes.length < 3) return [];
  const size = (b: Box) => (axis === "x" ? b.width : b.height);
  const sorted = [...boxes].sort((a, b) => a[axis] - b[axis]);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const total = sorted.reduce((s, b) => s + size(b), 0);
  const gap = (last[axis] + size(last) - first[axis] - total) / (sorted.length - 1);
  let cursor = first[axis] + size(first) + gap;
  const out: { id: string; x?: number; y?: number }[] = [];
  for (let i = 1; i < sorted.length - 1; i++) {
    const b = sorted[i]!;
    out.push({ id: b.id, [axis]: cursor });
    cursor += size(b) + gap;
  }
  return out;
}
