# Four-gadget DOM clobbering chain demo

This isolated demo models a realistic staged analytics export workflow. Its
scriptless fragment importer accepts only anchors and the `id`, `href`, and
`rel` attributes. There is no clobbering markup in the clean page.

The chain has four dependent named-property gadgets:

1. `window.accountPreference.href` enables the account-ready state.
2. After that state, `window.reportSelection.href` selects a report.
3. After report selection, `window.exportFormat.href` enables exports.
4. After export is enabled, `window.formatModule.href` is assigned to
   `script.src`.

The loaded module is a harmless local file. The scanner starts clean, records
clobberable window names, adds scriptless anchors for newly observed names,
and reruns Hulk until the script-src sink is reached or no new names appear.

Start the proxy from the proxy-server directory (the proxy reads its config
relative to that working directory):

```sh
cd proxy-server
./setup.sh
```

Then, from another terminal at the repository root, pass the proxy port as an
argument (default is 8899):

```sh
./tasks/dom-clobbering-chain4-demo/discover-chain.sh 8899
```

The site runs on port 8004. Results are written under
`tasks/dom-clobbering-chain4-demo/output/auto-chain/`, including the per-round
summary, generated fragment, final URL, and Hulk trace. A successful complete
run should discover the four names across successive rounds and reach the
script-src sink. This feedback-driven demo is not a general solver for
arbitrary branch predicates.

To keep the website running separately and scan it with the generic local-site
task, start it on a chosen port from this directory, for example
`python3 server.py 8080`, then run
`./tasks/dom-clobbering-site-scan/scan.sh 8080` from the repository root.
