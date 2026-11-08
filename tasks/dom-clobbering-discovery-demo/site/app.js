// Legacy module-loader pattern: the named link is implicitly exposed on window.
const config = window.widgetBootstrap;
if (!config || !config.href) {
  document.getElementById("status").textContent =
    "Service detail module could not be loaded.";
  throw new Error("Missing service detail module URL");
}

const script = document.createElement("script");

// Hulk should observe window.widgetBootstrap.href flowing to this script-src sink.
script.src = config.href;
document.head.appendChild(script);
