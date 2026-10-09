"""Reproducible, read-only MES endpoint comparison in isolated Python processes.

prepare creates SQLite backups plus synthetic data under ignored runtime only.
run uses real ASGI HTTP routes with identical read-only sessions, never ports.
Neither lifecycle hooks nor external services are started. Full integrity uses
sample_limit=None on both versions, including baselines with a sampled route.
SQL metrics count fetched DBAPI rows (not SQLite pages) and exclude EXPLAIN time.
"""

from __future__ import annotations

import argparse
import asyncio
from collections import Counter
from contextlib import closing
from contextvars import ContextVar
from datetime import datetime, timedelta
import hashlib
import inspect
import json
import math
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import time
from typing import Any
from urllib.parse import parse_qs, urlencode, urlsplit
from uuid import NAMESPACE_URL, uuid5
import zipfile


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = Path(__file__).resolve()
MEASUREMENT: ContextVar[dict | None] = ContextVar("measurement", default=None)


def percentile(values: list[float], fraction: float) -> float:
    """Nearest-rank percentiles make small benchmark groups reproducible."""
    return sorted(values)[max(0, math.ceil(len(values) * fraction) - 1)]


def compare_latency(base: list[float], current: list[float], limit_ms: int) -> dict:
    """Fail only the approved joint relative/absolute regression threshold."""
    before, after = percentile(base, .95), percentile(current, .95)
    return {"base_p95_ms": before, "current_p95_ms": after,
            "delta_ms": after - before, "ratio": after / before if before else None,
            "regression": after > before * 1.2 and after - before > 100,
            "absolute_pass": after <= limit_ms, "limit_ms": limit_ms}


def group_order(group: int) -> tuple[str, str]:
    """Alternate order to avoid consistently favoring a warm host."""
    return ("base", "current") if group % 2 == 0 else ("current", "base")


def read_connection(path: Path, **kwargs: Any) -> sqlite3.Connection:
    """SQLite itself rejects writes, including accidental ORM writes."""
    connection = sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True, **kwargs)
    connection.execute("PRAGMA query_only=ON")
    return connection


def new_run_directory(path: Path) -> Path:
    """Never overwrite an existing run or create artifacts beside active DBs."""
    resolved = path.resolve()
    if "/_attic/runtime/" not in resolved.as_posix().lower():
        raise ValueError("Benchmark output must be under _attic/runtime")
    resolved.mkdir(parents=True, exist_ok=False)
    return resolved


def _quoted(value: str) -> str:
    """Quote trusted SQLite schema names, including embedded quotes."""
    return '"' + value.replace('"', '""') + '"'


def logical_comparison(base: Path, current: Path) -> dict:
    """Hash every existing value; permit only the approved employees.level removal."""
    tables = {}
    with closing(read_connection(base)) as left, closing(read_connection(current)) as right:
        for (table,) in left.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"):
            if table in {"alembic_version", "sqlite_sequence"}:
                continue
            old_columns = [row[1] for row in left.execute(f"PRAGMA table_xinfo({_quoted(table)})")]
            new_columns = [row[1] for row in right.execute(f"PRAGMA table_xinfo({_quoted(table)})")]
            missing = set(old_columns) - set(new_columns)
            permitted = {"level"} if table == "employees" else set()
            columns = [column for column in old_columns if column in new_columns]
            query = f"SELECT {', '.join(map(_quoted, columns))} FROM {_quoted(table)}"
            fingerprints = []
            for connection in (left, right):
                hashes = sorted(hashlib.sha256(repr(tuple(row)).encode()).hexdigest()
                                for row in connection.execute(query))
                fingerprints.append({"rows": len(hashes), "sha256": hashlib.sha256(''.join(hashes).encode()).hexdigest()})
            tables[table] = {"base": fingerprints[0], "current": fingerprints[1],
                             "missing_columns": sorted(missing),
                             "equal": missing <= permitted and fingerprints[0] == fingerprints[1]}
    return {"equal": all(row["equal"] for row in tables.values()), "tables": tables}


