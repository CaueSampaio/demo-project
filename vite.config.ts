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
      tanstackStart({
        // Import protection: keep the default *specifier* guards
        // (`@tanstack/*-start/server` may not be bundled into client code,
        // `@tanstack/*-start/client*` may not leak into server code) but drop
        // the default filename rules (`**/*.server.*` on the client,
        // `**/*.client.*` on the server).
        //
        // The filename rules assume `createServerFn` wrappers live in
        // `*.functions.ts` and that `*.client.*` modules are never imported by
        // SSR code. This project predates that layout: the wrappers live in
        // `*.server.ts` (imported by client-visible routes — the server-function
        // compiler replaces them with RPC stubs) and `RootDocument` reads
        // `config.client.ts` during SSR (it has a `process.env` fallback). The
        // file rules therefore both mock-break dev server-fn calls and fail the
        // production build. Migrating to the documented `<name>.functions.ts`
        // layout is tracked as future work; until then the filename rules are
        // relaxed while the specifier guards stay active.
        importProtection: {
          client: { files: [] },
          server: { files: [] },
        },
      }),
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
