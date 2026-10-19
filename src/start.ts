import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

/**
 * Custom TanStack Start entry.
 *
 * TanStack Start resolves `src/start.ts` automatically (see the Start vite
 * plugin's entry resolution: `start.entry`, defaulting to `start` inside
 * `src/`) and uses it instead of the packaged default entry. Because a custom
 * entry exists, the framework does NOT auto-install its built-in CSRF
 * middleware — we register it explicitly here (`requestMiddleware`), filtered
 * to server functions: the same-origin RPC surface that previously carried our
 * hand-rolled `csrfMiddleware` as global function middleware.
 *
 * `createCsrfMiddleware` validates same-origin browser request metadata via
 * `Sec-Fetch-Site`, `Origin`, or `Referer` and rejects requests that cannot be
 * proven same-origin. Its strict default is kept: requests that carry none of
 * those headers (and are not opted in via
 * `allowRequestsWithoutOriginCheck`) are rejected with 403.
 *
 * The dev-only `/api/dev-reset-rate-limits` file route is not a server
 * function, so this filter skips it; that route installs the same middleware
 * itself (see `src/routes/api/dev-reset-rate-limits.ts`).
 */
export const startInstance = createStart(() => ({
  requestMiddleware: [createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" })],
}));
