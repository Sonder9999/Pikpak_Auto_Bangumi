/** PikPak client mode */
export type PikPakMode = "web" | "lib";

/** Stored token cache structure */
export interface PikPakTokenCache {
  username: string;
  accessToken: string;
  refreshToken: string;
  userId: string;
  webMode: boolean;
}

/** PikPak API error response */
export interface PikPakError {
  error_code?: number;
  error?: string;
  error_description?: string;
}

/** Auth token response from /v1/auth/signin or /v1/auth/token */
export interface AuthTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  sub: string; // user_id
  error_code?: number;
  error?: string;
  error_description?: string;
}

/** Captcha init response */
export interface CaptchaInitResponse {
  captcha_token: string;
  expires_in?: number;
  error_code?: number;
}

/** Offline download task creation response */
export interface OfflineTaskResponse {
  task?: {
    id: string;
    name: string;
    type: string;
    phase: string;
    progress: number;
    file_id: string;
    file_name: string;
  };
  upload_type?: string;
  file?: {
    id: string;
    name: string;
    kind: string;
    parent_id: string;
  };
  error_code?: number;
  error?: string;
}

/** Offline task list item */
export interface OfflineTask {
  id: string;
  name: string;
  type: string;
  phase: string; // PHASE_TYPE_RUNNING, PHASE_TYPE_COMPLETE, PHASE_TYPE_ERROR
  progress: number;
  file_id: string;
  file_name: string;
  message?: string;
  created_time: string;
  updated_time: string;
}

/** File list response */
export interface FileListResponse {
  files: PikPakFile[];
  next_page_token?: string;
  error_code?: number;
}

/** PikPak file/folder */
export interface PikPakFile {
  id: string;
  name: string;
  kind: string; // "drive#file" or "drive#folder"
  parent_id: string;
  size: string;
  mime_type?: string;
  web_content_link?: string;
  created_time: string;
  modified_time: string;
}
