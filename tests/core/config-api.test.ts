import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "fs";
import { Elysia } from "elysia";
import { isBangumiConfigured, initBangumi } from "../../src/core/bangumi/client.ts";
import { loadConfig } from "../../src/core/config/config.ts";
import { configRoutes } from "../../src/server/routes/config.ts";

const TEST_CONFIG_PATH = "data/test-config-api.json";

describe("Config API", () => {
  beforeEach(() => {
    mkdirSync("data", { recursive: true });
    if (existsSync(TEST_CONFIG_PATH)) {
      rmSync(TEST_CONFIG_PATH);
    }
    loadConfig(TEST_CONFIG_PATH);
    initBangumi("");
  });

  afterEach(() => {
    if (existsSync(TEST_CONFIG_PATH)) {
      rmSync(TEST_CONFIG_PATH);
    }
  });

  test("PATCH /api/config hot reloads Bangumi token and masks it in response", async () => {
    const app = new Elysia().use(configRoutes);
    const response = await app.handle(new Request("http://localhost/api/config/", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bangumi: { token: "new-bangumi-token" } }),
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(isBangumiConfigured()).toBe(true);
    expect(data.bangumi.token).toBe("***");
  });
});