# Local DOM Clobbering Lab

This page demonstrates a DOM-clobbered named property flowing into an
`innerHTML` sink. The form value is fixed, harmless markup. The page does not
read payloads from the URL or make requests to external hosts.

## Run the page

From the TheHulk repository root, start a server bound to loopback:

```sh
python3 -m http.server 8002 --bind 127.0.0.1 --directory examples/dom-clobbering-local
```

Leave this terminal running while you scan; stop the server with `Ctrl+C` when
finished.

Open <http://127.0.0.1:8002/>. The page should display “Read from the
clobbered form” in bold and confirm that `window.demoConfig` resolves to the
form element.

## Run Hulk's gadget detection

The task config leaves `CHROME_EXECUTABLE_PATH` empty so Hulk uses the
Chromium executable managed by its installed Playwright package. If Chromium
has not been downloaded yet, install it with `npx playwright install chromium`
from the `crawler` directory.

Hulk's proxy instruments the page's inline JavaScript before Chromium runs it.
If the proxy environment has not been set up, create it once from the
repository root:

```sh
conda create -n mitmproxy_env -c conda-forge --override-channels python=3.11 -y
conda run -n mitmproxy_env python -m pip install -r proxy-server/requirements.txt
```

Start the proxy in a separate terminal from the repository root:

```sh
cd proxy-server
./setup.sh
```

Leave it running on port 8899 while the scan is active.

In another terminal, build the runtime bundle if it has not already been
built:

```sh
cd gadget-detection/runtime-analysis
npm run deploy
```

Then, from `crawler/src`, run the dedicated one-URL analysis task:

```sh
cd crawler/src
node scheduler.js \
  --scheduler-config ../../tasks/dom-clobbering-local/config.scheduler.yml \
  --crawler-config ../../tasks/dom-clobbering-local/config.browser.yml
```

The task is seeded with `http://127.0.0.1:8002/` and uses Hulk's dynamic
taint-analysis callbacks. Inspect the generated task output under
`tasks/dom-clobbering-local/output/`; per-page `taintflows.json` files contain
the recorded dangerous flows when Hulk observes the clobbered value reaching
the sink.

This lab is for detection and analysis on the local page only. It does not run
Hulk's exploit-generation or exploit-verification modules and contains no
executable attack payload. Keep the page bound to `127.0.0.1`.
