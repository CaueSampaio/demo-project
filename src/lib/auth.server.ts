import crypto from "node:crypto";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { sessionCookieName } from "./auth.consts";
import { configService } from "./config.server";

// Resolved and fail-fast validated at config init; never re-read process.env here.
const COOKIE_SECRET = configService.getAppConfig().cookieSecret;

/**
 * Signs a user ID to create a tamper-proof session token
 */
function signUserId(userId: string): string {
  const signature = crypto.createHmac("sha256", COOKIE_SECRET).update(userId).digest("hex");
  return `${userId}.${signature}`;
}

/**
 * Constant-time string compare: both sides are SHA-256-hashed first so
 * `timingSafeEqual`'s equal-length requirement is met without leaking lengths.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Verifies a signed session token and returns the user ID if valid
 */
function verifySessionToken(token: string): string | null {
  const [userId, signature] = token.split(".");
  if (!userId || !signature) return null;

  const expectedSignature = crypto.createHmac("sha256", COOKIE_SECRET).update(userId).digest("hex");
  // Constant-time compare: early-exit equality would leak the HMAC via timing.
  if (!constantTimeEqual(signature, expectedSignature)) return null;

  return userId;
}

/**
 * Sets the session cookie for a user (internal use only)
 */
export function setSessionCookie(userId: string) {
  const token = signUserId(userId);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  setCookie(sessionCookieName, token, {
    path: "/",
    httpOnly: true,
    // Fail-closed: secure on every non-development env (VITE_ENVIRONMENT is
    // provisioned at build and runtime; NODE_ENV is unreliable at runtime).
    secure: configService.getAppConfig().environment !== "development",
    sameSite: "lax",
    expires: expiresAt,
  });
}

/**
 * Reads and verifies the session cookie, returning the user ID if valid.
 * Server-only: the cookie accessors live in `@tanstack/react-start/server`.
 */
export function getSessionUserId(): string | null {
  const sessionToken = getCookie(sessionCookieName);
  if (!sessionToken) return null;
  return verifySessionToken(sessionToken);
}

/**
 * Clears the session cookie (internal use only)
 */
export function clearSessionCookie() {
  // Delete must mirror the set attributes (path/domain) or browsers ignore it.
  deleteCookie(sessionCookieName, { path: "/" });
}
