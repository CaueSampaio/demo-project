#!/bin/bash

set -e

# Development script for @better-bookkeeping/demo-project
# Usage: ./scripts/dev.sh [up|down]

COMPOSE_FILE="docker-compose.dev.yml"

case "${1}" in
  "up")
    echo "Shutting down existing services..."
    docker compose -f $COMPOSE_FILE down
    echo "Starting full development environment with watch mode..."

    # Run tsr watch in background and docker compose watch in foreground
    bunx tsr watch &
    TSR_PID=$!

    # Trap to kill tsr watch when script exits
    trap "kill $TSR_PID 2>/dev/null" EXIT

    # No --env-file: compose auto-reads the root .env for interpolation
    # (so PORT there is honored). Note compose does NOT read .env.local;
    # values that belong in .env.local go inside the container via the
    # env_file list in docker-compose.dev.yml, not interpolation.
    # USER_ID/GROUP_ID are interpolated from the shell env set below
    # (shell wins over .env) with sane compose defaults.
    USER_ID=$(id -u) GROUP_ID=$(id -g) docker compose -f $COMPOSE_FILE watch
    ;;
  "down")
    echo "Shutting down Docker services..."
    docker compose -f $COMPOSE_FILE down
    ;;
  *)
    echo "Usage: $0 [up|down]"
    echo "  up       - Start development environment"
    echo "  down      - Shut down all services"
    exit 1
    ;;
esac
