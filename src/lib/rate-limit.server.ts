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

// Whether client-supplied X-Forwarded-For may be trusted as the rate-limit key.
// Only enable behind an IP-overwriting proxy (e.g. `TRUST_PROXY=1` in the
// reverse proxy's environment); with direct exposure, trusting XFF lets any
// client spoof per-IP buckets and bypass the limit.
// NOTE: this is read once at module init — a restart is required after changing it.
const TRUST_XFF = process.env.TRUST_PROXY === "1";

const buckets = new Map<string, { count: number; windowStart: number }>();

/** Soft cap on tracked buckets; guards against unbounded memory growth. */
const MAX_BUCKETS = 10_000;

function pruneExpired(now: number) {
  for (const [key, entry] of buckets) {
    if (now - entry.windowStart >= RATE_LIMITS[bucketOf(key)].windowMs) {
      buckets.delete(key);
    }
  }
}

function bucketOf(key: string): RateLimitBucket {
  return (key.split(":", 1)[0] ?? "signIn") as RateLimitBucket;
}

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
  if (entry && now - entry.windowStart >= windowMs) {
    buckets.delete(key);
  }
  if (!entry || now - entry.windowStart >= windowMs) {
    if (buckets.size >= MAX_BUCKETS) {
      pruneExpired(now);
      if (buckets.size >= MAX_BUCKETS) {
        // Still over the soft cap: shed the oldest windows by insertion order.
        let excess = buckets.size - MAX_BUCKETS + 1;
        for (const key of buckets.keys()) {
          if (excess-- <= 0) break;
          buckets.delete(key);
        }
      }
    }
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
  if (TRUST_XFF) {
    return getRequestIP({ xForwardedFor: true }) ?? "unknown";
  }
  // Socket IP only — client-supplied XFF headers are not trusted when the app
  // is exposed directly (no IP-overwriting proxy in front).
  return getRequestIP() ?? "unknown";
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
