import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

/**
 * Custom TanStack Start entry: because one exists, Start does not auto-install
 * its native CSRF middleware — register it here on `requestMiddleware`, filtered
 * to server functions (the same-origin RPC surface). Strict default kept:
 * requests without Sec-Fetch-Site/Origin/Referer are rejected (403).
 *
 * The dev-only `/api/dev-reset-rate-limits` file route is not a server function,
 * so this filter skips it; that route installs the same middleware itself.
 */
export const startInstance = createStart(() => ({
  requestMiddleware: [createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" })],
}));
