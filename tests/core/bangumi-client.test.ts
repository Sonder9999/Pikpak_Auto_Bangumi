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

  test("maps collection fields and caches by collection type", async () => {
    let fetchCalls = 0;
    initBangumi("test-token");

    globalThis.fetch = (async (input, init) => {
      fetchCalls += 1;
      expect(String(input)).toContain("/me/collections?subject_type=2&type=3");

      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer test-token");
      expect(headers.get("User-Agent")).toContain("Pikpak-Auto-Bangumi");

      return new Response(JSON.stringify(collectionPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const first = await getCollections(3);
    const second = await getCollections(3);

    expect(fetchCalls).toBe(1);
    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(first![0].type).toBe(3);
    expect(first![0].subject.id).toBe(576351);
    expect(first![0].subject.nameCn).toBe("黑猫与魔女的教室");
    expect(first![0].subject.images.large).toBe("https://lain.bgm.tv/pic/cover/l/example.jpg");
    expect(first![0].subject.rating.score).toBe(7.4);
    expect(first![0].subject.year).toBe("2026");
  });

  test("maps subject fields and returns null on 404", async () => {
    let fetchCalls = 0;
    initBangumi("test-token");

    globalThis.fetch = (async () => {
      fetchCalls += 1;

      if (fetchCalls === 1) {
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