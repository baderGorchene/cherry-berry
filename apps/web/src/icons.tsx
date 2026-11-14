import type { ReactNode } from "react";

const svg = (...d: ReactNode[]) => () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
const p = (d: string) => <path key={d} d={d} />;

export const IconHome = svg(p("M3 11l9-8 9 8"), p("M5 10v10h14V10"), p("M10 20v-6h4v6"));
export const IconImage = svg(<rect key="r" x="3" y="4" width="18" height="16" rx="2" />, <circle key="c" cx="9" cy="10" r="1.5" />, p("M21 16l-5-5-8 9"));
export const IconShapes = svg(<circle key="c" cx="7.5" cy="7.5" r="4" />, <rect key="r" x="13" y="13" width="8" height="8" rx="1" />, p("M7 21l-4-7h8z"));
export const IconTemplate = svg(<rect key="r" x="3" y="3" width="18" height="18" rx="2" />, p("M3 9h18M9 9v12"));
export const IconBrand = svg(<circle key="c" cx="12" cy="12" r="9" />, <circle key="a" cx="8.5" cy="10" r="1.2" />, <circle key="b" cx="12" cy="7.5" r="1.2" />, <circle key="d" cx="15.5" cy="10" r="1.2" />, p("M12 21c-1.5 0-2-1.2-1.4-2.2.6-1 .2-2.3-1.1-2.3H8"));
export const IconPlus = svg(p("M12 5v14M5 12h14"));
export const IconClose = svg(p("M6 6l12 12M18 6L6 18"));
export const IconSearch = svg(<circle key="c" cx="11" cy="11" r="7" />, p("M20 20l-4-4"));
export const IconChevron = svg(p("M6 9l6 6 6-6"));
export const IconBack = svg(p("M15 6l-6 6 6 6"));
export const IconUndo = svg(p("M9 14L4 9l5-5"), p("M4 9h10a6 6 0 010 12h-3"));
export const IconRedo = svg(p("M15 14l5-5-5-5"), p("M20 9H10a6 6 0 000 12h3"));
export const IconLayers = svg(p("M12 3l9 5-9 5-9-5z"), p("M3 13l9 5 9-5"));
export const IconEye = svg(p("M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"), <circle key="c" cx="12" cy="12" r="3" />);
export const IconEyeOff = svg(p("M3 3l18 18"), p("M10.6 6.1A9.7 9.7 0 0112 5c6 0 10 7 10 7a17 17 0 01-3.2 4M6.5 6.6A17 17 0 002 12s4 7 10 7c1.7 0 3.2-.4 4.5-1"), p("M9.9 9.9a3 3 0 004.2 4.2"));
export const IconLock = svg(<rect key="r" x="5" y="11" width="14" height="10" rx="2" />, p("M8 11V7a4 4 0 018 0v4"));
export const IconUnlock = svg(<rect key="r" x="5" y="11" width="14" height="10" rx="2" />, p("M8 11V7a4 4 0 017.5-2"));
export const IconUp = svg(p("M12 19V5M5 12l7-7 7 7"));
export const IconDown = svg(p("M12 5v14M5 12l7 7 7-7"));
export const IconCopy = svg(<rect key="r" x="9" y="9" width="11" height="11" rx="2" />, p("M5 15V5a2 2 0 012-2h8"));
export const IconTrash = svg(p("M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"));
export const IconUpload = svg(p("M12 16V4M7 9l5-5 5 5"), p("M4 16v4h16v-4"));
