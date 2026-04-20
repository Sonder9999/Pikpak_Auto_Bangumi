import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { createLogger } from "../logger.ts";
import { captchaSign } from "./crypto.ts";
import {
  WEB_CLIENT_ID, WEB_CLIENT_SECRET, WEB_CLIENT_VERSION,
  WEB_PACKAGE_NAME, WEB_TIMESTAMP, WEB_USER_AGENT, WEB_SALTS,
  LIB_CLIENT_ID, LIB_CLIENT_SECRET, LIB_CLIENT_VERSION, LIB_PACKAGE_NAME,
  AUTH_API_BASE, DRIVE_API_BASE,
} from "./constants.ts";
import type {
  PikPakMode, PikPakTokenCache, AuthTokenResponse, CaptchaInitResponse,
} from "./types.ts";

const logger = createLogger("pikpak-auth");

const DEFAULT_TOKEN_PATH = "./data/pikpak_token.json";
const DEFAULT_DEVICE_ID = "d185954a220c45308c16d0550e1d30c1";

/** Mode-specific config */
function getModeConfig(mode: PikPakMode) {
  if (mode === "web") {
    return {
      clientId: WEB_CLIENT_ID,
      clientSecret: WEB_CLIENT_SECRET,
      clientVersion: WEB_CLIENT_VERSION,
      packageName: WEB_PACKAGE_NAME,
      timestamp: WEB_TIMESTAMP,
      salts: WEB_SALTS,
      userAgent: WEB_USER_AGENT,
    };
  }
  return {
    clientId: LIB_CLIENT_ID,
    clientSecret: LIB_CLIENT_SECRET,
    clientVersion: LIB_CLIENT_VERSION,
    packageName: LIB_PACKAGE_NAME,
    timestamp: String(Date.now()),
    salts: [] as string[],
    userAgent: `PikPak/${LIB_CLIENT_VERSION} (com.pikcloud.pikpak)`,
  };
}

export type ModeConfig = ReturnType<typeof getModeConfig>;
export { getModeConfig };

/** PikPak authentication and token management */
export class PikPakAuth {
  accessToken = "";
  refreshToken = "";
  userId = "";
  mode: PikPakMode = "web";
  deviceId: string;
  tokenPath: string;

  constructor(opts?: { tokenPath?: string; deviceId?: string; refreshToken?: string }) {
    this.tokenPath = opts?.tokenPath ?? DEFAULT_TOKEN_PATH;
    this.deviceId = opts?.deviceId ?? DEFAULT_DEVICE_ID;
    if (opts?.refreshToken) {
      this.refreshToken = opts.refreshToken;
      logger.info("Seeded refresh token from config");
    }
  }

  get cfg(): ModeConfig {
    return getModeConfig(this.mode);
  }

  // ─── Token persistence ────────────────────────────────────────

  saveToken(): void {
    const cache: PikPakTokenCache = {
      username: "",
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      userId: this.userId,
      webMode: this.mode === "web",
    };
    mkdirSync(dirname(this.tokenPath), { recursive: true });
    writeFileSync(this.tokenPath, JSON.stringify(cache, null, 2));
    logger.info("Token saved", { path: this.tokenPath, mode: this.mode });
  }

  loadToken(): boolean {
    if (!existsSync(this.tokenPath)) return false;
    try {
      const raw = readFileSync(this.tokenPath, "utf-8");
      const cache: PikPakTokenCache = JSON.parse(raw);
      this.accessToken = cache.accessToken;
      this.refreshToken = cache.refreshToken;
      this.userId = cache.userId;
      this.mode = cache.webMode ? "web" : "lib";
      logger.info("Token loaded from cache", { mode: this.mode, userId: this.userId });
      return true;
    } catch (e) {
      logger.warn("Failed to load token cache", { error: String(e) });
      return false;
    }
  }

  // ─── Captcha ──────────────────────────────────────────────────

