import type { z } from "zod";
import type { Unit } from "./schema";

type UnitName = z.infer<typeof Unit>;

export const UNIT_PX: Record<UnitName, number> = { px: 1, mm: 96 / 25.4, in: 96 };
export const PT_PX = 96 / 72;

export const toPx = (v: number, unit: UnitName): number => v * UNIT_PX[unit];
export const fromPx = (v: number, unit: UnitName): number => v / UNIT_PX[unit];
