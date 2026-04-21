import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  getCollections,
  getSubject,
  initBangumi,
  isBangumiConfigured,
} from "../../src/core/bangumi/client.ts";

const collectionPayload = [
  {
    type: 3,
    subject: {
      id: 576351,
      name: "Kuroneko to Majo no Kyoushitsu",
      name_cn: "黑猫与魔女的教室",
      date: "2026-04-12",
      eps: 12,
      summary: "summary",
      images: {
        large: "https://lain.bgm.tv/pic/cover/l/example.jpg",
      },
      rating: {
        score: 7.4,
        total: 1499,
      },
      tags: [
        { name: "校园", count: 8 },
        { name: "奇幻", count: 5 },
      ],
      url: "https://bgm.tv/subject/576351",
    },
  },
];

const subjectPayload = {
  id: 576351,
  name: "Kuroneko to Majo no Kyoushitsu",
  name_cn: "黑猫与魔女的教室",
  date: "2026-04-12",
  eps: 12,
  summary: "summary",
  images: {
    large: "https://lain.bgm.tv/pic/cover/l/example.jpg",
  },
  rating: {
    score: 7.4,
    total: 1499,
  },
  tags: [
    { name: "校园", count: 8 },
    { name: "奇幻", count: 5 },
  ],
  url: "https://bgm.tv/subject/576351",
};

describe("Bangumi client", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    initBangumi("");
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("returns null when no token configured", async () => {
    expect(isBangumiConfigured()).toBe(false);
    expect(await getCollections(3)).toBeNull();
    expect(await getSubject(576351)).toBeNull();
  });

  test("maps collection fields, returns paginated result, and caches by type+offset+limit", async () => {
    let fetchCalls = 0;
    initBangumi("test-token");

    globalThis.fetch = (async (input, _init) => {
      fetchCalls += 1;
      const url = String(input);

      // First call resolves /me to get username
      if (url.endsWith("/me")) {
        return new Response(JSON.stringify({ username: "testuser" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      expect(url).toContain("/users/testuser/collections?subject_type=2&type=3");
      expect(url).toContain("offset=0");
      expect(url).toContain("limit=30");

      return new Response(JSON.stringify({ data: collectionPayload, total: 1, limit: 30, offset: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const first = await getCollections(3, 0, 30);
    const second = await getCollections(3, 0, 30); // should hit cache

    // 2 calls: /me + /collections (second call uses cache)
    expect(fetchCalls).toBe(2);
    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(first!.total).toBe(1);
    expect(first!.limit).toBe(30);
    expect(first!.offset).toBe(0);
    expect(first!.data[0].type).toBe(3);
    expect(first!.data[0].subject.id).toBe(576351);
    expect(first!.data[0].subject.nameCn).toBe("黑猫与魔女的教室");
    expect(first!.data[0].subject.images.large).toBe("https://lain.bgm.tv/pic/cover/l/example.jpg");
    expect(first!.data[0].subject.rating.score).toBe(7.4);
    expect(first!.data[0].subject.year).toBe("2026");
  });

  test("different offset/limit generate separate cache entries", async () => {
    let fetchCalls = 0;
    initBangumi("test-token");

    globalThis.fetch = (async (input, _init) => {
      fetchCalls += 1;
      const url = String(input);

      if (url.endsWith("/me")) {
        return new Response(JSON.stringify({ username: "testuser" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const urlObj = new URL(url);
      const offsetFromUrl = Number(urlObj.searchParams.get("offset") ?? "0");

      return new Response(JSON.stringify({ data: collectionPayload, total: 60, limit: 30, offset: offsetFromUrl }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const page1 = await getCollections(3, 0, 30);
    const page2 = await getCollections(3, 30, 30);

    // /me + page1 fetch + page2 fetch = 3 calls
    expect(fetchCalls).toBe(3);
    expect(page1!.offset).toBe(0);
    expect(page2!.offset).toBe(30);
    expect(page1!.total).toBe(60);
  });

  test("maps subject fields and returns null on 404", async () => {
    let fetchCalls = 0;
    initBangumi("test-token");

    globalThis.fetch = (async (input) => {
      fetchCalls += 1;
      const url = String(input);

      // Might call /me if currentUsername not cached from previous test
      if (url.endsWith("/me")) {
        return new Response(JSON.stringify({ username: "testuser" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/subjects/576351")) {
        return new Response(JSON.stringify(subjectPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const found = await getSubject(576351);
    const missing = await getSubject(1);

    expect(found).not.toBeNull();
    expect(found!.name).toBe("Kuroneko to Majo no Kyoushitsu");
    expect(found!.nameCn).toBe("黑猫与魔女的教室");
    expect(found!.summary).toBe("summary");
    expect(found!.eps).toBe(12);
    expect(found!.year).toBe("2026");
    expect(missing).toBeNull();
  });
});