import { Elysia, t } from "elysia";
import { initBangumi } from "../../core/bangumi/index.ts";
import { getConfig, updateConfig } from "../../core/config/config.ts";
import { exportConfig, importConfig } from "../../core/config/export.ts";
import { createLogger } from "../../core/logger.ts";
import { initTmdb } from "../../core/tmdb/index.ts";

const logger = createLogger("api-config");

export const configRoutes = new Elysia({ prefix: "/api/config" })
  .get("/", () => {
    logger.debug("GET /api/config");
    return exportConfig();
  })
  .patch("/", ({ body }) => {
    logger.info("Updating config");
    const config = updateConfig(body as Record<string, unknown>);
    initTmdb(config.tmdb.apiKey, config.tmdb.language);
    initBangumi(config.bangumi.token);
    return exportConfig();
  }, {
    body: t.Record(t.String(), t.Unknown()),
  })
  .post("/export", () => {
    logger.info("Exporting config");
    return exportConfig();
  })
  .post("/import", ({ body }) => {
    logger.info("Importing config");
    const config = importConfig(body as Record<string, unknown>);
    initTmdb(config.tmdb.apiKey, config.tmdb.language);
    initBangumi(config.bangumi.token);
    return exportConfig();
  }, {
    body: t.Record(t.String(), t.Unknown()),
  });
