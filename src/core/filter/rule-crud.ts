import { eq } from "drizzle-orm";
import { getDb } from "../db/connection.ts";
import { filterRules } from "../db/schema.ts";
import { createLogger } from "../logger.ts";

const logger = createLogger("filter");

export interface CreateRuleInput {
  name: string;
  pattern: string;
  mode: "include" | "exclude";
  sourceId?: number | null;
  enabled?: boolean;
}

export interface UpdateRuleInput {
  name?: string;
  pattern?: string;
  mode?: "include" | "exclude";
  sourceId?: number | null;
  enabled?: boolean;
}

export function createRule(input: CreateRuleInput) {
  const db = getDb();
  // Validate regex before saving
  try {
    new RegExp(input.pattern, "i");
  } catch {
    throw new Error(`Invalid regex pattern: ${input.pattern}`);
  }

  const result = db
    .insert(filterRules)
    .values({
      name: input.name,
      pattern: input.pattern,
      mode: input.mode,
      sourceId: input.sourceId ?? null,
      enabled: input.enabled ?? true,
    })
    .returning()
    .get();

  logger.info("Rule created", { id: result.id, name: result.name, mode: result.mode });
  return result;
}

export function getAllRules() {
  const db = getDb();
  return db.select().from(filterRules).all();
}

export function getRuleById(id: number) {
  const db = getDb();
  return db.select().from(filterRules).where(eq(filterRules.id, id)).get();
}

export function getRulesBySourceId(sourceId: number | null) {
  const db = getDb();
  if (sourceId === null) {
    // Global rules only (sourceId IS NULL)
    return db.select().from(filterRules).where(eq(filterRules.sourceId, sourceId)).all();
  }
  return db.select().from(filterRules).where(eq(filterRules.sourceId, sourceId)).all();
}

export function updateRule(id: number, input: UpdateRuleInput) {
  const db = getDb();

  if (input.pattern !== undefined) {
    try {
      new RegExp(input.pattern, "i");
    } catch {
      throw new Error(`Invalid regex pattern: ${input.pattern}`);
    }
  }

  const result = db
    .update(filterRules)
    .set(input)
    .where(eq(filterRules.id, id))
    .returning()
    .get();

  if (result) {
    logger.info("Rule updated", { id });
  }
  return result;
}

export function deleteRule(id: number): boolean {
  const db = getDb();
  const result = db
    .delete(filterRules)
    .where(eq(filterRules.id, id))
    .returning()
    .get();
  if (result) {
    logger.info("Rule deleted", { id });
    return true;
  }
  return false;
}
