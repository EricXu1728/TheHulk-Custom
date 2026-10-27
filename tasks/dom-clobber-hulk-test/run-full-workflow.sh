#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH=$(realpath "$0")
TASK_PATH=$(dirname "$SCRIPT_PATH")
THEHULK_PATH=$(realpath "$TASK_PATH/../..")
RUNTIME_PATH="$THEHULK_PATH/gadget-detection/runtime-analysis"
OUTPUT_PATH="$TASK_PATH/output-full"

require_listener() {
  local port=$1
  if ! timeout 1 bash -c "</dev/tcp/127.0.0.1/$port" 2>/dev/null; then
    echo "Required local service is not listening on 127.0.0.1:$port" >&2
    exit 1
  fi
}

require_listener 8001
require_listener 8899

echo "[1/4] Building the taint-analysis bundle"
(cd "$RUNTIME_PATH" && npm run deploy)

echo "[2/4] Building the task-local verifier bundle"
(cd "$RUNTIME_PATH" && ./node_modules/.bin/webpack \
  --config "$TASK_PATH/webpack.verifier.config.cjs")

echo "[3/4] Running gadget detection"
bash "$TASK_PATH/run.sh"

DETECTION_ROOT="$OUTPUT_PATH/detection"
DETECTION_RUN=$(find "$DETECTION_ROOT" -mindepth 1 -maxdepth 1 -type d \
  -name 'DOM-CLOBBER-FULL-PIPELINE-DETECT-*' -printf '%T@ %p\n' \
  | sort -nr | head -n 1 | cut -d' ' -f2-)

if [[ -z "$DETECTION_RUN" ]]; then
  echo "No detection output directory found under $DETECTION_ROOT" >&2
  exit 1
fi

TRACE_PATH=$(find "$DETECTION_RUN" -type f -path '*/crawler/taintflows.json' -print -quit)
if [[ -z "$TRACE_PATH" ]]; then
  echo "Detection did not write taintflows.json under $DETECTION_RUN" >&2
  exit 1
fi

CRAWLER_OUTPUT=$(dirname "$TRACE_PATH")
TRACE_PATH="$TRACE_PATH" node -e '
const fs = require("fs");
const trace = JSON.parse(fs.readFileSync(process.env.TRACE_PATH, "utf8"));
const found = trace.some(flow =>
  flow.sourceReason === "SOURCE-FROM-WINDOW" &&
  flow.sinkReason === "SINK-TO-SCRIPT-SRC"
);
if (!found) {
  console.error(`Expected SOURCE-FROM-WINDOW to SINK-TO-SCRIPT-SRC flow in ${process.env.TRACE_PATH}`);
  process.exit(1);
}
'

GENERATED_PATH="$CRAWLER_OUTPUT/exploit-generated.txt"
SAFE_EXPLOIT_PATH="$CRAWLER_OUTPUT/exploit.txt"
echo "[4/4] Generating a candidate and verifying it locally"
node "$THEHULK_PATH/exploit-gen/src/exploit.js" \
  --trace "$TRACE_PATH" --output "$GENERATED_PATH"

GENERATED_PATH="$GENERATED_PATH" SAFE_EXPLOIT_PATH="$SAFE_EXPLOIT_PATH" node -e '
const fs = require("fs");
const generated = fs.readFileSync(process.env.GENERATED_PATH, "utf8");
const candidates = generated.split(/={20,}/).map(x => x.trim()).filter(Boolean);
const target = candidates.find(candidate =>
  /^<a\b[^>]*>\s*<\/a>$/i.test(candidate) &&
  /<a\b[^>]*\bid\s*=\s*["\x27]?demoConfig["\x27]?/i.test(candidate) &&
  /<a\b[^>]*\bhref\s*=/i.test(candidate)
);
if (!target) {
  console.error(`No generated anchor candidate for demoConfig in ${process.env.GENERATED_PATH}`);
  process.exit(1);
}
const safeCandidate = `<a id="demoConfig" href="http://127.0.0.1:8001/hulk.js"></a>`;
fs.writeFileSync(
  process.env.SAFE_EXPLOIT_PATH,
  `${"=".repeat(20)}\n${safeCandidate}\n`,
  "utf8"
);
console.log(`Prepared one local-only candidate at ${process.env.SAFE_EXPLOIT_PATH}`);
'

(
cd "$THEHULK_PATH/crawler"
VERIFY_BROWSER_CONFIG="$OUTPUT_PATH/config.verify.browser.yml" \
  DETECTION_RUN="$DETECTION_RUN" \
  VERIFIER_BUNDLE="$OUTPUT_PATH/build/thehulk-dom-clobber-verifier.bundle.js" \
  node -e '
const fs = require("fs");
const yaml = require("yaml");
const config = yaml.parse(fs.readFileSync(process.argv[1], "utf8"));
config.others.EXPLOIT_INPUTS_FOLDER = process.env.DETECTION_RUN;
config.others.ANALYSIS_SCRIPT_PATH = process.env.VERIFIER_BUNDLE;
fs.writeFileSync(process.env.VERIFY_BROWSER_CONFIG, yaml.stringify(config));
' "$TASK_PATH/config.verify.browser.yml"
)

cd "$THEHULK_PATH/crawler/src"
node ./scheduler.js \
  --scheduler-config "$TASK_PATH/config.verify.scheduler.yml" \
  --crawler-config "$OUTPUT_PATH/config.verify.browser.yml"

VERIFY_ROOT="$OUTPUT_PATH/verification"
VERIFY_RUN=$(find "$VERIFY_ROOT" -mindepth 1 -maxdepth 1 -type d \
  -name 'DOM-CLOBBER-FULL-PIPELINE-VERIFY-*' -printf '%T@ %p\n' \
  | sort -nr | head -n 1 | cut -d' ' -f2-)

VERIFY_TRACE=$(find "$VERIFY_RUN" -type f -path '*/crawler/taintflows.json' -print -quit)
if [[ -z "$VERIFY_TRACE" ]]; then
  echo "Verification did not write taintflows.json under $VERIFY_RUN" >&2
  exit 1
fi

VERIFY_TRACE="$VERIFY_TRACE" node -e '
const fs = require("fs");
const flows = JSON.parse(fs.readFileSync(process.env.VERIFY_TRACE, "utf8"));
const verified = flows.some(flow =>
  flow.sink === "SINK-TO-SCRIPT-SRC" &&
  typeof flow.payload === "string" &&
  flow.payload.includes("demoConfig")
);
if (!verified) {
  console.error(`Verifier did not report the expected script-src sink in ${process.env.VERIFY_TRACE}`);
  console.error(JSON.stringify(flows, null, 2));
  process.exit(1);
}
console.log(`PASS: verifier observed the local candidate reaching script.src; see ${process.env.VERIFY_TRACE}`);
'
