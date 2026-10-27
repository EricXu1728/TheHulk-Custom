#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH=$(realpath "$0")
TASK_PATH=$(dirname "$SCRIPT_PATH")
THEHULK_PATH=$(realpath "$TASK_PATH/../..")

cd "$THEHULK_PATH/crawler/src"
exec node ./scheduler.js \
  --scheduler-config "$TASK_PATH/config.scheduler.yml" \
  --crawler-config "$TASK_PATH/config.browser.yml"
