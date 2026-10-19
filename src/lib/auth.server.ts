import crypto from "node:crypto";
import { redirect } from "@tanstack/react-router";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { sessionCookieName } from "./auth.consts";
import { configService } from "./config.server";
import { getServerSidePrismaClient } from "./db.server";
import { hashPassword, isPasswordHash, verifyPassword } from "./password.server";
import { checkRateLimit, getClientIp } from "./rate-limit.server";
import { z } from "zod";

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
function constantTimeEqual(a: string, b: string): boolean {
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
function setSessionCookie(userId: string) {
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
 * Gets the current user from session cookie
 * @returns User object or null if not logged in
 */
export const getUserServerFn = createServerFn().handler(async () => {
  const sessionToken = getCookie(sessionCookieName);
  if (!sessionToken) {
    return null;
  }

  const userId = verifySessionToken(sessionToken);
  if (!userId) {
    return null;
  }

  const prisma = await getServerSidePrismaClient();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, createdAt: true },
  });

  return user;
});

/**
 * Signs in a user with email and password
 */
export const signInServerFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: z.string().email(), password: z.string().min(1).max(128) }))
  .handler(async ({ data }: { data: { email: string; password: string } }) => {
    const rl = await checkRateLimit("signIn", getClientIp());
    if (!rl.allowed) return { success: false as const, error: "Too many attempts. Try again shortly." };

    const { email, password } = data;

    const prisma = await getServerSidePrismaClient();
    const user = await prisma.user.findUnique({
      where: { email },
    });

    let valid = false;
    if (user && isPasswordHash(user.password)) {
      valid = await verifyPassword(password, user.password);
      // A plaintext password starting with `$` is misrouted here and would lock
      // that user out; a direct compare can only match a known value, so it is safe.
      if (!valid && constantTimeEqual(password, user.password)) {
        valid = true;
      }
    } else if (user) {
      // Legacy plaintext row: compare directly, then lazily migrate.
      valid = constantTimeEqual(password, user.password);
    }
    if (user && valid && !isPasswordHash(user.password)) {
      // Lazy migration: rehash a legacy plaintext password to argon2id on
      // successful sign-in; rows already stored as hashes are left untouched.
      await prisma.user.update({
        where: { id: user.id },
        data: { password: await hashPassword(password) },
      });
    }

    if (!user || !valid) {
      return { success: false as const, error: "Invalid email or password" };
    }

    setSessionCookie(user.id);

    return { success: true as const };
  });

/**
 * Creates a new user account
 */
export const createAccountServerFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: z.email(), name: z.string().min(1), password: z.string().min(6).max(128) }))
  .handler(async ({ data }: { data: { email: string; name: string; password: string } }) => {
    const rl = await checkRateLimit("createAccount", getClientIp());
    if (!rl.allowed) return { success: false as const, error: "Too many attempts. Try again shortly." };

    const { email, name, password } = data;

    const prisma = await getServerSidePrismaClient();

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return { success: false as const, error: "An account with this email already exists" };
    }

    const user = await prisma.user.create({
      data: { email, name, password: await hashPassword(password) },
    });

    setSessionCookie(user.id);

    return { success: true as const };
  });

/**
 * Logs out the current user
 */
export const logoutServerFn = createServerFn({ method: "POST" })
  .handler(async () => {
  // Delete must mirror the set attributes (path/domain) or browsers ignore it.
  deleteCookie(sessionCookieName, { path: "/" });
  return { success: true };
});

/**
 * Authentication middleware that ensures user is logged in
 * @throws Redirects to sign-in page if not authenticated
 */
export const authMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const user = await getUserServerFn();
  if (!user) {
    throw redirect({ to: "/sign-in" });
  }

  return next({
    context: { user },
  });
});
