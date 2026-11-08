#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH=$(realpath "$0")
TASK_PATH=$(dirname "$SCRIPT_PATH")
THEHULK_PATH=$(realpath "$TASK_PATH/../..")
SITE_DIR="$TASK_PATH/site"
OUTPUT_ROOT="$TASK_PATH/output"

port_is_open() {
  timeout 1 bash -c "</dev/tcp/127.0.0.1/$1" 2>/dev/null
}

if port_is_open 8002; then
  echo "Port 8002 is already in use; stop that service before running this demo." >&2
  exit 1
fi
if ! port_is_open 8899; then
  echo "The TheHulk proxy is not listening on port 8899." >&2
  echo "Start it in another terminal: cd '$THEHULK_PATH/proxy-server' && ./setup.sh" >&2
  exit 1
fi

python3 "$SITE_DIR/server.py" &
SERVER_PID=$!
cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for attempt in {1..20}; do
  if port_is_open 8002; then
    break
  fi
  if [[ "$attempt" -eq 20 ]]; then
    echo "Demo server did not start on port 8002." >&2
    exit 1
  fi
  sleep 0.25
done

(cd "$THEHULK_PATH/gadget-detection/runtime-analysis" && npm run deploy)
(cd "$THEHULK_PATH/crawler/src" && node ./scheduler.js \
  --scheduler-config "$TASK_PATH/config.scheduler.yml" \
  --crawler-config "$TASK_PATH/config.browser.yml")

RUN_DIR=$(find "$OUTPUT_ROOT" -mindepth 1 -maxdepth 1 -type d \
  -name 'DOM-CLOBBERING-UNSEEDED-DISCOVERY-*' -printf '%T@ %p\n' \
  | sort -nr | head -n 1 | cut -d' ' -f2-)
TRACE_PATH=$(find "$RUN_DIR" -type f -path '*/crawler/taintflows.json' -print -quit)
EXPLOIT_PATH=$(find "$RUN_DIR" -type f -path '*/crawler/exploit.json' -print -quit)

if [[ -z "$TRACE_PATH" || -z "$EXPLOIT_PATH" ]]; then
  echo "The run did not produce both taintflows.json and exploit.json." >&2
  exit 1
fi

TRACE_PATH="$TRACE_PATH" EXPLOIT_PATH="$EXPLOIT_PATH" node -e '
const fs = require("fs");
const flows = JSON.parse(fs.readFileSync(process.env.TRACE_PATH, "utf8"));
const exploits = JSON.parse(fs.readFileSync(process.env.EXPLOIT_PATH, "utf8"));
const foundFlow = flows.some(flow =>
  flow.sourceReason === "SOURCE-FROM-WINDOW" &&
  flow.sinkReason === "SINK-TO-SCRIPT-SRC"
);
const foundPayload = exploits.some(entry =>
  Array.isArray(entry.exploits) &&
  entry.exploits.some(payload => payload.includes("widgetBootstrap"))
);
if (!foundFlow || !foundPayload) {
  console.error("Expected unseeded window-to-script-src discovery was not recorded.");
  console.error(`Trace: ${process.env.TRACE_PATH}`);
  console.error(`Payloads: ${process.env.EXPLOIT_PATH}`);
  process.exit(1);
}
console.log("PASS: Hulk observed the unseeded source-to-sink flow and generated widgetBootstrap candidates.");
console.log(`Trace: ${process.env.TRACE_PATH}`);
console.log(`Payloads: ${process.env.EXPLOIT_PATH}`);
'
