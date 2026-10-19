import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";
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

function createLimiter(bucket: RateLimitBucket): RateLimiterMemory {
  const { limit, windowMs } = RATE_LIMITS[bucket];
  return new RateLimiterMemory({
    keyPrefix: bucket,
    points: limit,
    duration: windowMs / 1000,
    execEvenly: false,
  });
}

// Single-process only: state is not shared across instances or restarts.
let limiters: Record<RateLimitBucket, RateLimiterMemory> = {
  signIn: createLimiter("signIn"),
  createAccount: createLimiter("createAccount"),
};

export async function checkRateLimit(
  bucket: RateLimitBucket,
  ip: string,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  try {
    await limiters[bucket].consume(ip, 1);
    return { allowed: true, retryAfterSeconds: 0 };
  } catch (rejection) {
    if (rejection instanceof RateLimiterRes) {
      return { allowed: false, retryAfterSeconds: Math.ceil(rejection.msBeforeNext / 1000) };
    }
    throw rejection;
  }
}

/**
 * Rebuilds both limiters; `RateLimiterMemory` has no bulk flush, so swapping the
 * instances is the only way to clear every key. Dev/e2e use only.
 */
export function resetRateLimits() {
  limiters = {
    signIn: createLimiter("signIn"),
    createAccount: createLimiter("createAccount"),
  };
}

// Fail-closed: an unresolvable IP keys a shared "unknown" bucket, so those
// clients are still limited rather than bypassing the limiter.
export function getClientIp(): string {
  if (TRUST_XFF) {
    return getRequestIP({ xForwardedFor: true }) ?? "unknown";
  }
  return getRequestIP() ?? "unknown";
}
