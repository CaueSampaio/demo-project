import { createFileRoute } from "@tanstack/react-router";
import { configService } from "../../lib/config.server";
import { resetRateLimits } from "../../lib/rate-limit.server";

export const Route = createFileRoute("/api/dev-reset-rate-limits")({
  server: {
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
