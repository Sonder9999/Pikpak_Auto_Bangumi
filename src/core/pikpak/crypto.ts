import { createHash } from "crypto";

/**
 * Generate captcha_sign for PikPak API.
 * Algorithm: iterative MD5 hashing with SALTS array.
 *
 * sign = CLIENT_ID + CLIENT_VERSION + PACKAGE_NAME + deviceId + timestamp
 * for each salt in SALTS:
 *   sign = md5(sign + salt)
 * return "1." + sign
 */
export function captchaSign(
  clientId: string,
  clientVersion: string,
  packageName: string,
  deviceId: string,
  timestamp: string,
  salts: string[]
): string {
  let sign = clientId + clientVersion + packageName + deviceId + timestamp;
  for (const salt of salts) {
    sign = createHash("md5")
      .update(sign + salt)
      .digest("hex");
  }
  return `1.${sign}`;
}
