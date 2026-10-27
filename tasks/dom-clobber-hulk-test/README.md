# TheHulk DOM Clobbering Test

This loopback-only harness runs gadget detection, exploit generation, and
verifier analysis. Its detector seed is a benign URL fragment that creates an
anchor named `demoConfig`; the page then reads its `href` and assigns it to a
script's `src`. Before verification, the runner restricts the candidate to a
single anchor with a local URL pointing to `/hulk.js`, a harmless local script.

The fragment is an explicit seed. This harness validates TheHulk's
trace-to-candidate-to-verifier pipeline, not unsupervised discovery from a
clean page with no clobbering input.

## Start the local page

From the TheHulk repository root, run in one terminal:

```sh
cd ../dom-clobber-hulk-test
python3 server.py
```

The page binds to `127.0.0.1:8001`.

## Start the proxy and run the workflow

In another terminal, start TheHulk's instrumentation proxy and leave it running:

```sh
cd proxy-server
./setup.sh
```

The workflow builds the taint-analysis bundle and a task-local verifier bundle
on each run. It does not modify TheHulk's shared runtime source or bundle.
If the JavaScript dependencies have not been installed, install the project's
dependencies first.

```sh
cd gadget-detection/runtime-analysis
npm run deploy
```

From the TheHulk repository root, run all three stages:

```sh
bash tasks/dom-clobber-hulk-test/run-full-workflow.sh
```

The runner checks for a `SOURCE-FROM-WINDOW` to `SINK-TO-SCRIPT-SRC` trace,
runs exploit generation from that trace, narrows the generated result to the
`demoConfig` anchor, rewrites its `href` to the local harmless script, and
launches the verifier against the plain page URL. It fails if detection,
generation, or verification produces no expected result. Outputs are saved
under `tasks/dom-clobber-hulk-test/output-full/`. Stop the local server and
proxy with `Ctrl+C` when finished.

The input fragment is needed because this runtime does not taint an absent
`window.demoConfig` value. A clean-URL scan cannot produce this test's
source-to-sink trace without a clobbering element being present while the
gadget executes. Therefore, a pass demonstrates the trace/generation/
verification workflow for a known test case, not automatic discovery from a
clean page.
