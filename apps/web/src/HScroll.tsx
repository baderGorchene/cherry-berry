import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Wraps a horizontally scrollable list/strip with left/right arrow buttons when it overflows,
 * replacing visible scrollbars.
 */
export default function HScroll({
  as = "div", className = "", label, step = 280, compact = false, children,
}: {
  as?: "div" | "ul" | "nav"; className?: string; label?: string; step?: number; compact?: boolean; children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 2);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sync, children]);

  const scroll = (dir: -1 | 1) => ref.current?.scrollBy({ left: dir * step, behavior: "smooth" });
  const Tag = as;

  return (
    <div className={`hscroll${compact ? " hscroll-sm" : ""}`}>
      {canLeft && (
        <button type="button" className="hscroll-btn hscroll-l" aria-label="Scroll left" onClick={() => scroll(-1)}>‹</button>
      )}
      <Tag ref={ref as never} aria-label={label} className={className} onScroll={sync}>{children}</Tag>
      {canRight && (
        <button type="button" className="hscroll-btn hscroll-r" aria-label="Scroll right" onClick={() => scroll(1)}>›</button>
      )}
    </div>
  );
}
