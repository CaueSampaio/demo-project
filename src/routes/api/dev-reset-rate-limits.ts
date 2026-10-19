import { createCsrfMiddleware } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { configService } from "../../lib/config.server";
import { resetRateLimits } from "../../lib/rate-limit.server";

export const Route = createFileRoute("/api/dev-reset-rate-limits")({
  server: {
    // File route, not a server fn, so the global CSRF middleware in `src/start.ts`
    // (filtered to server fns) skips it — install it here. Strict default applies.
    middleware: [createCsrfMiddleware()],
    handlers: {
      POST: () => {
        if (configService.getAppConfig().environment === "production") {
          return new Response("Not available in production", { status: 403 });
        }
        resetRateLimits();
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
