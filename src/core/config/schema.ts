import { z } from "zod";

export const PikPakConfigSchema = z.object({
  username: z.string().default(""),
  password: z.string().default(""),
  cloudBasePath: z.string().default("/Anime"),
  preferWebMode: z.boolean().default(true),
  refreshToken: z.string().default(""),
  deviceId: z.string().default(""),
  tokenCachePath: z.string().default("data/pikpak_token.json"),
});

const PIKPAK_DEFAULTS: z.input<typeof PikPakConfigSchema> = {};

export const RssConfigSchema = z.object({
  defaultPollIntervalMs: z.number().int().positive().default(300000),
  requestTimeoutMs: z.number().int().positive().default(30000),
  maxConsecutiveFailures: z.number().int().positive().default(10),
});

const RSS_DEFAULTS: z.input<typeof RssConfigSchema> = {};

export const RenameConfigSchema = z.object({
  enabled: z.boolean().default(true),
  template: z.string().default("S{season}E{episode}.{ext}"),
  maxRetries: z.number().int().min(0).default(3),
  retryBaseDelayMs: z.number().int().min(0).default(1000),
});

const RENAME_DEFAULTS: z.input<typeof RenameConfigSchema> = {};

export const GeneralConfigSchema = z.object({
  mode: z.enum(["server", "cli"]).default("server"),
  port: z.number().int().min(1).max(65535).default(7810),
  dbPath: z.string().default("data/pikpak-bangumi.db"),
  logLevel: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).default("INFO"),
  jwtSecret: z.string().default(""),
});

const GENERAL_DEFAULTS: z.input<typeof GeneralConfigSchema> = {};

export const AppConfigSchema = z
  .object({
    general: GeneralConfigSchema.optional(),
    pikpak: PikPakConfigSchema.optional(),
    rss: RssConfigSchema.optional(),
    rename: RenameConfigSchema.optional(),
  })
  .transform((val) => ({
    general: GeneralConfigSchema.parse(val.general ?? GENERAL_DEFAULTS),
    pikpak: PikPakConfigSchema.parse(val.pikpak ?? PIKPAK_DEFAULTS),
    rss: RssConfigSchema.parse(val.rss ?? RSS_DEFAULTS),
    rename: RenameConfigSchema.parse(val.rename ?? RENAME_DEFAULTS),
  }));

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type PikPakConfig = z.infer<typeof PikPakConfigSchema>;
export type RssConfig = z.infer<typeof RssConfigSchema>;
export type RenameConfig = z.infer<typeof RenameConfigSchema>;
export type GeneralConfig = z.infer<typeof GeneralConfigSchema>;
