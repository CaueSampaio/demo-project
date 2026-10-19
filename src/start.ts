import { createStart } from "@tanstack/react-start";
import { csrfMiddleware } from "./lib/csrf.server";

/**
 * Custom TanStack Start entry.
 *
 * TanStack Start resolves `src/start.ts` automatically (see the Start vite
 * plugin's entry resolution: `start.entry`, defaulting to `start` inside
 * `src/`) and uses it instead of the packaged default entry. Registering the
 * CSRF check here runs it for EVERY server function, instead of re-attaching
 * `.middleware([csrfMiddleware])` at each `createServerFn({ method: "POST" })`
 * site.
 *
 * `createStart` takes a getter returning the options. Global function
 * middleware runs before each server fn's own middleware (see
 * `executeMiddleware` in `@tanstack/start-client-core`).
 */
export const startInstance = createStart(() => ({
  functionMiddleware: [csrfMiddleware],
}));
