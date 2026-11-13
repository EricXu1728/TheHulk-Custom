#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const taskDir = __dirname;
const hulkDir = path.resolve(taskDir, "../..");
const crawlerSrcDir = path.join(hulkDir, "crawler", "src");
const runId = process.env.HULK_RUN_ID;
const outputDir = process.env.HULK_OUTPUT_DIR;
const workspaceRoot = process.env.HULK_WORKSPACE;
const templatePath = path.join(taskDir, "config.scheduler.template.yml");
const browserConfigPath = process.env.HULK_BROWSER_CONFIG;
const maxRounds = Number(process.env.HULK_MAX_ROUNDS || 12);
const maxTargets = Number(process.env.HULK_MAX_TARGETS || 80);
const formFieldSelector = process.env.HULK_FORM_FIELD_SELECTOR || "";
const formSubmitSelector = process.env.HULK_FORM_SUBMIT_SELECTOR || "";
if (Boolean(formFieldSelector) !== Boolean(formSubmitSelector)) {
  throw new Error("Field-based scanning requires both a field selector and a submit selector.");
}
const submitThroughForm = Boolean(formFieldSelector && formSubmitSelector);
const baseUrl = new URL(process.env.HULK_SITE_URL);
let initialFragment = "";
try { if (baseUrl.hash) initialFragment = decodeURIComponent(baseUrl.hash.slice(1)); }
catch { console.warn("URL fragment is not valid percent-encoding; ignoring it as an initial anchor payload."); }
const initialMarkup = /<a\b/i.test(initialFragment) ? initialFragment : "";
if (initialMarkup) baseUrl.hash = "";
const candidateHref = process.env.HULK_CANDIDATE_HREF || baseUrl.href;
const targets = new Set(extractAnchorNames(initialMarkup));
const initialTargets = new Set(targets);

async function findFiles(root, basename, found = []) {
  let entries;
  try { entries = await fs.readdir(root, { withFileTypes: true }); }
  catch { return found; }
  for (const entry of entries) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) await findFiles(file, basename, found);
    else if (entry.name === basename) found.push(file);
  }
  return found;
}

function extractAnchorNames(markup) {
  const names = [];
  for (const match of markup.matchAll(/<a\b([^>]*)>/gi)) {
    const attrs = match[1];
    for (const attribute of ["id", "name"]) {
      const found = attrs.match(new RegExp(`\\b${attribute}\\s*=\\s*(["'])(.*?)\\1`, "i"));
      if (found && /^[A-Za-z_$][\w$]*$/.test(found[2])) names.push(found[2]);
    }
  }
  return names;
}

function escapeAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function currentMarkup() {
  const generated = [...targets].filter(name => !initialTargets.has(name)).map(name =>
    `<a id="${escapeAttribute(name)}" name="${escapeAttribute(name)}" href="${escapeAttribute(candidateHref)}">${escapeAttribute(name)}</a>`
  );
  return [initialMarkup, ...generated].filter(Boolean).join("\n");
}

function sourceNames(flow) {
  return (flow.taintedValue?.taintInfo?.taintSource || [])
    .flatMap(source => source.operation?.arguments || [])
    .filter(value => typeof value === "string");
}

