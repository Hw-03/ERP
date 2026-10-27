"""격리 조회 측정 도구의 원본 보호와 통계 계약."""

import asyncio
import importlib.util
import sqlite3
import json
import os
import subprocess
import sys
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "benchmark_query_reads.py"


def load_script():
    assert SCRIPT.exists(), "격리 측정 스크립트가 필요합니다"
    spec = importlib.util.spec_from_file_location("benchmark_query_reads", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_snapshot_does_not_modify_source_and_refuses_overwrite(tmp_path):
    module = load_script()
    source, snapshot = tmp_path / "source.db", tmp_path / "snapshot.db"
    with sqlite3.connect(source) as db:
        db.execute("CREATE TABLE proof (value INTEGER)")
        db.execute("INSERT INTO proof VALUES (7)")
    original = source.read_bytes()
    module.create_snapshot(source, snapshot)
    assert source.read_bytes() == original
    with sqlite3.connect(snapshot) as db:
        assert db.execute("SELECT value FROM proof").fetchone() == (7,)
    with pytest.raises(FileExistsError):
        module.create_snapshot(source, snapshot)


def test_read_only_engine_rejects_writes(tmp_path):
    module = load_script()
    snapshot = tmp_path / "snapshot.db"
    with sqlite3.connect(snapshot) as db:
        db.execute("CREATE TABLE proof (value INTEGER)")
    engine = module.create_read_only_engine(snapshot)
    try:
        with engine.connect() as db:
            assert db.execute(text("PRAGMA query_only")).scalar() == 1
            with pytest.raises(OperationalError, match="readonly"):
                db.execute(text("INSERT INTO proof VALUES (1)"))
    finally:
        engine.dispose()


@pytest.mark.parametrize("target", ["https://example.org/api/items", "//example.org/api/items", "/api/items#secret"])
def test_endpoint_rejects_external_targets(target):
    module = load_script()
    with pytest.raises(ValueError):
        module.parse_endpoint(f"items={target}")


def test_measurement_excludes_warmup_and_redacts_request_and_response_data():
    module = load_script()
    app = FastAPI()
    calls = []

    @app.get("/api/items")
    def items(search: str):
        calls.append(search)
        return {"private": search, "queried_at": str(len(calls))}

    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://benchmark.invalid") as client:
            return await module.measure_endpoint(client, module.parse_endpoint("items=/api/items?search=private-value"), requests=7, concurrency=3, warmup=2, timeout=5)

    result = asyncio.run(run())
    assert len(calls) == 9
    assert result["requests"] == result["completed"] == 7
    assert result["errors"] == result["cancelled"] == 0
    assert len(result["semantic_checksums"]) == 1
    assert result["latency_ms"]["p95"] <= result["latency_ms"]["max"]
    assert result["throughput_rps"] > 0
    assert len(result["request_fingerprints"]["items"]) == 64
    assert "private-value" not in str(result)
    assert "private" not in str(result)


def test_measurement_counts_http_errors_and_timeout():
    module = load_script()
    app = FastAPI()

    @app.get("/api/fail", status_code=503)
    def fail():
        return {"detail": "private-error"}

    @app.get("/api/slow")
    async def slow():
        await asyncio.sleep(0.05)
        return {}

    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://benchmark.invalid") as client:
            errors = await module.measure_endpoint(client, module.parse_endpoint("fail=/api/fail"), requests=2, concurrency=1, warmup=0, timeout=1)
            cancelled = await module.measure_endpoint(client, module.parse_endpoint("slow=/api/slow"), requests=2, concurrency=1, warmup=0, timeout=0.001)
            return errors, cancelled

    errors, cancelled = asyncio.run(run())
    assert errors["errors"] == 2
    assert errors["status_counts"] == {"503": 2}
    assert "private-error" not in str(errors)
    assert cancelled["cancelled"] == 2


def test_mixed_load_rotates_endpoints_and_reports_each_population():
    module = load_script()
    app = FastAPI()
    calls = []

    @app.get("/api/{kind}")
    async def read(kind: str):
        calls.append(kind)
        await asyncio.sleep(0)
        return {"kind": kind}

    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://benchmark.invalid") as client:
            return await module.measure_endpoint(client, [module.parse_endpoint("a=/api/a"), module.parse_endpoint("b=/api/b")], requests=6, concurrency=3, warmup=1, timeout=5)

    result = asyncio.run(run())
    assert result["endpoint"] == "mixed"
    assert result["completed"] == 6
    assert result["endpoint_samples"]["a"]["requests"] == 3
    assert result["endpoint_samples"]["b"]["requests"] == 3
    assert calls.count("a") == calls.count("b") == 4
    assert "all attempts" in result["latency_population"]


def test_cancelling_measurement_stops_scheduling_more_requests():
    module = load_script()
    app = FastAPI()
    calls = []
    entered = None

    @app.get("/api/slow")
    async def read():
        calls.append(1)
        entered.set()
        await asyncio.sleep(0.01)
        return {}

    async def run():
        nonlocal entered
        entered = asyncio.Event()
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://benchmark.invalid") as client:
            task = asyncio.create_task(module.measure_endpoint(client, module.parse_endpoint("slow=/api/slow"), requests=5, concurrency=1, warmup=0, timeout=5))
            await entered.wait()
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
        assert len(calls) == 1

    asyncio.run(run())


def test_cli_measures_real_app_without_changing_snapshot_or_running_server(tmp_path):
    """A separate CLI process also verifies application import and DB binding."""
    module = load_script()
    from app.database import Base

    snapshot, output = tmp_path / "snapshot.db", tmp_path / "report.json"
    engine = create_engine(f"sqlite:///{snapshot}")
    Base.metadata.create_all(engine)
    engine.dispose()
    original = snapshot.read_bytes()
    process = subprocess.run([
        sys.executable, str(SCRIPT), "--snapshot", str(snapshot), "--output", str(output),
        "--requests", "1", "--concurrency", "1", "--warmup", "0",
        "--endpoint", "summary=/api/inventory/summary",
    ], cwd=SCRIPT.parents[1], env={**os.environ, "PYTHONPATH": str(SCRIPT.parents[1])},
       capture_output=True, text=True, timeout=30)
    assert process.returncode == 0, process.stderr
    assert snapshot.read_bytes() == original
    report = json.loads(output.read_text(encoding="utf-8"))
    assert report["results"][0]["status_counts"] == {"200": 1}
    assert "read-only" in report["metadata"]["transport"]
    assert report["metadata"]["snapshot_unchanged"] is True
    assert len(report["metadata"]["application_sha256"]) == 64

    failure = subprocess.run([
        sys.executable, str(SCRIPT), "--snapshot", str(snapshot), "--output", str(tmp_path / "failed.json"),
        "--requests", "1", "--concurrency", "1", "--warmup", "1",
        "--endpoint", "missing=/api/nonexistent?search=private-value",
    ], cwd=SCRIPT.parents[1], env={**os.environ, "PYTHONPATH": str(SCRIPT.parents[1])},
       capture_output=True, text=True, timeout=30)
    assert failure.returncode == 1
    assert "private-value" not in failure.stdout + failure.stderr
