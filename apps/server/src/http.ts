import type { z } from "zod";
import { HttpError } from "./errors";

export const parse = <T>(schema: z.ZodType<T>, data: unknown): T => {
  const r = schema.safeParse(data ?? {});
  if (!r.success) throw new HttpError(400, "invalid_body");
  return r.data;
};

/**
 * Escapes `!`, `%` and `_` so user text (backslash included) matches literally in `ILIKE ... ESCAPE '!'`.
 * One explicit escape character for every LIKE; `!` avoids string-literal backslash ambiguity.
 */
export const escapeLike = (q: string) => q.replace(/[!%_]/g, "!$&");
