import { createMiddleware } from "@tanstack/react-start";
import { getRequest, getRequestHeader, getRequestHost } from "@tanstack/react-start/server";

/**
 * Origin-check CSRF middleware for mutating (POST) server functions.
 *
 * Browsers send Origin on cross-site POSTs; if it doesn't match our host the
 * request is forged (e.g. a cross-site form auto-submitted by an attacker
 * page). GETs are skipped by design — they must remain side-effect-free.
 */
export const csrfMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();
  if (request.method !== "GET") {
    const origin = getRequestHeader("origin");
    if (origin && new URL(origin).host !== getRequestHost()) {
      throw new Response("Forbidden", { status: 403 });
    }
  }
  return next();
});
