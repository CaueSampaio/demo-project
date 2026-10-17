import crypto from "node:crypto";
import type { Cookie } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../prisma/generated/client/client";

const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/demo_project";

const COOKIE_SECRET = process.env.E2E_COOKIE_SECRET ?? "change-me-in-production";

const sessionCookieName: string = "session";

let _prismaClient: PrismaClient | null = null;

function getTestPrismaClient(): PrismaClient {
  if (!_prismaClient) {
    const adapter = new PrismaPg({ connectionString: DATABASE_URL });
    _prismaClient = new PrismaClient({ adapter });
  }
  return _prismaClient;
}

/**
 * Creates a throwaway user directly in the dev database for e2e tests.
 */
export async function createTestUser(): Promise<{ id: string; email: string }> {
  const prisma = getTestPrismaClient();
  const user = await prisma.user.create({
    data: {
      email: `e2e-${crypto.randomUUID()}@test.local`,
      name: "E2E User",
      password: "e2test-password",
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
