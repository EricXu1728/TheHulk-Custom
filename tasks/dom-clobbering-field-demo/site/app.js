const STORAGE_KEY = "northstar.case-4821.updates";
const statusElement = document.getElementById("status");
const savedLinks = document.getElementById("savedLinks");
const updateForm = document.getElementById("updateForm");
const chainEvidence = document.getElementById("chainEvidence");

function beginWorkflowAttempt() {
  chainEvidence.replaceChildren();
}

function recordNamedAnchor(propertyName, anchor, property) {
  const item = document.createElement("li");
  const code = document.createElement("code");
  code.textContent = `window.${propertyName}`;
  item.append(code, ` resolved to <a id="${anchor.id}" href="${anchor.getAttribute("href")}">; ${property} passed.`);
  chainEvidence.appendChild(item);
}

function allowedAnchorsFromMarkup(markup) {
  const parsed = new DOMParser().parseFromString(markup, "text/html");
  const result = [];

  for (const input of parsed.body.querySelectorAll("a")) {
    const rawHref = input.getAttribute("href");
    if (!rawHref) continue;

    let href;
    try {
      href = new URL(rawHref, location.href);
    } catch {
      continue;
    }
    if (href.protocol !== "http:" && href.protocol !== "https:") continue;

    // The sanitizer removes executable markup and handlers, but preserves id
    // and name. Keeping those attributes makes the saved links clobberable.
    const anchor = document.createElement("a");
    for (const attribute of ["id", "name", "href", "rel"]) {
      if (input.hasAttribute(attribute)) anchor.setAttribute(attribute, input.getAttribute(attribute));
    }
    anchor.textContent = input.textContent.trim() || href.href;
    result.push(anchor);
  }
  return result;
}

function persistAndRender(markup) {
  const anchors = allowedAnchorsFromMarkup(markup);
  const safeMarkup = anchors.map(anchor => anchor.outerHTML).join("\n");
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  saved.push(safeMarkup);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  renderSavedUpdates();
}

function renderSavedUpdates() {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  const fragment = document.createDocumentFragment();
  for (const markup of saved) {
    for (const anchor of allowedAnchorsFromMarkup(markup)) fragment.appendChild(anchor);
  }
  savedLinks.replaceChildren(fragment);
}

// Gadget 1: a customer-provided link toggles the report-tools feature.
function checkWorkspaceSettings() {
  const settings = window.workspaceSettings;
  if (!(settings instanceof HTMLAnchorElement) || !settings.href) return false;
  recordNamedAnchor("workspaceSettings", settings, "href");
  statusElement.textContent = "Workspace settings found; checking the selected report…";
  return true;
}

// Gadget 2: this lookup only runs after Gadget 1 passes.
function checkSelectedReport() {
  const selectedReport = window.selectedReport;
  if (!(selectedReport instanceof HTMLAnchorElement) || !selectedReport.href) return false;
  recordNamedAnchor("selectedReport", selectedReport, "href");
  statusElement.textContent = "Report selected; checking its export policy…";
  return true;
}

// Gadget 3: a selected report must have a saved export-policy link.
function checkExportPolicy() {
  const policy = window.exportPolicy;
  if (!(policy instanceof HTMLAnchorElement) || !policy.href) return false;
  recordNamedAnchor("exportPolicy", policy, "href");
  statusElement.textContent = "Export policy accepted; loading the report format…";
  return true;
}

// Gadget 4: the clobbered link supplies a harmless local navigation target.
function openReportPreview() {
  const destination = window.previewDestination;
  if (!(destination instanceof HTMLAnchorElement) || !destination.href) return false;
  recordNamedAnchor("previewDestination", destination, "href");

  statusElement.textContent = "All report checks passed; opening the selected preview…";
  window.location.href = destination.href;
  return true;
}

function runExportWorkflow() {
  if (!checkWorkspaceSettings()) {
    statusElement.textContent = "Waiting for workspace settings in the saved update.";
    return;
  }
  if (!checkSelectedReport()) {
    statusElement.textContent = "Workspace is ready; waiting for a selected report.";
    return;
  }
  if (!checkExportPolicy()) {
    statusElement.textContent = "Report selected; waiting for an export policy.";
    return;
  }
  if (!openReportPreview()) {
    statusElement.textContent = "Export is approved; waiting for a preview destination.";
  }
}

updateForm.addEventListener("submit", event => {
  event.preventDefault();
  beginWorkflowAttempt();
  persistAndRender(document.getElementById("updateMarkup").value);
  runExportWorkflow();
});

document.getElementById("clearUpdates").addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  renderSavedUpdates();
  beginWorkflowAttempt();
  statusElement.textContent = "Saved updates cleared. Add a new update to prepare an export.";
});

renderSavedUpdates();
if (localStorage.getItem(STORAGE_KEY)) runExportWorkflow();
