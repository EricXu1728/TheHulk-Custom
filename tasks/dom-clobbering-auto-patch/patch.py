#!/usr/bin/env python3
"""Create and optionally verify a conservative DOM-clobbering remediation patch.

The first remediation rule handles a common, high-confidence pattern:

    window.NAME = window.NAME || [...]

when Hulk observed NAME as a clobberable Window source. The copy is patched to
accept only the array type the fallback demonstrates the application expects.
Original site files are never modified.
"""

from __future__ import annotations

import argparse
import difflib
import http.server
import json
import os
import re
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
SCAN_SCRIPT = ROOT / "tasks/dom-clobbering-site-scan/scan.sh"
TEXT_SUFFIXES = {".html", ".htm", ".js", ".mjs", ".cjs"}


def read_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as stream:
        return json.load(stream)


def get_target_names(scan_output: Path) -> tuple[list[str], Path | None]:
    summary_path = scan_output / "discovery-summary.json"
    if not summary_path.exists():
        raise FileNotFoundError(f"Missing scan summary: {summary_path}")

    summary = read_json(summary_path)
    records = sorted(summary, key=lambda item: item.get("round", -1), reverse=True)
    flow_names = {
        name
        for record in records
        for flow in record.get("flowsFromInjectedTargets", [])
        for name in flow.get("sourceNames", [])
    }
    observed_names = {
        name for record in records for name in record.get("observedTargets", [])
    }
    trace = next((Path(record["tracePath"]) for record in records if record.get("flowsFromInjectedTargets") and record.get("tracePath")), None)
    return sorted(flow_names | observed_names), trace


def statement_end(source: str, start: int) -> int | None:
    """Find a top-level semicolon while tolerating nested JS literals/comments."""
    stack: list[str] = []
    quote: str | None = None
    escaped = False
    line_comment = False
    block_comment = False
    pairs = {"[": "]", "{": "}", "(": ")"}
    i = start
    while i < len(source):
        char = source[i]
        nxt = source[i + 1] if i + 1 < len(source) else ""
        if line_comment:
            if char == "\n":
                line_comment = False
        elif block_comment:
            if char == "*" and nxt == "/":
                block_comment = False
                i += 1
        elif quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
        elif char == "/" and nxt == "/":
            line_comment = True
            i += 1
        elif char == "/" and nxt == "*":
            block_comment = True
            i += 1
        elif char in "'\"`":
            quote = char
        elif char in pairs:
            stack.append(pairs[char])
        elif stack and char == stack[-1]:
            stack.pop()
        elif char == ";" and not stack:
            return i
        i += 1
    return None


def mask_comments(source: str) -> str:
    """Replace JS/HTML comments with spaces while retaining source offsets."""
    chars = list(source)
    i = 0
    quote: str | None = None
    escaped = False
    while i < len(source):
        if quote:
            if escaped:
                escaped = False
            elif source[i] == "\\":
                escaped = True
            elif source[i] == quote:
                quote = None
            i += 1
            continue
        if source[i] in "'\"`":
            quote = source[i]
            i += 1
            continue

        end = None
        if source.startswith("<!--", i):
            close = source.find("-->", i + 4)
            end = len(source) if close < 0 else close + 3
        elif source.startswith("//", i):
            close = source.find("\n", i + 2)
            end = len(source) if close < 0 else close
        elif source.startswith("/*", i):
            close = source.find("*/", i + 2)
            end = len(source) if close < 0 else close + 2

        if end is not None:
            for j in range(i, end):
                if chars[j] not in "\r\n":
                    chars[j] = " "
            i = end
        else:
            i += 1
    return "".join(chars)


def typed_default_patches(source: str, target: str) -> list[tuple[float, str, str]]:
    """Guard a traced Window value using the type of its existing fallback."""
    escaped = re.escape(target)
    patterns = [
        re.compile(rf"(?P<lhs>window\s*\.\s*{escaped})\s*=\s*window\s*\.\s*{escaped}\s*\|\|\s*"),
        re.compile(rf"(?P<lhs>(?:var|let|const)\s+(?P<alias>[A-Za-z_$][\w$]*))\s*=\s*window\s*\.\s*{escaped}\s*\|\|\s*"),
    ]
    patches: list[tuple[float, str, str]] = []
    searchable = mask_comments(source)
    for pattern in patterns:
        match = pattern.search(searchable)
        if not match:
            continue
        fallback_start = match.end()
        end = statement_end(searchable, fallback_start)
        if end is None:
            continue
        fallback = source[fallback_start:end].strip()
        if not fallback:
            continue

        value = f"window.{target}"
        alias = match.groupdict().get("alias")
        if fallback.startswith("["):
            valid = f"Array.isArray({value})"
            score, kind = 0.96, "array"
        elif fallback.startswith("{"):
            valid = f"{value} && Object.getPrototypeOf({value}) === Object.prototype"
            score, kind = 0.94, "plain-object"
        elif fallback[0] in "'\"`":
            valid = f"typeof {value} === \"string\""
            score, kind = 0.93, "string"
        elif fallback == "null" and alias and re.search(rf"\b{re.escape(alias)}\s*\.\s*id\b", source):
            valid = f'{value} && Object.getPrototypeOf({value}) === Object.prototype && typeof {value}.id === "string"'
            score, kind = 0.97, "plain-object-with-string-id"
        else:
            # A fallback identifier/expression supplies its own expected type.
            # This rejects DOM elements while retaining values of that type.
            valid = f"typeof {value} === typeof ({fallback})"
            score, kind = 0.88, "fallback-type"

        # Keep the original assignment/declaration and fallback expression.
        replacement = f"{match.group('lhs')} = ({valid}) ? {value} : {fallback};"
        patched = source[: match.start()] + replacement + source[end + 1 :]
        patches.append((score, patched, f"type-guard:{target}:{kind}"))
    return patches


