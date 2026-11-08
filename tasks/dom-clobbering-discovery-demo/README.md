# Unseeded DOM clobbering discovery demo

This positive-control page is visited at a plain URL (`http://127.0.0.1:8002/`)
with no fragment or injected attack markup. The page contains a service-details
link with `id="widgetBootstrap"`; the legacy module loader reads the
browser-exposed `window.widgetBootstrap.href` and assigns it to `script.src`.
The loaded module powers the service breakdown control. Hulk should observe
the `SOURCE-FROM-WINDOW` to `SINK-TO-SCRIPT-SRC` flow and generate candidate
clobbering markup for `widgetBootstrap`.

This demonstrates gadget discovery and payload generation without supplying
the clobbering payload in the input URL. The page still contains a naturally
clobberable named element, and the script URL points only to the harmless local
`service-status-widget.js`. It is a controlled positive example, not proof that
Hulk can cover every route or discover every gadget in an arbitrary site.

## Run

Start the instrumentation proxy in one terminal and leave it running:

```sh
cd proxy-server
./setup.sh
```

If you changed the demo JavaScript since starting the proxy, restart the proxy
so it instruments the current files rather than reusing cached output. Then,
from the TheHulk repository root, run:

```sh
./tasks/dom-clobbering-discovery-demo/run.sh
```

The runner starts and stops the local demo server on port 8002. It exits with a
failure if it does not find the expected flow and generated payloads. Results
are printed as absolute paths and saved under
`tasks/dom-clobbering-discovery-demo/output/` in `crawler/taintflows.json`,
`conditions.json`, and `exploit.json`. Each page folder also contains
`clobberableSourcePool.json`, `clobberableSources.json`, and
`clobberableSinks.json` for the names and sink types observed at runtime.
