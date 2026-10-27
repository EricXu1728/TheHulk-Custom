# DOM Clobber Demo Task

This task visits the local demo with a harmless URL-fragment markup that
creates `window.pageMessage`, then records TheHulk's dynamic taint-analysis
results. It is scoped to `127.0.0.1`; it does not run exploit generation or
verification.

## Run

In separate terminals:

1. Start the demo server:

   ```sh
   cd ../dom-clobber-demo
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

4. Run this task from the repository root:

   ```sh
   bash tasks/dom-clobber-demo/run.sh
   ```

The output is written under `tasks/dom-clobber-demo/output/`. Inspect the
per-page `crawler/taintflows.json` for reported flows. The page should also
show the clobbering candidate message when the seeded fragment is processed.
Stop the server and proxy with `Ctrl+C` when finished.

The clobbered value is ultimately rendered with `textContent`, which treats
it as text rather than HTML. A reported flow to `innerHTML` may be from the
fragment insertion itself, so inspect its source and sink before treating it
as evidence that TheHulk detected the named-property clobbering.
