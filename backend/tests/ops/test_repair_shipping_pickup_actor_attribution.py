"""출하 픽업 담당자 귀속 복구 도구의 안전 계약."""

from __future__ import annotations

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import sqlite3
import sys
import uuid

SCRIPT_PATH = (
    Path(__file__).resolve().parents[3]
    / "_attic"
    / "backend-scripts"
    / "repair_shipping_pickup_actor_attribution.py"
)
SPEC = spec_from_file_location("repair_shipping_pickup_actor_attribution", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
repair = module_from_spec(SPEC)
sys.modules[SPEC.name] = repair
SPEC.loader.exec_module(repair)


def _create_database(path: Path, *, extra_actor: bool = False) -> dict[str, str]:
    request_id = uuid.uuid4()
    wrong_employee_id = uuid.uuid4()
    actual_employee_id = uuid.uuid4()
    extra_employee_id = uuid.uuid4()
    log_id = uuid.uuid4()
    operation_id = uuid.uuid4()
    audit_id = uuid.uuid4()
    with sqlite3.connect(path) as conn:
        conn.executescript(
            """
            CREATE TABLE employees (
                employee_id TEXT PRIMARY KEY,
                employee_code TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL
            );
            CREATE TABLE shipping_requests (
                request_id TEXT PRIMARY KEY,
                status TEXT NOT NULL
            );
            CREATE TABLE transaction_logs (
                log_id TEXT PRIMARY KEY,
                shipping_request_id TEXT NOT NULL,
                shipping_phase TEXT NOT NULL,
                cancelled INTEGER NOT NULL,
                operation_id TEXT,
                created_at TEXT NOT NULL,
                produced_by TEXT,
                producer_employee_id TEXT,
                quantity_change INTEGER NOT NULL
            );
            CREATE TABLE inventory_operations (
                operation_id TEXT PRIMARY KEY,
                domain TEXT NOT NULL,
                action TEXT NOT NULL,
                actor_name TEXT NOT NULL,
                actor_employee_id TEXT
            );
            CREATE TABLE activity_audit_logs (
                audit_id TEXT PRIMARY KEY,
                occurred_at TEXT NOT NULL,
                actor_employee_code TEXT,
                related_id TEXT,
                action_key TEXT NOT NULL,
                outcome TEXT NOT NULL
            );
            """
        )
        conn.executemany(
            "INSERT INTO employees(employee_id, employee_code, name) VALUES (?, ?, ?)",
            [
                (wrong_employee_id.hex, "E06", "김현우"),
                (actual_employee_id.hex, "E04", "김건호"),
                (extra_employee_id.hex, "E05", "다른 작업자"),
            ],
        )
        conn.execute(
            "INSERT INTO shipping_requests(request_id, status) VALUES (?, 'PICKED_UP')",
            (request_id.hex,),
        )
        conn.execute(
            """
            INSERT INTO transaction_logs(
                log_id, shipping_request_id, shipping_phase, cancelled, operation_id,
                created_at, produced_by, producer_employee_id, quantity_change
            ) VALUES (?, ?, 'PICKUP', 0, ?, '2026-09-15 07:12:22.000000', ?, ?, -2)
            """,
            (log_id.hex, request_id.hex, operation_id.hex, "김현우", wrong_employee_id.hex),
        )
        conn.execute(
            """
            INSERT INTO inventory_operations(operation_id, domain, action, actor_name, actor_employee_id)
            VALUES (?, 'shipping', 'pickup', ?, ?)
            """,
            (operation_id.hex, "김현우", wrong_employee_id.hex),
        )
        conn.execute(
            """
            INSERT INTO activity_audit_logs(
                audit_id, occurred_at, actor_employee_code, related_id, action_key, outcome
            ) VALUES (?, '2026-09-15 07:12:22.100000', 'E04', ?, ?, 'success')
            """,
            (audit_id.hex, str(request_id), repair.PICKUP_ACTION_KEY),
        )
        if extra_actor:
            conn.execute(
                """
                INSERT INTO activity_audit_logs(
                    audit_id, occurred_at, actor_employee_code, related_id, action_key, outcome
                ) VALUES (?, '2026-09-15 07:12:22.200000', 'E05', ?, ?, 'success')
                """,
                (uuid.uuid4().hex, str(request_id), repair.PICKUP_ACTION_KEY),
            )
    return {
        "request_id": request_id.hex,
        "log_id": log_id.hex,
        "operation_id": operation_id.hex,
        "actual_employee_id": actual_employee_id.hex,
    }


def _range() -> tuple:
    return (
        repair.parse_kst("2026-09-15T16:00:00"),
        repair.parse_kst("2026-09-15T17:00:00"),
    )


def test_discover_candidates_requires_one_matching_success_audit_actor(tmp_path: Path) -> None:
    database = tmp_path / "mes.db"
    ids = _create_database(database, extra_actor=True)
    from_utc, to_utc = _range()

    with sqlite3.connect(database) as conn:
        conn.row_factory = sqlite3.Row
        discovery = repair.discover_candidates(
            conn,
            from_utc=from_utc,
            to_utc=to_utc,
            request_ids={ids["request_id"]},
        )

    assert discovery.candidates == ()
    assert discovery.skipped == (
        repair.SkippedRequest(
            ids["request_id"],
            "같은 픽업 시각의 실제 작업자를 하나로 확정할 수 없습니다.",
        ),
    )


def test_repair_database_updates_only_actor_attribution_after_online_backup(tmp_path: Path) -> None:
    database = tmp_path / "mes.db"
    ids = _create_database(database)
    from_utc, to_utc = _range()

    dry_run = repair.repair_database(
        database,
        from_utc=from_utc,
        to_utc=to_utc,
        request_ids={ids["request_id"]},
    )
    assert dry_run["mode"] == "dry-run"
    assert dry_run["backup_path"] is None
    assert len(dry_run["candidates"]) == 1
    candidate = dry_run["candidates"][0]
    assert candidate["request_id"] == ids["request_id"]
    assert candidate["employee_id"] == ids["actual_employee_id"]
    assert candidate["employee_code"] == "E04"
    assert candidate["employee_name"] == "김건호"
    assert candidate["audit_ids"]
    assert candidate["log_ids"] == (ids["log_id"],)
    assert candidate["operation_ids"] == (ids["operation_id"],)

    applied = repair.repair_database(
        database,
        from_utc=from_utc,
        to_utc=to_utc,
        apply=True,
        backup_dir=tmp_path / "backups",
        request_ids={ids["request_id"]},
    )

    assert applied["mode"] == "applied"
    assert Path(applied["backup_path"]).is_file()
    with sqlite3.connect(database) as conn:
        log = conn.execute(
            "SELECT produced_by, producer_employee_id, quantity_change, created_at FROM transaction_logs"
        ).fetchone()
        operation = conn.execute(
            "SELECT actor_name, actor_employee_id FROM inventory_operations"
        ).fetchone()
        request = conn.execute("SELECT status FROM shipping_requests").fetchone()
        audit = conn.execute("SELECT actor_employee_code, occurred_at FROM activity_audit_logs").fetchone()

    assert log == ("김건호", ids["actual_employee_id"], -2, "2026-09-15 07:12:22.000000")
    assert operation == ("김건호", ids["actual_employee_id"])
    assert request == ("PICKED_UP",)
    assert audit == ("E04", "2026-09-15 07:12:22.100000")
