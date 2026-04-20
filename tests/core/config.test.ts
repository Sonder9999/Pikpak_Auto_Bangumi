import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, mkdirSync } from "fs";
import { loadConfig, saveConfig, getConfig, updateConfig, expandEnvVars } from "../../src/core/config/config.ts";
import { exportConfig, importConfig } from "../../src/core/config/export.ts";
import { AppConfigSchema } from "../../src/core/config/schema.ts";

const TEST_CONFIG_PATH = "data/test-config.json";

beforeEach(() => {
  mkdirSync("data", { recursive: true });
  if (existsSync(TEST_CONFIG_PATH)) rmSync(TEST_CONFIG_PATH);
});

afterEach(() => {
  if (existsSync(TEST_CONFIG_PATH)) rmSync(TEST_CONFIG_PATH);
});

describe("config schema", () => {
  test("defaults are generated when parsing empty object", () => {
    const config = AppConfigSchema.parse({});
    expect(config.general.port).toBe(7810);
    expect(config.general.mode).toBe("server");
    expect(config.pikpak.cloudBasePath).toBe("/Anime");
    expect(config.rss.defaultPollIntervalMs).toBe(300000);
    expect(config.rename.template).toBe("S{season}E{episode}.{ext}");
  });

  test("rejects invalid values", () => {
    const result = AppConfigSchema.safeParse({ general: { port: -1 } });
    expect(result.success).toBe(false);
  });

  test("rejects negative poll interval", () => {
    const result = AppConfigSchema.safeParse({ rss: { defaultPollIntervalMs: -100 } });
    expect(result.success).toBe(false);
  });
});

describe("env var expansion", () => {
  test("expands ${VAR} in strings", () => {
    process.env.TEST_USER = "alice";
    const result = expandEnvVars("Hello ${TEST_USER}");
    expect(result).toBe("Hello alice");
    delete process.env.TEST_USER;
  });

  test("expands nested objects", () => {
    process.env.TEST_PW = "secret123";
    const result = expandEnvVars({ pikpak: { password: "${TEST_PW}" } });
    expect(result).toEqual({ pikpak: { password: "secret123" } });
    delete process.env.TEST_PW;
  });

  test("empty string for missing env var", () => {
    const result = expandEnvVars("${NONEXISTENT_VAR_XYZ}");
    expect(result).toBe("");
  });
});

describe("loadConfig / saveConfig", () => {
  test("creates default config when file does not exist", () => {
    const config = loadConfig(TEST_CONFIG_PATH);
    expect(config.general.port).toBe(7810);
    expect(existsSync(TEST_CONFIG_PATH)).toBe(true);
  });

  test("loads existing config", () => {
    const custom = AppConfigSchema.parse({ general: { port: 9999 } });
    saveConfig(custom, TEST_CONFIG_PATH);

    const loaded = loadConfig(TEST_CONFIG_PATH);
    expect(loaded.general.port).toBe(9999);
  });
});

describe("updateConfig", () => {
  test("merges partial config", () => {
    loadConfig(TEST_CONFIG_PATH);
    const updated = updateConfig({ general: { port: 8080 } });
    expect(updated.general.port).toBe(8080);
    expect(updated.pikpak.cloudBasePath).toBe("/Anime");
  });
});

describe("export / import", () => {
  test("export sanitizes sensitive fields", () => {
    loadConfig(TEST_CONFIG_PATH);
    updateConfig({ pikpak: { password: "my-secret-pw" } });

    const exported = exportConfig(true);
    expect(exported.pikpak.password).toBe("***");
  });

  test("export without sanitize keeps sensitive fields", () => {
    loadConfig(TEST_CONFIG_PATH);
    updateConfig({ pikpak: { password: "my-secret-pw" } });

    const exported = exportConfig(false);
    expect(exported.pikpak.password).toBe("my-secret-pw");
  });

  test("import preserves masked sensitive fields", () => {
    loadConfig(TEST_CONFIG_PATH);
    updateConfig({ pikpak: { password: "original-pw" } });

    const imported = importConfig({
      pikpak: { password: "***" },
      general: { port: 3000 },
    });

    expect(imported.pikpak.password).toBe("original-pw");
    expect(imported.general.port).toBe(3000);
  });
});
