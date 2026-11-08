#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH=$(realpath "$0")
TASK_PATH=$(dirname "$SCRIPT_PATH")
THEHULK_PATH=$(realpath "$TASK_PATH/../..")

if ! timeout 2 bash -c '</dev/tcp/127.0.0.1/8899' 2>/dev/null; then
  echo "TheHulk proxy is not listening on 127.0.0.1:8899." >&2
  echo "Start it in another terminal: cd '$THEHULK_PATH/proxy-server' && ./setup.sh" >&2
  exit 1
fi

cd "$THEHULK_PATH/gadget-detection/runtime-analysis"
npm run deploy

cd "$THEHULK_PATH/crawler/src"
exec node ./scheduler.js \
  --scheduler-config "$TASK_PATH/config.scheduler.yml" \
  --crawler-config "$TASK_PATH/config.browser.yml"
