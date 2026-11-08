const workflow = {
  accountReady: false,
  reportSelected: false,
  exportEnabled: false
};

function importFragmentAnchors() {
  if (!location.hash) return;
  const fragment = decodeURIComponent(location.hash.slice(1));
  const parsed = new DOMParser().parseFromString(fragment, "text/html");
  const target = document.getElementById("importedContent");
  for (const input of parsed.body.querySelectorAll("a")) {
    const anchor = document.createElement("a");
    for (const attribute of ["id", "href", "rel"]) {
      if (input.hasAttribute(attribute)) anchor.setAttribute(attribute, input.getAttribute(attribute));
    }
    anchor.hidden = true;
    target.appendChild(anchor);
  }
}

// Gadget 1: account readiness. This stage only changes control flow.
function checkAccountPreference() {
  const preference = window.accountPreference;
  if (!preference || !preference.href) return;
  workflow.accountReady = true;
}

// Gadget 2: reached only after gadget 1. It unlocks report selection.
function selectReport() {
  if (!workflow.accountReady) return;
  const selection = window.reportSelection;
  if (!selection || !selection.href) return;
  workflow.reportSelected = true;
}

// Gadget 3: reached only after gadgets 1 and 2. It enables export.
function enableExport() {
  if (!workflow.reportSelected) return;
  const format = window.exportFormat;
  if (!format || !format.href) return;
  workflow.exportEnabled = true;
}

// Gadget 4: reached only after all prior stages; its DOM-derived URL reaches
// the script-src sink. The demo module is intentionally harmless.
function loadFormatModule() {
  if (!workflow.exportEnabled) return;
  const moduleConfig = window.formatModule;
  if (!moduleConfig || !moduleConfig.href) return;
  const script = document.createElement("script");
  script.src = moduleConfig.href;
  document.head.appendChild(script);
}

importFragmentAnchors();
checkAccountPreference();
selectReport();
enableExport();
loadFormatModule();
