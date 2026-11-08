const status = document.getElementById("status");
const panel = document.getElementById("widgetPanel");
const detailsLink = document.getElementById("widgetBootstrap");

status.textContent = "Service detail module loaded. Select the button for component health.";

detailsLink.addEventListener("click", event => {
  event.preventDefault();

  if (!panel.hasChildNodes()) {
    const services = [
      ["Public API", "Operational"],
      ["Background jobs", "Operational"],
      ["Data warehouse", "Operational"],
      ["Next maintenance", "Sunday, 02:00–02:30 UTC"]
    ];

    for (const [name, value] of services) {
      const row = document.createElement("div");
      row.className = "widget-row";
      const label = document.createElement("strong");
      label.textContent = name;
      const detail = document.createElement("span");
      detail.textContent = value;
      row.append(label, detail);
      panel.appendChild(row);
    }
  }

  panel.hidden = !panel.hidden;
  detailsLink.textContent = panel.hidden
    ? "View service details"
    : "Hide service details";
});
