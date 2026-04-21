import { Elysia, t } from "elysia";
import { getMikanBangumi, MikanRequestError, searchMikan, type MikanBangumiDetail, type MikanSubgroup } from "../../core/mikan/index.ts";
import { createLogger } from "../../core/logger.ts";

const logger = createLogger("api-mikan");

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type LegacyMikanSubgroup = MikanSubgroup & {
  latestEpisodeTitle?: string;
  latestUpdatedAt?: string;
};

function normalizeMikanDetail(detail: MikanBangumiDetail): MikanBangumiDetail {
  return {
    ...detail,
    subgroups: detail.subgroups.map((subgroup) => {
      const legacySubgroup = subgroup as LegacyMikanSubgroup;
      if (Array.isArray(legacySubgroup.episodes)) {
        return subgroup;
      }

      return {
        id: legacySubgroup.id,
        name: legacySubgroup.name,
        rssUrl: legacySubgroup.rssUrl,
        episodes: legacySubgroup.latestEpisodeTitle
          ? [{
              title: legacySubgroup.latestEpisodeTitle,
              size: "",
              updatedAt: legacySubgroup.latestUpdatedAt || "",
              magnet: "",
            }]
          : [],
      } satisfies MikanSubgroup;
    }),
  };
}

async function handleGetMikanBangumi(params: { id: string }): Promise<Response> {
  const mikanId = Number(params.id);
  if (!Number.isInteger(mikanId) || mikanId <= 0) {
    return jsonError(400, "Invalid Mikan bangumi id");
  }

  try {
    const detail = await getMikanBangumi(mikanId);
    if (!detail) {
      return jsonError(404, "Mikan bangumi not found");
    }

    const normalizedDetail = normalizeMikanDetail(detail);
    logger.info("Mikan bangumi fetched", {
      mikanId,
      subgroupCount: normalizedDetail.subgroups.length,
      episodeCounts: normalizedDetail.subgroups.map((subgroup) => ({
        name: subgroup.name,
        count: subgroup.episodes.length,
      })),
    });

    return new Response(JSON.stringify(normalizedDetail), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof MikanRequestError && error.status === 404) {
      return jsonError(404, "Mikan bangumi not found");
    }

    logger.error("Failed to fetch Mikan bangumi", { mikanId, error: String(error) });
    return jsonError(502, "Failed to fetch Mikan bangumi");
  }
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
  .get("/bangumi/:id", ({ params }) => handleGetMikanBangumi(params))
  .get("/bangumi-detail/:id", ({ params }) => handleGetMikanBangumi(params));