import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import {
  getMikanBangumi,
  parseBangumiSubjectIdFromUrl,
  parseMikanBangumiHtml,
  parseMikanBangumiIdFromRssUrl,
  parseMikanSearchHtml,
  searchMikan,
} from "../../src/core/mikan/scraper.ts";
import { resolveMikanBangumiIdentity } from "../../src/core/mikan/identity.ts";

const searchFixture = readFileSync("tests/fixtures/mikan-search.fixture.html", "utf-8");
const bangumiFixture = readFileSync("tests/fixtures/mikan-bangumi.fixture.html", "utf-8");

describe("Mikan scraper", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("parses search results from a live snapshot fixture", () => {
    const results = parseMikanSearchHtml(searchFixture);

    expect(results.length).toBe(1);
    expect(results[0]).toEqual({
      mikanId: 3928,
      title: "黑猫与魔女的教室",
      posterUrl: "https://mikanani.me/images/Bangumi/202604/1db6cd91.jpg?width=400&height=400&format=webp",
    });
  });

  test("parses bangumi details, subgroup RSS links, and latest release info from a live snapshot fixture", () => {
    const detail = parseMikanBangumiHtml(bangumiFixture, 3928);

    expect(detail.title).toBe("黑猫与魔女的教室");
    expect(detail.posterUrl).toBe("https://mikanani.me/images/Bangumi/202604/1db6cd91.jpg?width=400&height=560&format=webp");
    expect(detail.bangumiTvUrl).toBe("https://bgm.tv/subject/576351");
    expect(detail.bangumiSubjectId).toBe(576351);
    expect(detail.mikanRssUrl).toBe("https://mikanani.me/RSS/Bangumi?bangumiId=3928");
    expect(detail.subgroups.length).toBe(2);
    expect(detail.subgroups[0]).toMatchObject({
      id: 370,
      name: "LoliHouse",
      rssUrl: "https://mikanani.me/RSS/Bangumi?bangumiId=3928&subgroupid=370",
    });
    expect(detail.subgroups[0].episodes).toBeArray();
    expect(detail.subgroups[0].episodes.length).toBeGreaterThan(0);
    expect(detail.subgroups[0].episodes[0]).toMatchObject({
      title: expect.stringContaining("LoliHouse"),
      size: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(detail.subgroups[1].name).toBe("ANi");
  });

  test("parses identity values from Mikan and Bangumi URLs", () => {
    expect(parseMikanBangumiIdFromRssUrl("https://mikanani.me/RSS/Bangumi?bangumiId=3928&subgroupid=370")).toBe(3928);
    expect(parseBangumiSubjectIdFromUrl("https://bgm.tv/subject/576351")).toBe(576351);
  });

  test("returns null bangumiSubjectId when Bangumi link is missing", () => {
    const detail = parseMikanBangumiHtml(
      bangumiFixture.replace("https://bgm.tv/subject/576351", "https://example.com/no-subject"),
      3928,
    );

    expect(detail.bangumiTvUrl).toBeNull();
    expect(detail.bangumiSubjectId).toBeNull();
  });

  test("returns empty array when search parsing fails", async () => {
    globalThis.fetch = (async () => new Response("<html></html>", { status: 200 })) as typeof fetch;

    const results = await searchMikan("黑猫与魔女的教室");
    expect(results).toEqual([]);
  });

  test("returns null for missing bangumi detail page", async () => {
    globalThis.fetch = (async () => new Response("not found", { status: 404 })) as typeof fetch;

    const detail = await getMikanBangumi(3928);
    expect(detail).toBeNull();
  });

  test("resolves Mikan identity from RSS URL", async () => {
    globalThis.fetch = (async () => new Response(bangumiFixture, { status: 200 })) as typeof fetch;

    const detail = await resolveMikanBangumiIdentity({
      rssUrl: "https://mikanani.me/RSS/Bangumi?bangumiId=3928&subgroupid=370",
    });

    expect(detail).toMatchObject({
      mikanBangumiId: 3928,
      bangumiSubjectId: 576351,
      bangumiTvUrl: "https://bgm.tv/subject/576351",
    });
  });

  test("rejects conflicting Bangumi subject identity", async () => {
    globalThis.fetch = (async () => new Response(bangumiFixture, { status: 200 })) as typeof fetch;

    await expect(resolveMikanBangumiIdentity({
      mikanBangumiId: 3928,
      bangumiSubjectId: 999999,
    })).rejects.toThrow("Bangumi subject id mismatch");
  });

  test("rejects missing Bangumi subject link during resolution", async () => {
    globalThis.fetch = (async () => new Response(
      bangumiFixture.replace("https://bgm.tv/subject/576351", "https://example.com/no-subject"),
      { status: 200 },
    )) as typeof fetch;

    await expect(resolveMikanBangumiIdentity({
      mikanBangumiId: 3928,
    })).rejects.toThrow("Bangumi subject link not found");
  });
});