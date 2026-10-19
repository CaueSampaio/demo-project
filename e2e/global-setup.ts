import { execSync } from "node:child_process";
import net from "node:net";
import path from "node:path";

/** Repo root — this file lives in `e2e/`, one level below it. */
const REPO_ROOT = path.join(import.meta.dirname, "..");

const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/demo_project";

const PROBE_TIMEOUT_MS = 250;
const BOOT_TIMEOUT_MS = 30_000;
const BOOT_POLL_INTERVAL_MS = 500;

/** Single TCP reachability probe: resolves true if host:port accepts a connection. */
function probe(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const settle = (reachable: boolean) => {
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.once("connect", () => settle(true));
    socket.once("timeout", () => settle(false));
    socket.once("error", () => settle(false));
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Boots the compose Postgres service if nothing is listening on the configured
 * database, then applies migrations. Makes a test run self-sufficient: no
 * manual prerequisite, and a cold machine (no running database) still passes.
 */
export default async function globalSetup(): Promise<void> {
  const { hostname, port } = new URL(DATABASE_URL);
  const dbPort = Number(port);

  if (!(await probe(hostname, dbPort))) {
    execSync("docker compose -f docker-compose.dev.yml up -d postgres", {
      stdio: "inherit",
      cwd: REPO_ROOT,
    });

    const deadline = Date.now() + BOOT_TIMEOUT_MS;
    let reachable = false;
    while (!reachable && Date.now() < deadline) {
      reachable = await probe(hostname, dbPort);
      if (!reachable) await sleep(BOOT_POLL_INTERVAL_MS);
    }
    if (!reachable) {
      throw new Error(
        `Postgres at ${hostname}:${dbPort} never became reachable within ${BOOT_TIMEOUT_MS} ms ` +
          `after "docker compose -f docker-compose.dev.yml up -d postgres".`,
      );
    }
  }

  execSync("bunx prisma migrate deploy", { stdio: "inherit", cwd: REPO_ROOT });
}
