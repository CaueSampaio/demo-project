import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

const config = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());

  return {
    plugins: [
      // this is the plugin that enables path aliases
      viteTsConfigPaths({
        projects: ["./tsconfig.json"],
      }),
      tailwindcss(),
      // Defaults only: client code cannot import `**/*.server.*` (and never the
      // `@tanstack/*-start/server` specifiers); server code cannot import
      // `**/*.client.*`. Server functions live in `*.functions.ts` (client-safe
      // RPC stubs), server-only helpers in `*.server.ts` (reached only via
      // `await import(...)` inside handler bodies). No overrides needed.
      tanstackStart(),
      nitro({
        preset: "node-server",
        // Bun resolves package exports with the "bun" condition (e.g.
        // react-dom/server -> server.bun.js); tracing must match the runtime.
        exportConditions: ["bun", "node"],
      }),
      viteReact(),
    ],
    build: {
      sourcemap: env.VITE_ENVIRONMENT === "development" || env.VITE_ENVIRONMENT === "test",
    },
    server: {
      allowedHosts: ["onboarding.abacus.local"],
      watch: { usePolling: true },
    },
  };
});

export default config;
