# Local DOM clobbering analysis

This task analyzes one page, `http://127.0.0.1:8000/` by default. Its configured
seed fragment creates an anchor named `demoConfig` whose local `href` is read
through `window.demoConfig.href` and assigned to a script element's `src`.
That assignment is the tracked sink. The referenced `hulk.js` only sets a
same-origin boolean; it is a harmless positive-control payload. This seeded
example checks Hulk's flow-recording path, rather than discovering the seed on
its own. The task records runtime dangerous taint flows and branch conditions,
then runs Hulk's exploit generator against those flows.

## Run

1. Start your local website on port 8000.
2. In a second terminal, start the instrumentation proxy and leave it running:

   ```sh
   cd TheHulk/proxy-server
   ./setup.sh
   ```

3. From the TheHulk repository root, run:

   ```sh
   ./tasks/dom-clobbering-local/run.sh
   ```

Edit `config.scheduler.yml` to point `SEED_URL` at another local path. The
browser waits ten seconds after navigation. For pages that need interaction,
set `HEADLESS: false` in `config.browser.yml` and use that time to exercise the
page; increase the wait callback if necessary.

## Results

Results are under `tasks/dom-clobbering-local/output/`. In the per-page
`crawler/` folder, inspect:

- `taintflows.json`: observed dangerous source-to-sink flows.
- `conditions.json`: recorded branch conditions for exploit generation.
- `exploit.json`: generated DOM-clobbering payload candidates, if the trace
  supports generation.

A taint flow or generated payload is a lead, not proof that the application is
vulnerable. Confirm that a candidate actually changes a DOM property used by
the page and reaches an exploitable sink. No flow means only that this visit
did not observe one; the page may require other routes, inputs, or interactions.
