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
      tanstackStart(),
      nitro({
        preset: "node-server",
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
