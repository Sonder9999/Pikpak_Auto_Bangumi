import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { bangumiRoutes } from "../../src/server/routes/bangumi.ts";
import { initBangumi } from "../../src/core/bangumi/client.ts";

const originalFetch = globalThis.fetch;

describe("Bangumi routes", () => {
  beforeEach(() => {
    initBangumi("");
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("GET /api/bangumi/collections returns 401 when token is missing", async () => {
    const app = new Elysia().use(bangumiRoutes);
    const response = await app.handle(new Request("http://localhost/api/bangumi/collections?type=3"));

    expect(response.status).toBe(401);
  });

  test("GET /api/bangumi/collections returns mapped data when configured", async () => {
    initBangumi("route-token");

    const collectionItem = {
      type: 3,
      subject: {
        id: 576351,
        name: "Kuroneko to Majo no Kyoushitsu",
        name_cn: "黑猫与魔女的教室",
        date: "2026-04-12",
        images: { large: "https://lain.bgm.tv/pic/cover/l/example.jpg" },
        rating: { score: 7.4, total: 1499 },
        tags: [],
        url: "https://bgm.tv/subject/576351",
      },
    };

    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url.endsWith("/me")) {
        return new Response(JSON.stringify({ username: "testroute" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ data: [collectionItem], total: 1, limit: 30, offset: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const app = new Elysia().use(bangumiRoutes);
    const response = await app.handle(new Request("http://localhost/api/bangumi/collections?type=3"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.total).toBe(1);
    expect(data.data[0].subject.nameCn).toBe("黑猫与魔女的教室");
    expect(data.data[0].subject.year).toBe("2026");
  });
});