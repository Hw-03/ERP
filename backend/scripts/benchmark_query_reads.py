"""Measure GET queries against a read-only SQLite snapshot, without a server.

Run from backend, for example::

    python scripts/benchmark_query_reads.py --snapshot ../_attic/runtime/query-performance/snapshot.db \
        --output ../_attic/runtime/query-performance/after.json --requests 100 \
        --concurrency 1 5 10 20 --endpoint items=/api/items?limit=2000

Only ASGI requests are supported. No TCP client or application lifespan is run.
Snapshot creation and result output require new filenames; existing snapshots
can be reused read-only so before/after measurements share identical data.
Default endpoints reproduce the October 2026 snapshot scenario; pass --endpoint
to select a different date/filter. --mixed rotates the selected endpoints.
"""

from __future__ import annotations

import argparse
import asyncio
from collections import Counter
from contextlib import closing
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import logging
import math
import os
from pathlib import Path
import platform
import re
import sqlite3
import sys
import time
from typing import Any, Generator
from urllib.parse import urlsplit
import uuid

import httpx
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool


BACKEND = Path(__file__).resolve().parents[1]
DEFAULT_SNAPSHOT = BACKEND.parent / "_attic/runtime/query-performance/snapshot.db"
DEFAULT_ENDPOINTS = (
    "items=/api/items?limit=2000",
    "history=/api/inventory/transactions/display-groups?limit=100&date_from=2026-10-01",
    "capacity=/api/production/capacity",
)
VOLATILE_RESPONSE_KEYS = frozenset({"queried_at"})


@dataclass(frozen=True)
class Endpoint:
    """Keep the raw target internal; reports contain only its caller chosen label."""

    name: str
    target: str


def parse_endpoint(value: str) -> Endpoint:
    """Accept named relative API paths and reject remote/fragment targets."""
    name, separator, target = value.partition("=")
    parsed = urlsplit(target)
    if (not separator or not re.fullmatch(r"[A-Za-z0-9_-]+", name)
            or not target.startswith("/api/") or parsed.scheme or parsed.netloc
            or parsed.fragment or "\\" in target):
        raise ValueError("endpoint must be NAME=/api/relative-path without fragments")
    return Endpoint(name, target)


def create_snapshot(source: Path, destination: Path) -> None:
    """Read the live DB using SQLite backup; never overwrite existing evidence."""
    source, destination = source.resolve(strict=True), destination.resolve()
    if source == destination:
        raise ValueError("source and snapshot must differ")
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation also protects concurrent invocations and the source.
    with destination.open("xb"):
        pass
    with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as reader:
        with closing(sqlite3.connect(destination)) as writer:
            reader.backup(writer)


def create_read_only_engine(snapshot: Path) -> Engine:
    """Enforce read-only in both SQLite open mode and per-connection pragmas."""
    uri = snapshot.resolve(strict=True).as_uri() + "?mode=ro"
    engine = create_engine("sqlite://", creator=lambda: sqlite3.connect(
        uri, uri=True, check_same_thread=False, timeout=10), poolclass=NullPool)

    @event.listens_for(engine, "connect")
    def configure(connection: Any, _record: Any) -> None:
        """Use a deferred read transaction without changing snapshot journaling."""
        connection.execute("PRAGMA query_only=ON")
        connection.execute("PRAGMA foreign_keys=ON")
        connection.isolation_level = None

    @event.listens_for(engine, "begin")
    def begin(connection: Any) -> None:
        """Match the application's explicit read transaction boundary."""
        connection.exec_driver_sql("BEGIN")

    return engine


def _semantic_payload(value: Any) -> Any:
    """Ignore only the server's per-request query timestamp when comparing data."""
    if isinstance(value, dict):
        return {key: _semantic_payload(child) for key, child in value.items()
                if key not in VOLATILE_RESPONSE_KEYS}
    if isinstance(value, list):
        return [_semantic_payload(child) for child in value]
    return value


def _percentile(values: list[float], quantile: float) -> float | None:
    """Use nearest-rank percentiles so the definition is stable across runtimes."""
    return round(sorted(values)[max(0, math.ceil(len(values) * quantile) - 1)], 3) if values else None


