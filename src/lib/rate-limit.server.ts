import { getRequestIP } from "@tanstack/react-start/server";

export type RateLimitBucket = "signIn" | "createAccount";

export const RATE_LIMITS: Record<RateLimitBucket, { limit: number; windowMs: number }> = {
  signIn: { limit: 5, windowMs: 60_000 },
  createAccount: { limit: 3, windowMs: 60_000 },
};

// TRUST_PROXY=1 opts into trusting X-Forwarded-For (valid only behind an
// IP-overwriting proxy); while directly exposed, trusting it lets any client
// spoof per-IP buckets and bypass the limit. Read once; requires restart after changing.
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

// Single-process only: state is not shared across instances or restarts.
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

// Fail-closed: an unresolvable IP keys a shared "unknown" bucket, so those
// clients are still limited rather than bypassing the limiter.
export function getClientIp(): string {
  if (TRUST_XFF) {
    return getRequestIP({ xForwardedFor: true }) ?? "unknown";
  }
  return getRequestIP() ?? "unknown";
}
