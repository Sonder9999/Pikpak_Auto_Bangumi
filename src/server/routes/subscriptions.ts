import { Elysia, t } from "elysia";
import { createSource } from "../../core/rss/source-crud.ts";
import { createRule } from "../../core/filter/rule-crud.ts";
import { createLogger } from "../../core/logger.ts";

const logger = createLogger("api-subscriptions");

export const subscriptionsRoutes = new Elysia({ prefix: "/api/subscriptions" })
  .post("/", async ({ body }) => {
    logger.info("Creating new subscription from frontend", {
      bangumiId: body.bangumiId,
      mikanId: body.mikanId,
      subgroupName: body.subgroupName
    });

    try {
      // 1. Create the RSS Source
      const source = createSource({
        name: `${body.subgroupName} - ${body.mikanId}`,
        url: body.rssUrl,
        enabled: true,
        pollIntervalMs: 300000,
        bangumiSubjectId: body.bangumiId
      });

      // 2. Create the Rules if any are defined
      if (body.regexInclude) {
        createRule({
          name: `Include: ${body.subgroupName}`,
          pattern: body.regexInclude,
          mode: "include",
          sourceId: source.id,
          enabled: true
        });
      }

      if (body.regexExclude) {
        createRule({
          name: `Exclude: ${body.subgroupName}`,
          pattern: body.regexExclude,
          mode: "exclude",
          sourceId: source.id,
          enabled: true
        });
      }

      return { success: true, source };
    } catch (e) {
      logger.error("Failed to create subscription", { error: String(e) });
      return new Response(JSON.stringify({ error: "Failed to create subscription" }), { status: 500 });
    }
  }, {
    body: t.Object({
      bangumiId: t.Number(),
      mikanId: t.String(),
      subgroupName: t.String(),
      rssUrl: t.String(),
      regexInclude: t.Optional(t.String()),
      regexExclude: t.Optional(t.String()),
      episodeOffset: t.Optional(t.Number())
    })
  });