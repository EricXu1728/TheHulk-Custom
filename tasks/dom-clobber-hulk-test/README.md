# TheHulk DOM Clobbering Test

This isolated, loopback-only demo runs a `window.demoConfig` read and an
`innerHTML` assignment on the plain page, without a clobbering fragment in the
URL. The runtime analysis only taints values it can wrap; it does not wrap
`undefined` or `null`. Therefore, when `demoConfig` is absent, a taint flow is
not expected from this page.

## Start the local page

From the TheHulk repository root, run in one terminal:

```sh
cd ../dom-clobber-hulk-test
python3 server.py
```

The page binds to `127.0.0.1:8001`.

## Start TheHulk and run the test

In another terminal, start TheHulk's instrumentation proxy and leave it running:

```sh
cd proxy-server
./setup.sh
```

If needed, build the analysis bundles once:

```sh
cd gadget-detection/runtime-analysis
npm run deploy
```

From the TheHulk repository root, run the integration test:

```sh
bash tasks/dom-clobber-hulk-test/test.sh
```

The task writes any observed flows under
`tasks/dom-clobber-hulk-test/output/`. The `test.sh` assertion expects a
source-to-sink flow and will fail for the plain URL because no DOM element
clobbers `window.demoConfig`. That assertion is useful as a positive control
when run with a seeded clobbering fragment; it is not a test of automatic
discovery. A full discovery test needs TheHulk's gadget-discovery and
exploit-generation stages, not just this runtime taint-crawl task. Stop the
local server and proxy with `Ctrl+C` when finished.
