import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { existsSync, rmSync, mkdirSync } from "fs";
import { loadConfig } from "../../src/core/config/config.ts";
import { DandanplayClient, DandanplayError } from "../../src/core/danmaku/client.ts";

const TEST_CONFIG_PATH = "data/test-danmaku-config.json";

beforeEach(() => {
  mkdirSync("data", { recursive: true });
  if (existsSync(TEST_CONFIG_PATH)) rmSync(TEST_CONFIG_PATH);
  loadConfig(TEST_CONFIG_PATH);
});

afterEach(() => {
  if (existsSync(TEST_CONFIG_PATH)) rmSync(TEST_CONFIG_PATH);
  mock.restore();
});

describe("DandanplayClient", () => {
  test("isConfigured returns false when appId/appSecret empty", () => {
    const client = new DandanplayClient({ appId: "", appSecret: "" });
    expect(client.isConfigured()).toBe(false);
  });

  test("isConfigured returns true when both provided", () => {
    const client = new DandanplayClient({ appId: "testId", appSecret: "testSecret" });
    expect(client.isConfigured()).toBe(true);
  });

  test("searchEpisodes throws when not configured", async () => {
    const client = new DandanplayClient({ appId: "", appSecret: "" });
    await expect(client.searchEpisodes("Frieren", 5)).rejects.toThrow(DandanplayError);
  });

  test("getComments throws when not configured", async () => {
    const client = new DandanplayClient({ appId: "", appSecret: "" });
    await expect(client.getComments(12345)).rejects.toThrow(DandanplayError);
  });

  test("searchEpisodes parses response correctly", async () => {
    const mockResponse: unknown = {
      hasMore: false,
      animes: [
        {
          animeId: 100,
          animeTitle: "Sousou no Frieren",
          type: "tvseries",
          typeDescription: "TV",
          episodes: [
            {
              episodeId: 20001,
              animeId: 100,
              animeTitle: "Sousou no Frieren",
              episodeTitle: "Episode 5",
              type: "tvseries",
              typeDescription: "TV",
              shift: 0,
            },
          ],
        },
      ],
      errorCode: 0,
      success: true,
      errorMessage: "",
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
    );

    try {
      const client = new DandanplayClient({ appId: "testId", appSecret: "testSecret" });
      const episodes = await client.searchEpisodes("Frieren", 5);

      expect(episodes.length).toBe(1);
      expect(episodes[0].episodeId).toBe(20001);
      expect(episodes[0].animeTitle).toBe("Sousou no Frieren");
      expect(episodes[0].episodeTitle).toBe("Episode 5");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("getComments parses response correctly", async () => {
    const mockResponse: unknown = {
      count: 2,
      comments: [
        { cid: 1, p: "10.5,1,16777215,abc123", m: "Hello" },
        { cid: 2, p: "20.0,4,255,def456", m: "World" },
      ],
      errorCode: 0,
      success: true,
      errorMessage: "",
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
    );

    try {
      const client = new DandanplayClient({ appId: "testId", appSecret: "testSecret" });
      const comments = await client.getComments(20001);

      expect(comments.length).toBe(2);
      expect(comments[0].cid).toBe(1);
      expect(comments[0].p).toBe("10.5,1,16777215,abc123");
      expect(comments[0].m).toBe("Hello");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("throws DandanplayError on API error response", async () => {
    const mockResponse: unknown = {
      errorCode: 401,
      success: false,
      errorMessage: "Unauthorized",
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
    );

    try {
      const client = new DandanplayClient({ appId: "testId", appSecret: "testSecret" });
      await expect(client.searchEpisodes("Test", 1)).rejects.toThrow(DandanplayError);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("throws DandanplayError on HTTP non-2xx", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Server Error", { status: 500 }))
    );

    try {
      const client = new DandanplayClient({ appId: "testId", appSecret: "testSecret" });
      await expect(client.searchEpisodes("Test", 1)).rejects.toThrow(DandanplayError);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("throws DandanplayError on network failure", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() => Promise.reject(new Error("ECONNREFUSED")));

    try {
      const client = new DandanplayClient({ appId: "testId", appSecret: "testSecret" });
      await expect(client.searchEpisodes("Test", 1)).rejects.toThrow(DandanplayError);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("searchEpisodes returns empty when no animes match", async () => {
    const mockResponse: unknown = {
      hasMore: false,
      animes: [],
      errorCode: 0,
      success: true,
      errorMessage: "",
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
    );

    try {
      const client = new DandanplayClient({ appId: "testId", appSecret: "testSecret" });
      const episodes = await client.searchEpisodes("NonExistent", 1);
      expect(episodes.length).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
