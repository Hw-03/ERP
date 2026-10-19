"""Restore only evidenced precursors, once; stop at the first failure."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import time
from typing import Any


HERE = Path(__file__).resolve().parent
BATCHES = (
    ("bom-native-only-precursors", ("shipping-additional-expectations.spec.ts",),
     "SHIP-(DISCARD|VARIANT|CANDIDATE-DRIFT|GENERATED-ROLES) ", 4),
)


def save(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")


def identity(pid: int) -> dict[str, Any] | None:
    """Use start ticks for lifetime identity; inspect arguments only for kill ownership."""
    try:
        proc = Path("/proc") / str(pid)
        fields = (proc / "stat").read_text().rsplit(")", 1)[1].split()
        return {"pid": pid, "start_ticks": fields[19], "state": fields[0],
                "cwd": str((proc / "cwd").resolve(strict=True)),
                "args": (proc / "cmdline").read_bytes().split(b"\0")}
    except (FileNotFoundError, ProcessLookupError):
        return None


def owned_backend(source: Path) -> dict[str, Any] | None:
    pidfile = source / "frontend/tests/e2e/.e2e-backend.pid"
    if not pidfile.exists():
        return None
    pid = int(pidfile.read_text().strip())
    if pid < 2:
        raise ValueError("invalid owned backend PID")
    current = identity(pid)
    if current is None or current["state"] == "Z":
        return None
    args = current["args"]
    if current["cwd"] != str(source / "backend") or b"uvicorn" not in args or b"--port" not in args or args[args.index(b"--port") + 1] != b"8021":
        raise ValueError("backend PID ownership mismatch; refusing to signal")
    return current


def stop_backend(source: Path) -> None:
    current = owned_backend(source)
    if current is None:
        return
    os.kill(current["pid"], signal.SIGTERM)
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        after = identity(current["pid"])
        if after is None or after["state"] == "Z" or after["start_ticks"] != current["start_ticks"]:
            return
        time.sleep(0.1)
    raise RuntimeError("owned backend did not stop gracefully")


def stop_group(process: subprocess.Popen[Any], source: Path) -> None:
    """Signal only our session's remaining children with cwd inside the export."""
    members = []
    for proc in Path("/proc").iterdir():
        if not proc.name.isdigit():
            continue
        try:
            if os.getpgid(int(proc.name)) != process.pid:
                continue
        except ProcessLookupError:
            continue
        current = identity(int(proc.name))
        if current and current["state"] != "Z":
            if not Path(current["cwd"]).is_relative_to(source):
                raise ValueError("runner child ownership mismatch")
            members.append(current)
    if members:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    if process.poll() is None:
        process.wait(timeout=10)
    deadline = time.monotonic() + 10
    while members and time.monotonic() < deadline:
        members = [current for previous in members if (current := identity(previous["pid"])) is not None
                   and current["start_ticks"] == previous["start_ticks"] and current["state"] != "Z"]
        if members:
            time.sleep(0.1)
    if members:
        raise RuntimeError("owned Next/runner group did not stop gracefully")


def stop_helper(process: subprocess.Popen[Any] | None) -> None:
    if process is not None and process.poll() is None:
        process.terminate()
        process.wait(timeout=10)
    if process is not None and process.returncode != 0:
        raise RuntimeError("PID watcher did not exit cleanly")


def capture_ready(path: Path, process: subprocess.Popen[Any]) -> None:
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if path.exists() and any('"event": "capture.ready"' in line for line in path.read_text().splitlines()):
            return
        if process.poll() is not None:
            raise RuntimeError("TCP collector exited before capture.ready")
        time.sleep(0.1)
    raise RuntimeError("TCP collector readiness timed out")


def stop_capture(process: subprocess.Popen[Any] | None, output: Path) -> None:
    if process is None:
        return
    # Root process cwd may be unreadable to the runner user. Verify/stop as root;
    # the helper checks the exact script, output path and /proc start ticks.
    subprocess.run(["sudo", "-n", sys.executable, "-I", str(HERE / "stop-capture.py"),
                    "--pid-file", str(output / "collector-pid.json"),
                    "--script", str(HERE / "io/capture-ipv4-tcp.py"),
                    "--output", str(output / "packets.jsonl")], check=True)
    if process.wait(timeout=10) != 0:
        raise RuntimeError("TCP collector did not exit cleanly")


def ports_free() -> None:
    with socket.socket() as front, socket.socket() as back:
        for connection, port in ((front, 3100), (back, 8021)):
            connection.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            connection.bind(("127.0.0.1", port))


