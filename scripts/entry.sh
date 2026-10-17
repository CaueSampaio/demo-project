#!/usr/bin/env bash

set -euo pipefail

exec bun .output/server/index.mjs
