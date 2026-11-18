# DOM Clobbering Auto Patch (experimental)

This task consumes a `dom-clobbering-site-scan` output directory, copies a local
site into a separate output directory, and tries conservative, trace-guided
remediations. It currently handles these patterns:

- Type-check a clobberable global against the type of its existing default
  (`Array.isArray`, plain object, string, or the fallback expression's type).
- Require string-valued `.root` configuration and require a discovered
  `document.currentScript` value to be an `HTMLScriptElement`.
- Require an actual boolean `true` for feature gates whose in-file default is
  `false`.

The task applies one candidate to the scanned entry file in a temporary site
copy. Unsupported patterns result in an abstention. Its confidence value is a
rule-ranking score, not a calibrated probability.

## Generate a patch

```bash
python3 tasks/dom-clobbering-auto-patch/patch.py \
  --site-dir /path/to/site \
  --scan-output /path/to/site-scan/output/RUN-ID \
  --entry index.html
```

The task writes `remediation.diff`, `remediation.json`, and a complete
`patched-site/` copy under a new `/tmp/hulk-auto-patch-*` directory. Set
`--output-dir` to choose another destination.

## Generate and verify

Start Hulk's proxy, then run:

```bash
python3 tasks/dom-clobbering-auto-patch/patch.py \
  --site-dir /path/to/site \
  --scan-output /path/to/site-scan/output/RUN-ID \
  --entry index.html \
  --proxy-port 8901 \
  --verify
```

Verification serves the temporary patched copy on a free local port and runs
`tasks/dom-clobbering-site-scan/scan.sh` against it. A passing result means the
scanner no longer observed a taint flow in that run; it does not prove the
whole site is free of DOM clobbering.

## Run all benchmark fixtures

With Hulk's proxy running:

```bash
python3 tasks/dom-clobbering-auto-patch/benchmark.py \
  --site-dir /path/to/multi-gadget-chains \
  --proxy-port 8901
```

The runner first checks that each original fixture has an injected-target flow,
then generates and verifies a patch on a separate copy. It writes per-fixture
logs/reports and `benchmark-summary.json` under a temporary directory. Provide
`--output-dir` to retain them at a chosen path.

This is an experimental fixer, not a general-purpose code-repair system. Source
mapping currently uses observed targets from the scan summary and matches
patterns in the entry file; it does not yet follow external JavaScript modules.
Review the diff and test normal application behavior before adopting it.
