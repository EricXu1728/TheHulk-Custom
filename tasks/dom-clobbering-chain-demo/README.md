# DOM clobbering gadget-chain demo

This page models a control-flow-dependent chain with two DOM-clobbering
gadgets. It has no clobbering markup in the page source. The app accepts a
fragment through a restricted importer that copies only `a` elements and
their `id`, `href`, and `rel` attributes; it drops scripts and event-handler
attributes.

## Chain

1. **Gadget 1 — feature gate:** `window.reportMode` must resolve to an element
   with a non-empty `href`. If so, the app sets `state.exportEnabled`.
2. **Gadget 2 — module loader:** this function returns unless Gadget 1 enabled
   the export branch. It then reads `window.reportModule.href` and assigns it
   to a script element's `src`.
3. **Impact:** the second clobbered value reaches the script-loading sink. The
   supplied test URL points to a harmless local module.

The chain mode supplies two scriptless anchors in the fragment. The clean mode
visits `/` with no fragment: the first gadget's condition is false, so the
second gadget and sink are not reached.

## Run

Start the TheHulk instrumentation proxy in one terminal:

```sh
cd proxy-server
./setup.sh
```

From the TheHulk repository root, the manual clean baseline and seeded chain
are:

```sh
./tasks/dom-clobbering-chain-demo/run.sh clean
./tasks/dom-clobbering-chain-demo/run.sh seeded
```

Each command starts and stops its own demo server on port 8003. Results are
stored under `tasks/dom-clobbering-chain-demo/output/clean/` and
`tasks/dom-clobbering-chain-demo/output/seeded/`, respectively. Inspect each
run's `crawler/taintflows.json`, `conditions.json`, and `exploit.json`.
Each run also writes `clobberableSourcePool.json` (observed `window` and
`document` property names), `clobberableSources.json` (lookup counts), and
`clobberableSinks.json` (observed sink-type counts). Compare clean and seeded
inventories: the clean path should not reach the `reportModule` lookup, while
the seeded path should.

This experiment is designed to expose Hulk's current limitation: it can trace
the second gadget's source-to-sink flow when the complete chain is supplied,
but it does not compose the first gadget's control-flow condition into a
payload for the second gadget in one analysis pass. The clean run is not
expected to report the sink because the gated code is not reached.

## Iterative chain construction

The adaptive driver reuses Hulk's clobberable-source inventory across repeated
visits. It starts with a clean URL, injects scriptless anchors for newly seen
`window` property names, and repeats when opening one branch reveals another
clobberable name. It stops when a recorded taint flow reaches `script.src` or
when a round reveals no new target. The report-mode gadget requires a non-empty
`href`; the driver supplies the local module URL to candidate anchors.

Run it from the TheHulk repository root:

```sh
./tasks/dom-clobbering-chain-demo/discover-chain.sh
```

The optional first argument selects the proxy port; it defaults to 8899. For
example, with the proxy listening on port 8901, run
`./tasks/dom-clobbering-chain-demo/discover-chain.sh 8901`.

The driver writes per-round Hulk traces and a `discovery-summary.json`. On
success it also writes `generated-chain-markup.html` and
`generated-chain-url.txt` under `tasks/dom-clobbering-chain-demo/output/auto-chain/`.
This is a small feedback-driven prototype for the demo's simple `href`
restriction, not a general solver for arbitrary branch predicates. Hulk's own
single-pass chain limitation remains; the wrapper explores the dependency by
running Hulk repeatedly.
