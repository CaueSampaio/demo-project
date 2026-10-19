import crypto from "node:crypto";
import type { Cookie } from "@playwright/test";
import { testPrisma } from "./db";

export { testPrisma };

const COOKIE_SECRET = process.env.E2E_COOKIE_SECRET ?? "change-me-in-production";

const sessionCookieName: string = "session";

export const E2E_TEST_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=2,p=1$5BE8E974lmIJ/giXJ3V8tq6/WBr7x5E4CWRbShve+cE$AKtw6jCqwG//EI70+DQlS9OXIXHIP/NZuBIOXxs8OZQ";

/**
 * Creates a throwaway user directly in the dev database for e2e tests.
 */
export async function createTestUser(password = "e2test-password"): Promise<{ id: string; email: string }> {
  if (password !== "e2test-password") {
    throw new Error("custom passwords unsupported — use the sign-up UI flow");
  }

  const user = await testPrisma.user.create({
    data: {
      email: `e2e-${crypto.randomUUID()}@test.local`,
      name: "E2E User",
      password: E2E_TEST_PASSWORD_HASH,
    },
  });
  return { id: user.id, email: user.email };
}

/**
 * Forges the signed session cookie the server would set, so tests skip the
 * auth flow. Signature matches src/lib/auth.server.ts (HMAC-SHA256 of the
 * user ID keyed with COOKIE_SECRET).
 */
export function sessionCookieFor(userId: string): Cookie[] {
  const signature = crypto.createHmac("sha256", COOKIE_SECRET).update(userId).digest("hex");
  return [
    {
      name: sessionCookieName,
      value: `${userId}.${signature}`,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ];
}
