import { Elysia, t } from "elysia";
import { createSource, getAllSources, updateSource, type RssSource } from "../../core/rss/source-crud.ts";
import { refreshScheduler } from "../../core/rss/scheduler.ts";
import { createRule, deleteRule, getRulesBySourceId, updateRule } from "../../core/filter/rule-crud.ts";
import { compileTitleMatcher } from "../../core/filter/title-pattern.ts";
import { createLogger } from "../../core/logger.ts";
import { fetchRssFeed } from "../../core/rss/feed-parser.ts";
import { groupPreviewItems, type PreviewGroupItem } from "../../core/rss/preview-grouping.ts";
import { rawParser } from "../../core/parser/raw-parser.ts";
import { requeueSourceItemsForReplay } from "../../core/rss/item-store.ts";
import { replayStoredItems } from "../../core/pipeline.ts";
import { getPikPakClient } from "../../core/pikpak/client.ts";

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
      const requeued = requeueSourceItemsForReplay(source.id, { reason: "subscription-updated" });
      refreshScheduler();

      void replayStoredItems(getPikPakClient(), {
        sourceId: source.id,
        trigger: updated ? "subscription-updated" : "subscription-created",
      }).catch((error) => {
        logger.warn("Historical replay after subscription change failed", { sourceId: source.id, error: String(error) });
      });

      logger.info("Subscription replay scheduled", { sourceId: source.id, requeued });

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
  })
  .post("/preview-rss", async ({ body }) => {
    try {
      const targetUrl = body.url || body.rssUrl;
      if (!targetUrl) return new Response(JSON.stringify({ error: "URL is required" }), { status: 400 });

      logger.info("Preview RSS request received", {
        url: targetUrl,
        hasInclude: Boolean(body.regexInclude),
        hasExclude: Boolean(body.regexExclude),
      });

      const items = await fetchRssFeed(targetUrl);
      const matched: PreviewGroupItem[] = [];
      const excluded: PreviewGroupItem[] = [];

      let includeMatcher: ReturnType<typeof compileTitleMatcher> | null = null;
      let excludeMatcher: ReturnType<typeof compileTitleMatcher> | null = null;

      try {
        if (body.regexInclude) includeMatcher = compileTitleMatcher(body.regexInclude);
        if (body.regexExclude) excludeMatcher = compileTitleMatcher(body.regexExclude);
      } catch (err) {
        return new Response(JSON.stringify({ error: "筛选规则格式无效" }), { status: 400 });
      }

      for (const item of items) {
        const title = item.title;
        let isMatched = true;

        if (includeMatcher && !includeMatcher.test(title)) isMatched = false;
        if (isMatched && excludeMatcher && excludeMatcher.test(title)) isMatched = false;

        const parsed = rawParser(title);

        const previewItem: PreviewGroupItem = {
          title,
          link: item.link,
          homepage: item.homepage,
          magnetUrl: item.magnetUrl,
          torrentUrl: item.torrentUrl,
          sizeBytes: item.sizeBytes ?? null,
          publishedAt: item.publishedAt ?? null,
          parsed,
        };

        if (isMatched) {
          matched.push(previewItem);
        } else {
          excluded.push(previewItem);
        }
      }

      const matchedGroups = groupPreviewItems(matched);

      logger.info("Preview RSS request completed", {
        url: targetUrl,
        total: items.length,
        matched: matched.length,
        excluded: excluded.length,
        matchedGroups: matchedGroups.length,
      });

      return { matched, matchedGroups, excluded, error: null };
    } catch (e: any) {
      logger.error("Preview fetching failed", { error: e.message });
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
  }, {
    body: t.Object({
      url: t.Optional(t.String()),
      rssUrl: t.Optional(t.String()),
      regexInclude: t.Optional(t.String()),
      regexExclude: t.Optional(t.String()),
    })
  });
