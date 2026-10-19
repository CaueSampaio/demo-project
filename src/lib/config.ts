import { useMemo } from "react";

// Public, isomorphic config (no secrets): read by the client and during SSR
// (root route). Deliberately NOT named `*.client.*` — that suffix is denied in
// the server graph by TanStack Start's import-protection default file rule.

export interface ClientConfig {
  environment: "development" | "test" | "staging" | "production";
}

function resolveClientEnv(key: string): string {
  if (!key.startsWith("VITE_")) throw new Error(`Client environment variable must start with "VITE_": ${key}`);
  if (typeof window !== "undefined") {
    const value = import.meta.env[key];
    if (value) return value;
  }
  const value = process.env[key];
  if (value) return value;
  throw new Error(`Missing environment variable: ${key}`);
}

let _clientConfig: ClientConfig | null = null;
export function getClientConfig(): ClientConfig {
  if (_clientConfig) return _clientConfig;
  _clientConfig = {
    environment: resolveClientEnv("VITE_ENVIRONMENT") as "development" | "test" | "staging" | "production",
  };
  console.log("Client configuration loaded:", _clientConfig);
  return _clientConfig;
}

export function useClientConfig(): ClientConfig {
  const config = useMemo(() => getClientConfig(), []);
  return config;
}