def verify_report(report: dict[str, Any], expected: int, same_worker: bool) -> list[int]:
    """Reject partial success or an unintended browser-worker restart in a cohort."""
    stats = report["stats"]
    if stats.get("expected") != expected or any(stats.get(key, 0) for key in ("unexpected", "flaky", "skipped")):
        raise ValueError("selector execution count or retry-free result mismatch")
    results = []

    def visit(suite: dict[str, Any]) -> None:
        for spec in suite.get("specs", []):
            for test in spec.get("tests", []):
                results.extend(test.get("results", []))
        for child in suite.get("suites", []):
            visit(child)

    visit(report)
    if len(results) != expected or any(row.get("status") != "passed" or row.get("retry") != 0 for row in results):
        raise ValueError("individual test result mismatch")
    workers = sorted({row["workerIndex"] for row in results})
    if same_worker and len(workers) != 1:
        raise ValueError("original precursor cohort must keep one browser worker")
    return workers


def run_batch(source: Path, artifacts: Path, name: str, specs: tuple[str, ...], selector: str, expected: int) -> dict[str, Any]:
    output = artifacts / name
    output.mkdir()
    env = {**os.environ, "MES_DIAG_SOURCE": str(source), "MES_DIAG_OUTPUT": str(output),
           "MES_RUNTIME_ROOT": str(output / "runtime"), "AUDIT_CSV_DIR": str(output / "audit_csv"),
           "DATABASE_URL": "sqlite:///" + str(source / "backend/mes_e2e.db"),
           "BACKEND_INTERNAL_URL": "http://127.0.0.1:8021", "CI": "1", "APP_ENV": "development",
           "REQUIRE_POSTGRES": "0", "NEXT_TELEMETRY_DISABLED": "1", "PYTHONUTF8": "1", "MES_BOM_DIAG": "1",
           "IO_RUN_ID": name, "IO_TRACE_TARGET_PORT": "8021",
           "IO_NODE_TRACE_FILE": str(output / "next-http.jsonl"), "IO_PY_TRACE_FILE": str(output / "backend-protocol.jsonl"),
           "NODE_OPTIONS": "--require=" + str(HERE / "io/next-preload.cjs"), "PYTHONPATH": str(HERE / "io")}
    result: dict[str, Any] = {"name": name, "selector": selector, "specs": specs, "max_repetitions": 1,
                              "expected_tests": expected, "retry": 0, "workers": 1,
                              "started_wall_ns": time.time_ns(), "started_mono_ns": time.monotonic_ns(), "status": "infrastructure_failure",
                              "environment": {key: env[key] for key in ("CI", "APP_ENV", "REQUIRE_POSTGRES", "DATABASE_URL",
                                  "BACKEND_INTERNAL_URL", "MES_RUNTIME_ROOT", "AUDIT_CSV_DIR", "IO_RUN_ID", "IO_TRACE_TARGET_PORT", "MES_BOM_DIAG")}}
    runner = watcher = collector = None
    errors = []
    try:
        ports_free()
        with (output / "collector-stdout.log").open("wb") as stdout, (output / "collector-stderr.log").open("wb") as stderr:
            collector = subprocess.Popen(["sudo", "-n", "env", "IO_RUN_ID=" + name, sys.executable, "-I",
                str(HERE / "io/capture-ipv4-tcp.py"), "--interface", "lo", "--port", "8021",
                "--output", str(output / "packets.jsonl"), "--pid-file", str(output / "collector-pid.json")],
                stdout=stdout, stderr=stderr)
        capture_ready(output / "packets.jsonl", collector)
        command = ["node", "node_modules/@playwright/test/cli.js", "test", "--config=mes-flaky-diagnosis.config.ts",
                   "--project=chromium", "--workers=1", "--retries=0", "--max-failures=1",
                   "--repeat-each=1", *("tests/e2e/" + spec for spec in specs), "--grep", selector]
        with (output / "runner-stdout.log").open("wb") as stdout, (output / "runner-stderr.log").open("wb") as stderr:
            runner = subprocess.Popen(command, cwd=source / "frontend", env=env, stdout=stdout, stderr=stderr, start_new_session=True)
        with (output / "pidwatch-stderr.log").open("wb") as stderr:
            watcher = subprocess.Popen([sys.executable, "-I", str(HERE / "io/watch-pids.py"), "--pid", str(runner.pid),
                "--pidfile", str(source / "frontend/tests/e2e/.e2e-backend.pid"), "--output", str(output / "pids.jsonl")],
                env={**os.environ, "IO_RUN_ID": name}, stdout=subprocess.DEVNULL, stderr=stderr)
        result["runner_pid"] = runner.pid
        result["exit_code"] = runner.wait()
        result["status"] = "passed" if result["exit_code"] == 0 else "failed"
        report = output / "report.json"
        if report.exists():
            contents = json.loads(report.read_text())
            result["stats"] = contents["stats"]
            if result["exit_code"] == 0:
                result["worker_indices"] = verify_report(contents, expected, name.startswith("bom-"))
        elif result["exit_code"] == 0:
            raise RuntimeError("successful runner did not produce its JSON report")
    except Exception as exc:
        errors.append({"phase": "run", "type": type(exc).__name__, "message": str(exc)})
        result["status"] = "infrastructure_failure"
    finally:
        for phase, cleanup in (
            ("runner", lambda: stop_group(runner, source) if runner else None),
            ("backend", lambda: stop_backend(source)),
            ("collector", lambda: stop_capture(collector, output)),
            ("pidwatch", lambda: stop_helper(watcher)),
        ):
            try:
                cleanup()
            except Exception as exc:
                errors.append({"phase": phase, "type": type(exc).__name__, "message": str(exc)})
        events = [output / filename for filename in ("next-http.jsonl", "backend-protocol.jsonl", "pids.jsonl", "packets.jsonl") if (output / filename).exists()]
        if events:
            command = [sys.executable, "-I", str(HERE / "io/summarize-trace.py"), "--events", *map(str, events), "--output", str(output / "io-report")]
            for trace in (output / "test-results").rglob("trace.zip"):
                command.extend(("--trace", str(trace)))
            with (output / "postprocess.log").open("w") as log:
                code = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT).returncode
            if code:
                errors.append({"phase": "postprocess", "exit_code": code})
        for filename, marker in (("next-http.jsonl", '"event":"instrumentation.ready"'),
                                 ("backend-protocol.jsonl", '"event": "server.serve.enter"')):
            path = output / filename
            if not path.exists() or marker not in path.read_text():
                errors.append({"phase": "instrumentation", "file": filename, "reason": "required_ready_event_missing"})
        try:
            database = source / "backend/mes_e2e.db"
            if database.exists() and owned_backend(source) is None:
                shutil.copy2(database, output / "synthetic-mes-e2e.db")
        except Exception as exc:
            errors.append({"phase": "database_evidence", "type": type(exc).__name__, "message": str(exc)})
        result.update({"finished_wall_ns": time.time_ns(), "finished_mono_ns": time.monotonic_ns(), "diagnostic_errors": errors})
        if errors:
            result["status"] = "infrastructure_failure"
        save(output / "batch-result.json", result)
    print(json.dumps({key: result.get(key) for key in ("name", "status", "exit_code")}))
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, type=Path)
    args = parser.parse_args()
    module_spec = importlib.util.spec_from_file_location("diagnostic_export", HERE / "export-source.py")
    exporter = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(exporter)
    exporter.ci_guard()
    root = exporter.checked_root(args.root, Path(os.environ["GITHUB_WORKSPACE"]))
    source, artifacts = root / "source", root / "artifacts"
    if not json.loads((artifacts / "environment.json").read_text())["version_guard_passed"]:
        raise ValueError("approved environment was not verified")
    if not (source / ".mes-flaky-export.json").is_file() or (source / ".git").exists():
        raise ValueError("missing isolated source export")
    code_manifest = json.loads((artifacts / "export-instrumented.json").read_text())["files"]
    next_env = source / "frontend/next-env.d.ts"
    generated = {"path": "frontend/next-env.d.ts", "guarded_tracked_input": "frontend/next-env.d.ts" in code_manifest,
                 "existed_before_app": next_env.exists(),
                 "before_sha256": hashlib.sha256(next_env.read_bytes()).hexdigest() if next_env.exists() else None,
                 "policy": "If tracked, retain the strict input hash guard. Otherwise record Next-generated output separately."}
    batches = []
    summary = {"status": "incomplete", "root_cause": "unresolved", "batches": batches}

    def interrupt(signum: int, frame: Any) -> None:
        raise KeyboardInterrupt("diagnostic runner interrupted")

    signal.signal(signal.SIGTERM, interrupt)
    try:
        preflight = run_batch(source, artifacts, "preflight", ("mes-flaky-preflight.spec.ts",), "MES-DIAG-APP-READY", 1)
        batches.append(preflight)
        if preflight["status"] != "passed":
            summary["status"] = "environment_readiness_failed"
            raise SystemExit(1)
        for name, specs, selector, expected in BATCHES:
            current = run_batch(source, artifacts, name, specs, selector, expected)
            batches.append(current)
            if current["status"] != "passed":
                summary["status"] = "first_failure_stopped"
                raise SystemExit(1)
        summary["status"] = "no_failure_observed_root_cause_unresolved"
    finally:
        save(artifacts / "run-summary.json", summary)
        generated["after_sha256"] = hashlib.sha256(next_env.read_bytes()).hexdigest() if next_env.exists() else None
        save(artifacts / "next-generated-file.json", generated)
        exporter.verify(source, artifacts / "export-instrumented.json", artifacts / "export-after-run.json")
    if summary["status"] != "no_failure_observed_root_cause_unresolved":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
