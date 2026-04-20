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

  constructor(opts?: { tokenPath?: string; deviceId?: string; refreshToken?: string }) {
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
      "X-Device-ID": this.auth.deviceId,
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
      logger.warn("API error response", { error_code: data.error_code, error: data.error, url: fullUrl, body: opts?.body });
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
    const filters = JSON.stringify({
      trashed: { eq: false },
      phase: { eq: "PHASE_TYPE_COMPLETE" },
    });
    const params: Record<string, string> = {
      ...(parentId ? { parent_id: parentId } : {}),
      page_size: String(pageSize),
      with_audit: "false",
      filters,
    };
    const resp = await this.request<FileListResponse>(
      "GET",
      `${DRIVE_API_BASE}/drive/v1/files`,
      { params }
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
          ...(parentId ? { parent_id: parentId } : {}),
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
    let parentId = "";  // empty string = root in PikPak

    for (const part of parts) {
      parentId = await this.ensureFolder(parentId, part);
    }

    return parentId;
  }

  /** Find or create a single folder by name under a parent */
  async ensureFolder(parentId: string, name: string): Promise<string> {
    try {
      const files = await this.listFiles(parentId);
      const existing = files.find((f) => f.kind === "drive#folder" && f.name === name);
      if (existing) {
        logger.debug("Folder exists", { name, id: existing.id });
        return existing.id;
      }
    } catch {
      logger.debug("listFiles failed, will try create", { parentId, name });
    }

    const created = await this.createFolder(parentId, name);
    if (!created) throw new Error(`Failed to create folder: ${name}`);
    logger.info("Folder created", { name, id: created.id });
    return created.id;
  }

  async getFileDetails(fileId: string): Promise<PikPakFile | null> {
    const resp = await this.request<PikPakFile & { error_code?: number }>(
      "GET",
      `${DRIVE_API_BASE}/drive/v1/files/${fileId}`
    );
    if (resp.error_code) return null;
    return resp;
  }

  /**
   * Upload a small file (< 1MB) to PikPak via resumable upload.
   * Suitable for danmaku XML and similar tiny files.
   */
  async uploadSmallFile(
    parentId: string,
    fileName: string,
    content: string | Uint8Array
  ): Promise<PikPakFile | null> {
    logger.info("Uploading small file", { parentId, fileName, bytes: content.length });

    const data = typeof content === "string" ? new TextEncoder().encode(content) : content;

    // Step 1: Create file entry with resumable upload
    const sha1Hash = new Bun.CryptoHasher("sha1").update(data).digest("hex");

    const body = {
      kind: "drive#file",
      parent_id: parentId,
      name: fileName,
      size: String(data.length),
      hash: sha1Hash.toUpperCase(),
      upload_type: "UPLOAD_TYPE_RESUMABLE",
    };

    const createResp = await this.request<{
      file?: PikPakFile;
      resumable?: {
        kind: string;
        provider: string;
        params: {
          endpoint: string;
          bucket: string;
          key: string;
          access_key_id: string;
          access_key_secret: string;
          security_token?: string;
          expiration: string;
          access_url?: string;
        };
      };
      error_code?: number;
      error?: string;
    }>("POST", `${DRIVE_API_BASE}/drive/v1/files`, { body });

    if (createResp.error_code) {
      logger.error("File creation failed", { error: createResp.error, error_code: createResp.error_code });
      return null;
    }

    logger.debug("File creation response", { resumable: JSON.stringify(createResp.resumable)?.slice(0, 300) });

    const params = createResp.resumable?.params;
    if (!params?.endpoint || !params?.key) {
      // File deduped - PikPak already has this content
      logger.info("No upload endpoint returned, file may be deduped", { fileName });
      return createResp.file ?? null;
    }

    // Step 2: Upload to Aliyun OSS using STS credentials
    const ossUrl = `https://${params.bucket}.${params.endpoint}/${params.key}`;
    const date = new Date().toUTCString();
    const contentType = "application/octet-stream";

    // Build OSS signature: HMAC-SHA1 of "PUT\n\n{contentType}\n{date}\nx-oss-security-token:{token}\n/{bucket}/{key}"
    const canonicalHeaders = params.security_token
      ? `x-oss-security-token:${params.security_token}\n`
      : "";
    const stringToSign = `PUT\n\n${contentType}\n${date}\n${canonicalHeaders}/${params.bucket}/${params.key}`;

    const hmac = new Bun.CryptoHasher("sha1", params.access_key_secret);
    hmac.update(stringToSign);
    const signature = Buffer.from(hmac.digest()).toString("base64");

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Length": String(data.length),
      Date: date,
      Authorization: `OSS ${params.access_key_id}:${signature}`,
    };
    if (params.security_token) {
      headers["x-oss-security-token"] = params.security_token;
    }

    logger.debug("Upload to OSS", { ossUrl: ossUrl.slice(0, 120), bucket: params.bucket });

    const uploadResp = await fetch(ossUrl, {
      method: "PUT",
      headers,
      body: data,
    });

    if (!uploadResp.ok) {
      const respText = await uploadResp.text();
      logger.error("File upload failed", { status: uploadResp.status, fileName, body: respText.slice(0, 300) });
      return null;
    }

    logger.info("File uploaded successfully", { fileName, parentId });
    return createResp.file ?? null;
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