def _write_json(path: Path, value: object) -> None:
    """Store evidence as UTF-8 without shell interpolation or personal row values."""
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def _child(config: dict, directory: Path, stem: str) -> dict:
    """Use fresh imports for each version and preserve child diagnostics on failure."""
    config_path, output = directory / f"{stem}.config.json", directory / f"{stem}.json"
    _write_json(config_path, config)
    with (directory / f"{stem}.log").open("w", encoding="utf-8") as log:
        result = subprocess.run([sys.executable, str(SCRIPT), "worker", "--config", str(config_path),
                                 "--output", str(output)], cwd=directory, stdout=log, stderr=log, check=False)
    if result.returncode:
        raise RuntimeError(f"Child failed ({result.returncode}); see {directory / (stem + '.log')}")
    return json.loads(output.read_text(encoding="utf-8"))


def _backup(source: Path, destination: Path) -> None:
    """Backup handles WAL correctly; source is always opened read-only."""
    if destination.exists():
        raise FileExistsError(destination)
    with closing(read_connection(source)) as src, closing(sqlite3.connect(destination)) as dst:
        src.backup(dst)


def _endpoints(path: Path) -> dict[str, str]:
    """Choose populated hot/general histories and a real activity day without writes."""
    with closing(read_connection(path)) as connection:
        ranked = connection.execute("SELECT item_id, count(*) FROM transaction_logs GROUP BY item_id ORDER BY count(*) DESC").fetchall()
        hot = ranked[0][0]
        general = ranked[len(ranked) // 2][0]
        operation = connection.execute("SELECT operation_id FROM inventory_operations ORDER BY effective_at DESC LIMIT 1").fetchone()
        activity = connection.execute("SELECT producer_employee_id, date(created_at, '+9 hours'), count(*) FROM transaction_logs WHERE producer_employee_id IS NOT NULL GROUP BY 1, 2 ORDER BY count(*) DESC LIMIT 1").fetchone()
        if activity is None:
            employee = connection.execute("SELECT employee_id FROM employees LIMIT 1").fetchone()[0]
            day = connection.execute("SELECT date(max(created_at), '+9 hours') FROM transaction_logs").fetchone()[0]
        else:
            employee, day = activity[:2]
        search = connection.execute("SELECT mes_code FROM items WHERE item_id=?", (hot,)).fetchone()[0]
    endpoints = {
        "history_list": "/api/inventory/transactions?limit=50",
        "history_groups": "/api/inventory/transactions/display-groups?limit=50",
        "history_search": "/api/inventory/transactions?" + urlencode({"limit": 50, "search": search}),
        "hot_item": "/api/inventory/transactions?" + urlencode({"limit": 50, "item_id": hot}),
        "general_item": "/api/inventory/transactions?" + urlencode({"limit": 50, "item_id": general}),
        "history_detail": "/api/inventory/transactions?" + urlencode({"item_id": hot, "limit": 1}),
        "daily": f"/api/daily-work-reports/{employee}/{day}/activity",
        "inventory": "/api/inventory?limit=100",
        "integrity": "/api/admin/inventory-integrity",
    }
    if operation:
        endpoints["operation_detail"] = f"/api/inventory/operations/{operation[0]}"
    return endpoints


def prepare(args: argparse.Namespace) -> dict:
    """Materialize baseline source and independent real/synthetic DB pairs."""
    run = new_run_directory(args.output)
    archive = run / "baseline-source.zip"
    subprocess.run(["git", "archive", "--format=zip", f"--output={archive}", args.baseline_ref],
                   cwd=ROOT, check=True)
    base_source = run / "baseline-source"
    with zipfile.ZipFile(archive) as source:
        source.extractall(base_source)
    manifest = {"baseline_ref": args.baseline_ref, "current_source": str(ROOT),
                "base_source": str(base_source), "runtime": sys.version, "datasets": {}}
    for label, size in [("real", 0), *((f"synthetic_{size}", size) for size in args.sizes)]:
        directory = run / label
        directory.mkdir()
        base, current = directory / "base.db", directory / "current.db"
        if size:
            _child({"task": "synthetic", "source": str(base_source), "db": str(base), "size": size}, directory, "seed")
        else:
            original = directory / "input.db"
            _backup(args.source_db, original)
            _backup(original, base)
            _child({"task": "migrate", "source": str(base_source), "db": str(base)}, directory, "base-migration")
            preservation = logical_comparison(original, base)
            _write_json(directory / "base-logical-preservation.json", preservation)
            if not preservation["equal"]:
                raise RuntimeError("Baseline migration changed existing logical records")
        _backup(base, current)
        _child({"task": "migrate", "source": str(ROOT), "db": str(current)}, directory, "migration")
        equality = logical_comparison(base, current)
        _write_json(directory / "logical-preservation.json", equality)
        if not equality["equal"]:
            raise RuntimeError(f"Existing logical records changed in {label}")
        manifest["datasets"][label] = {"base": str(base), "current": str(current),
                                          "endpoints": _endpoints(base), "synthetic": bool(size)}
    _write_json(run / "manifest.json", manifest)
    return {"manifest": str(run / "manifest.json")}


def _synthetic(path: Path, size: int, revision: str) -> dict:
    """Create synthetic-only data; never append any rows to a real-data copy."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from app.models import Base, Employee, Inventory, InventoryOperation, InventoryOperationKindEnum, Item, ProcessType, TransactionLog, TransactionTypeEnum

    if path.exists() or "/_attic/runtime/" not in path.resolve().as_posix().lower():
        raise ValueError("Synthetic target must be a new runtime database")
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    Base.metadata.create_all(engine)
    item_ids = [uuid5(NAMESPACE_URL, f"mes-benchmark-item-{index}") for index in range(101)]
    assignments = [0 if index % 5 else 1 + (index // 5) % 100 for index in range(size)]
    counts = Counter(assignments)
    start = datetime(2026, 9, 1, 0)
    with Session(engine) as session:
        session.add(ProcessType(code="TR", prefix="T", suffix="R", stage_order=10))
        employee = Employee(employee_id=uuid5(NAMESPACE_URL, "mes-benchmark-employee"), employee_code="BENCH", name="Synthetic", role="benchmark", department="benchmark")
        session.add(employee)
        session.flush()
        for index, item_id in enumerate(item_ids):
            session.add(Item(item_id=item_id, item_name=f"Synthetic {index}", unit="EA", model_symbol="9", serial_no=index + 1, process_type_code="TR"))
        session.flush()
        session.add_all([Inventory(item_id=item_id, quantity=counts[index], warehouse_qty=counts[index]) for index, item_id in enumerate(item_ids)])
        operation = InventoryOperation(operation_id=uuid5(NAMESPACE_URL, "mes-benchmark-operation"), kind=InventoryOperationKindEnum.BUSINESS,
                                       domain="inventory", action="receive", display_label="Synthetic", actor_name="Synthetic",
                                       actor_employee_id=employee.employee_id, effective_at=start + timedelta(minutes=size - 1))
        session.add(operation)
        session.flush()
        running = Counter()
        transactions = []
        for index, item in enumerate(assignments):
            before = running[item]
            running[item] += 1
            transactions.append({
                "log_id": uuid5(NAMESPACE_URL, f"mes-benchmark-log-{index}"), "item_id": item_ids[item],
                "transaction_type": TransactionTypeEnum.RECEIVE, "quantity_change": 1,
                "quantity_before": before, "quantity_after": running[item],
                "warehouse_qty_before": before, "warehouse_qty_after": running[item],
                "department_qty_before": 0, "department_qty_after": 0,
                "inventory_effect": [{"scope": "warehouse", "delta": 1}],
                "producer_employee_id": employee.employee_id, "produced_by": "Synthetic",
                "operation_id": operation.operation_id if index == size - 1 else None,
                "created_at": start + timedelta(minutes=index),
            })
        session.bulk_insert_mappings(TransactionLog, transactions)
        session.commit()
    engine.dispose()
    with closing(sqlite3.connect(path)) as connection:
        connection.execute("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)")
        connection.execute("INSERT INTO alembic_version VALUES (?)", (revision,))
        connection.commit()
    return {"synthetic": True, "transactions": size}


class _CountingCursor(sqlite3.Cursor):
    """Observe rows actually consumed without issuing extra queries."""

    def _count(self, rows: list | tuple) -> None:
        measurement = MEASUREMENT.get()
        if measurement is not None:
            measurement["rows"] += len(rows)

    def fetchall(self) -> list:
        rows = super().fetchall()
        self._count(rows)
        return rows

    def fetchmany(self, size: int | None = None) -> list:
        rows = super().fetchmany() if size is None else super().fetchmany(size)
        self._count(rows)
        return rows

    def fetchone(self) -> tuple | None:
        row = super().fetchone()
        self._count([] if row is None else [row])
        return row


class _CountingConnection(sqlite3.Connection):
    def cursor(self, factory: type = _CountingCursor) -> sqlite3.Cursor:
        return super().cursor(factory)


def validate_route_parameters(app: Any, endpoints: dict[str, str]) -> None:
    """An ignored new query parameter would silently benchmark a different result."""
    for name, url in endpoints.items():
        parsed = urlsplit(url)
        route = next((route for route in app.routes if "GET" in getattr(route, "methods", set())
                      and route.path_regex.fullmatch(parsed.path)), None)
        if route is None or not hasattr(route, "dependant"):
            raise ValueError(f"No GET route for {name}")
        declared = set()
        pending = [route.dependant]
        while pending:
            dependency = pending.pop()
            declared.update(field.alias for field in dependency.query_params)
            pending.extend(dependency.dependencies)
        unsupported = set(parse_qs(parsed.query, keep_blank_values=True)) - declared
        if unsupported:
            raise ValueError(f"Unsupported query parameters for {name}: {sorted(unsupported)}")


async def _measure(config: dict) -> dict:
    """Exercise routing, serialization and DB reads with real per-request sessions."""
    import httpx
    from sqlalchemy import create_engine, event
    from sqlalchemy.orm import Session
    from sqlalchemy.pool import NullPool
    from app.database import get_db
    from app.main import app
    from app.services import inventory_integrity, inventory_integrity_engine

    validate_route_parameters(app, config["endpoints"])
    path = Path(config["db"])
    before_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    engine = create_engine("sqlite://", creator=lambda: read_connection(path, check_same_thread=False, factory=_CountingConnection), poolclass=NullPool)

    @event.listens_for(engine, "before_cursor_execute")
    def capture(_connection: Any, _cursor: Any, statement: str, parameters: tuple, _context: Any, _many: bool) -> None:
        measurement = MEASUREMENT.get()
        if measurement is not None and statement.lstrip().upper().startswith(("SELECT", "WITH")):
            measurement["queries"] += 1
            if measurement.get("diagnostic"):
                measurement["sql"].append((statement, parameters))

    def get_read_db():
        with Session(engine, autoflush=False) as session:
            yield session

    app.dependency_overrides[get_db] = get_read_db
    evaluate_integrity = inventory_integrity.evaluate_inventory_integrity
    if "sample_limit" in inspect.signature(evaluate_integrity).parameters:
        inventory_integrity.evaluate_inventory_integrity = lambda *args, **kwargs: evaluate_integrity(
            *args, **{**kwargs, "sample_limit": None}
        )
    else:
        # Older code uses samples[:SAMPLE_LIMIT]; [:None] retains every finding.
        inventory_integrity_engine.SAMPLE_LIMIT = None
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://benchmark.invalid", headers={"X-Admin-Pin": "0000"}, timeout=120) as client:
        async def request(url: str, diagnostic: bool = False) -> dict:
            metrics = {"queries": 0, "rows": 0, "sql": [], "diagnostic": diagnostic}
            token = MEASUREMENT.set(metrics)
            try:
                start = time.perf_counter()
                response = await asyncio.wait_for(client.get(url), timeout=120)
                duration = (time.perf_counter() - start) * 1000
            except TimeoutError:
                return {"ms": (time.perf_counter() - start) * 1000, "status": 0, "bytes": 0,
                        "queries": metrics["queries"], "rows": metrics["rows"], "error": "120s timeout"}
            finally:
                MEASUREMENT.reset(token)
            result = {"ms": duration, "status": response.status_code, "bytes": len(response.content),
                      "queries": metrics["queries"], "rows": metrics["rows"]}
            if diagnostic:
                plans = []
                with closing(read_connection(path)) as connection:
                    for statement, parameters in metrics["sql"]:
                        plans.append({"sql": statement, "plan": connection.execute("EXPLAIN QUERY PLAN " + statement, parameters).fetchall()})
                result["plans"] = plans
                if response.status_code == 200:
                    payload = response.json()
                    result["entity_count"] = len(payload) if isinstance(payload, list) else None
                    pending, log_ids = [payload], set()
                    while pending:
                        value = pending.pop()
                        if isinstance(value, dict):
                            if isinstance(value.get("log_id"), str):
                                log_ids.add(value["log_id"])
                            pending.extend(value.values())
                        elif isinstance(value, list):
                            pending.extend(value)
                    result["log_count"] = len(log_ids)
                    result["population_sha256"] = hashlib.sha256('|'.join(sorted(log_ids)).encode()).hexdigest()
                    if isinstance(payload, dict):
                        payload.pop("generated_at", None)
                        if "checks" in payload:
                            result["integrity_samples"] = sum(len(check["samples"]) for check in payload["checks"])
                            result["integrity_finding_count"] = sum(check["count"] for check in payload["checks"])
                    result["response_sha256"] = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
                if response.status_code != 200:
                    result["error"] = response.text[:400]
            return result

        endpoints = {}
        semaphore = asyncio.Semaphore(config["users"])

        async def bounded(name: str, url: str) -> tuple[str, dict]:
            async with semaphore:
                return name, await request(url)

        for name, url in config["endpoints"].items():
            cold = await request(url, True)
            for _ in range(config["warmup"]):
                await request(url)
            endpoints[name] = {"cold": cold, "samples": []}
            if config.get("workload", "endpoint") == "endpoint":
                samples = await asyncio.gather(*(bounded(name, url) for _ in range(config["calls"])))
                endpoints[name]["samples"] = [sample for _, sample in samples]
        if config.get("workload") == "mixed":
            routes = list(config["endpoints"].items())
            samples = await asyncio.gather(*(bounded(name, url)
                for _ in range(config["calls"]) for name, url in routes))
            for name, sample in samples:
                endpoints[name]["samples"].append(sample)
    app.dependency_overrides.clear()
    engine.dispose()
    after_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    if before_hash != after_hash:
        raise RuntimeError("Read workload changed database bytes")
    return {"endpoints": endpoints, "db_unchanged": True, "db_sha256": before_hash,
            "users": config["users"], "calls": config["calls"], "runtime": sys.version}


def worker(config: dict) -> dict:
    """Load exactly one source tree, never the default active database."""
    backend = Path(config["source"]) / "backend"
    sys.path.insert(0, str(backend))
    os.environ["DATABASE_URL"] = "sqlite:///:memory:"
    os.environ["APP_ENV"] = "test"
    os.environ["REQUIRE_POSTGRES"] = "0"
    if config["task"] == "synthetic":
        from alembic.config import Config
        from alembic.script import ScriptDirectory
        alembic = Config(str(backend / "alembic.ini"))
        alembic.set_main_option("script_location", str(backend / "alembic"))
        revision = ScriptDirectory.from_config(alembic).get_current_head()
        return _synthetic(Path(config["db"]), config["size"], revision)
    if config["task"] == "migrate":
        from alembic import command
        from alembic.config import Config
        target = Path(config["db"]).resolve()
        if "/_attic/runtime/" not in target.as_posix().lower() or target.name not in {"base.db", "current.db"}:
            raise ValueError("Migration is restricted to this benchmark's runtime copies")
        alembic = Config(str(backend / "alembic.ini"))
        alembic.set_main_option("script_location", str(backend / "alembic"))
        alembic.set_main_option("sqlalchemy.url", f"sqlite:///{target.as_posix()}")
        command.upgrade(alembic, "head")
        return {"migrated": str(target)}
    return asyncio.run(_measure(config))


def validate_run(manifest: dict, args: argparse.Namespace) -> None:
    """Reject empty or mistyped workloads instead of reporting vacuous success."""
    if min(args.groups, args.calls, *args.users) < 1 or args.warmup < 0:
        raise ValueError("Groups, calls and users must be positive; warmup cannot be negative")
    datasets = set(args.datasets or manifest["datasets"])
    if not datasets or not datasets <= manifest["datasets"].keys():
        raise ValueError("Select at least one known dataset")
    for name in datasets:
        endpoints = manifest["datasets"][name]["endpoints"]
        if not endpoints or (args.endpoints and not set(args.endpoints) <= endpoints.keys()):
            raise ValueError(f"Unknown or empty endpoints for {name}")


def workload_scenarios(manifest: dict, args: argparse.Namespace) -> list[tuple[str, str, int]]:
    """Keep endpoint growth independent from realistic mixed-user concurrency."""
    datasets = {name: row for name, row in manifest["datasets"].items()
                if args.datasets is None or name in args.datasets}
    scenarios = [(name, "endpoint", 1) for name in datasets] if args.workload != "mixed" else []
    if args.workload != "endpoint":
        synthetic = [name for name, row in datasets.items() if row["synthetic"]]
        mixed = [name for name, row in datasets.items() if not row["synthetic"]]
        if synthetic:
            mixed.append(max(synthetic, key=lambda name: datasets[name]["transactions"]))
        scenarios.extend((name, "mixed", users) for name in mixed for users in args.users)
    return scenarios


def run(args: argparse.Namespace) -> dict:
    """Save every raw sample and compare each concurrency level separately."""
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    validate_run(manifest, args)
    for dataset in manifest["datasets"].values():
        with closing(read_connection(Path(dataset["base"]))) as connection:
            dataset["transactions"] = connection.execute("SELECT count(*) FROM transaction_logs").fetchone()[0]
    directory = new_run_directory(args.output)
    source_hashes = {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
                     for path in sorted((ROOT / "backend/app").rglob("*.py"))}
    _write_json(directory / "source-hashes.json", source_hashes)
    comparisons = {}
    for label, workload, users in workload_scenarios(manifest, args):
        dataset = manifest["datasets"][label]
        observations = {"base": [], "current": []}
        for group in range(args.groups):
            for variant in group_order(group):
                endpoints = dataset["endpoints"]
                if args.endpoints:
                    endpoints = {key: value for key, value in endpoints.items() if key in args.endpoints}
                result = _child({"task": "measure", "source": manifest[f"{variant}_source"],
                                 "db": dataset[variant], "endpoints": endpoints,
                                 "warmup": args.warmup, "calls": args.calls, "users": users, "workload": workload},
                                directory, f"{label}-{workload}-u{users}-g{group}-{variant}")
                returned = result.get("endpoints")
                if not isinstance(returned, dict) or set(returned) != set(endpoints):
                    raise ValueError(f"Worker endpoint results differ from the requested set: {label}/{workload}/{variant}/g{group}")
                observations[variant].append(result)
        endpoint_comparisons = {}
        for endpoint in observations["base"][0]["endpoints"]:
            samples = {variant: [sample for group in groups for sample in group["endpoints"][endpoint]["samples"]]
                       for variant, groups in observations.items()}
            comparison = compare_latency([s["ms"] for s in samples["base"]], [s["ms"] for s in samples["current"]],
                                         10000 if endpoint == "integrity" else 2000)
            comparison["successful"] = all(s["status"] == 200 for group in samples.values() for s in group) and all(
                group["endpoints"][endpoint]["cold"]["status"] == 200
                for groups in observations.values() for group in groups
            )
            comparison["metrics"] = {variant: {metric: percentile([s[metric] for s in rows], .95)
                                                 for metric in ("queries", "rows", "bytes")}
                                      for variant, rows in samples.items()}
            comparison["samples_per_variant"] = len(samples["base"])
            comparison["samples_per_group"] = {
                variant: [len(group["endpoints"][endpoint]["samples"]) for group in groups]
                for variant, groups in observations.items()
            }
            comparison["samples_complete"] = all(
                len(counts) == args.groups and all(count == args.calls for count in counts)
                for counts in comparison["samples_per_group"].values()
            )
            diagnostics = [group["endpoints"][endpoint]["cold"] for groups in observations.values() for group in groups]
            comparison["same_log_population"] = len({row.get("population_sha256") for row in diagnostics}) == 1
            comparison["detail_equivalent"] = endpoint != "history_detail" or (
                comparison["same_log_population"] and all(row.get("entity_count") == 1 for row in diagnostics)
            )
            comparison["integrity_equivalent"] = endpoint != "integrity" or (
                len({row.get("response_sha256") for row in diagnostics}) == 1
            )
            comparison["pass"] = (comparison["successful"] and comparison["absolute_pass"]
                                  and comparison["samples_complete"]
                                  and comparison["same_log_population"] and comparison["detail_equivalent"]
                                  and comparison["integrity_equivalent"] and not comparison["regression"])
            endpoint_comparisons[endpoint] = comparison
        comparisons[f"{label}/{workload}/users={users}"] = endpoint_comparisons
        _write_json(directory / "comparisons.json", comparisons)
    changed_sources = [name for name, digest in source_hashes.items()
                       if not (ROOT / name).exists() or hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != digest]
    result = {"method": "ASGI HTTP; no lifespan; read-only SQLite; full integrity; fetched rows exclude query plans",
              "cold_definition": "First API call per endpoint in each fresh worker; interpreter startup and OS cold-cache timing excluded",
              "python": sys.version, "baseline_ref": manifest["baseline_ref"],
              "groups": args.groups, "calls_per_group": args.calls, "calls_unit": "per endpoint",
              "warmup": args.warmup,
              "workloads": "Every selected endpoint receives calls_per_group measured GETs in each group and variant; mixed requests use round-robin endpoint scheduling at each concurrency level",
              "complete_protocol": args.groups >= 3 and args.calls >= 30 and args.warmup >= 1
                  and bool(comparisons) and all(row["samples_complete"]
                      for endpoints in comparisons.values() for row in endpoints.values()),
              "complete_matrix": args.workload == "all" and args.datasets is None and args.endpoints is None and {1, 10, 30} <= set(args.users),
              "source_unchanged": not changed_sources, "changed_sources": changed_sources,
              "comparisons": comparisons, "manifest": str(args.manifest.resolve())}
    result["pass"] = result["complete_protocol"] and result["complete_matrix"] and result["source_unchanged"] and bool(comparisons) and all(
        row["pass"] for endpoints in comparisons.values() for row in endpoints.values()
    )
    _write_json(directory / "report.json", result)
    return {"report": str(directory / "report.json"), "pass": result["pass"]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    preparation = commands.add_parser("prepare")
    preparation.add_argument("--source-db", type=Path, required=True)
    preparation.add_argument("--baseline-ref", required=True)
    preparation.add_argument("--output", type=Path, required=True)
    preparation.add_argument("--sizes", type=int, nargs="+", default=[1000, 5000, 20000])
    measurement = commands.add_parser("run")
    measurement.add_argument("--manifest", type=Path, required=True)
    measurement.add_argument("--output", type=Path, required=True)
    measurement.add_argument("--groups", type=int, default=3)
    measurement.add_argument("--calls", type=int, default=30, help="Measured GETs per endpoint per group, including mixed workloads")
    measurement.add_argument("--warmup", type=int, default=3)
    measurement.add_argument("--users", type=int, nargs="+", default=[1, 10, 30])
    measurement.add_argument("--datasets", nargs="+")
    measurement.add_argument("--endpoints", nargs="+")
    measurement.add_argument("--workload", choices=["all", "endpoint", "mixed"], default="all")
    child = commands.add_parser("worker")
    child.add_argument("--config", type=Path, required=True)
    child.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "worker":
        result = worker(json.loads(args.config.read_text(encoding="utf-8")))
        _write_json(args.output, result)
    else:
        print(json.dumps(prepare(args) if args.command == "prepare" else run(args)))


if __name__ == "__main__":
    main()
