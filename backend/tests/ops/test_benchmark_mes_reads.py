"""Read benchmark safety, comparison thresholds and deterministic scheduling."""

import importlib.util
import asyncio
from collections import Counter
import json
from argparse import Namespace
import sqlite3
import sys
from pathlib import Path

import pytest


SCRIPT = Path(__file__).resolve().parents[3] / "scripts/ops/benchmark_mes_reads.py"


def _module():
    spec = importlib.util.spec_from_file_location("benchmark_mes_reads", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_regression_requires_both_relative_and_absolute_increase():
    module = _module()
    assert not module.compare_latency([100] * 30, [190] * 30, 2000)["regression"]
    assert not module.compare_latency([1000] * 30, [1200] * 30, 2000)["regression"]
    assert module.compare_latency([1000] * 30, [1201] * 30, 2000)["regression"]
    assert not module.compare_latency([2200] * 30, [2100] * 30, 2000)["absolute_pass"]


def test_nearest_rank_p95_and_group_order():
    module = _module()
    assert module.percentile(list(range(1, 31)), .95) == 29
    assert module.group_order(0) == ("base", "current")
    assert module.group_order(1) == ("current", "base")
    assert module.group_order(2) == ("base", "current")


def test_read_connection_refuses_mutation(tmp_path):
    module = _module()
    path = tmp_path / "disposable.db"
    with sqlite3.connect(path) as connection:
        connection.execute("CREATE TABLE records (value INTEGER)")
        connection.execute("INSERT INTO records VALUES (7)")
    with module.read_connection(path) as connection:
        assert connection.execute("SELECT value FROM records").fetchone() == (7,)
        with pytest.raises(sqlite3.OperationalError, match="readonly"):
            connection.execute("DELETE FROM records")


def test_baseline_comparison_detects_changed_existing_value(tmp_path):
    module = _module()
    base, current = tmp_path / "base.db", tmp_path / "current.db"
    for path in (base, current):
        with sqlite3.connect(path) as connection:
            connection.execute("CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT)")
            connection.execute("INSERT INTO records VALUES (1, 'original')")
    assert module.logical_comparison(base, current)["equal"]
    with sqlite3.connect(current) as connection:
        connection.execute("ALTER TABLE records ADD COLUMN nullable_new TEXT")
    assert module.logical_comparison(base, current)["equal"]
    with sqlite3.connect(current) as connection:
        connection.execute("UPDATE records SET value = 'changed'")
    assert not module.logical_comparison(base, current)["equal"]


def test_output_guard_rejects_backend_and_reuse(tmp_path):
    module = _module()
    with pytest.raises(ValueError, match="runtime"):
        module.new_run_directory(tmp_path / "backend")
    safe = tmp_path / "_attic/runtime/closure/performance/run"
    assert module.new_run_directory(safe) == safe.resolve()
    with pytest.raises(FileExistsError):
        module.new_run_directory(safe)


@pytest.mark.parametrize("change", [{"datasets": ["missing"]}, {"endpoints": ["missing"]},
                                     {"calls": 0}, {"users": [0]}])
def test_invalid_selection_cannot_produce_vacuous_pass(change):
    module = _module()
    args = Namespace(datasets=None, endpoints=None, groups=3, calls=30, warmup=3, users=[1, 10, 30])
    vars(args).update(change)
    with pytest.raises(ValueError):
        module.validate_run({"datasets": {"real": {"endpoints": {"inventory": "/api/inventory"}}}}, args)


def test_synthetic_history_has_valid_cell_snapshots(tmp_path):
    module = _module()
    directory = tmp_path / "_attic/runtime/synthetic"
    directory.mkdir(parents=True)
    path = directory / "base.db"
    module._synthetic(path, 100, "test-revision")
    with sqlite3.connect(path) as connection:
        assert connection.execute(
            "SELECT count(*) FROM transaction_logs WHERE warehouse_qty_before IS NULL "
            "OR warehouse_qty_after != warehouse_qty_before + 1 "
            "OR department_qty_before != 0 OR department_qty_after != 0"
        ).fetchone()[0] == 0
        for item, quantity in connection.execute("SELECT item_id, warehouse_qty FROM inventory"):
            maximum = connection.execute(
                "SELECT coalesce(max(warehouse_qty_after), 0) FROM transaction_logs WHERE item_id=?", (item,)
            ).fetchone()[0]
            assert maximum == quantity


def test_workload_matrix_separates_growth_from_mixed_concurrency():
    module = _module()
    manifest = {"datasets": {"real": {"synthetic": False, "transactions": 6000},
                              "small": {"synthetic": True, "transactions": 1000},
                              "medium": {"synthetic": True, "transactions": 5000},
                              "large": {"synthetic": True, "transactions": 20000}}}
    scenarios = module.workload_scenarios(manifest, Namespace(datasets=None, workload="all", users=[1, 10, 30]))
    assert scenarios == [(name, "endpoint", 1) for name in manifest["datasets"]] + [
        (name, "mixed", users) for name in ["real", "large"] for users in [1, 10, 30]
    ]


def test_unsupported_filter_cannot_silently_benchmark_a_different_population():
    from fastapi import FastAPI

    module = _module()
    app = FastAPI()

    @app.get("/transactions")
    def listed(item_id: str, limit: int = 100):
        return []

    module.validate_route_parameters(app, {"detail": "/transactions?item_id=one&limit=1"})
    with pytest.raises(ValueError, match="log_id"):
        module.validate_route_parameters(app, {"detail": "/transactions?log_id=one"})


@pytest.mark.parametrize("endpoint,diagnostic", [
    ("history_list", "population_sha256"), ("integrity", "response_sha256"),
])
def test_changed_population_or_integrity_result_cannot_pass(tmp_path, monkeypatch, endpoint, diagnostic):
    module = _module()
    database = tmp_path / "fixture.db"
    with sqlite3.connect(database) as connection:
        connection.execute("CREATE TABLE transaction_logs (id INTEGER)")
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({"baseline_ref": "fixture", "base_source": "before", "current_source": "after",
        "datasets": {"real": {"base": str(database), "current": str(database), "synthetic": False,
                                "endpoints": {endpoint: "/fixture"}}}}), encoding="utf-8")

    def child(config, directory, label):
        cold = {"status": 200, "population_sha256": "same", "response_sha256": "same"}
        cold[diagnostic] = config["source"]
        return {"endpoints": {endpoint: {"cold": cold, "samples": [
            {"status": 200, "ms": 1, "queries": 1, "rows": 1, "bytes": 1}] * 30}}}

    monkeypatch.setattr(module, "_child", child)
    args = Namespace(manifest=manifest, output=tmp_path / "_attic/runtime/run", datasets=None,
                     endpoints=None, groups=3, calls=30, warmup=1, users=[1, 10, 30], workload="all")
    assert module.run(args)["pass"] is False


