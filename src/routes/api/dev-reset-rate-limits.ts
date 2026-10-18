import { createFileRoute } from "@tanstack/react-router";
import { configService } from "../../lib/config.server";
import { resetRateLimits } from "../../lib/rate-limit.server";
import { originMismatch } from "../../lib/csrf.server";

export const Route = createFileRoute("/api/dev-reset-rate-limits")({
  server: {
    handlers: {
      POST: ({ request }: { request: Request }) => {
        if (configService.getAppConfig().environment === "production") {
          return new Response("Not available in production", { status: 403 });
        }
        if (originMismatch(request)) {
          return new Response("Forbidden", { status: 403 });
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
