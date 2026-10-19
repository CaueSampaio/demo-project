import { defineConfig, devices } from "@playwright/test";

const TEST_PORT = 4173;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: { baseURL: `http://localhost:${TEST_PORT}`, trace: "on-first-retry" },
  webServer: {
    command: "bun run build && bun .output/server/index.mjs",
    port: TEST_PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      PORT: String(TEST_PORT),
      NITRO_PORT: String(TEST_PORT),
      // The production server reads these at runtime; a fresh worktree has no
      // untracked `.env.local`, so supplying them here keeps the run
      // self-sufficient. COOKIE_SECRET is inert for the tests — no helper
      // forges cookies — and matches the app's dev default (`.env.local.example`).
      VITE_ENVIRONMENT: "development",
      COOKIE_SECRET: "change-me-in-production",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
