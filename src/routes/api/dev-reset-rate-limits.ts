import { createCsrfMiddleware } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { configService } from "../../lib/config.server";
import { resetRateLimits } from "../../lib/rate-limit.server";

export const Route = createFileRoute("/api/dev-reset-rate-limits")({
  server: {
    // Dev-only endpoint: this is a file route, not a server function, so the
    // global CSRF middleware in `src/start.ts` (filtered to server functions)
    // does not cover it. Install the framework's CSRF middleware here instead
    // of the previous hand-rolled Origin-vs-Host check. The strict default
    // applies: callers must send same-origin browser metadata
    // (Sec-Fetch-Site/Origin/Referer) or the request is rejected with 403 —
    // the e2e reset hook sends an explicit same-origin Origin header.
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
