import { createLogger } from "../logger.ts";
import { PikPakAuth } from "./auth.ts";
import { DRIVE_API_BASE } from "./constants.ts";
import type {
  PikPakMode, OfflineTaskResponse, OfflineTask,
  FileListResponse, PikPakFile,
} from "./types.ts";

const logger = createLogger("pikpak");

/**
 * PikPak Drive API client.
 * Delegates authentication to PikPakAuth.
 * Handles captcha injection, token refresh on 401, and all drive operations.
 */
export class PikPakClient {
  private auth: PikPakAuth;

  constructor(opts?: { tokenPath?: string; deviceId?: string }) {
    this.auth = new PikPakAuth(opts);
  }

  // ─── Auth delegation ──────────────────────────────────────────

  async authenticate(username?: string, password?: string): Promise<boolean> {
    return this.auth.auth(username, password);
  }

  async refreshAccessToken(): Promise<boolean> {
    return this.auth.refreshAccessToken();
  }

  getMode(): PikPakMode { return this.auth.mode; }
  isAuthenticated(): boolean { return !!this.auth.accessToken; }
  getUserId(): string { return this.auth.userId; }

  // ─── HTTP request helper ──────────────────────────────────────

  private async request<T>(
    method: string,
    url: string,
    opts?: { body?: unknown; params?: Record<string, string>; skipCaptcha?: boolean }
  ): Promise<T> {
    const cfg = this.auth.cfg;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": cfg.userAgent,
    };

    if (this.auth.accessToken) {
      headers["Authorization"] = `Bearer ${this.auth.accessToken}`;
    }

    // Auto captcha for drive API (WEB mode)
    const isDriveApi = url.includes(DRIVE_API_BASE);
    if (this.auth.mode === "web" && isDriveApi && !opts?.skipCaptcha) {
      const ct = await this.auth.getCaptchaToken("GET:/drive/v1/files");
      if (ct) headers["X-Captcha-Token"] = ct;
    }

    let fullUrl = url;
    if (opts?.params) {
      const qs = new URLSearchParams(opts.params).toString();
      fullUrl += (url.includes("?") ? "&" : "?") + qs;
    }

    const fetchOpts: RequestInit = { method, headers };
    if (opts?.body) fetchOpts.body = JSON.stringify(opts.body);

    logger.debug("API request", { method, url: fullUrl.slice(0, 100) });
    const resp = await fetch(fullUrl, fetchOpts);
    const data = (await resp.json()) as T & { error_code?: number; error?: string };

    // Handle token expiry (error_code 16) — auto refresh
    if (data.error_code === 16 && this.auth.refreshToken) {
      logger.info("Access token expired, refreshing...");
      const refreshed = await this.auth.refreshAccessToken();
      if (refreshed) {
        headers["Authorization"] = `Bearer ${this.auth.accessToken}`;
        if (this.auth.mode === "web" && isDriveApi && !opts?.skipCaptcha) {
          const ct = await this.auth.getCaptchaToken("GET:/drive/v1/files");
          if (ct) headers["X-Captcha-Token"] = ct;
        }
        const retryOpts: RequestInit = { method, headers };
        if (opts?.body) retryOpts.body = JSON.stringify(opts.body);
        const retryResp = await fetch(fullUrl, retryOpts);
        return (await retryResp.json()) as T;
      }
    }

    if (data.error_code) {
      logger.warn("API error response", { error_code: data.error_code, error: data.error });
    }

    return data;
  }

  // ─── Drive API: Offline download ──────────────────────────────

  async offlineDownload(url: string, parentId: string, name?: string): Promise<OfflineTaskResponse> {
    const body: Record<string, unknown> = {
      kind: "drive#file",
      upload_type: "UPLOAD_TYPE_URL",
      url: { url },
      folder_type: "",
      parent_id: parentId,
    };
    if (name) body.name = name;

    logger.info("Submitting offline download", { url: url.slice(0, 60), parentId });
    return this.request<OfflineTaskResponse>(
      "POST",
      `${DRIVE_API_BASE}/drive/v1/files`,
      { body }
    );
  }

  async listOfflineTasks(pageSize = 50): Promise<OfflineTask[]> {
    const resp = await this.request<{ tasks?: OfflineTask[]; error_code?: number }>(
      "GET",
      `${DRIVE_API_BASE}/drive/v1/tasks`,
      { params: { type: "offline", page_size: String(pageSize) } }
    );
    return resp.tasks ?? [];
  }

  async getOfflineTask(taskId: string): Promise<OfflineTask | null> {
    const tasks = await this.listOfflineTasks(100);
    return tasks.find((t) => t.id === taskId) ?? null;
  }

  // ─── Drive API: Files & folders ───────────────────────────────

  async listFiles(parentId: string, pageSize = 100): Promise<PikPakFile[]> {
    const resp = await this.request<FileListResponse>(
      "GET",
      `${DRIVE_API_BASE}/drive/v1/files`,
      {
        params: {
          parent_id: parentId,
          page_size: String(pageSize),
          with_audit: "false",
        },
      }
    );
    return resp.files ?? [];
  }

  async createFolder(parentId: string, name: string): Promise<PikPakFile | null> {
    logger.info("Creating folder", { parentId, name });
    const resp = await this.request<{ file?: PikPakFile; error_code?: number }>(
      "POST",
      `${DRIVE_API_BASE}/drive/v1/files`,
      {
        body: {
          kind: "drive#folder",
          parent_id: parentId,
          name,
        },
      }
    );
    return resp.file ?? null;
  }

  async renameFile(fileId: string, newName: string): Promise<PikPakFile | null> {
    logger.info("Renaming file", { fileId, newName });
    const resp = await this.request<PikPakFile & { error_code?: number }>(
      "PATCH",
      `${DRIVE_API_BASE}/drive/v1/files/${fileId}`,
      { body: { name: newName } }
    );
    if (resp.error_code) return null;
    return resp;
  }

  async ensurePath(basePath: string): Promise<string> {
    const parts = basePath.split("/").filter(Boolean);
    let parentId = "";

    for (const part of parts) {
      const files = await this.listFiles(parentId);
      const existing = files.find((f) => f.kind === "drive#folder" && f.name === part);
      if (existing) {
        parentId = existing.id;
        logger.debug("Folder exists", { name: part, id: parentId });
      } else {
        const created = await this.createFolder(parentId, part);
        if (!created) throw new Error(`Failed to create folder: ${part}`);
        parentId = created.id;
        logger.info("Folder created", { name: part, id: parentId });
      }
    }

    return parentId;
  }

  async getFileDetails(fileId: string): Promise<PikPakFile | null> {
    const resp = await this.request<PikPakFile & { error_code?: number }>(
      "GET",
      `${DRIVE_API_BASE}/drive/v1/files/${fileId}`
    );
    if (resp.error_code) return null;
    return resp;
  }
}

// ─── Singleton ────────────────────────────────────────────────

let _client: PikPakClient | null = null;

export function getPikPakClient(opts?: ConstructorParameters<typeof PikPakClient>[0]): PikPakClient {
  if (!_client) _client = new PikPakClient(opts);
  return _client;
}

export function resetPikPakClient(): void {
  _client = null;
}
