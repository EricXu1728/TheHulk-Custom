#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH=$(realpath "$0")
TASK_PATH=$(dirname "$SCRIPT_PATH")
THEHULK_PATH=$(realpath "$TASK_PATH/../..")
PROXY_PORT=${1:-8899}
SITE_PORT=8004
EXPECTED_TARGETS="accountPreference,reportSelection,exportFormat,formatModule"

port_is_open() { timeout 1 bash -c "</dev/tcp/127.0.0.1/$1" 2>/dev/null; }

if [[ ! "$PROXY_PORT" =~ ^[0-9]+$ ]] || (( PROXY_PORT < 1 || PROXY_PORT > 65535 )); then
  echo "Usage: $0 [proxy-port]" >&2
  exit 2
fi
if port_is_open "$SITE_PORT"; then
  echo "Port $SITE_PORT is already in use; stop that service before running this demo." >&2
  exit 1
fi
if ! port_is_open "$PROXY_PORT"; then
  echo "The TheHulk proxy is not listening on port $PROXY_PORT." >&2
  echo "Start it from '$THEHULK_PATH/proxy-server' using mitmdump -p $PROXY_PORT -s '$THEHULK_PATH/proxy-server/proxy.py'." >&2
  exit 1
fi

python3 "$TASK_PATH/site/server.py" &
SERVER_PID=$!
BROWSER_CONFIG=""
cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  if [[ -n "$BROWSER_CONFIG" ]]; then rm -f "$BROWSER_CONFIG"; fi
}
trap cleanup EXIT INT TERM

for attempt in {1..20}; do
  if port_is_open "$SITE_PORT"; then break; fi
  if [[ "$attempt" -eq 20 ]]; then echo "Demo server did not start on port $SITE_PORT." >&2; exit 1; fi
  sleep 0.25
done

(cd "$THEHULK_PATH/gadget-detection/runtime-analysis" && npm run deploy)
BROWSER_CONFIG=$(mktemp)
sed "s/PROXY_PORT: 8899/PROXY_PORT: $PROXY_PORT/" "$TASK_PATH/config.browser.yml" > "$BROWSER_CONFIG"
HULK_TASK_DIR="$TASK_PATH" \
HULK_SITE_PORT="$SITE_PORT" \
HULK_EXPECTED_TARGETS="$EXPECTED_TARGETS" \
HULK_MODULE_PATH="format-module.js" \
HULK_BROWSER_CONFIG="$BROWSER_CONFIG" \
node "$THEHULK_PATH/tasks/dom-clobbering-chain-demo/discover-chain.js"
