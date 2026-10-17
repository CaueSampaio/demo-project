#!/usr/bin/env bash
set -euo pipefail

# Evaluate server config before starting so boot-time validation (required
# COOKIE_SECRET outside development) aborts startup with the real message
# instead of surfacing on the first, lazily-loaded SSR request.
bun -e 'await import("./src/lib/config.server.ts")'

exec bun .output/server/index.mjs
