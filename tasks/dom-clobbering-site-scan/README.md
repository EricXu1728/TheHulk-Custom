# Scan a locally hosted site with TheHulk

This task uses TheHulk's runtime instrumentation to iteratively probe a local
page for DOM-clobbering gadget chains. Your website runs separately; this task
does not start or modify its files. Each round collects the window/document
property names Hulk observed, adds scriptless anchors for newly observed names,
and scans again. It stops when an injected target reaches a recorded sink, no
new names appear, or the round limit is reached.

Start your website in one terminal, for example:

```sh
python3 -m http.server 8080
```

Start TheHulk's proxy in another terminal. Run the proxy from `proxy-server`
because its script reads `config.yaml` relative to the working directory:

```sh
cd proxy-server
./setup.sh
```

Then, from the TheHulk repository root, pass the website port:

```sh
./tasks/dom-clobbering-site-scan/scan.sh 8080
```

The task assumes `http://127.0.0.1:<port>/`. You can pass a full local URL to
select a hostname, path, or query string, and an optional second argument to
select a non-default proxy port:

```sh
./tasks/dom-clobbering-site-scan/scan.sh http://localhost:8080/account 8902
```

To supply initial named-property candidates, put one or more anchors in the
fragment. The task imports only `a` elements and copies only `id`, `name`,
`href`, and `rel`; it ignores scripts and event-handler attributes. For example:

```sh
./tasks/dom-clobbering-site-scan/scan.sh 'http://localhost:8080/account#%3Ca%20id%3D%22reportModule%22%20href%3D%22http%3A%2F%2F127.0.0.1%3A8080%2Fmodule.js%22%3Etest%3C%2Fa%3E'
```

By default, discovered anchors use the scanned URL as their `href`. To try a
different URL value, pass a third argument after the proxy port:

```sh
./tasks/dom-clobbering-site-scan/scan.sh 8080 8899 http://127.0.0.1:8080/module.js
```

The iteration limit defaults to 12 rounds; override it with
`HULK_MAX_ROUNDS=20` before the command if the target has a longer chain.

Results are stored in a timestamped folder under
`tasks/dom-clobbering-site-scan/output/`. Inspect `taintflows.json` for
source-to-sink flows, `exploit.json` for Hulk's generated candidates, and the
`clobberable*` JSON files for named DOM properties observed at runtime.

The task injects markup into the test browser before page scripts execute; it
does not establish that a real attacker can inject the same fragment into your
site. Its generic anchor strategy satisfies common presence and `href`
conditions, but it does not infer arbitrary required element types, attribute
values, event sequences, or application-specific states. It also scans only
the supplied URL. Treat a found chain as a candidate to validate, and a missing
flow as inconclusive rather than proof the site is safe.

If the first round has an empty `clobberableSourcePool.json`, Hulk did not
observe any named window/document reads on that page execution. Confirm that
the supplied URL is the application's page (not a directory listing or a
different server root) and that the relevant JavaScript workflow runs there.
