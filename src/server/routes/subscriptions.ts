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
import { parseMikanBangumiIdFromRssUrl, resolveMikanBangumiIdentity } from "../../core/mikan/index.ts";

const logger = createLogger("api-subscriptions");

type SubscriptionBody = {
  bangumiSubjectId?: number | null;
  mikanBangumiId?: number | string | null;
  bangumiId?: number | null;
  mikanId?: number | string | null;
  subgroupName?: string;
  rssUrl: string;
  regexInclude?: string;
  regexExclude?: string;
  episodeOffset?: number;
  sourceId?: number;
};

type NormalizedSubscriptionBody = {
  bangumiSubjectId: number;
  mikanBangumiId: number | null;
  subgroupName?: string;
  rssUrl: string;
  regexInclude?: string;
  regexExclude?: string;
  episodeOffset?: number;
  sourceId?: number;
};

class SubscriptionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubscriptionValidationError";
  }
}

function parseOptionalNumber(value: unknown, fieldName: string): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsedValue = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new SubscriptionValidationError(`${fieldName} must be a positive integer`);
  }

  return parsedValue;
}

function buildSourceName(body: NormalizedSubscriptionBody): string {
  if (body.subgroupName && body.mikanBangumiId !== null) {
    return `${body.subgroupName} - ${body.mikanBangumiId}`;
  }

  return `Manual RSS - ${body.bangumiSubjectId}`;
}

function findExistingManualSource(bangumiSubjectId: number): RssSource | undefined {
  return getAllSources().find((source) => {
    return source.bangumiSubjectId === bangumiSubjectId && source.name.startsWith("Manual RSS -");
  });
}

function findExistingMikanSource(rssUrl: string): RssSource | undefined {
  return getAllSources().find((source) => source.url === rssUrl);
}

async function normalizeSubscriptionBody(body: SubscriptionBody): Promise<NormalizedSubscriptionBody> {
  const bangumiSubjectId = parseOptionalNumber(body.bangumiSubjectId ?? body.bangumiId, "bangumiSubjectId");
  const explicitMikanBangumiId = parseOptionalNumber(body.mikanBangumiId, "mikanBangumiId");
  const legacyMikanBangumiId = parseOptionalNumber(body.mikanId, "mikanId");
  const rssMikanBangumiId = parseMikanBangumiIdFromRssUrl(body.rssUrl);
  const requestedMikanBangumiId = explicitMikanBangumiId ?? legacyMikanBangumiId;
  const hasMikanIdentity = requestedMikanBangumiId !== null || rssMikanBangumiId !== null;

  if (body.bangumiId !== undefined) {
    logger.warn("Legacy subscription field used", { field: "bangumiId" });
  }

  if (body.mikanId !== undefined) {
    logger.warn("Legacy subscription field used", { field: "mikanId" });
  }

  if (hasMikanIdentity) {
    try {
      const resolvedIdentity = await resolveMikanBangumiIdentity({
        rssUrl: body.rssUrl,
        mikanBangumiId: requestedMikanBangumiId,
        bangumiSubjectId: bangumiSubjectId ?? undefined,
      });

      return {
        bangumiSubjectId: resolvedIdentity.bangumiSubjectId,
        mikanBangumiId: resolvedIdentity.mikanBangumiId,
        subgroupName: body.subgroupName,
        rssUrl: body.rssUrl,
        regexInclude: body.regexInclude,
        regexExclude: body.regexExclude,
        episodeOffset: body.episodeOffset,
        sourceId: body.sourceId,
      };
    } catch (error) {
      throw new SubscriptionValidationError(error instanceof Error ? error.message : "Failed to resolve Mikan identity");
    }
  }

  if (bangumiSubjectId === null) {
    throw new SubscriptionValidationError("bangumiSubjectId is required");
  }

  return {
    bangumiSubjectId,
    mikanBangumiId: null,
    subgroupName: body.subgroupName,
    rssUrl: body.rssUrl,
    regexInclude: body.regexInclude,
    regexExclude: body.regexExclude,
    episodeOffset: body.episodeOffset,
    sourceId: body.sourceId,
  };
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
    try {
      const normalizedBody = await normalizeSubscriptionBody(body);
      const sourceName = buildSourceName(normalizedBody);

      logger.info("Creating new subscription from frontend", {
        bangumiSubjectId: normalizedBody.bangumiSubjectId,
        mikanBangumiId: normalizedBody.mikanBangumiId,
        subgroupName: normalizedBody.subgroupName,
        sourceId: normalizedBody.sourceId,
        sourceName,
      });

      let source = normalizedBody.sourceId
        ? updateSource(normalizedBody.sourceId, {
            name: sourceName,
            url: normalizedBody.rssUrl,
            enabled: true,
            pollIntervalMs: 300000,
            bangumiSubjectId: normalizedBody.bangumiSubjectId,
            mikanBangumiId: normalizedBody.mikanBangumiId,
          })
        : undefined;

      let updated = Boolean(source);
      if (!source && normalizedBody.mikanBangumiId === null) {
        const existingManualSource = findExistingManualSource(normalizedBody.bangumiSubjectId);
        if (existingManualSource) {
          source = updateSource(existingManualSource.id, {
            name: sourceName,
            url: normalizedBody.rssUrl,
            enabled: true,
            pollIntervalMs: 300000,
            bangumiSubjectId: normalizedBody.bangumiSubjectId,
            mikanBangumiId: null,
          });
          updated = Boolean(source);
        }
      }

      if (!source && normalizedBody.mikanBangumiId !== null) {
        const existingMikanSource = findExistingMikanSource(normalizedBody.rssUrl);
        if (existingMikanSource) {
          source = updateSource(existingMikanSource.id, {
            name: sourceName,
            url: normalizedBody.rssUrl,
            enabled: true,
            pollIntervalMs: 300000,
            bangumiSubjectId: normalizedBody.bangumiSubjectId,
            mikanBangumiId: normalizedBody.mikanBangumiId,
          });
          updated = Boolean(source);
        }
      }

      if (!source) {
        source = createSource({
          name: sourceName,
          url: normalizedBody.rssUrl,
          enabled: true,
          pollIntervalMs: 300000,
          bangumiSubjectId: normalizedBody.bangumiSubjectId,
          mikanBangumiId: normalizedBody.mikanBangumiId,
        });
      }

      syncRule(source.id, "include", normalizedBody.regexInclude, sourceName);
      syncRule(source.id, "exclude", normalizedBody.regexExclude, sourceName);
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
      if (e instanceof SubscriptionValidationError) {
        logger.warn("Rejected invalid subscription payload", { error: e.message });
        return new Response(JSON.stringify({ error: e.message }), { status: 400 });
      }

      logger.error("Failed to create subscription", { error: String(e) });
      return new Response(JSON.stringify({ error: "Failed to create subscription" }), { status: 500 });
    }
  }, {
    body: t.Object({
      bangumiSubjectId: t.Optional(t.Union([t.Number(), t.Null()])),
      mikanBangumiId: t.Optional(t.Union([t.Number(), t.String(), t.Null()])),
      bangumiId: t.Optional(t.Union([t.Number(), t.Null()])),
      mikanId: t.Optional(t.Union([t.Number(), t.String(), t.Null()])),
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
