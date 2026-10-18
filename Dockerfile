# dependencies
FROM imbios/bun-node:1.3.1-22-slim AS deps

ARG USER_ID=1000
ARG GROUP_ID=1000

# Create non-root user
RUN groupadd -g ${GROUP_ID} appgroup || true && \
    useradd -u ${USER_ID} -g ${GROUP_ID} -m appuser || true

WORKDIR /app
COPY --chown=${USER_ID}:${GROUP_ID} . .
RUN apt-get update && apt-get install -y openssl curl gettext-base && rm -rf /var/lib/apt/lists/*

RUN bun install --frozen-lockfile && chown -R ${USER_ID}:${GROUP_ID} /app

RUN bun run generate

# development
FROM deps AS development
WORKDIR /app
CMD ["bun", "--bun", "vite", "dev", "--host", "0.0.0.0", "--port", "3000"]

# production
FROM deps AS production
WORKDIR /app
ARG NODE_ENV
# VITE_ENVIRONMENT must be available at build time (import.meta.env baking takes
# priority over .env files) and at runtime (server-side process.env reads).
ARG VITE_ENVIRONMENT=production
ENV NODE_ENV=$NODE_ENV \
    VITE_ENVIRONMENT=$VITE_ENVIRONMENT
RUN bun run build
USER appuser
CMD ["./scripts/entry.sh"]
