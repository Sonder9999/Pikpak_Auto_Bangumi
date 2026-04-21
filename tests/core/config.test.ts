import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, mkdirSync } from "fs";
import { resolve } from "path";
import { loadConfig, saveConfig, getConfig, updateConfig, expandEnvVars, getDefaultConfigPath, resolveConfigPath } from "../../src/core/config/config.ts";
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
    expect(config.rename.template).toBe("{title} S{season}E{episode}.{ext}");
    expect(config.bangumi.token).toBe("");
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
  test("default config path stays at project root when cwd changes", () => {
    const originalCwd = process.cwd();
    const nestedDir = resolve("data", "config-cwd");

    mkdirSync(nestedDir, { recursive: true });
    process.chdir(nestedDir);

    try {
      expect(getDefaultConfigPath()).toBe(resolve(import.meta.dir, "../../config.json"));
    } finally {
      process.chdir(originalCwd);
      rmSync(nestedDir, { recursive: true, force: true });
    }
  });

  test("resolveConfigPath anchors relative paths to current config file", () => {
    const testConfigDir = resolve("data", "config-root");
    const testConfigPath = resolve(testConfigDir, "config.json");

    mkdirSync(testConfigDir, { recursive: true });
    loadConfig(testConfigPath);

    expect(resolveConfigPath("runtime/pikpak_token.json")).toBe(
      resolve(testConfigDir, "runtime", "pikpak_token.json")
    );
    expect(resolveConfigPath(":memory:")).toBe(":memory:");

    rmSync(testConfigDir, { recursive: true, force: true });
  });

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

  test("merges nested bangumi config", () => {
    loadConfig(TEST_CONFIG_PATH);
    const updated = updateConfig({ bangumi: { token: "bangumi-token" } });

    expect(updated.bangumi.token).toBe("bangumi-token");
    expect(updated.general.port).toBe(7810);
  });
});

describe("export / import", () => {
  test("export sanitizes sensitive fields", () => {
    loadConfig(TEST_CONFIG_PATH);
    updateConfig({
      pikpak: { password: "my-secret-pw" },
      bangumi: { token: "bangumi-token" },
    });

    const exported = exportConfig(true);
    expect(exported.pikpak.password).toBe("***");
    expect(exported.bangumi.token).toBe("***");
  });

  test("export without sanitize keeps sensitive fields", () => {
    loadConfig(TEST_CONFIG_PATH);
    updateConfig({ pikpak: { password: "my-secret-pw" } });

    const exported = exportConfig(false);
    expect(exported.pikpak.password).toBe("my-secret-pw");
  });

  test("import preserves masked sensitive fields", () => {
    loadConfig(TEST_CONFIG_PATH);
    updateConfig({
      pikpak: { password: "original-pw" },
      bangumi: { token: "original-token" },
    });

    const imported = importConfig({
      pikpak: { password: "***" },
      bangumi: { token: "***" },
      general: { port: 3000 },
    });

    expect(imported.pikpak.password).toBe("original-pw");
    expect(imported.bangumi.token).toBe("original-token");
    expect(imported.general.port).toBe(3000);
  });
});
