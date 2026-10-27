# TheHulk DOM Clobbering Test

This isolated, loopback-only demo checks whether TheHulk tracks a DOM-clobbered
`window.demoConfig` value into an `innerHTML` assignment. The injected anchor
contains inert text only; it does not execute script or contact another host.

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

The test passes only if the generated `taintflows.json` contains both
`SOURCE-FROM-WINDOW` and `SINK-TO-DOM-ELEMENT-INNERHTML`. Results are stored
under `tasks/dom-clobber-hulk-test/output/`. A failed assertion prints the
captured flows for diagnosis. Stop the local server and proxy with `Ctrl+C`
when finished.
