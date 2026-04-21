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
  method: z.enum(["pn", "advance", "none"]).default("advance"),
  template: z.string().default("{title} S{season}E{episode}.{ext}"),
  folderPattern: z.string().default("{title} ({year})/Season {season}"),
  maxRetries: z.number().int().min(0).default(3),
  retryBaseDelayMs: z.number().int().min(0).default(1000),
});

const RENAME_DEFAULTS: z.input<typeof RenameConfigSchema> = {};

export const TmdbConfigSchema = z.object({
  apiKey: z.string().default(""),
  language: z.enum(["zh-CN", "zh-TW", "en-US", "ja-JP"]).default("zh-CN"),
});

const TMDB_DEFAULTS: z.input<typeof TmdbConfigSchema> = {};

export const BangumiConfigSchema = z.object({
  token: z.string().default(""),
});

const BANGUMI_DEFAULTS: z.input<typeof BangumiConfigSchema> = {};

export const DandanplayConfigSchema = z.object({
  enabled: z.boolean().default(false),
  appId: z.string().default(""),
  appSecret: z.string().default(""),
  chConvert: z.number().int().min(0).max(2).default(1),
});

const DANDANPLAY_DEFAULTS: z.input<typeof DandanplayConfigSchema> = {};

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
    dandanplay: DandanplayConfigSchema.optional(),
    tmdb: TmdbConfigSchema.optional(),
    bangumi: BangumiConfigSchema.optional(),
  })
  .transform((val) => ({
    general: GeneralConfigSchema.parse(val.general ?? GENERAL_DEFAULTS),
    pikpak: PikPakConfigSchema.parse(val.pikpak ?? PIKPAK_DEFAULTS),
    rss: RssConfigSchema.parse(val.rss ?? RSS_DEFAULTS),
    rename: RenameConfigSchema.parse(val.rename ?? RENAME_DEFAULTS),
    dandanplay: DandanplayConfigSchema.parse(val.dandanplay ?? DANDANPLAY_DEFAULTS),
    tmdb: TmdbConfigSchema.parse(val.tmdb ?? TMDB_DEFAULTS),
    bangumi: BangumiConfigSchema.parse(val.bangumi ?? BANGUMI_DEFAULTS),
  }));

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type PikPakConfig = z.infer<typeof PikPakConfigSchema>;
export type RssConfig = z.infer<typeof RssConfigSchema>;
export type RenameConfig = z.infer<typeof RenameConfigSchema>;
export type GeneralConfig = z.infer<typeof GeneralConfigSchema>;
export type DandanplayConfig = z.infer<typeof DandanplayConfigSchema>;
export type TmdbConfig = z.infer<typeof TmdbConfigSchema>;
export type BangumiConfig = z.infer<typeof BangumiConfigSchema>;
