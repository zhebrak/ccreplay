#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"
npm run build --silent 2>&1
node dist/cli.js \
  --font-size 20 \
  -o media/demo.mp4 \
  test/fixtures/demo-session.jsonl
