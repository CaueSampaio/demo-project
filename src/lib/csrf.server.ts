import { createMiddleware } from "@tanstack/react-start";
import { getRequest, getRequestHost } from "@tanstack/react-start/server";

/**
 * Resolves the Origin-header verdict for a mutating request.
 *
 * Missing-Origin policy: ACCEPT. Non-browser clients (curl, scripts, our
 * e2e request-context calls) send no Origin and cannot be CSRF-stopped;
 * this check only guards browsers, which always supply it on POSTs.
 * Malformed Origin is rejected (never a same-origin browser request).
 */
export function originMismatch(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return true;
  }
  return originHost !== getRequestHost();
}

/**
 * Origin-check CSRF middleware for mutating (POST) server functions.
 *
 * Browsers send Origin on cross-site POSTs; if it doesn't match our host the
 * request is forged (e.g. a cross-site form auto-submitted by an attacker
 * page). GETs are skipped by design — they must remain side-effect-free.
 */
export const csrfMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();
  if (request.method !== "GET" && originMismatch(request)) {
    throw new Response("Forbidden", { status: 403 });
  }
  return next();
});
