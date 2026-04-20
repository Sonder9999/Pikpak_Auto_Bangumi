import { Elysia, t } from "elysia";
import { createLogger } from "../../core/logger.ts";
import { getPikPakClient } from "../../core/pikpak/client.ts";
import { downloadDanmaku, getCachedDanmaku } from "../../core/danmaku/service.ts";

const logger = createLogger("api-danmaku");

export const danmakuRoutes = new Elysia({ prefix: "/api/danmaku" })
  .post("/trigger", async ({ body }) => {
    const { fileId } = body;
    logger.info("POST /api/danmaku/trigger", { fileId });

    const client = getPikPakClient();
    const file = await client.getFileDetails(fileId);
    if (!file) {
      logger.warn("File not found", { fileId });
      return { success: false, error: "File not found" };
    }

    const result = await downloadDanmaku(client, {
      animeTitle: file.name,
      episode: 0,
      parentFolderId: file.parent_id,
      videoFileName: file.name,
    });

    return result;
  }, {
    body: t.Object({
      fileId: t.String(),
    }),
  })
  .get("/status", () => {
    logger.debug("GET /api/danmaku/status");
    return getCachedDanmaku();
  });
