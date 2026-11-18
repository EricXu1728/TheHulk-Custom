#!/usr/bin/env python3
"""Run baseline detection, temporary patching, and post-patch scans on fixtures."""

from __future__ import annotations

import argparse
import http.server
import json
import re
import socketserver
import subprocess
import sys
import tempfile
import threading
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
SCAN_SCRIPT = ROOT / "tasks/dom-clobbering-site-scan/scan.sh"
PATCH_SCRIPT = ROOT / "tasks/dom-clobbering-auto-patch/patch.py"


def serve(directory: Path):
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            super().__init__(*args, directory=str(directory), **kwargs)

        def log_message(self, fmt: str, *args: Any) -> None:
            pass

    server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread


def run_baseline(site_dir: Path, entry: str, proxy_port: int, log_path: Path) -> tuple[int, Path | None, str]:
    server, thread = serve(site_dir)
    url = f"http://127.0.0.1:{server.server_address[1]}/{entry}"
    try:
        proc = subprocess.run(
            [str(SCAN_SCRIPT), url, str(proxy_port)],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            check=False,
        )
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
    log_path.write_text(proc.stdout, encoding="utf-8")
    match = re.search(r"Scan output: (.+)", proc.stdout)
    return proc.returncode, Path(match.group(1).strip()) if match else None, url


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site-dir", type=Path, required=True, help="Original fixture/site directory; never modified")
    parser.add_argument("--proxy-port", type=int, default=8899)
    parser.add_argument("--output-dir", type=Path, help="Results directory; defaults to /tmp")
    parser.add_argument("--pattern", default="chain_*.html", help="Fixture glob (default: chain_*.html)")
    args = parser.parse_args()

    site_dir = args.site_dir.resolve()
    if not site_dir.is_dir():
        parser.error(f"Not a directory: {site_dir}")
    output = args.output_dir.resolve() if args.output_dir else Path(tempfile.mkdtemp(prefix="hulk-patch-benchmark-"))
    try:
        output.relative_to(site_dir)
    except ValueError:
        pass
    else:
        parser.error("--output-dir must be outside --site-dir; the source fixtures are read only")
    output.mkdir(parents=True, exist_ok=True)

    fixtures = sorted(path for path in site_dir.glob(args.pattern) if path.is_file())
    if not fixtures:
        parser.error(f"No fixtures matched {args.pattern!r} in {site_dir}")

    results = []
    for fixture in fixtures:
        entry = fixture.relative_to(site_dir).as_posix()
        key = fixture.stem.split("_")[1]
        case_dir = output / f"chain_{key}"
        case_dir.mkdir(parents=True, exist_ok=True)
        print(f"[{fixture.name}] baseline scan", flush=True)
        code, baseline, url = run_baseline(site_dir, entry, args.proxy_port, case_dir / "baseline.log")
        result: dict[str, Any] = {"fixture": fixture.name, "baselineUrl": url}
        if code or not baseline:
            result.update(status="failed", reason=f"Baseline scanner failed; see {case_dir / 'baseline.log'}")
            results.append(result)
            print(f"[{fixture.name}] FAIL: {result['reason']}", flush=True)
            continue

        summary_path = baseline / "discovery-summary.json"
        try:
            summary = json.loads(summary_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            result.update(status="failed", reason=f"Could not read baseline summary: {exc}")
            results.append(result)
            print(f"[{fixture.name}] FAIL: {result['reason']}", flush=True)
            continue

        baseline_flows = [flow for row in summary for flow in row.get("flowsFromInjectedTargets", [])]
        if not baseline_flows:
            result.update(status="failed", reason="Baseline had no injected-target flow; patch verification would not be meaningful.")
            results.append(result)
            print(f"[{fixture.name}] FAIL: baseline found no injected-target flow", flush=True)
            continue

        print(f"[{fixture.name}] generate and verify temporary patch", flush=True)
        patch_log = case_dir / "patcher.log"
        proc = subprocess.run(
            [
                sys.executable,
                str(PATCH_SCRIPT),
                "--site-dir", str(site_dir),
                "--scan-output", str(baseline),
                "--entry", entry,
                "--output-dir", str(case_dir / "patch-result"),
                "--proxy-port", str(args.proxy_port),
                "--verify",
            ],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            check=False,
        )
        patch_log.write_text(proc.stdout, encoding="utf-8")
        report_path = case_dir / "patch-result" / "remediation.json"
        try:
            report = json.loads(report_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            report = {}
        passed = proc.returncode == 0 and report.get("verification") == "passed"
        result.update(
            status="passed" if passed else "failed",
            baselineScan=str(baseline),
            patchReport=str(report_path),
            strategy=report.get("strategy"),
            remainingFlows=report.get("verificationDetails"),
        )
        results.append(result)
        print(f"[{fixture.name}] {'PASS' if passed else 'FAIL'}: {report.get('strategy')} / {report.get('verificationDetails')}", flush=True)

    aggregate = {"siteDir": str(site_dir), "fixtureCount": len(fixtures), "results": results}
    summary_out = output / "benchmark-summary.json"
    summary_out.write_text(json.dumps(aggregate, indent=2) + "\n", encoding="utf-8")
    passed_count = sum(result.get("status") == "passed" for result in results)
    print(f"\nPassed {passed_count}/{len(fixtures)} fixtures")
    print(f"Benchmark report: {summary_out}")
    return 0 if passed_count == len(fixtures) else 1


if __name__ == "__main__":
    sys.exit(main())
