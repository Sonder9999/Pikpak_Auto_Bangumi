import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { AppConfigSchema, type AppConfig } from "./schema.ts";
import { createLogger } from "../logger.ts";

const logger = createLogger("config");

const DEFAULT_CONFIG_PATH = "config.json";

function expandEnvVars(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/\$\{([^}]+)}/g, (_, envKey: string) => {
      return process.env[envKey] ?? "";
    });
  }
  if (Array.isArray(value)) {
    return value.map(expandEnvVars);
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = expandEnvVars(v);
    }
    return result;
  }
  return value;
}

let _config: AppConfig | null = null;
let _configPath = DEFAULT_CONFIG_PATH;

export function loadConfig(configPath?: string): AppConfig {
  _configPath = configPath ?? DEFAULT_CONFIG_PATH;

  if (!existsSync(_configPath)) {
    logger.info("Config file not found, generating defaults", { path: _configPath });
    const defaults = AppConfigSchema.parse({});
    saveConfig(defaults);
    _config = defaults;
    return _config;
  }

  const raw = readFileSync(_configPath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    logger.error("Failed to parse config JSON", { path: _configPath, error: String(e) });
    throw new Error(`Invalid JSON in ${_configPath}`);
  }

  const expanded = expandEnvVars(parsed);
  const result = AppConfigSchema.safeParse(expanded);

  if (!result.success) {
    logger.error("Config validation failed", { errors: result.error.issues });
    throw new Error(`Config validation failed: ${result.error.message}`);
  }

  _config = result.data;
  logger.info("Config loaded", { path: _configPath });
  return _config;
}

export function saveConfig(config: AppConfig, configPath?: string): void {
  const targetPath = configPath ?? _configPath;
  const dir = dirname(targetPath);
  if (dir && dir !== ".") {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(targetPath, JSON.stringify(config, null, 2), "utf-8");
  _config = config;
  logger.info("Config saved", { path: targetPath });
}

export function getConfig(): AppConfig {
  if (!_config) {
    return loadConfig();
  }
  return _config;
}

export function updateConfig(partial: Partial<AppConfig>): AppConfig {
  const current = getConfig();
  const merged = {
    ...current,
    ...partial,
    general: { ...current.general, ...(partial.general ?? {}) },
    pikpak: { ...current.pikpak, ...(partial.pikpak ?? {}) },
    rss: { ...current.rss, ...(partial.rss ?? {}) },
    rename: { ...current.rename, ...(partial.rename ?? {}) },
    dandanplay: { ...current.dandanplay, ...(partial.dandanplay ?? {}) },
    tmdb: { ...current.tmdb, ...(partial.tmdb ?? {}) },
    bangumi: { ...current.bangumi, ...(partial.bangumi ?? {}) },
  };

  const result = AppConfigSchema.safeParse(merged);
  if (!result.success) {
    logger.error("Config update validation failed", { errors: result.error.issues });
    throw new Error(`Config validation failed: ${result.error.message}`);
  }

  saveConfig(result.data);
  return result.data;
}

export { expandEnvVars };
