import { Elysia } from "elysia";
import { createLogger } from "../../core/logger.ts";
import { getConfig } from "../../core/config/config.ts";

const logger = createLogger("auth-middleware");

/** JWT auth plugin for ElysiaJS.
 * - Validates Bearer token in Authorization header.
 * - Skips auth for health check.
 * - Uses HS256 HMAC with jwtSecret from config. */
export const jwtAuth = new Elysia({ name: "jwt-auth" })
  .derive({ as: "global" }, ({ request }) => {
    const config = getConfig();
    const secret = config.general.jwtSecret;

    // If no JWT secret configured, skip auth entirely
    if (!secret) {
      return { userId: "anonymous" };
    }

    const url = new URL(request.url);
    // Skip auth for health check
    if (url.pathname === "/api/health") {
      return { userId: "anonymous" };
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return { userId: null as string | null };
    }

    const token = authHeader.slice(7);
    try {
      const payload = verifyJwt(token, secret);
      return { userId: payload.sub ?? "authenticated" };
    } catch (e) {
      logger.warn("JWT verification failed", { error: String(e) });
      return { userId: null as string | null };
    }
  })
  .onBeforeHandle({ as: "global" }, ({ userId, request, set }) => {
    const config = getConfig();
    if (!config.general.jwtSecret) return; // No auth required

    const url = new URL(request.url);
    if (url.pathname === "/api/health") return;
    if (!url.pathname.startsWith("/api/")) return;

    if (!userId) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
  });

/** Simple JWT sign (HS256) */
export function signJwt(payload: Record<string, unknown>, secret: string, expiresInSec = 86400): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const now = Math.floor(Date.now() / 1000);
  const body = btoa(JSON.stringify({ ...payload, iat: now, exp: now + expiresInSec }))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const signature = hmacSha256(`${header}.${body}`, secret);
  return `${header}.${body}.${signature}`;
}

/** Simple JWT verify (HS256) */
export function verifyJwt(token: string, secret: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");

  const [header, body, sig] = parts;
  const expectedSig = hmacSha256(`${header}.${body}`, secret);
  if (sig !== expectedSig) throw new Error("Invalid JWT signature");

  const payload = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error("JWT expired");

  return payload;
}

function hmacSha256(data: string, secret: string): string {
  const hasher = new Bun.CryptoHasher("sha256", secret);
  hasher.update(data);
  const buf = hasher.digest();
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