async def measure_endpoint(client: httpx.AsyncClient, endpoint: Endpoint | list[Endpoint], *,
                           requests: int, concurrency: int, warmup: int,
                           timeout: float) -> dict[str, Any]:
    """Measure a single or round-robin mixed workload, retaining no payload data."""
    endpoints = endpoint if isinstance(endpoint, list) else [endpoint]
    label = "mixed" if isinstance(endpoint, list) else endpoint.name
    for target in endpoints:
        for _ in range(warmup):
            response = await asyncio.wait_for(client.get(target.target), timeout)
            response.raise_for_status()
    latency, sizes = [], []
    statuses, checksums, raw_checksums, failures = Counter(), Counter(), Counter(), Counter()
    semantic_hashes: dict[str, str] = {}
    pending = iter(range(requests))
    cancelled = 0
    endpoint_latencies: dict[str, list[float]] = {target.name: [] for target in endpoints}

    async def worker() -> None:
        """Start the latency clock only when a worker actually sends a request."""
        nonlocal cancelled
        for index in pending:
            target = endpoints[index % len(endpoints)]
            started = time.perf_counter()
            try:
                response = await asyncio.wait_for(client.get(target.target), timeout)
            except asyncio.TimeoutError:
                cancelled += 1
            except asyncio.CancelledError:
                cancelled += 1
                raise
            except Exception as exc:
                # Error messages may contain SQL values or response contents.
                failures[type(exc).__name__] += 1
            else:
                statuses[str(response.status_code)] += 1
                sizes.append(len(response.content))
                raw_digest = hashlib.sha256(response.content).hexdigest()
                raw_checksums[raw_digest] += 1
                semantic_digest = semantic_hashes.get(raw_digest)
                if semantic_digest is None:
                    try:
                        semantic_digest = hashlib.sha256(json.dumps(
                            _semantic_payload(response.json()), sort_keys=True,
                            separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
                    except ValueError:
                        semantic_digest = raw_digest
                    semantic_hashes[raw_digest] = semantic_digest
                checksums[semantic_digest] += 1
            finally:
                duration = (time.perf_counter() - started) * 1000
                latency.append(duration)
                endpoint_latencies[target.name].append(duration)

    started, cpu_started = time.perf_counter(), time.process_time()
    await asyncio.gather(*(worker() for _ in range(min(concurrency, requests))))
    elapsed, cpu = time.perf_counter() - started, time.process_time() - cpu_started
    completed = sum(statuses.values())
    return {"endpoint": label, "requests": requests, "concurrency": concurrency,
            "request_fingerprints": {target.name: hashlib.sha256(target.target.encode()).hexdigest() for target in endpoints},
            "warmup_requests": warmup * len(endpoints), "completed": completed,
            "errors": sum(count for status, count in statuses.items() if int(status) >= 400) + sum(failures.values()),
            "cancelled": cancelled, "exception_types": dict(failures), "status_counts": dict(statuses),
            "elapsed_seconds": round(elapsed, 6), "process_cpu_seconds": round(cpu, 6),
            "throughput_rps": round(completed / elapsed, 3),
            "latency_ms": {"p50": _percentile(latency, .5), "p95": _percentile(latency, .95),
                           "max": round(max(latency), 3) if latency else None},
            "latency_population": "all attempts including errors/cancellations and content checksum validation; excludes warmup and worker queue",
            "endpoint_samples": {name: {"requests": len(values), "p50_ms": _percentile(values, .5),
                                         "p95_ms": _percentile(values, .95)}
                                 for name, values in endpoint_latencies.items()},
            "response_bytes": {"min": min(sizes) if sizes else None, "max": max(sizes) if sizes else None,
                               "total": sum(sizes)},
            "semantic_checksums": dict(checksums), "raw_checksums": dict(raw_checksums)}


def build_isolated_app(snapshot: Path) -> tuple[Any, Engine]:
    """Bind all application session factories to the snapshot before app import.

    Intended for a dedicated CLI process. The application lifespan is deliberately
    skipped, and no dependency can accidentally fall back to the active DB.
    PYTHONPATH may point at a saved application tree for baseline measurements.
    """
    os.environ["DATABASE_URL"] = "sqlite:///:memory:"
    os.environ["APP_ENV"] = "test"
    os.environ.pop("REQUIRE_POSTGRES", None)
    if str(BACKEND) not in sys.path:
        sys.path.append(str(BACKEND))
    import app.database as database

    engine = create_read_only_engine(snapshot)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    for name in ("engine", "read_engine", "close_engine", "snapshot_engine"):
        setattr(database, name, engine)
    for name in ("SessionLocal", "ReadSessionLocal", "CloseSessionLocal", "ClosePreviewSessionLocal"):
        setattr(database, name, factory)
    from app.main import app
    from app.utils.mes_code import refresh_symbol_cache

    def read_session() -> Generator[Session, None, None]:
        """Give each concurrent request an independent read-only session."""
        with factory() as db:
            yield db

    app.dependency_overrides[database.get_db] = read_session
    with factory() as db:
        refresh_symbol_cache(db)
    return app, engine


async def run_benchmark(args: argparse.Namespace) -> dict[str, Any]:
    """Run sequential conditions through ASGI; no listening socket is created."""
    endpoints = [parse_endpoint(value) for value in (args.endpoint or DEFAULT_ENDPOINTS)]
    snapshot_hash = hashlib.sha256(args.snapshot.read_bytes()).hexdigest()
    app, engine = build_isolated_app(args.snapshot)
    # Suppress SQL/request logs: filters/search terms must not escape via logging.
    logging.disable(logging.CRITICAL)
    results = []
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, raise_app_exceptions=False),
                                     base_url="http://benchmark.invalid", follow_redirects=False,
                                     headers=({"X-Actor-Employee-Id": str(args.actor_employee_id)}
                                              if args.actor_employee_id else None)) as client:
            for concurrency in args.concurrency:
                workloads = [endpoints] if args.mixed else endpoints
                for endpoint in workloads:
                    result = await measure_endpoint(client, endpoint, requests=args.requests,
                                                    concurrency=concurrency, warmup=args.warmup, timeout=args.timeout)
                    results.append(result)
                    print(json.dumps({"endpoint": result["endpoint"], "concurrency": concurrency,
                                      "p95_ms": result["latency_ms"]["p95"], "errors": result["errors"],
                                      "cancelled": result["cancelled"]}), flush=True)
    finally:
        engine.dispose()
    import app as application_package
    application_root = Path(application_package.__file__).parent
    application_hash = hashlib.sha256()
    for source in sorted(application_root.rglob("*.py")):
        application_hash.update(source.relative_to(application_root).as_posix().encode())
        application_hash.update(source.read_bytes())
    snapshot_unchanged = snapshot_hash == hashlib.sha256(args.snapshot.read_bytes()).hexdigest()
    if not snapshot_unchanged:
        raise RuntimeError("snapshot changed during read-only benchmark")
    return {"metadata": {"created_at_utc": datetime.now(timezone.utc).isoformat(),
            "transport": "in-process ASGI; application lifespan disabled; read-only SQLite snapshot",
            "python": platform.python_version(), "platform": platform.platform(), "pid": os.getpid(),
            "application_source": str(application_root), "application_sha256": application_hash.hexdigest(),
            "snapshot_sha256": snapshot_hash, "snapshot_unchanged": snapshot_unchanged,
            "actor_header_configured": args.actor_employee_id is not None,
            "validation_policy": "per-response raw SHA256; semantic canonicalization reused only for identical raw SHA256 within one condition",
            "percentile_method": "nearest_rank", "volatile_response_keys": sorted(VOLATILE_RESPONSE_KEYS),
            "resource_limits": "CPU/latency include client, ASGI server and checksum validation in one process; memory/OS scheduling/network not measured",
            "warmup_excluded": True, "timeout_seconds": args.timeout}, "results": results}


