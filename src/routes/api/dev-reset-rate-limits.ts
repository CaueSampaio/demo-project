import { createFileRoute } from "@tanstack/react-router";
import { configService } from "../../lib/config.server";
import { resetRateLimits } from "../../lib/rate-limit.server";

export const Route = createFileRoute("/api/dev-reset-rate-limits")({
  server: {
    handlers: {
      POST: ({ request }: { request: Request }) => {
        if (configService.getAppConfig().environment === "production") {
          return new Response("Not available in production", { status: 403 });
        }
        // Dev-only route: origin check via Origin vs Host headers (equivalent
        // to originMismatch in csrf.server.ts; that helper needs
        // @tanstack/react-start/server, which must not be statically imported
        // into client-visible files — see the root-cause note there).
        const origin = request.headers.get("origin");
        if (origin) {
          let originHost: string | null = null;
          try {
            originHost = new URL(origin).host;
          } catch {
            return new Response("Forbidden", { status: 403 });
          }
          if (!originHost || originHost !== (request.headers.get("host") ?? "")) {
            return new Response("Forbidden", { status: 403 });
          }
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
