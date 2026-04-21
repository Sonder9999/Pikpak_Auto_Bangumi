import { Elysia, t } from "elysia";
import { getMikanBangumi, MikanRequestError, searchMikan } from "../../core/mikan/index.ts";
import { createLogger } from "../../core/logger.ts";

const logger = createLogger("api-mikan");

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const mikanRoutes = new Elysia({ prefix: "/api/mikan" })
  .get("/search", async ({ query }) => {
    const keyword = query.q.trim();
    if (!keyword) {
      return jsonError(400, "Query q is required");
    }

    try {
      return await searchMikan(keyword);
    } catch (error) {
      logger.error("Failed to search Mikan", { keyword, error: String(error) });
      return jsonError(502, "Failed to search Mikan");
    }
  }, {
    query: t.Object({
      q: t.String(),
    }),
  })
  .get("/bangumi/:id", async ({ params }) => {
    const mikanId = Number(params.id);
    if (!Number.isInteger(mikanId) || mikanId <= 0) {
      return jsonError(400, "Invalid Mikan bangumi id");
    }

    try {
      const detail = await getMikanBangumi(mikanId);
      if (!detail) {
        return jsonError(404, "Mikan bangumi not found");
      }

      return detail;
    } catch (error) {
      if (error instanceof MikanRequestError && error.status === 404) {
        return jsonError(404, "Mikan bangumi not found");
      }

      logger.error("Failed to fetch Mikan bangumi", { mikanId, error: String(error) });
      return jsonError(502, "Failed to fetch Mikan bangumi");
    }
  });