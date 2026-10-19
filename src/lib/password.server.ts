const ARGON2ID = { algorithm: "argon2id" } as const;

export function isPasswordHash(value: string): boolean {
  return value.startsWith("$");
}

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, ARGON2ID);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await Bun.password.verify(password, hash);
  } catch {
    return false;
  }
}
