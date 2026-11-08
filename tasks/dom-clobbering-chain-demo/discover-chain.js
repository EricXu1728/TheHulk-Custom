#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const taskDir = process.env.HULK_TASK_DIR
  ? path.resolve(process.env.HULK_TASK_DIR)
  : __dirname;
const hulkDir = path.resolve(taskDir, "../..");
const crawlerDir = path.join(hulkDir, "crawler");
const crawlerSrcDir = path.join(crawlerDir, "src");
const outputDir = path.join(taskDir, "output", "auto-chain");
const templatePath = path.join(taskDir, "config.scheduler.template.yml");
const browserConfigPath = process.env.HULK_BROWSER_CONFIG
  ? path.resolve(process.env.HULK_BROWSER_CONFIG)
  : path.join(taskDir, "config.browser.yml");
const sitePort = Number(process.env.HULK_SITE_PORT || 8003);
const baseUrl = `http://127.0.0.1:${sitePort}/`;
const safeModuleUrl = `${baseUrl}${process.env.HULK_MODULE_PATH || "report-module.js"}`;
const maxRounds = 8;
const expectedTargets = (process.env.HULK_EXPECTED_TARGETS || "reportMode,reportModule")
  .split(",").map(target => target.trim()).filter(Boolean);

async function findFiles(root, predicate, found = []) {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) await findFiles(fullPath, predicate, found);
    else if (predicate(fullPath)) found.push(fullPath);
  }
  return found;
}

function flowSources(flow) {
  return (flow.taintedValue?.taintInfo?.taintSource || [])
    .flatMap(source => source.operation?.arguments || []);
}

function makeMarkup(targets) {
  return [...targets].map(target =>
    `<a id="${target}" name="${target}" href="${safeModuleUrl}">${target}</a>`
  ).join("\n");
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const template = await fs.readFile(templatePath, "utf8");
  const targets = new Set();
  const summary = [];
  let finalFlowPath = null;
  let finalExploitPath = null;
  let finalMarkup = "";

  for (let round = 0; round < maxRounds; round++) {
    const roundName = `round-${String(round).padStart(2, "0")}`;
    const relativeTaskDir = path.relative(hulkDir, taskDir);
    const roundWorkspace = `${relativeTaskDir}/output/auto-chain/${roundName}`;
    const roundConfig = path.join(outputDir, `${roundName}.scheduler.yml`);
    const markup = makeMarkup(targets);
    const url = markup ? `${baseUrl}#${encodeURIComponent(markup)}` : baseUrl;
    const config = template
      .replaceAll("__TEST_NAME__", `DOM-CLOBBER-CHAIN-AUTO-${roundName}`)
      .replaceAll("__WORKSPACE__", roundWorkspace)
      .replaceAll("__SEED_URL__", url);

    await fs.writeFile(roundConfig, config);
    console.log(`[${roundName}] Visiting ${targets.size} discovered target(s).`);
    const run = spawnSync(process.execPath, [
      "./scheduler.js",
      "--scheduler-config", roundConfig,
      "--crawler-config", browserConfigPath
    ], { cwd: crawlerSrcDir, stdio: "inherit" });
    if (run.error) throw run.error;
    if (run.status !== 0) throw new Error(`Hulk scheduler exited with status ${run.status}`);

    const roundDir = path.join(hulkDir, roundWorkspace);
    const traceFiles = await findFiles(roundDir, file => path.basename(file) === "taintflows.json");
    const poolFiles = await findFiles(roundDir, file => path.basename(file) === "clobberableSourcePool.json");
    if (!traceFiles.length || !poolFiles.length) {
      throw new Error(`Round ${roundName} did not write its taint flow and source inventory files.`);
    }

    const tracePath = traceFiles[0];
    const poolPath = poolFiles[0];
    const flows = JSON.parse(await fs.readFile(tracePath, "utf8"));
    const pool = JSON.parse(await fs.readFile(poolPath, "utf8"));
    const conditionFiles = await findFiles(roundDir, file => path.basename(file) === "conditions.json");
    const conditions = conditionFiles.length
      ? JSON.parse(await fs.readFile(conditionFiles[0], "utf8"))
      : [];
    const observedWindowTargets = (pool["SOURCE-FROM-WINDOW"] || [])
      .filter(target => /^[A-Za-z_$][\w$]*$/.test(target));
    const newTargets = observedWindowTargets.filter(target => !targets.has(target));
    const sourceSinkFlow = flows.find(flow => flow.sinkReason === "SINK-TO-SCRIPT-SRC");

    summary.push({
      round,
      url,
      injectedTargets: [...targets],
      observedWindowTargets,
      newTargets,
      observedConditionCount: conditions.length,
      observedConditionOperations: conditions.flatMap(condition =>
        condition.taintInfo?.taintPropOperations || []
      ).map(operation => ({
        operation: operation.operation,
        arguments: operation.arguments,
        iid: conditionIidForOperation(conditions, operation)
      })),
      dangerousFlowCount: flows.length,
      scriptSrcFlow: Boolean(sourceSinkFlow),
      tracePath,
      sourcePoolPath: poolPath
    });

    if (sourceSinkFlow) {
      finalFlowPath = tracePath;
      const exploitFiles = await findFiles(path.dirname(tracePath), file => path.basename(file) === "exploit.json");
      finalExploitPath = exploitFiles[0] || null;
      finalMarkup = markup;
      break;
    }

    if (newTargets.length === 0) break;
    for (const target of newTargets) targets.add(target);
  }

  const summaryPath = path.join(outputDir, "discovery-summary.json");
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));

  if (finalFlowPath) {
    const markupPath = path.join(outputDir, "generated-chain-markup.html");
    const urlPath = path.join(outputDir, "generated-chain-url.txt");
    await fs.writeFile(markupPath, finalMarkup);
    await fs.writeFile(urlPath, `${baseUrl}#${encodeURIComponent(finalMarkup)}\n`);

    const chainTargets = new Set(targets);
    const finalFlows = JSON.parse(await fs.readFile(finalFlowPath, "utf8"));
    const sinkFlow = finalFlows.find(flow => flow.sinkReason === "SINK-TO-SCRIPT-SRC");
    const reachedSource = flowSources(sinkFlow || {}).find(source => chainTargets.has(source));
    const missingTargets = expectedTargets.filter(target => !chainTargets.has(target));
    if (!reachedSource || missingTargets.length) {
      throw new Error(`A script-src flow was found, but expected chain target(s) are missing: ${missingTargets.join(", ") || "sink source"}.`);
    }

    console.log("PASS: clean-start iterative discovery reached the chained script-src sink.");
    console.log(`Targets injected: ${[...chainTargets].join(", ")}`);
    console.log(`Trace: ${finalFlowPath}`);
    console.log(`Exploit candidates: ${finalExploitPath || "not written"}`);
    console.log(`Constructed markup: ${markupPath}`);
    console.log(`Reusable test URL: ${urlPath}`);
    console.log(`Round summary: ${summaryPath}`);
    return;
  }

  console.error(`No complete chain reached a supported script-src sink in ${summary.length} round(s).`);
  console.error(`Round summary: ${summaryPath}`);
  process.exitCode = 1;
}

function conditionIidForOperation(conditions, operation) {
  for (const condition of conditions) {
    if ((condition.taintInfo?.taintPropOperations || []).includes(operation)) {
      return condition.iid;
    }
  }
  return undefined;
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
