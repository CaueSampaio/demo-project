import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { configService } from "./config.server";
import { csrfMiddleware } from "./csrf.server";

export type RateLimitBucket = "signIn" | "createAccount";

/**
 * Fixed-window limits per unauthenticated auth endpoint. Windows are counted
 * per client IP; once `limit` requests land inside a window, further requests
 * are rejected until the window elapses.
 */
export const RATE_LIMITS: Record<RateLimitBucket, { limit: number; windowMs: number }> = {
  signIn: { limit: 5, windowMs: 60_000 },
  createAccount: { limit: 3, windowMs: 60_000 },
};

const buckets = new Map<string, { count: number; windowStart: number }>();

/**
 * In-memory fixed-window rate limiter keyed by `${bucket}:${ip}`.
 * Suitable for single-process deployments only; state does not survive
 * restarts and is not shared across instances.
 */
export function checkRateLimit(
  bucket: RateLimitBucket,
  ip: string,
): { allowed: boolean; retryAfterSeconds: number } {
  const { limit, windowMs } = RATE_LIMITS[bucket];
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  entry.count += 1;
  if (entry.count > limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.windowStart + windowMs - now) / 1000) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Clears every rate-limit bucket. Dev/e2e use only. */
export function resetRateLimits() {
  buckets.clear();
}

/**
 * Resolves the client IP for rate-limit keying. Falls back to a shared
 * "unknown" bucket when the IP cannot be determined (fail-closed: those
 * clients still get limited, against the same limits).
 */
export function getClientIp(): string {
  return getRequestIP({ xForwardedFor: true }) ?? "unknown";
}

/**
 * Dev/e2e-only hook that clears all rate-limit buckets. Throws when invoked
 * in a production environment so the limiter can never be disarmed there.
 */
export const resetRateLimitsServerFn = createServerFn({ method: "POST" })
  .middleware([csrfMiddleware])
  .handler(() => {
  if (configService.getAppConfig().environment === "production") {
    throw new Error("Rate-limit reset is not available in production");
  }
  resetRateLimits();
  return { ok: true as const };
});