  async getCaptchaToken(action: string, username?: string): Promise<string> {
    const c = this.cfg;
    const sign = captchaSign(
      c.clientId, c.clientVersion, c.packageName,
      this.deviceId, c.timestamp, c.salts
    );

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": c.userAgent,
    };
    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }

    const meta: Record<string, string> = {
      captcha_sign: sign,
      client_version: c.clientVersion,
      package_name: c.packageName,
      user_id: this.userId,
      timestamp: c.timestamp,
    };
    if (username) {
      meta.username = username;
    }

    try {
      const resp = await fetch(`${AUTH_API_BASE}/v1/shield/captcha/init`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          client_id: c.clientId,
          action,
          device_id: this.deviceId,
          meta,
        }),
      });
      const data = (await resp.json()) as CaptchaInitResponse;
      if (data.captcha_token) return data.captcha_token;
      logger.warn("Failed to get captcha token", { action, error_code: data.error_code });
      return "";
    } catch (e) {
      logger.error("Captcha request failed", { error: String(e) });
      return "";
    }
  }

  // ─── Auth flows ───────────────────────────────────────────────

  /** Full auth flow: cache -> WEB login -> LIB login -> refresh fallback */
  async auth(username?: string, password?: string): Promise<boolean> {
    // Step 1: Try cached token
    if (this.loadToken()) {
      const valid = await this.verifyToken();
      if (valid) {
        logger.info("Authenticated from cached token");
        return true;
      }
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        logger.info("Authenticated after token refresh");
        return true;
      }
      logger.warn("Cached token invalid, proceeding to login");
    }

    // Step 2: Try WEB mode login first (captcha signing with SALTS)
    if (username && password) {
      this.mode = "web";
      logger.info("Attempting WEB mode login with captcha...");
      const webOk = await this.loginWithPassword(username, password);
      if (webOk) {
        this.saveToken();
        logger.info("WEB login successful");
        return true;
      }
      logger.warn("WEB login failed, trying LIB mode");
    }

    // Step 3: Try LIB login (only if credentials provided)
    if (username && password) {
      this.mode = "lib";
      logger.info("Attempting LIB mode login...");
      const libOk = await this.loginWithPassword(username, password);
      if (libOk) {
        this.saveToken();
        logger.info("LIB login successful");
        return true;
      }
      logger.warn("LIB login failed");
    }

    // Step 4: WEB mode refresh fallback (requires existing refresh_token)
    if (this.refreshToken) {
      this.mode = "web";
      logger.info("Attempting WEB mode with refresh_token...");
      const webOk = await this.refreshAccessToken();
      if (webOk) {
        const valid = await this.verifyToken();
        if (valid) {
          this.saveToken();
          logger.info("WEB mode authentication successful");
          return true;
        }
      }
    }

    logger.error("All authentication methods failed");
    return false;
  }

  /** Password login with captcha support */
  private async loginWithPassword(username: string, password: string): Promise<boolean> {
    try {
      const c = this.cfg;

      // Get captcha token before login
      const captchaToken = await this.getCaptchaToken("POST:/v1/auth/signin", username);
      if (!captchaToken) {
        logger.warn("Failed to obtain captcha token for login", { mode: this.mode });
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": c.userAgent,
      };
      if (captchaToken) {
        headers["X-Captcha-Token"] = captchaToken;
      }

      const resp = await fetch(`${AUTH_API_BASE}/v1/auth/signin`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          client_id: c.clientId,
          client_secret: c.clientSecret,
          username,
          password,
        }),
      });
      const data = (await resp.json()) as AuthTokenResponse;

      if (data.access_token && data.refresh_token) {
        this.accessToken = data.access_token;
        this.refreshToken = data.refresh_token;
        this.userId = data.sub;
        return true;
      }

      logger.warn("Login failed", { error: data.error, desc: data.error_description });
      return false;
    } catch (e) {
      logger.error("Login request failed", { error: String(e) });
      return false;
    }
  }

  /** Refresh access token using refresh_token */
  async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken) return false;
    try {
      const c = this.cfg;
      const resp = await fetch(`${AUTH_API_BASE}/v1/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": c.userAgent },
        body: JSON.stringify({
          client_id: c.clientId,
          client_secret: c.clientSecret,
          grant_type: "refresh_token",
          refresh_token: this.refreshToken,
        }),
      });
      const data = (await resp.json()) as AuthTokenResponse;

      if (data.access_token && data.refresh_token) {
        this.accessToken = data.access_token;
        this.refreshToken = data.refresh_token;
        this.userId = data.sub;
        this.saveToken();
        logger.info("Token refreshed successfully");
        return true;
      }

      logger.warn("Token refresh failed", { error: data.error });
      return false;
    } catch (e) {
      logger.error("Token refresh request failed", { error: String(e) });
      return false;
    }
  }

  /** Verify token by calling a lightweight API */
  async verifyToken(): Promise<boolean> {
    try {
      const c = this.cfg;
      const headers: Record<string, string> = {
        "User-Agent": c.userAgent,
        "Authorization": `Bearer ${this.accessToken}`,
        "X-Device-ID": this.deviceId,
      };
      const url = `${DRIVE_API_BASE}/drive/v1/tasks?type=offline&page_token=&page_size=1`;
      const resp = await fetch(url, { headers });
      const data = (await resp.json()) as { error_code?: number };
      return !data.error_code;
    } catch {
      return false;
    }
  }
}
