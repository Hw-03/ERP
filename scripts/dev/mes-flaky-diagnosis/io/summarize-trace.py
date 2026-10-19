"""Join safe observation JSONL and trace network metadata without extracting bodies."""

import argparse
from collections import Counter
from datetime import datetime
import ipaddress
import json
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
import zipfile


def wall_ns(value: dict[str, Any]) -> int:
    """Prefer packet kernel time; JS Date.now has only millisecond resolution."""
    if value.get("kernel_wall_ns") is not None:
        return int(value["kernel_wall_ns"])
    if value.get("wall_ns") is not None:
        return int(value["wall_ns"])
    return int(value.get("wall_ms", 0)) * 1_000_000


def endpoint(value: Any) -> tuple[str, int] | None:
    if not isinstance(value, (list, tuple)) or len(value) < 2 or value[0] is None or value[1] is None:
        return None
    address = ipaddress.ip_address(value[0])
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
        address = address.ipv4_mapped
    return str(address), int(value[1])


def connection(value: dict[str, Any]) -> tuple[Any, Any] | None:
    first, second = endpoint(value.get("local")), endpoint(value.get("remote"))
    return tuple(sorted((first, second))) if first and second else None


def read_events(paths: list[Path]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    events, gaps = [], []
    for path in paths:
        with path.open(encoding="utf-8") as stream:
            for line_number, line in enumerate(stream, 1):
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    gaps.append({"file": str(path), "line": line_number, "reason": "invalid_or_truncated_json"})
                    continue
                event["input_file"], event["input_line"] = str(path), line_number
                event["sort_wall_ns"] = wall_ns(event)
                events.append(event)
    return events, gaps


def read_trace(path: Path) -> list[dict[str, Any]]:
    """Read only .network HAR metadata from the ZIP, preserving no request secrets."""
    result = []
    with zipfile.ZipFile(path) as archive:
        for name in archive.namelist():
            if not name.endswith(".network"):
                continue
            with archive.open(name) as stream:
                for line_number, line in enumerate(stream, 1):
                    entry = json.loads(line)
                    snapshot = entry.get("snapshot", {})
                    request, response = snapshot.get("request", {}), snapshot.get("response", {})
                    started = snapshot.get("startedDateTime")
                    if not started or not request.get("url"):
                        continue
                    start_ns = int(datetime.fromisoformat(started.replace("Z", "+00:00")).timestamp() * 1e9)
                    duration_ms = snapshot.get("time", 0)
                    result.append({"event": "trace.http", "source": "trace",
                                   "input_file": str(path), "network": name, "input_line": line_number,
                                   "sort_wall_ns": start_ns, "wall_ns": start_ns,
                                   "end_wall_ns": start_ns + int(duration_ms * 1e6), "duration_ms": duration_ms,
                                   "method": request.get("method"), "path": urlsplit(request["url"]).path,
                                   "status": response.get("status")})
    return result


def request_key(value: dict[str, Any]) -> tuple[Any, Any]:
    return value.get("pid"), value.get("request")


def error_kind(error: dict[str, Any]) -> str:
    if error.get("code") == "ECONNRESET" and error.get("syscall") == "read" and error.get("errno") == -104:
        return "ci_signature_read_ECONNRESET_minus104"
    if error.get("code") == "ECONNRESET" and error.get("syscall") == "read" and error.get("errno") is not None:
        return "other_os_read_reset"
    if error.get("code") == "ECONNRESET":
        return "js_or_destroy_reset_not_original_ci_signature"
    return "other_error"


def write_jsonl(path: Path, events: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as stream:
        for value in events:
            stream.write(json.dumps(value, ensure_ascii=False) + "\n")


def summarize(events: list[dict[str, Any]], traces: list[dict[str, Any]], gaps: list[dict[str, Any]]) -> dict[str, Any]:
    errors = [event for event in events if event.get("event") == "request.error"]
    failures = []
    for error in errors:
        identity = request_key(error)
        same_request = [row for row in events if row.get("source") == "node" and request_key(row) == identity]
        same_connection = connection(error)
        if same_connection is None:
            same_connection = next((connection(row) for row in same_request if connection(row)), None)
        failure_time = wall_ns(error)
        related = [row for row in events if connection(row) == same_connection and same_connection is not None]
        prior_complete = [row for row in related if row.get("event") == "response.end"
                          and row.get("complete") and wall_ns(row) <= failure_time]
        prior_destroy = [row for row in same_request if row.get("event") == "request.destroy.called"
                         and wall_ns(row) <= failure_time]
        packets = [row for row in related if row.get("event") == "tcp.packet"
                   and row.get("flags", 0) & 7 and abs(wall_ns(row) - failure_time) <= 7_000_000_000]
        failures.append({"signature": error_kind(error.get("error") or {}), "error": error,
                         "connection_4tuple": same_connection,
                         "last_complete_response": prior_complete[-1] if prior_complete else None,
                         "same_request_destroy_before_error": prior_destroy,
                         "control_packets_within_7s": packets,
                         "interpretation": "Correlation only. Match 4-tuple lifetime/SYN and packet direction before assigning cause."})
    anchors = []
    for row in events:
        clock = row.get("clock")
        if clock:
            midpoint = (int(clock["mono_before_ns"]) + int(clock["mono_after_ns"])) // 2
            wall = int(clock["wall_ns"]) if clock.get("wall_ns") is not None else int(clock["wall_ms"]) * 1_000_000
            anchors.append({"source": row.get("source"), "pid": row.get("pid"), "wall_minus_mono_ns": wall - midpoint,
                            "bracket_ns": int(clock["mono_after_ns"]) - int(clock["mono_before_ns"]),
                            "wall_resolution_ns": 1_000_000 if clock.get("wall_ms") is not None else 1,
                            "input_line": row.get("input_line")})
    return {"status": "observations_only_no_root_cause_assertion", "event_counts": dict(Counter(row.get("event") for row in events)),
            "original_ci_compatible_errors": sum(row["signature"] == "ci_signature_read_ECONNRESET_minus104" for row in failures),
            "request_errors": failures, "clock_anchors": anchors, "input_gaps": gaps,
            "target_http": [row for row in traces if row["path"].startswith(("/api/io/submit", "/api/io/draft", "/api/stock-requests/"))],
            "backend_exceptions": [row for row in events if row.get("event") in ("app.raise", "asgi.send.raise", "logging.exception", "server.serve.raise")],
            "loop_lag": [row for row in events if row.get("event") == "loop.lag"],
            "process_lifetime": [row for row in events if row.get("event") in ("instrumentation.ready", "process.exit", "process.uncaught", "proc.start", "proc.gone", "capture.ready", "capture.exit")]}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--events", type=Path, nargs="+", required=True)
    parser.add_argument("--trace", type=Path, action="append", default=[])
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    events, gaps = read_events(args.events)
    traces = [row for path in args.trace for row in read_trace(path)]
    events.sort(key=lambda row: (row["sort_wall_ns"], row.get("event_seq", 0)))
    report = summarize(events, traces, gaps)
    failure_times = [wall_ns(row) for row in events if row.get("event") == "request.error"]
    failure_times += [row["sort_wall_ns"] for row in traces if row.get("status", 0) >= 500]
    # Always include target submit/detail/drafts; otherwise show a 7s lead-in for each error.
    combined = events + traces
    window = [row for row in combined if any(-7_000_000_000 <= wall_ns(row) - instant <= 2_000_000_000 for instant in failure_times)
              or str(row.get("path", "")).startswith(("/api/io/submit", "/api/io/draft", "/api/stock-requests/"))]
    window.sort(key=lambda row: (wall_ns(row), row.get("event_seq", 0)))
    args.output.mkdir(parents=True, exist_ok=True)
    write_jsonl(args.output / "target-window.jsonl", window)
    write_jsonl(args.output / "trace-http.jsonl", traces)
    (args.output / "summary.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"events": len(events), "traces": len(traces), "request_errors": len(report["request_errors"]),
                      "ci_compatible_read_resets": report["original_ci_compatible_errors"], "input_gaps": len(gaps), "output": str(args.output)}))


if __name__ == "__main__":
    main()
