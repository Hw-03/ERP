"""Sanitized original-segment extraction (no original body material exported)."""
import argparse
from datetime import datetime
from decimal import Decimal
import hashlib
import json
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlsplit
import zipfile


SAFE_STRINGS = frozenset({
    "work_type", "sub_type", "from_department", "to_department", "source_kind", "source_location",
    "process_type_code", "unit", "department", "role", "warehouse_role", "department_role",
    "internal_use_bom_mode", "event", "source", "from", "to", "path", "screen_key", "screen_label",
    "theme", "sidebar_mode", "date_from", "date_to", "week_start", "week_end", "active_only", "limit",
})
FRESH_FIELDS = {"notes": "memo", "client_request_id": "client_request_id", "session_id": "audit_session", "terminal_id": "terminal_id"}


def sanitize(value: object, bindings: dict[str, str], key: str = "") -> Any:
    """Keep only known semantic fields and explicit synthetic references."""
    if isinstance(value, dict):
        return {name: sanitize(entry, bindings, name) for name, entry in value.items()}
    if isinstance(value, list):
        return [sanitize(entry, bindings, key) for entry in value]
    if key in FRESH_FIELDS:
        return {"$ref": "fresh." + FRESH_FIELDS[key]}
    if not isinstance(value, str):
        return value
    if value in bindings:
        return {"$ref": bindings[value]}
    if key in SAFE_STRINGS:
        return value
    raise ValueError("unapproved_string_field:" + key)


def submit_template(value: dict[str, Any], preview: dict[str, Any], preview_id: str, bindings: dict[str, str]) -> dict[str, Any]:
    """Consume the exact fresh response after checking the original dependency."""
    if value.get("bundles") != preview.get("bundles"):
        raise ValueError("submit_preview_mismatch")
    output = sanitize({key: entry for key, entry in value.items() if key != "bundles"}, bindings)
    output["bundles"] = {"$ref": f"responses.{preview_id}.bundles"}
    return output


def epoch_ms(value: str) -> Decimal:
    """Preserve the original fractional millisecond offsets exactly."""
    return Decimal(str(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp())) * 1000


