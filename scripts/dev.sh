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

    USER_ID=$(id -u) GROUP_ID=$(id -g) docker compose --env-file ".env.local" -f $COMPOSE_FILE watch
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
