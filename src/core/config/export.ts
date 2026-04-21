import type { AppConfig } from "./schema.ts";
import { AppConfigSchema } from "./schema.ts";
import { getConfig, saveConfig } from "./config.ts";
import { createLogger } from "../logger.ts";

const logger = createLogger("config");

const SENSITIVE_FIELDS = ["password", "refreshToken", "jwtSecret"] as const;
const MASKED_VALUE = "***";

export function exportConfig(sanitize = true): AppConfig {
  const config = structuredClone(getConfig());

  if (sanitize) {
    for (const field of SENSITIVE_FIELDS) {
      if (field in config.pikpak) {
        const key = field as keyof typeof config.pikpak;
        const val = config.pikpak[key];
        if (typeof val === "string" && val.length > 0) {
          (config.pikpak as Record<string, unknown>)[key] = MASKED_VALUE;
        }
      }
    }
    if (config.general.jwtSecret.length > 0) {
      config.general.jwtSecret = MASKED_VALUE;
    }
    if (config.dandanplay.appSecret.length > 0) {
      config.dandanplay.appSecret = MASKED_VALUE;
    }
    if (config.tmdb.apiKey.length > 0) {
      config.tmdb.apiKey = MASKED_VALUE;
    }
    if (config.bangumi.token.length > 0) {
      config.bangumi.token = MASKED_VALUE;
    }
  }

  return config;
}

export function importConfig(input: unknown): AppConfig {
  const result = AppConfigSchema.safeParse(input);
  if (!result.success) {
    logger.error("Import config validation failed", { errors: result.error.issues });
    throw new Error(`Config import validation failed: ${result.error.message}`);
  }

  const current = getConfig();
  const imported = result.data;

  // Preserve sensitive fields that are masked
  if (imported.pikpak.password === MASKED_VALUE) {
    imported.pikpak.password = current.pikpak.password;
  }
  if (imported.pikpak.refreshToken === MASKED_VALUE) {
    imported.pikpak.refreshToken = current.pikpak.refreshToken;
  }
  if (imported.general.jwtSecret === MASKED_VALUE) {
    imported.general.jwtSecret = current.general.jwtSecret;
  }
  if (imported.dandanplay.appSecret === MASKED_VALUE) {
    imported.dandanplay.appSecret = current.dandanplay.appSecret;
  }
  if (imported.tmdb.apiKey === MASKED_VALUE) {
    imported.tmdb.apiKey = current.tmdb.apiKey;
  }
  if (imported.bangumi.token === MASKED_VALUE) {
    imported.bangumi.token = current.bangumi.token;
  }

  saveConfig(imported);
  logger.info("Config imported successfully");
  return imported;
}