async function main() {
  const template = await fs.readFile(templatePath, "utf8");
  const summary = [];
  let completeFlowPath = null;
  let completeExploitPath = null;
  let completedTargets = [];

  for (let round = 0; round < maxRounds; round++) {
    const roundName = `round-${String(round).padStart(2, "0")}`;
    const roundWorkspace = `${workspaceRoot}/${roundName}`;
    const roundConfig = path.join(outputDir, `${roundName}.scheduler.yml`);
    const markup = currentMarkup();
    const url = new URL(baseUrl.href);
    if (markup && !submitThroughForm) url.hash = encodeURIComponent(markup);
    const config = template
      .replace("__TEST_NAME__", `${runId}-${roundName}`)
      .replace("__WORKSPACE__", roundWorkspace)
      .replace("__SEED_URL__", JSON.stringify(url.href));
    await fs.writeFile(roundConfig, config);

    console.log(`[${roundName}] Scanning with ${targets.size} clobber target(s) injected.`);
    const result = spawnSync(process.execPath, [
      "./scheduler.js", "--scheduler-config", roundConfig,
      "--crawler-config", browserConfigPath
    ], {
      cwd: crawlerSrcDir,
      stdio: "inherit",
      env: { ...process.env, HULK_INJECT_MARKUP: markup }
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Hulk scheduler exited with status ${result.status}`);

    const traceFiles = await findFiles(path.join(hulkDir, roundWorkspace), "taintflows.json");
    const poolFiles = await findFiles(path.join(hulkDir, roundWorkspace), "clobberableSourcePool.json");
    if (!traceFiles.length || !poolFiles.length) {
      throw new Error(`${roundName} did not produce a taint trace and clobberable-source inventory.`);
    }
    const tracePath = traceFiles[0];
    const poolPath = poolFiles[0];
    const flows = JSON.parse(await fs.readFile(tracePath, "utf8"));
    const pool = JSON.parse(await fs.readFile(poolPath, "utf8"));
    const observedTargets = [
      ...(pool["SOURCE-FROM-WINDOW"] || []),
      ...(pool["SOURCE-FROM-DOCUMENT"] || [])
    ].filter((name, index, all) =>
      typeof name === "string" && /^[A-Za-z_$][\w$]*$/.test(name) && all.indexOf(name) === index
    );
    const newTargets = observedTargets.filter(name => !targets.has(name));
    const clobberFlows = flows.filter(flow =>
      flow.sinkReason && sourceNames(flow).some(name => targets.has(name))
    );
    const exploitFiles = await findFiles(path.dirname(tracePath), "exploit.json");

    summary.push({
      round,
      url: url.href,
      injectedTargets: [...targets],
      observedTargets,
      newTargets,
      taintFlowCount: flows.length,
      flowsFromInjectedTargets: clobberFlows.map(flow => ({
        sourceReason: flow.sourceReason,
        sinkReason: flow.sinkReason,
        sourceNames: sourceNames(flow)
      })),
      tracePath,
      sourcePoolPath: poolPath
    });

    if (clobberFlows.length) {
      completeFlowPath = tracePath;
      completeExploitPath = exploitFiles[0] || null;
      completedTargets = [...targets];
      break;
    }
    if (!newTargets.length) break;
    for (const name of newTargets) {
      if (targets.size >= maxTargets) break;
      targets.add(name);
    }
  }

  const summaryPath = path.join(outputDir, "discovery-summary.json");
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
  if (completeFlowPath) {
    const markupPath = path.join(outputDir, "generated-chain-markup.html");
    const urlPath = path.join(outputDir, "generated-chain-url.txt");
    const markup = currentMarkup();
    const finalUrl = new URL(baseUrl.href);
    finalUrl.hash = encodeURIComponent(markup);
    await fs.writeFile(markupPath, markup);
    await fs.writeFile(urlPath, `${finalUrl.href}\n`);
    console.log("Found a taint flow from an injected DOM-clobbering target to a recorded sink.");
    console.log(`Targets injected: ${completedTargets.join(", ")}`);
    console.log(`Trace: ${completeFlowPath}`);
    console.log(`Exploit candidates: ${completeExploitPath || "not written"}`);
    console.log(`Generated markup: ${markupPath}`);
  } else {
    console.log("No source-to-sink flow from injected targets was observed within the available rounds.");
    if (summary.length === 1 && summary[0].observedTargets.length === 0) {
      console.log("Hulk observed no clobberable window/document property reads on this page.");
      console.log("Check that this URL serves the intended app JavaScript and exercises the relevant workflow.");
    }
    console.log("Review the per-round source inventory and conditions; this does not prove the site is safe.");
  }
  console.log(`Round summary: ${summaryPath}`);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
