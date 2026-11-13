# Field-based DOM clobbering chain demo

This local support-portal demo accepts formatted link markup in a **case update
field**, not in the URL. It stores a sanitized copy in `localStorage`: script
elements and event-handler attributes are discarded, but anchor `id`, `name`,
`href`, and `rel` attributes are preserved. That models a rich-text feature
whose sanitizer allows safe-looking links but leaves named DOM properties
available to the app.

## Run the website

```sh
cd tasks/dom-clobbering-field-demo/site
python3 server.py 8006
```

Open `http://127.0.0.1:8006/`. To use another free port, pass it to
`server.py`.

## Test the chain through the form

Paste this into the **Formatted update** field, then click **Save update**:

```html
<a id="workspaceSettings" href="/">Workspace settings</a>
<a id="selectedReport" href="/">Quarterly report</a>
<a id="exportPolicy" rel="export" href="/">Export policy</a>
<a id="previewDestination" href="/report-preview.html?via=dom-clobber">Report preview</a>
```

The app's four dependent gadgets are:

1. `window.workspaceSettings.href` enables the report-tools path.
2. That path reads `window.selectedReport.href`.
3. The next stage checks for `window.exportPolicy.href`.
4. The final stage reads `window.previewDestination.href` and assigns it to
   `window.location.href`, navigating to the harmless local report preview.

On success, the browser URL changes to `/report-preview.html?via=dom-clobber`.
That local page shows a **DOM-CLOBBERING CHAIN TRIGGERED** banner and a harmless
report-chart image. The input page also lists the named-property checks as the
chain runs.

To have the generic Hulk task submit candidates through this field, keep the
site and TheHulk proxy running, then use the field and submit selectors:

```sh
./tasks/dom-clobbering-site-scan/scan.sh 8006 \
  --field-selector '#updateMarkup' \
  --submit-selector '#updateForm button[type=submit]' \
  --href 'http://127.0.0.1:8006/report-preview.html?via=dom-clobber'
```

The task starts by submitting an empty update so Hulk can observe the first
named-property lookup. It then submits anchors for newly observed names on
successive rounds. If the site uses another port, replace `8006` in the command
and candidate URL with that port. If the proxy is not on its default port,
pass the proxy port immediately after the site port.

The form importer is the attacker-controlled HTML entry point in this demo.
The URL fragment is not used. The HTML allowlist prevents direct script and
event-handler injection, but retaining user-controlled `id` and `name` makes
the saved anchors able to clobber the app's named globals.

This is an intentionally vulnerable teaching example. A production fix is to
render user text as text, or sanitize rich content with a well-maintained
allowlist that removes `id` and `name` (and to never choose a script URL from
user-controlled DOM properties).
