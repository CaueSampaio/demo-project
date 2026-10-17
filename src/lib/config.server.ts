class AppConfigService<ConfigType> {
  private config: ConfigType;
  constructor(inputFig: ConfigType) {
    this.config = inputFig;
  }
  isInitialized() {
    return !!this.config;
  }
  initialize() {
    this.config = this.config;
  }
  getAppConfig() {
    return this.config;
  }
}

const environment = (process.env.VITE_ENVIRONMENT || "development") as
  | "development"
  | "test"
  | "staging"
  | "production";

/**
 * Resolves the session cookie signing secret, exactly once, at module init.
 *
 * Module init is the deliberate fail-fast point: a missing secret outside
 * development must stop the process while it is starting. Resolving it on
 * demand (the first auth-touching request) instead lets a lazily-loaded
 * chunk swallow the throw into a confusing, message-less 500.
 */
function resolveCookieSecret(): string {
  const secret = process.env.COOKIE_SECRET;
  if (secret) return secret;

  // Safe fallback for local dev only; every other environment must provide it.
  if (environment === "development") {
    return "dev-secret-change-in-production";
  }

  throw new Error("COOKIE_SECRET is required in non-development environments");
}

export const configService = new AppConfigService({
  environment,
  database: { url: process.env.DATABASE_URL },
  cookieSecret: resolveCookieSecret(),
});
