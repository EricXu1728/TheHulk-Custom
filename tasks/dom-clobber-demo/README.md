# DOM Clobber Demo Taint Positive Control

The task uses the demo server on `127.0.0.1:8000`, but visits the separate
`/hulk-taint-test.html` fixture rather than changing the demo's main page.
That fixture uses an inert fragment anchor to clobber `window.demoConfig`,
then sends its local `href` to a script `src`. The referenced `/hulk.js` only
sets a local boolean; it does not execute an attack or contact another host.
This is a positive control for taint tracking, not blind vulnerability
discovery.

## Run

In separate terminals:

1. Start the original demo server from its directory:

   ```sh
   cd /home/ericx/hulkwork/dom-clobber-demo
   python3 server.py
   ```

2. Start the TheHulk instrumentation proxy from the repository root:

   ```sh
   cd /home/ericx/hulkwork/TheHulk/proxy-server
   ./setup.sh
   ```

3. If the runtime bundles have not been built, build them from the repository root:

   ```sh
   cd /home/ericx/hulkwork/TheHulk/gadget-detection/runtime-analysis
   npm run deploy
   ```

4. Run the test from the TheHulk repository root:

   ```sh
   bash tasks/dom-clobber-demo/test.sh
   ```

The output is written under `tasks/dom-clobber-demo/output/`. Inspect the
per-page `crawler/taintflows.json`; the test succeeds only if it contains a
`SOURCE-FROM-WINDOW` to `SINK-TO-SCRIPT-SRC` flow. Stop the server and proxy
with `Ctrl+C` when finished.

The original `/` page still demonstrates its `pageMessage` behavior, but it
uses `textContent` for the clobbered message, not a sink TheHulk reports as
dangerous. The positive-control fixture is separate so the main demo remains
unchanged.