@pytest.mark.parametrize("users", [1, 10, 30])
def test_mixed_workload_measures_each_endpoint_thirty_times(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, users: int,
) -> None:
    """Mixed concurrency must not divide one endpoint's required sample budget across URLs."""
    from fastapi import FastAPI, Request
    from app import main as main_module
    from app.services import inventory_integrity

    module = _module()
    app = FastAPI()
    calls = Counter()

    async def read(request: Request) -> list[object]:
        calls[request.url.path] += 1
        return []

    endpoints = {f"read_{number}": f"/read/{number}" for number in range(10)}
    for url in endpoints.values():
        app.add_api_route(url, read)
    monkeypatch.setattr(main_module, "app", app)
    monkeypatch.setattr(inventory_integrity, "evaluate_inventory_integrity",
                        inventory_integrity.evaluate_inventory_integrity)
    database = tmp_path / "fixture.db"
    with sqlite3.connect(database) as connection:
        connection.execute("CREATE TABLE records (id INTEGER)")
    result = asyncio.run(module._measure({"db": str(database), "endpoints": endpoints,
                                         "warmup": 1, "calls": 30, "users": users, "workload": "mixed"}))
    assert result["db_unchanged"]
    assert {key: len(row["samples"]) for key, row in result["endpoints"].items()} == {
        key: 30 for key in endpoints
    }
    assert calls == Counter({url: 32 for url in endpoints.values()})