def extract(trace: Path) -> dict[str, Any]:
    """Read only network metadata plus allowlisted fixture/IO resource bodies."""
    with zipfile.ZipFile(trace) as archive:
        networks = {name: [json.loads(line)["snapshot"] for line in archive.read(name).splitlines()]
                    for name in ("0-trace.network", "1-trace.network")}
        used_resources: list[str] = []

        def body(snapshot: dict[str, Any], response: bool = False) -> dict[str, Any]:
            node = snapshot["response"]["content"] if response else snapshot["request"].get("postData", {})
            resource = node.get("_sha1")
            if resource:
                used_resources.append(resource)
                return json.loads(archive.read("resources/" + resource))
            return json.loads(node["text"]) if node.get("text") else {}

        api, browser = networks["0-trace.network"], networks["1-trace.network"]
        anchor, submit, preview = browser[195], browser[211], browser[209]
        duration = Decimal(str(anchor["time"])).quantize(Decimal("0.001"))
        if urlsplit(anchor["request"]["url"]).path != "/api/inventory/transactions/display-groups" or duration != Decimal("555.652"):
            raise ValueError("original_anchor_mismatch")
        if not submit["request"]["url"].endswith("/api/io/submit") or submit["response"]["status"] != 201:
            raise ValueError("original_submit_mismatch")
        start = epoch_ms(anchor["startedDateTime"])
        completion = start + duration
        end = epoch_ms(api[15]["startedDateTime"])
        bindings: dict[str, str] = {}
        fixtures = []
        for line, name in ((1, "requester"), (3, "approver"), (5, "other"), (8, "parent"), (9, "child"), (10, "omitted")):
            snapshot = api[line - 1]
            response = body(snapshot, True)
            kind = "employee" if line < 8 else "item"
            for field in (("employee_id", "employee_code", "name") if kind == "employee" else ("item_id", "item_name", "mes_code")):
                if response.get(field):
                    bindings[response[field]] = f"fixture.{name}.{field}"
            payload = body(snapshot)
            payload.pop("name" if kind == "employee" else "item_name")
            if kind == "employee":
                payload.pop("employee_code")
            fixtures.append({"id": name, "kind": kind, "path": urlsplit(snapshot["request"]["url"]).path,
                             "data": sanitize(payload, bindings), "source": f"0-trace.network:{line}"})
        fixture_followups = []
        for line in (2, 4, 6, 7, 11, 12, 13, 14, 15):
            snapshot = api[line - 1]
            path = urlsplit(snapshot["request"]["url"]).path
            segments = [({"$ref": bindings[part]} if part in bindings else part) for part in path.split("/")]
            fixture_followups.append({"id": f"prep{line}", "method": snapshot["request"]["method"],
                                      "path_segments": segments, "data": sanitize(body(snapshot), bindings),
                                      "source": f"0-trace.network:{line}"})

        def spec(network: str, line: int, snapshot: dict[str, Any]) -> dict[str, Any]:
            request = snapshot["request"]
            parsed = urlsplit(request["url"])
            offset = epoch_ms(snapshot["startedDateTime"]) - completion
            headers = {row["name"].lower(): row["value"] for row in request.get("headers", [])}
            output: dict[str, Any] = {"id": ("b" if network.startswith("1") else "a") + str(line),
                "client": "browser" if network.startswith("1") else "api", "method": request["method"],
                "path": parsed.path, "query": sanitize(dict(parse_qsl(parsed.query)), bindings),
                "phase": "after_anchor_body" if offset >= 0 else "anchor_overlap",
                "offset_ms": float(offset), "offset_from_start_ms": float(epoch_ms(snapshot["startedDateTime"]) - start),
                "source": f"{network}:{line}", "original_status": snapshot["response"]["status"],
                "original_duration_ms": snapshot["time"], "original_header_names": sorted(headers), "headers": {}}
            header_refs = {"x-mes-employee-code": "fixture.requester.employee_code", "x-actor-employee-id": "fixture.requester.employee_id",
                           "x-operator-session": "auth.operator_session.token", "x-mes-audit-session": "fresh.audit_session", "x-mes-terminal-id": "fresh.terminal_id"}
            for key, ref in header_refs.items():
                if key in headers:
                    output["headers"][key] = {"$ref": ref}
            for key in ("x-mes-audit-screen", "x-mes-audit-screen-label", "x-mes-audit-source"):
                if key in headers:
                    output["headers"][key] = headers[key]
            if request.get("postData"):
                output["data"] = submit_template(body(snapshot), body(preview, True), "b210", bindings) if line == 212 else sanitize(body(snapshot), bindings)
            return output

        requests, excluded = [], []
        for line, snapshot in enumerate(browser, 1):
            stamp = epoch_ms(snapshot["startedDateTime"])
            if start <= stamp <= end and urlsplit(snapshot["request"]["url"]).path.startswith("/api/"):
                if snapshot["response"]["status"] == -1:
                    excluded.append({"source": f"1-trace.network:{line}", "path": urlsplit(snapshot["request"]["url"]).path,
                                     "reason": "original_cancelled_request_no_forced_abort_replay"})
                else:
                    requests.append(spec("1-trace.network", line, snapshot))
        detail = spec("0-trace.network", 16, api[15])
        result = body(submit, True)
        target_id = urlsplit(api[15]["request"]["url"]).path.rsplit("/", 1)[1]
        index = next(i for i, row in enumerate(result["stock_requests"]) if row["stock_request_id"] == target_id)
        detail["path"] = ["/api/stock-requests/", {"$ref": f"responses.b212.stock_requests.{index}.stock_request_id"}]
        requests.append(detail)
        requests.sort(key=lambda row: (row["offset_from_start_ms"], row["id"]))
        return {"version": 1, "segment": "AS-before-IO-RESEARCH-RETURNS", "max_dispatch_error_ms": 20,
                "origin": "http://localhost:3100", "backend_port": 8021,
                "source": {"trace": trace.name, "sha256": hashlib.sha256(trace.read_bytes()).hexdigest(),
                           "extractor_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                           "resources_read": sorted(set(used_resources)), "fixture_source": "frontend/tests/e2e/io-as-research-audit.spec.ts"},
                "anchor": {"id": "b196", "source": "1-trace.network:196", "original_started_utc": anchor["startedDateTime"],
                           "original_duration_ms": anchor["time"], "original_complete_epoch_ms": str(completion)},
                "fixtures": fixtures, "fixture_followups": fixture_followups, "requests": requests, "excluded": excluded,
                "differences": ["No React/UI/assets in the same-origin blank diagnostic document; original UI load is absent.",
                                "Pre-body overlap uses original anchor-start offsets; post-body deadlines use actual anchor-body completion.",
                                "Only fresh synthetic actors/items/names/memo/session identifiers and real fresh preview bundles are used.",
                                "Synthetic X-Request-Id uses the existing passthrough middleware for exact client/Next/upstream socket correlation.",
                                "Cancelled original requests are excluded; no forced reset, close, retry, delay workaround or fake status.",
                                "No claim that the original socket idle interval/topology is restored."]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--trace", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    manifest = extract(args.trace)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"manifest": str(args.output), "requests": len(manifest["requests"]), "excluded": len(manifest["excluded"])}))


if __name__ == "__main__":
    main()
