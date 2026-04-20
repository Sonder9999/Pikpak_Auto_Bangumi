import { and, eq, isNull, or } from "drizzle-orm";
import { getDb } from "../db/connection.ts";
import { filterRules } from "../db/schema.ts";
import { createLogger } from "../logger.ts";

const logger = createLogger("filter");

export interface FilterableItem {
  title: string;
  [key: string]: unknown;
}

/**
 * Get all applicable rules for a source: global rules + source-specific rules.
 * Only returns enabled rules.
 */
function getApplicableRules(sourceId: number) {
  const db = getDb();
  return db
    .select()
    .from(filterRules)
    .where(
      and(
        eq(filterRules.enabled, true),
        or(isNull(filterRules.sourceId), eq(filterRules.sourceId, sourceId))
      )
    )
    .all();
}

/**
 * Apply filter rules to a list of items.
 * 1. If any include rules exist, keep only items matching at least one include rule.
 * 2. Then remove items matching any exclude rule.
 */
export function applyFilters<T extends FilterableItem>(
  items: T[],
  sourceId: number
): T[] {
  const rules = getApplicableRules(sourceId);

  if (rules.length === 0) return items;

  const includeRules = rules.filter((r) => r.mode === "include");
  const excludeRules = rules.filter((r) => r.mode === "exclude");

  let result = items;

  // Step 1: Include filter (if any include rules exist)
  if (includeRules.length > 0) {
    const includePatterns = includeRules.map((r) => new RegExp(r.pattern, "i"));
    result = result.filter((item) =>
      includePatterns.some((re) => re.test(item.title))
    );
    logger.debug("Include filter applied", {
      before: items.length,
      after: result.length,
      rules: includeRules.length,
    });
  }

  // Step 2: Exclude filter
  if (excludeRules.length > 0) {
    const excludePatterns = excludeRules.map((r) => new RegExp(r.pattern, "i"));
    const beforeExclude = result.length;
    result = result.filter(
      (item) => !excludePatterns.some((re) => re.test(item.title))
    );
    logger.debug("Exclude filter applied", {
      before: beforeExclude,
      after: result.length,
      rules: excludeRules.length,
    });
  }

  return result;
}
