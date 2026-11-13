#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH=$(realpath "$0")
TASK_PATH=$(dirname "$SCRIPT_PATH")
THEHULK_PATH=$(realpath "$TASK_PATH/../..")

usage() {
  echo "Usage: $0 <site-port|site-url> [proxy-port] [options]" >&2
  echo "Options: --field-selector <css> --submit-selector <css> --href <candidate-url>" >&2
  echo "Example: $0 8006 --field-selector '#updateMarkup' --submit-selector '#updateForm button[type=submit]'" >&2
}

if [[ $# -lt 1 ]]; then usage; exit 2; fi
TARGET_INPUT=$1
shift
PROXY_PORT=8899
CANDIDATE_HREF=""
FIELD_SELECTOR=""
SUBMIT_SELECTOR=""

if [[ $# -gt 0 && "$1" =~ ^[0-9]+$ ]]; then
  PROXY_PORT=$1
  shift
fi
while [[ $# -gt 0 ]]; do
  case "$1" in
    --field-selector)
      [[ $# -ge 2 ]] || { usage; exit 2; }
      FIELD_SELECTOR=$2
      shift 2
      ;;
    --submit-selector)
      [[ $# -ge 2 ]] || { usage; exit 2; }
      SUBMIT_SELECTOR=$2
      shift 2
      ;;
    --href)
      [[ $# -ge 2 ]] || { usage; exit 2; }
      CANDIDATE_HREF=$2
      shift 2
      ;;
    *) usage; exit 2 ;;
  esac
done

if [[ -n "$FIELD_SELECTOR" && -z "$SUBMIT_SELECTOR" || -z "$FIELD_SELECTOR" && -n "$SUBMIT_SELECTOR" ]]; then
  echo "Field-based scanning requires both --field-selector and --submit-selector." >&2
  exit 2
fi

if [[ ! "$PROXY_PORT" =~ ^[0-9]+$ ]] || (( PROXY_PORT < 1 || PROXY_PORT > 65535 )); then
  echo "Invalid proxy port: $PROXY_PORT" >&2
  usage
  exit 2
fi

if [[ "$TARGET_INPUT" =~ ^[0-9]+$ ]]; then
  if (( TARGET_INPUT < 1 || TARGET_INPUT > 65535 )); then
    echo "Invalid site port: $TARGET_INPUT" >&2
    exit 2
  fi
  SITE_URL="http://127.0.0.1:$TARGET_INPUT/"
elif [[ "$TARGET_INPUT" =~ ^https?:// ]]; then
  SITE_URL=$TARGET_INPUT
else
  echo "The site target must be a port number or an http(s) URL." >&2
  usage
  exit 2
fi

port_is_open() { timeout 2 bash -c "</dev/tcp/127.0.0.1/$1" 2>/dev/null; }
if ! port_is_open "$PROXY_PORT"; then
  echo "TheHulk proxy is not listening on 127.0.0.1:$PROXY_PORT." >&2
  echo "Start it from '$THEHULK_PATH/proxy-server' and pass its port as the second argument." >&2
  exit 1
fi

RUN_ID="LOCAL-SITE-SCAN-$(date +%m-%d-%H-%M-%S)"
WORKSPACE="tasks/dom-clobbering-site-scan/output/$RUN_ID"
OUTPUT_DIR="$TASK_PATH/output/$RUN_ID"
mkdir -p "$OUTPUT_DIR"
BROWSER_CONFIG="$OUTPUT_DIR/config.browser.yml"
sed "s/PROXY_PORT: 8899/PROXY_PORT: $PROXY_PORT/" \
  "$TASK_PATH/config.browser.yml" > "$BROWSER_CONFIG"

(cd "$THEHULK_PATH/gadget-detection/runtime-analysis" && npm run deploy)
HULK_RUN_ID="$RUN_ID" \
HULK_OUTPUT_DIR="$OUTPUT_DIR" \
HULK_WORKSPACE="$WORKSPACE" \
HULK_SITE_URL="$SITE_URL" \
HULK_CANDIDATE_HREF="$CANDIDATE_HREF" \
HULK_FORM_FIELD_SELECTOR="$FIELD_SELECTOR" \
HULK_FORM_SUBMIT_SELECTOR="$SUBMIT_SELECTOR" \
HULK_BROWSER_CONFIG="$BROWSER_CONFIG" \
node "$TASK_PATH/discover-chains.js"

echo
echo "Scan output: $OUTPUT_DIR"
echo "Look under the per-host crawler directory for taintflows.json, exploit.json,"
echo "clobberableSourcePool.json, clobberableSources.json, and clobberableSinks.json."