def if_conditions(source: str):
    """Yield simple if-test spans, excluding comments and preserving offsets."""
    searchable = mask_comments(source)
    for match in re.finditer(r"\bif\s*\(([^()\n]*)\)", searchable):
        yield match.start(1), match.end(1), source[match.start(1):match.end(1)]


def root_string_patches(source: str, target: str) -> list[tuple[float, str, str]]:
    patches = []
    target_pattern = re.compile(rf"\b(?:window\s*\.\s*)?{re.escape(target)}(?:\s*\.\s*[A-Za-z_$][\w$]*)*\s*\.\s*root\b")
    for start, end, condition in if_conditions(source):
        if target not in condition:
            continue
        matches = list(target_pattern.finditer(condition))
        if not matches:
            continue
        field = matches[-1].group(0)
        replacement = f'(typeof {field} === "string" && {field})'
        updated_condition = condition[:matches[-1].start()] + replacement + condition[matches[-1].end():]
        patched = source[:start] + updated_condition + source[end:]
        patches.append((0.92, patched, f"string-root-guard:{target}"))
    return patches


def strict_boolean_gate_patches(source: str) -> list[tuple[float, str, str]]:
    """Require actual booleans for properties whose defaults are false."""
    searchable = mask_comments(source)
    false_properties = set(re.findall(r"\b([A-Za-z_$][\w$]*)\s*:\s*false\b", searchable))
    patches = []
    for start, end, condition in if_conditions(source):
        members = []
        for prop in false_properties:
            pattern = re.compile(rf"\b[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*\s*\.\s*{re.escape(prop)}\b")
            members.extend((m.start(), m.end(), m.group(0), prop) for m in pattern.finditer(condition))
        if not members:
            continue
        left, right, member, prop = max(members, key=lambda item: item[0])
        if re.search(rf"{re.escape(member)}\s*===\s*true", condition):
            continue
        replacement = f"({member} === true)"
        updated_condition = condition[:left] + replacement + condition[right:]
        patched = source[:start] + updated_condition + source[end:]
        patches.append((0.87, patched, f"strict-boolean-gate:{prop}"))
    return patches


def current_script_guard_patches(source: str) -> list[tuple[float, str, str]]:
    """Ignore named DOM elements where code expects document.currentScript."""
    searchable = mask_comments(source)
    patches = []
    pattern = re.compile(r"\bif\s*\(\s*(?P<expr>(?:document|document_obj)\s*\.\s*currentScript)\s*\)")
    for match in pattern.finditer(searchable):
        expr = match.group("expr")
        replacement = f"if ({expr} instanceof HTMLScriptElement)"
        patched = source[:match.start()] + replacement + source[match.end():]
        patches.append((0.99, patched, "currentScript-must-be-script-element"))
    return patches


def apply_candidate(site_dir: Path, site_copy: Path, entry: str, target_names: list[str]) -> tuple[Path, str, str, str] | None:
    candidates: list[tuple[float, Path, str, str, str]] = []
    relative = site_dir / entry
    if not relative.is_file() or relative.suffix.lower() not in TEXT_SUFFIXES:
        return None
    for relative in [relative]:
        try:
            original = relative.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for target in target_names:
            rules = typed_default_patches(original, target)
            rules += root_string_patches(original, target)
            for score, patched, strategy in rules:
                candidates.append((score, relative, original, patched, strategy))
        # Boolean gates are useful when a trace's direct source has no safe
        # fallback initialization (e.g. code strings gated by a false-by-default
        # feature flag). Only consider files that contain one of the traced names.
        if any(re.search(rf"\b{re.escape(target)}\b", original) for target in target_names):
            for score, patched, strategy in strict_boolean_gate_patches(original):
                candidates.append((score, relative, original, patched, strategy))
            if "currentScript" in target_names:
                for score, patched, strategy in current_script_guard_patches(original):
                    candidates.append((score, relative, original, patched, strategy))

    if not candidates:
        return None

    candidates.sort(key=lambda item: item[0], reverse=True)
    best_score, original_path, original, patched, strategy = candidates[0]
    dest = site_copy / original_path.relative_to(site_dir)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(patched, encoding="utf-8")
    diff = "".join(
        difflib.unified_diff(
            original.splitlines(keepends=True),
            patched.splitlines(keepends=True),
            fromfile=f"a/{original_path.relative_to(site_dir)}",
            tofile=f"b/{original_path.relative_to(site_dir)}",
        )
    )
    return original_path, strategy, diff, str(best_score)


