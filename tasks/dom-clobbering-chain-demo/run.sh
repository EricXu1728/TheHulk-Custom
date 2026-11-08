#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH=$(realpath "$0")
TASK_PATH=$(dirname "$SCRIPT_PATH")
THEHULK_PATH=$(realpath "$TASK_PATH/../..")
SITE_DIR="$TASK_PATH/site"
MODE=${1:-clean}

case "$MODE" in
  clean)
    SCHEDULER_CONFIG="$TASK_PATH/config.scheduler.clean.yml"
    TEST_NAME="DOM-CLOBBERING-CHAIN-CLEAN"
    ;;
  seeded)
    SCHEDULER_CONFIG="$TASK_PATH/config.scheduler.chain.yml"
    TEST_NAME="DOM-CLOBBERING-CHAIN-SEEDED"
    ;;
  *)
    echo "Usage: $0 [clean|seeded]" >&2
    exit 2
    ;;
esac

port_is_open() {
  timeout 1 bash -c "</dev/tcp/127.0.0.1/$1" 2>/dev/null
}

if port_is_open 8003; then
  echo "Port 8003 is already in use; stop that service before running this demo." >&2
  exit 1
fi
if ! port_is_open 8899; then
  echo "The TheHulk proxy is not listening on port 8899." >&2
  echo "Start it in another terminal: cd '$THEHULK_PATH/proxy-server' && ./setup.sh" >&2
  exit 1
fi

python3 "$SITE_DIR/server.py" &
SERVER_PID=$!
cleanup() { kill "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

for attempt in {1..20}; do
  if port_is_open 8003; then break; fi
  if [[ "$attempt" -eq 20 ]]; then
    echo "Demo server did not start on port 8003." >&2
    exit 1
  fi
  sleep 0.25
done

(cd "$THEHULK_PATH/gadget-detection/runtime-analysis" && npm run deploy)
(cd "$THEHULK_PATH/crawler/src" && node ./scheduler.js \
  --scheduler-config "$SCHEDULER_CONFIG" \
  --crawler-config "$TASK_PATH/config.browser.yml")

OUTPUT_ROOT="$TASK_PATH/output/$MODE"
RUN_DIR=$(find "$OUTPUT_ROOT" -mindepth 1 -maxdepth 1 -type d \
  -name "$TEST_NAME-*" -printf '%T@ %p\n' \
  | sort -nr | head -n 1 | cut -d' ' -f2-)
TRACE_PATH=$(find "$RUN_DIR" -type f -path '*/crawler/taintflows.json' -print -quit)
EXPLOIT_PATH=$(find "$RUN_DIR" -type f -path '*/crawler/exploit.json' -print -quit)

echo "Mode: $MODE"
echo "Taint trace: ${TRACE_PATH:-not written}"
echo "Generated payloads: ${EXPLOIT_PATH:-not written}"
