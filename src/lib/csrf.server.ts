import { createMiddleware } from "@tanstack/react-start";

/**
 * Resolves the Origin-header verdict for a mutating request.
 *
 * Missing-Origin policy: ACCEPT. Non-browser clients (curl, scripts, our
 * e2e request-context calls) send no Origin and cannot be CSRF-stopped;
 * this check only guards browsers, which always supply it on POSTs.
 * Malformed Origin is rejected (never a same-origin browser request).
 *
 * Importantly, this is a PURE function: it receives the request (or its host)
 * as an argument, so it can never be the reason for a top-level
 * `@tanstack/react-start/server` import.
 */
export function originMismatch(request: Request, requestHost: string): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return true;
  }
  return originHost !== requestHost;
}

/**
 * Origin-check CSRF middleware for mutating (POST) server functions.
 *
 * Browsers send Origin on cross-site POSTs; if it doesn't match our host the
 * request is forged (e.g. a cross-site form auto-submitted by an attacker
 * page). GETs are skipped by design — they must remain side-effect-free.
 *
 * ROOT-CAUSE NOTE (dev hydration failure): the request helpers from
 * `@tanstack/react-start/server` must ONLY be reachable from this `.server`
 * handler. `@tanstack/react-start/server` is a server-only barrel
 * (react-start-server → start-server-core → @tanstack/react-router/ssr →
 * react-dom/server); importing it at module top level from a client-loaded
 * module drags the whole SSR render runtime into the browser module graph in
 * dev, where react-dom/server.browser.js is CJS and the ESM import dies
 * ("does not provide an export named 'default'") — killing hydration
 * (`hydrated: false`) on EVERY page.
 *
 * `src/start.ts` is TanStack Start's SHARED entry: the client's hydrateStart
 * imports it too, so anything statically imported there must be client-safe.
 * `createMiddleware(...).server(cb)` itself is client-safe (the cb is a
 * client stub), hence the lazy dynamic import below — on the client it is
 * never even fetched (no static analysis edge), on the server it resolves to
 * the real request-context helpers.
 */
export const csrfMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { getRequest, getRequestHost } = await import("@tanstack/react-start/server");
  const request = getRequest();
  if (request.method !== "GET" && originMismatch(request, getRequestHost())) {
    throw new Response("Forbidden", { status: 403 });
  }
  return next();
});
