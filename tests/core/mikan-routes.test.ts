import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { Elysia } from "elysia";
import { mikanRoutes } from "../../src/server/routes/mikan.ts";

const originalFetch = globalThis.fetch;
const searchFixture = readFileSync("tests/fixtures/mikan-search.fixture.html", "utf-8");
const bangumiFixture = readFileSync("tests/fixtures/mikan-bangumi.fixture.html", "utf-8");

describe("Mikan routes", () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("GET /api/mikan/search returns parsed results", async () => {
    globalThis.fetch = (async () => new Response(searchFixture, { status: 200 })) as typeof fetch;

    const app = new Elysia().use(mikanRoutes);
    const response = await app.handle(new Request("http://localhost/api/mikan/search?q=%E9%BB%91%E7%8C%AB"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data[0].mikanId).toBe(3928);
    expect(data[0].title).toBe("黑猫与魔女的教室");
  });

  test("GET /api/mikan/bangumi/:id returns 404 when page does not exist", async () => {
    globalThis.fetch = (async () => new Response("not found", { status: 404 })) as typeof fetch;

    const app = new Elysia().use(mikanRoutes);
    const response = await app.handle(new Request("http://localhost/api/mikan/bangumi/3928"));

    expect(response.status).toBe(404);
  });

  test("GET /api/mikan/bangumi-detail/:id returns normalized subgroup episodes", async () => {
    globalThis.fetch = (async () => new Response(bangumiFixture, { status: 200 })) as typeof fetch;

    const app = new Elysia().use(mikanRoutes);
    const response = await app.handle(new Request("http://localhost/api/mikan/bangumi-detail/3928"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(data.bangumiSubjectId).toBe(576351);
    expect(data.subgroups[0].name).toBe("LoliHouse");
    expect(data.subgroups[0].episodes).toBeArray();
    expect(data.subgroups[0].episodes[0]).toMatchObject({
      title: expect.stringContaining("LoliHouse"),
      updatedAt: "2026/04/20 01:50",
    });
  });
});