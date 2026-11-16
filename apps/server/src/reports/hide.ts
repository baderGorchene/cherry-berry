import { sql, type AnyColumn, type SQL } from "drizzle-orm";

/**
 * SQL predicate: false for a public item that open reports from 3+ users have hidden, unless `userId` uploaded it.
 * ponytail: fixed threshold of 3; this rule stays as a safety net alongside the instance moderation queue.
 */
export const notHidden = (
  targetType: "asset" | "shape" | "template", id: AnyColumn, visibility: AnyColumn, createdBy: AnyColumn, userId: string,
): SQL => sql`not (${visibility} = 'public' and ${createdBy} <> ${userId} and (
  select count(*) from reports where reports.target_type = ${targetType} and reports.target_id = ${id}
    and reports.status = 'open') >= 3)`;
