import { Elysia, t } from "elysia";
import { createSource, getAllSources, updateSource, type RssSource } from "../../core/rss/source-crud.ts";
import { createRule, deleteRule, getRulesBySourceId, updateRule } from "../../core/filter/rule-crud.ts";
import { createLogger } from "../../core/logger.ts";

const logger = createLogger("api-subscriptions");

type SubscriptionBody = {
  bangumiId: number;
  mikanId?: string | null;
  subgroupName?: string;
  rssUrl: string;
  regexInclude?: string;
  regexExclude?: string;
  episodeOffset?: number;
  sourceId?: number;
};

function buildSourceName(body: SubscriptionBody): string {
  if (body.subgroupName && body.mikanId) {
    return `${body.subgroupName} - ${body.mikanId}`;
  }

  return `Manual RSS - ${body.bangumiId}`;
}

function findExistingManualSource(bangumiId: number): RssSource | undefined {
  return getAllSources().find((source) => {
    return source.bangumiSubjectId === bangumiId && source.name.startsWith("Manual RSS -");
  });
}

function syncRule(sourceId: number, mode: "include" | "exclude", pattern: string | undefined, sourceName: string): void {
  const existingRule = getRulesBySourceId(sourceId).find((rule) => rule.mode === mode);

  if (!pattern) {
    if (existingRule) {
      deleteRule(existingRule.id);
    }
    return;
  }

  const ruleName = `${mode === "include" ? "Include" : "Exclude"}: ${sourceName}`;
  if (existingRule) {
    updateRule(existingRule.id, { name: ruleName, pattern, enabled: true });
    return;
  }

  createRule({
    name: ruleName,
    pattern,
    mode,
    sourceId,
    enabled: true,
  });
}

export const subscriptionsRoutes = new Elysia({ prefix: "/api/subscriptions" })
  .post("/", async ({ body }) => {
    const sourceName = buildSourceName(body);
    logger.info("Creating new subscription from frontend", {
      bangumiId: body.bangumiId,
      mikanId: body.mikanId,
      subgroupName: body.subgroupName,
      sourceId: body.sourceId,
      sourceName,
    });

    try {
      let source = body.sourceId
        ? updateSource(body.sourceId, {
            name: sourceName,
            url: body.rssUrl,
            enabled: true,
            pollIntervalMs: 300000,
            bangumiSubjectId: body.bangumiId,
          })
        : undefined;

      let updated = Boolean(source);
      if (!source && !body.mikanId) {
        const existingManualSource = findExistingManualSource(body.bangumiId);
        if (existingManualSource) {
          source = updateSource(existingManualSource.id, {
            name: sourceName,
            url: body.rssUrl,
            enabled: true,
            pollIntervalMs: 300000,
            bangumiSubjectId: body.bangumiId,
          });
          updated = Boolean(source);
        }
      }

      if (!source) {
        source = createSource({
          name: sourceName,
          url: body.rssUrl,
          enabled: true,
          pollIntervalMs: 300000,
          bangumiSubjectId: body.bangumiId,
        });
      }

      syncRule(source.id, "include", body.regexInclude, sourceName);
      syncRule(source.id, "exclude", body.regexExclude, sourceName);

      return { success: true, updated, source };
    } catch (e) {
      logger.error("Failed to create subscription", { error: String(e) });
      return new Response(JSON.stringify({ error: "Failed to create subscription" }), { status: 500 });
    }
  }, {
    body: t.Object({
      bangumiId: t.Number(),
      mikanId: t.Optional(t.Union([t.String(), t.Null()])),
      subgroupName: t.Optional(t.String()),
      sourceId: t.Optional(t.Number()),
      rssUrl: t.String(),
      regexInclude: t.Optional(t.String()),
      regexExclude: t.Optional(t.String()),
      episodeOffset: t.Optional(t.Number())
    })
  });