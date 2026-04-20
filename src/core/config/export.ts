import type { AppConfig } from "./schema.ts";
import { AppConfigSchema } from "./schema.ts";
import { getConfig, saveConfig } from "./config.ts";
import { createLogger } from "../logger.ts";

const logger = createLogger("config");

const SENSITIVE_FIELDS = ["password", "refreshToken", "jwtSecret"] as const;

export function exportConfig(sanitize = true): AppConfig {
  const config = structuredClone(getConfig());

  if (sanitize) {
    for (const field of SENSITIVE_FIELDS) {
      if (field in config.pikpak) {
        const key = field as keyof typeof config.pikpak;
        const val = config.pikpak[key];
        if (typeof val === "string" && val.length > 0) {
          (config.pikpak as Record<string, unknown>)[key] = "***";
        }
      }
    }
    if (config.general.jwtSecret.length > 0) {
      config.general.jwtSecret = "***";
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
  if (imported.pikpak.password === "***") {
    imported.pikpak.password = current.pikpak.password;
  }
  if (imported.pikpak.refreshToken === "***") {
    imported.pikpak.refreshToken = current.pikpak.refreshToken;
  }
  if (imported.general.jwtSecret === "***") {
    imported.general.jwtSecret = current.general.jwtSecret;
  }

  saveConfig(imported);
  logger.info("Config imported successfully");
  return imported;
}
