import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

const config = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());

  // Dev-only shim: TanStack Start resolves its virtual modules only in the
  // server environment (see @tanstack/start-plugin-core dev-server-plugin
  // applyToEnvironment). When a stale/hydration-race transform paths the
  // client env to import "tanstack-start-injected-head-scripts:v"
  // (dynamic import inside router-manifest.js), vite:import-analysis can't
  // resolve it -> 500 with empty content-type -> browser "disallowed MIME
  // type" -> hydration dies. This makes the id resolvable everywhere; the
  // real server module is still provided by the Start plugin, whose hook
  // runs for the server env first.
  // Registered only in development mode (see plugins below), so a prod build
  // never even loads it.
  const devVirtualModuleShim: Plugin = {
    name: "demo-project:dev-virtual-module-shim",
    enforce: "pre",
    // Scope to the client environment: with `enforce: "pre"` this hook runs
    // before the Start plugin, so without this the shim would also shadow the
    // real server-env module and blank out injectedHeadScripts (dropping the
    // dev React Refresh preamble). The server env keeps using the Start
    // plugin's module, exactly as the comment above requires.
    applyToEnvironment: (environment) =>
      environment.config.consumer === "client",
    resolveId(id) {
      if (id.endsWith("tanstack-start-injected-head-scripts:v")) return "\0" + id;
      return null;
    },
    load(id) {
      if (id === "\0tanstack-start-injected-head-scripts:v") {
        return "export default { injectedHeadScripts: undefined };\n";
      }
      return null;
    },
  };

  return {
    plugins: [
      // this is the plugin that enables path aliases
      viteTsConfigPaths({
        projects: ["./tsconfig.json"],
      }),
      tailwindcss(),
      tanstackStart(),
      nitro({
        preset: "node-server",
        // Bun resolves package exports with the "bun" condition (e.g.
        // react-dom/server -> server.bun.js); tracing must match the runtime.
        exportConditions: ["bun", "node"],
      }),
      viteReact(),
      // Dev-only: prod builds never even load the shim.
      ...(mode === "development" ? [devVirtualModuleShim] : []),
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