@pytest.mark.parametrize("sample_counts", [(3, 3, 3), (29, 31, 30), (30, 30, 30)])
def test_protocol_checks_actual_samples_in_every_group_and_variant(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, sample_counts: tuple[int, int, int],
) -> None:
    """CLI counts and an aggregate of ninety cannot conceal an incomplete endpoint/group."""
    module = _module()
    database = tmp_path / "fixture.db"
    with sqlite3.connect(database) as connection:
        connection.execute("CREATE TABLE transaction_logs (id INTEGER)")
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({"baseline_ref": "fixture", "base_source": "before", "current_source": "after",
        "datasets": {"real": {"base": str(database), "current": str(database), "synthetic": False,
                                "endpoints": {"inventory": "/fixture"}}}}), encoding="utf-8")

    def child(config: dict, directory: Path, label: str) -> dict:
        """Return equal responses while selectively withholding one variant's mixed samples."""
        count = 30
        if config["workload"] == "mixed" and config["source"] == "after":
            group = int(label.split("-g")[1].split("-")[0])
            count = sample_counts[group]
        return {"endpoints": {"inventory": {
            "cold": {"status": 200, "population_sha256": "same", "response_sha256": "same"},
            "samples": [{"status": 200, "ms": 1, "queries": 1, "rows": 1, "bytes": 1}] * count}}}

    monkeypatch.setattr(module, "_child", child)
    args = Namespace(manifest=manifest, output=tmp_path / "_attic/runtime/run", datasets=None,
                     endpoints=None, groups=3, calls=30, warmup=1, users=[1, 10, 30], workload="all")
    result = module.run(args)
    report = json.loads(Path(result["report"]).read_text(encoding="utf-8"))
    expected = all(count == 30 for count in sample_counts)
    assert report["complete_protocol"] is expected
    assert result["pass"] is expected


@pytest.mark.parametrize("returned", [(), ("inventory",), ("inventory", "overview", "unexpected")])
def test_worker_cannot_silently_omit_or_replace_requested_endpoints(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, returned: tuple[str, ...],
) -> None:
    """Healthy measurements for a partial set must never certify the requested matrix."""
    module = _module()
    database = tmp_path / "fixture.db"
    with sqlite3.connect(database) as connection:
        connection.execute("CREATE TABLE transaction_logs (id INTEGER)")
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({"baseline_ref": "fixture", "base_source": "before", "current_source": "after",
        "datasets": {"real": {"base": str(database), "current": str(database), "synthetic": False,
                                "endpoints": {"inventory": "/fixture", "overview": "/overview"}}}}), encoding="utf-8")

    def child(config: dict, directory: Path, label: str) -> dict:
        """Hide the same missing endpoint in every variant to expose vacuous comparisons."""
        return {"endpoints": {key: {
            "cold": {"status": 200, "population_sha256": "same", "response_sha256": "same"},
            "samples": [{"status": 200, "ms": 1, "queries": 1, "rows": 1, "bytes": 1}] * 30}
            for key in returned}}

    monkeypatch.setattr(module, "_child", child)
    args = Namespace(manifest=manifest, output=tmp_path / "_attic/runtime/run", datasets=None,
                     endpoints=None, groups=3, calls=30, warmup=1, users=[1, 10, 30], workload="all")
    with pytest.raises(ValueError, match="endpoint"):
        module.run(args)
