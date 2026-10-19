import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Gets the current user from session cookie
 * @returns User object or null if not logged in
 */
export const getUserServerFn = createServerFn().handler(async () => {
  const { getSessionUserId } = await import("@/lib/auth.server");
  const { getServerSidePrismaClient } = await import("@/lib/db.server");

  const userId = getSessionUserId();
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
    const { checkRateLimit, getClientIp } = await import("@/lib/rate-limit.server");
    const rl = await checkRateLimit("signIn", getClientIp());
    if (!rl.allowed) return { success: false as const, error: "Too many attempts. Try again shortly." };

    const { email, password } = data;

    const { constantTimeEqual, setSessionCookie } = await import("@/lib/auth.server");
    const { getServerSidePrismaClient } = await import("@/lib/db.server");
    const { hashPassword, isPasswordHash, verifyPassword } = await import("@/lib/password.server");

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
    const { checkRateLimit, getClientIp } = await import("@/lib/rate-limit.server");
    const rl = await checkRateLimit("createAccount", getClientIp());
    if (!rl.allowed) return { success: false as const, error: "Too many attempts. Try again shortly." };

    const { email, name, password } = data;

    const { setSessionCookie } = await import("@/lib/auth.server");
    const { getServerSidePrismaClient } = await import("@/lib/db.server");
    const { hashPassword } = await import("@/lib/password.server");

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
    const { clearSessionCookie } = await import("@/lib/auth.server");
    clearSessionCookie();
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
