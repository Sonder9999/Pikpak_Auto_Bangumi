import { Elysia, t } from "elysia";
import {
  getAllSources, getSourceById, createSource, updateSource, deleteSource,
} from "../../core/rss/source-crud.ts";
import { createLogger } from "../../core/logger.ts";

const logger = createLogger("api-rss");

export const rssRoutes = new Elysia({ prefix: "/api/rss" })
  .get("/", () => {
    logger.debug("GET /api/rss");
    return getAllSources();
  })
  .get("/:id", ({ params }) => {
    const source = getSourceById(Number(params.id));
    if (!source) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    return source;
  })
  .post("/", ({ body }) => {
    logger.info("Creating RSS source", { name: body.name });
    const source = createSource(body);
    return source;
  }, {
    body: t.Object({
      name: t.String(),
      url: t.String(),
      enabled: t.Optional(t.Boolean()),
      pollIntervalMs: t.Optional(t.Number()),
      bangumiSubjectId: t.Optional(t.Union([t.Number(), t.Null()])),
    }),
  })
  .patch("/:id", ({ params, body }) => {
    logger.info("Updating RSS source", { id: params.id });
    const updated = updateSource(Number(params.id), body);
    if (!updated) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    return updated;
  }, {
    body: t.Object({
      name: t.Optional(t.String()),
      url: t.Optional(t.String()),
      enabled: t.Optional(t.Boolean()),
      pollIntervalMs: t.Optional(t.Number()),
      bangumiSubjectId: t.Optional(t.Union([t.Number(), t.Null()])),
    }),
  })
  .delete("/:id", ({ params }) => {
    logger.info("Deleting RSS source", { id: params.id });
    const deleted = deleteSource(Number(params.id));
    if (!deleted) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    return { ok: true };
  });