def verify_with_scanner(site_copy: Path, entry: str, proxy_port: int, output: Path) -> tuple[bool, str]:
    class QuietHandler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            super().__init__(*args, directory=str(site_copy), **kwargs)

        def log_message(self, fmt: str, *args: Any) -> None:
            pass

    try:
        server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), QuietHandler)
    except OSError as exc:
        raise RuntimeError(f"Could not start temporary site server: {exc}") from exc
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        url = f"http://127.0.0.1:{server.server_address[1]}/{entry.lstrip('/')}"
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

    output.write_text(proc.stdout, encoding="utf-8")
    match = re.search(r"Scan output: (.+)", proc.stdout)
    if proc.returncode != 0 or not match:
        return False, f"Scanner failed; see {output}"

    generated = Path(match.group(1).strip())
    summary_path = generated / "discovery-summary.json"
    if not summary_path.exists():
        return False, f"Scanner did not produce a summary; see {output}"
    summary = read_json(summary_path)
    injected = [record for record in summary if record.get("injectedTargets")]
    if not injected:
        return False, f"The scan produced no injected-target round; cannot verify remediation: {summary_path}"
    remaining = [
        flow
        for record in summary
        for flow in record.get("flowsFromInjectedTargets", [])
    ]
    remaining_count = sum(int(record.get("taintFlowCount", 0)) for record in summary)
    passed = not remaining and remaining_count == 0
    return passed, f"verification summary: {summary_path}; remaining flows: {remaining_count}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site-dir", type=Path, required=True, help="Original local site directory (read only)")
    parser.add_argument("--scan-output", type=Path, required=True, help="Hulk scan output directory containing discovery-summary.json")
    parser.add_argument("--entry", required=True, help="Entry page path relative to site-dir, used with --verify")
    parser.add_argument("--output-dir", type=Path, help="Output directory; defaults to a new temporary directory")
    parser.add_argument("--verify", action="store_true", help="Run the generic site-scan task on the patched copy")
    parser.add_argument("--proxy-port", type=int, default=int(os.environ.get("HULK_PROXY_PORT", "8899")))
    args = parser.parse_args()

    site_dir = args.site_dir.resolve()
    scan_output = args.scan_output.resolve()
    if not site_dir.is_dir():
        parser.error(f"Not a site directory: {site_dir}")
    output = args.output_dir.resolve() if args.output_dir else Path(tempfile.mkdtemp(prefix="hulk-auto-patch-"))
    try:
        output.relative_to(site_dir)
    except ValueError:
        pass
    else:
        parser.error("--output-dir must be outside --site-dir; the source site is read only")
    entry_path = Path(args.entry)
    if entry_path.is_absolute() or ".." in entry_path.parts:
        parser.error("--entry must be a relative path inside --site-dir")
    output.mkdir(parents=True, exist_ok=True)
    site_copy = output / "patched-site"
    if site_copy.exists():
        shutil.rmtree(site_copy)
    shutil.copytree(site_dir, site_copy)
    if not (site_copy / entry_path).is_file():
        parser.error(f"Entry page does not exist in the site copy: {entry_path}")

    target_names, _trace = get_target_names(scan_output)
    report: dict[str, Any] = {
        "inputSite": str(site_dir),
        "scanOutput": str(scan_output),
        "observedTargets": target_names,
        "patchStatus": "abstained",
        "confidence": 0,
        "reason": "No supported high-confidence remediation pattern matched.",
        "verification": "not-run",
    }

    if target_names:
        candidate = apply_candidate(site_dir, site_copy, args.entry, target_names)
        if candidate:
            changed_file, strategy, diff, score = candidate
            (output / "remediation.diff").write_text(diff, encoding="utf-8")
            report.update(
                patchStatus="generated",
                confidence=float(score),
                strategy=strategy,
                changedFile=str(changed_file.relative_to(site_dir)),
                reason="A trace-linked type/default or false-by-default gate matched a conservative remediation rule.",
            )
            if args.verify:
                passed, details = verify_with_scanner(
                    site_copy,
                    args.entry,
                    args.proxy_port,
                    output / "verification.log",
                )
                report["verification"] = "passed" if passed else "failed"
                report["verificationDetails"] = details
        else:
            report["reason"] = "The trace had clobberable Window targets, but no supported remediation rule matched. No patch was applied."
    else:
        report["reason"] = "The supplied scan summary contains no injected-target source-to-sink flow. No patch was applied."

    (output / "remediation.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    print(f"\nTemporary patched site: {site_copy}")
    print(f"Report: {output / 'remediation.json'}")
    if report["patchStatus"] == "generated":
        print(f"Diff: {output / 'remediation.diff'}")
    if args.verify and report["verification"] != "passed":
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
