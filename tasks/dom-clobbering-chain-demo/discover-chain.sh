#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH=$(realpath "$0")
TASK_PATH=$(dirname "$SCRIPT_PATH")
THEHULK_PATH=$(realpath "$TASK_PATH/../..")
PROXY_PORT=${1:-${HULK_PROXY_PORT:-8899}}
if [[ ! "$PROXY_PORT" =~ ^[0-9]+$ ]] || (( PROXY_PORT < 1 || PROXY_PORT > 65535 )); then
  echo "Usage: $0 [proxy-port]" >&2
  exit 2
fi

port_is_open() {
  timeout 1 bash -c "</dev/tcp/127.0.0.1/$1" 2>/dev/null
}

if port_is_open 8003; then
  echo "Port 8003 is already in use; stop that service before running this demo." >&2
  exit 1
fi
if ! port_is_open "$PROXY_PORT"; then
  echo "The TheHulk proxy is not listening on port $PROXY_PORT." >&2
  echo "Start it in another terminal from '$THEHULK_PATH/proxy-server': mitmdump --set stream_large_bodies=500m --anticache -p $PROXY_PORT -s '$THEHULK_PATH/proxy-server/proxy.py'" >&2
  exit 1
fi

python3 "$TASK_PATH/site/server.py" &
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
BROWSER_CONFIG=$(mktemp)
trap 'kill "$SERVER_PID" 2>/dev/null || true; rm -f "$BROWSER_CONFIG"' EXIT INT TERM
sed "s/PROXY_PORT: 8899/PROXY_PORT: $PROXY_PORT/" "$TASK_PATH/config.browser.yml" > "$BROWSER_CONFIG"
HULK_BROWSER_CONFIG="$BROWSER_CONFIG" node "$TASK_PATH/discover-chain.js"
