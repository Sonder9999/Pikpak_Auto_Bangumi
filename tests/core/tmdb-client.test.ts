import { describe, test, expect, beforeEach } from "bun:test";
import { initTmdb, searchAnime } from "../../src/core/tmdb/client.ts";

const TMDB_API_KEY = process.env.TMDB_API_KEY ?? "";

describe("TMDB client", () => {
  beforeEach(() => {
    initTmdb(TMDB_API_KEY, "zh-CN");
  });

  test("returns null when no API key configured", async () => {
    initTmdb("", "zh-CN");
    const result = await searchAnime("Kuroneko to Majo no Kyoushitsu");
    expect(result).toBeNull();
  });

  test.skipIf(!TMDB_API_KEY)("searches anime and returns Chinese title + year", async () => {
    const result = await searchAnime("Kuroneko to Majo no Kyoushitsu");
    expect(result).not.toBeNull();
    expect(result!.officialTitle).toBeTruthy();
    expect(result!.year).toMatch(/^\d{4}$/);
    expect(result!.tmdbId).toBeNumber();
  });

  test.skipIf(!TMDB_API_KEY)("returns cached result on second call", async () => {
    const first = await searchAnime("Kuroneko to Majo no Kyoushitsu");
    const second = await searchAnime("Kuroneko to Majo no Kyoushitsu");
    // Both should be same reference (cache hit)
    expect(first).toBe(second);
  });

  test.skipIf(!TMDB_API_KEY)("returns null for unknown title", async () => {
    const result = await searchAnime("XYZUNKNOWNTITLEABCDEF12345");
    expect(result).toBeNull();
  });
});
