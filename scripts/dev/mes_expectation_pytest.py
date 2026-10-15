"""Observe pytest collection/results without changing product fixtures or selection."""

import json
import os
from collections.abc import Generator
from pathlib import Path
from typing import Any

import pytest

COLLECTED: dict[str, dict[str, Any]] = {}
REPORTS: dict[str, list[Any]] = {}


@pytest.hookimpl(wrapper=True, tryfirst=True)
def pytest_collection_modifyitems(items: list[pytest.Item]) -> Generator[None, None, None]:
    """Observe parameters before -k/-m or another plugin can deselect them."""
    COLLECTED.clear()
    REPORTS.clear()
    for item in items:
        item.user_properties.append(("mes_nodeid", item.nodeid))
        COLLECTED[item.nodeid] = {
            "file": f"backend/{item.nodeid.split('::')[0]}",
            "name": item.name,
            "mode": "skip" if item.get_closest_marker("skip") else "run",
            "expectedFailure": item.get_closest_marker("xfail") is not None,
        }
    yield


def pytest_runtest_logreport(report: Any) -> None:
    """Retain setup/call/teardown failures and reruns, not only the final call."""
    REPORTS.setdefault(report.nodeid, []).append(report)


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    """Write a small sidecar next to the unmodified JUnit report."""
    completed = []
    for nodeid, entry in COLLECTED.items():
        reports = REPORTS.get(nodeid, [])
        calls = [report for report in reports if report.when == "call"]
        completed.append({
            **entry,
            "status": "PASS" if len(calls) == 1 and len(reports) == 3 and all(report.passed and not hasattr(report, "wasxfail") for report in reports) else "FAIL",
            "retry": max(0, len(calls) - 1),
        })
    Path(os.environ["MES_EXPECTATION_COLLECTION"]).write_text(
        json.dumps({"schemaVersion": 1, "collected": list(COLLECTED.values()), "completed": completed, "exitCode": exitstatus}, ensure_ascii=False), encoding="utf-8",
    )