def main() -> None:
    """Validate CLI input before touching any database or importing the app."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="Create a fresh snapshot from this DB using read-only backup")
    parser.add_argument("--snapshot", type=Path, default=DEFAULT_SNAPSHOT)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--requests", type=int, default=100, help="Measured requests per condition (total across endpoints with --mixed)")
    parser.add_argument("--concurrency", type=int, nargs="+", default=[1, 5, 10, 20])
    parser.add_argument("--endpoint", action="append", help="NAME=/api/path?query (repeatable; no credentials)")
    parser.add_argument("--mixed", action="store_true", help="Rotate endpoints within one shared concurrent workload")
    parser.add_argument("--actor-employee-id", help="Optional UUID actor header for recipient-protected reads; never logged")
    parser.add_argument("--warmup", type=int, default=3)
    parser.add_argument("--timeout", type=float, default=120)
    args = parser.parse_args()
    if args.actor_employee_id is not None:
        try:
            args.actor_employee_id = uuid.UUID(args.actor_employee_id)
        except ValueError:
            parser.error("actor employee ID must be a UUID")
    if args.requests < 1 or args.warmup < 0 or args.timeout <= 0 or min(args.concurrency) < 1:
        parser.error("requests, concurrency and timeout must be positive; warmup must be nonnegative")
    try:
        for value in args.endpoint or DEFAULT_ENDPOINTS:
            parse_endpoint(value)
    except ValueError as exc:
        parser.error(str(exc))
    if args.output.exists():
        parser.error("output already exists; use a new evidence filename")
    if args.source:
        create_snapshot(args.source, args.snapshot)
    args.snapshot = args.snapshot.resolve(strict=True)
    try:
        result = asyncio.run(run_benchmark(args))
    except Exception as exc:
        # Tracebacks from HTTP/SQL failures can expose query strings or values.
        print(f"benchmark failed: {type(exc).__name__}; no request data logged", file=sys.stderr)
        raise SystemExit(1) from None
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x", encoding="utf-8") as output:
        json.dump(result, output, indent=2)


if __name__ == "__main__":
    main()
