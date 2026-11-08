const state = { exportEnabled: false };

function importAllowedFragmentMarkup() {
  if (!location.hash) return;

  // The demo accepts only anchors and copies only scriptless attributes.
  // This models a constrained rich-text/HTML feature that still permits IDs.
  const markup = decodeURIComponent(location.hash.slice(1));
  const parsed = new DOMParser().parseFromString(markup, "text/html");
  const destination = document.getElementById("clobberedMarkup");

  for (const input of parsed.body.querySelectorAll("a")) {
    const anchor = document.createElement("a");
    for (const name of ["id", "href", "rel"]) {
      if (input.hasAttribute(name)) anchor.setAttribute(name, input.getAttribute(name));
    }
    anchor.hidden = true;
    destination.appendChild(anchor);
  }
}

// Gadget 1: the clobbered named global controls whether the export workflow
// enters its second stage. A non-empty href passes the feature gate; this
// gadget only changes control flow and does not reach a dangerous sink.
function enableExportFromNamedOption() {
  const option = window.reportMode;
  if (!option || !option.href) return;

  state.exportEnabled = true;
  document.getElementById("status").textContent =
    "Export mode enabled; preparing the report module…";
}

// Gadget 2: this code is reached only after Gadget 1 enables export. A second
// clobbered global supplies the module URL that reaches the script-src sink.
function loadReportModule() {
  if (!state.exportEnabled) return;

  const moduleConfig = window.reportModule;
  if (!moduleConfig || !moduleConfig.href) return;

  const script = document.createElement("script");
  script.src = moduleConfig.href;
  document.head.appendChild(script);
}

importAllowedFragmentMarkup();
enableExportFromNamedOption();
loadReportModule();
