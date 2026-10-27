#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH=$(realpath "$0")
TASK_PATH=$(dirname "$SCRIPT_PATH")
THEHULK_PATH=$(realpath "$TASK_PATH/../..")

bash "$TASK_PATH/run.sh"

OUTPUT_PATH="$THEHULK_PATH/tasks/dom-clobber-hulk-test/output"
TRACE_PATH=$(find "$OUTPUT_PATH" -type f -name taintflows.json -printf '%T@ %p\n' \
  | sort -nr \
  | head -n 1 \
  | cut -d' ' -f2-)

if [[ -z "$TRACE_PATH" ]]; then
  echo "FAIL: TheHulk did not write a taintflows.json file." >&2
  exit 1
fi

TRACE_PATH="$TRACE_PATH" node -e '
const fs = require("fs");
const trace = JSON.parse(fs.readFileSync(process.env.TRACE_PATH, "utf8"));
const found = trace.some(flow =>
  flow.sourceReason === "SOURCE-FROM-WINDOW" &&
  flow.sinkReason === "SINK-TO-DOM-ELEMENT-INNERHTML"
);
if (!found) {
  console.error(`FAIL: expected DOM-clobbering flow not found in ${process.env.TRACE_PATH}`);
  console.error(JSON.stringify(trace, null, 2));
  process.exit(1);
}
console.log(`PASS: expected DOM-clobbering flow found in ${process.env.TRACE_PATH}`);
'
