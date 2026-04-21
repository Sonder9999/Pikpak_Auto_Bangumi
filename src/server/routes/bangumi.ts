import { Elysia, t } from "elysia";
import {
  BangumiRequestError,
  getCollections,
  getSubject,
  isBangumiConfigured,
} from "../../core/bangumi/index.ts";
import { createLogger } from "../../core/logger.ts";

const logger = createLogger("api-bangumi");

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const bangumiRoutes = new Elysia({ prefix: "/api/bangumi" })
  .get("/collections", async ({ query }) => {
    const type = Number(query.type ?? "3");
    if (!Number.isInteger(type) || type <= 0) {
      return jsonError(400, "Invalid collection type");
    }

    const offset = Number(query.offset ?? "0");
    const limit = Math.min(Number(query.limit ?? "30"), 100); // cap at 100
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit <= 0) {
      return jsonError(400, "Invalid pagination parameters");
    }

    if (!isBangumiConfigured()) {
      return jsonError(401, "Bangumi token not configured");
    }

    try {
      const result = await getCollections(type, offset, limit);
      return result ?? { data: [], total: 0, limit, offset };
    } catch (error) {
      if (error instanceof BangumiRequestError && [401, 403].includes(error.status)) {
        return jsonError(401, "Bangumi token invalid or expired");
      }

      logger.error("Failed to fetch Bangumi collections", { type, offset, limit, error: String(error) });
      return jsonError(502, "Failed to fetch Bangumi collections");
    }
  }, {
    query: t.Object({
      type: t.Optional(t.String()),
      offset: t.Optional(t.String()),
      limit: t.Optional(t.String()),
    }),
  })
  .get("/subjects/:id", async ({ params }) => {
    const subjectId = Number(params.id);
    if (!Number.isInteger(subjectId) || subjectId <= 0) {
      return jsonError(400, "Invalid subject id");
    }

    if (!isBangumiConfigured()) {
      return jsonError(401, "Bangumi token not configured");
    }

    try {
      const subject = await getSubject(subjectId);
      if (!subject) {
        return jsonError(404, "Bangumi subject not found");
      }

      return subject;
    } catch (error) {
      if (error instanceof BangumiRequestError && [401, 403].includes(error.status)) {
        return jsonError(401, "Bangumi token invalid or expired");
      }

      logger.error("Failed to fetch Bangumi subject", { subjectId, error: String(error) });
      return jsonError(502, "Failed to fetch Bangumi subject");
    }
  });