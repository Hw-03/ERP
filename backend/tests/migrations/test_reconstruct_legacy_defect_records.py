"""기존 합산 격리 원장을 거래 로그 기준으로 복원하는 마이그레이션 테스트."""

from __future__ import annotations

import importlib.util
import json
import sqlite3
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
PREVIOUS_REVISION = "20260824_0027"
MIGRATION_REVISION = "20260825_0028"
MIGRATION_FILE = (
    BACKEND_DIR
    / "alembic"
    / "versions"
    / "20260825_0028_reconstruct_legacy_defect_records.py"
)

ITEM_ID = "11111111111111111111111111111111"
LOCATION_ID = "22222222222222222222222222222222"
PARENT_ID = "33333333333333333333333333333333"
ACTOR_ID = "44444444444444444444444444444444"


def _config(path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def _migration_module():
    spec = importlib.util.spec_from_file_location("legacy_defect_reconstruction", MIGRATION_FILE)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _seed_parent(db: sqlite3.Connection, *, quantity: int) -> None:
    db.execute(
        "INSERT INTO process_types (code, prefix, suffix, stage_order) "
        "VALUES ('HR', 'H', 'R', 1)"
    )
    db.execute(
        """
        INSERT INTO items (
            item_id, item_name, unit, model_symbol, process_type_code,
            serial_no, sales_review_required, deleted_at
        ) VALUES (?, 'Legacy reconstructed item', 'EA', '346', 'HR', 23, 0, NULL)
        """,
        (ITEM_ID,),
    )
    db.execute(
        """
        INSERT INTO inventory_locations (
            location_id, item_id, department, status, quantity,
            pending_quantity, defective_at
        ) VALUES (?, ?, 'ASSEMBLY', 'DEFECTIVE', ?, 0, '2026-08-24 00:37:17')
        """,
        (LOCATION_ID, ITEM_ID, quantity),
    )
    db.execute(
        """
        INSERT INTO defect_quarantine_records (
            record_id, item_id, department, original_quantity,
            remaining_quantity, quarantined_at, quarantined_by_name,
            reason_category, current_memo, is_legacy, legacy_location_id,
            created_at, updated_at
        ) VALUES (
            ?, ?, 'ASSEMBLY', ?, ?, '2026-08-24 00:37:17', '김건호',
            '기능 불량', '기존 합산 메모', 1, ?,
            '2026-08-24 00:37:17', '2026-08-24 00:37:17'
        )
        """,
        (PARENT_ID, ITEM_ID, quantity, quantity, LOCATION_ID),
    )
    db.execute(
        """
        INSERT INTO defect_quarantine_memo_revisions (
            revision_id, record_id, previous_memo, next_memo,
            edited_by_name, edited_at, is_initial
        ) VALUES (
            '55555555555555555555555555555555', ?, NULL, '기존 합산 메모',
            '김건호', '2026-08-24 00:37:17', 1
        )
        """,
        (PARENT_ID,),
    )


def _insert_log(
    db: sqlite3.Connection,
    *,
    log_id: str,
    delta: int,
    created_at: str,
    memo: str | None,
    transaction_type: str,
    record_id: str | None = None,
    notes: str | None = None,
) -> None:
    effect = json.dumps(
        [
            {
                "scope": "location",
                "department": "ASSEMBLY",
                "status": "DEFECTIVE",
                "delta": delta,
            }
        ]
    )
    db.execute(
        """
        INSERT INTO transaction_logs (
            log_id, item_id, transaction_type, quantity_change,
            produced_by, notes, reason_category, reason_memo, department,
            defect_quarantine_record_id, cancelled, inventory_effect, created_at
        ) VALUES (?, ?, ?, ?, '김건호', ?, '기능 불량', ?, 'ASSEMBLY', ?, 0, ?, ?)
        """,
        (
            log_id,
            ITEM_ID,
            transaction_type,
            delta,
            notes,
            memo,
            record_id,
            effect,
            created_at,
        ),
    )


def _prepare(path: Path, *, quantity: int) -> Config:
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)
    with sqlite3.connect(path) as db:
        _seed_parent(db, quantity=quantity)
    return config


def test_reconstructs_each_positive_event_with_its_original_memo(tmp_path: Path) -> None:
    path = tmp_path / "reconstruct-two-events.db"
    config = _prepare(path, quantity=3)
    with sqlite3.connect(path) as db:
        _insert_log(
            db,
            log_id="60000000000000000000000000000001",
            delta=1,
            created_at="2026-08-24 00:36:29",
            memo=(
                "SN675606 센서 이미지에 점, 얼룩 등 이물질이 촬영됨\n"
                "2026-06-22 연구소 오성식 주임이 가져감"
            ),
            transaction_type="MARK_DEFECTIVE",
        )
        _insert_log(
            db,
            log_id="60000000000000000000000000000002",
            delta=2,
            created_at="2026-08-24 00:37:17",
            memo="SN675491, SN675496\n센서 이미지에 검은 점 촬영됨",
            transaction_type="MARK_DEFECTIVE",
        )

    command.upgrade(config, MIGRATION_REVISION)

    with sqlite3.connect(path) as db:
        parent_remaining = db.execute(
            "SELECT remaining_quantity FROM defect_quarantine_records WHERE record_id = ?",
            (PARENT_ID,),
        ).fetchone()[0]
        children = db.execute(
            """
            SELECT record_id, original_quantity, remaining_quantity, current_memo,
                   reconstruction.parent_record_id, is_legacy, legacy_location_id
            FROM defect_quarantine_records AS record
            JOIN defect_quarantine_reconstructions AS reconstruction
              ON reconstruction.child_record_id = record.record_id
            WHERE reconstruction.parent_record_id = ?
            ORDER BY record.quarantined_at, record.record_id
            """,
            (PARENT_ID,),
        ).fetchall()
        child_revisions = db.execute(
            """
            SELECT revision.record_id, revision.next_memo, revision.edited_by_name,
                   revision.is_initial
            FROM defect_quarantine_memo_revisions AS revision
            JOIN defect_quarantine_records AS record
              ON record.record_id = revision.record_id
            JOIN defect_quarantine_reconstructions AS reconstruction
              ON reconstruction.child_record_id = record.record_id
            WHERE reconstruction.parent_record_id = ?
            ORDER BY record.quarantined_at, record.record_id
            """,
            (PARENT_ID,),
        ).fetchall()
        linked_logs = db.execute(
            """
            SELECT log_id, defect_quarantine_record_id
            FROM transaction_logs
            WHERE log_id LIKE '6000000000000000000000000000000%'
            ORDER BY created_at, log_id
            """
        ).fetchall()
        validator_result = db.execute(
            _migration_module().EMPLOYEE_AUTO_DEPLOY_POLICY["validator_sql"]
        ).fetchone()[0]

    assert parent_remaining == 0
    assert [row[1:] for row in children] == [
        (
            1,
            1,
            "SN675606 센서 이미지에 점, 얼룩 등 이물질이 촬영됨\n"
            "2026-06-22 연구소 오성식 주임이 가져감",
            PARENT_ID,
            1,
            None,
        ),
        (
            2,
            2,
            "SN675491, SN675496\n센서 이미지에 검은 점 촬영됨",
            PARENT_ID,
            1,
            None,
        ),
    ]
    assert [row[1:] for row in child_revisions] == [
        (
            "SN675606 센서 이미지에 점, 얼룩 등 이물질이 촬영됨\n"
            "2026-06-22 연구소 오성식 주임이 가져감",
            "김건호",
            1,
        ),
        ("SN675491, SN675496\n센서 이미지에 검은 점 촬영됨", "김건호", 1),
    ]
    assert [row[1] for row in linked_logs] == [children[0][0], children[1][0]]
    assert validator_result == 0


def test_replays_historical_decrements_fifo_and_keeps_allocations(tmp_path: Path) -> None:
    path = tmp_path / "reconstruct-fifo.db"
    config = _prepare(path, quantity=2)
    with sqlite3.connect(path) as db:
        _insert_log(
            db,
            log_id="70000000000000000000000000000001",
            delta=2,
            created_at="2026-08-20 01:00:00",
            memo="첫 격리",
            transaction_type="MARK_DEFECTIVE",
        )
        _insert_log(
            db,
            log_id="70000000000000000000000000000002",
            delta=-1,
            created_at="2026-08-21 01:00:00",
            memo="첫 처리",
            transaction_type="UNMARK_DEFECTIVE",
            record_id=PARENT_ID,
        )
        _insert_log(
            db,
            log_id="70000000000000000000000000000003",
            delta=3,
            created_at="2026-08-22 01:00:00",
            memo="둘째 격리",
            transaction_type="MARK_DEFECTIVE",
        )
        _insert_log(
            db,
            log_id="70000000000000000000000000000004",
            delta=-2,
            created_at="2026-08-23 01:00:00",
            memo="둘째 처리",
            transaction_type="DEFECT_SCRAP",
            record_id=PARENT_ID,
        )

    command.upgrade(config, MIGRATION_REVISION)

    with sqlite3.connect(path) as db:
        children = db.execute(
            """
            SELECT record.record_id, record.current_memo,
                   record.original_quantity, record.remaining_quantity
            FROM defect_quarantine_records AS record
            JOIN defect_quarantine_reconstructions AS reconstruction
              ON reconstruction.child_record_id = record.record_id
            WHERE reconstruction.parent_record_id = ?
            ORDER BY record.quarantined_at, record.record_id
            """,
            (PARENT_ID,),
        ).fetchall()
        allocations = db.execute(
            """
            SELECT transaction_log_id, record_id, quantity
            FROM defect_quarantine_reconstruction_allocations
            ORDER BY transaction_log_id, record_id
            """
        ).fetchall()

    first_id, second_id = children[0][0], children[1][0]
    assert [row[1:] for row in children] == [
        ("첫 격리", 2, 0),
        ("둘째 격리", 3, 2),
    ]
    assert set(allocations) == {
        ("70000000000000000000000000000002", first_id, 1),
        ("70000000000000000000000000000004", first_id, 1),
        ("70000000000000000000000000000004", second_id, 1),
    }


def test_reconstructs_notes_when_reason_memo_is_missing(tmp_path: Path) -> None:
    path = tmp_path / "reconstruct-notes-fallback.db"
    config = _prepare(path, quantity=2)
    with sqlite3.connect(path) as db:
        _insert_log(
            db,
            log_id="71000000000000000000000000000001",
            delta=2,
            created_at="2026-08-20 01:00:00",
            memo=None,
            notes="notes에만 남은 기존 격리 메모",
            transaction_type="MARK_DEFECTIVE",
        )

    command.upgrade(config, MIGRATION_REVISION)

    with sqlite3.connect(path) as db:
        memo, revision_memo = db.execute(
            """
            SELECT record.current_memo, revision.next_memo
            FROM defect_quarantine_records AS record
            JOIN defect_quarantine_reconstructions AS reconstruction
              ON reconstruction.child_record_id = record.record_id
            JOIN defect_quarantine_memo_revisions AS revision
              ON revision.record_id = record.record_id
            WHERE reconstruction.parent_record_id = ?
            """,
            (PARENT_ID,),
        ).fetchone()

    assert memo == "notes에만 남은 기존 격리 메모"
    assert revision_memo == memo


def test_leaves_unreconstructable_or_pending_aggregates_untouched(tmp_path: Path) -> None:
    cases = ["mismatch", "underflow", "pending"]
    for case in cases:
        path = tmp_path / f"reconstruct-{case}.db"
        config = _prepare(path, quantity=2)
        with sqlite3.connect(path) as db:
            if case == "underflow":
                _insert_log(
                    db,
                    log_id="80000000000000000000000000000001",
                    delta=-1,
                    created_at="2026-08-20 01:00:00",
                    memo="근거 순서 오류",
                    transaction_type="UNMARK_DEFECTIVE",
                    record_id=PARENT_ID,
                )
                positive_delta = 3
            else:
                positive_delta = 1 if case == "mismatch" else 2
            _insert_log(
                db,
                log_id="80000000000000000000000000000002",
                delta=positive_delta,
                created_at="2026-08-21 01:00:00",
                memo="격리 근거",
                transaction_type="MARK_DEFECTIVE",
            )
            if case == "pending":
                db.execute(
                    """
                    INSERT INTO employees (
                        employee_id, employee_code, name, role, department,
                        level, display_order, is_active
                    ) VALUES (?, 'PENDING-01', '승인 대기자', 'worker',
                              'ASSEMBLY', 'STAFF', 0, 1)
                    """,
                    (ACTOR_ID,),
                )
                db.execute(
                    """
                    INSERT INTO stock_requests (
                        request_id, requester_employee_id, requester_name,
                        requester_department, request_type, status,
                        requires_warehouse_approval, requires_department_approval
                    ) VALUES (
                        '90000000000000000000000000000001', ?, '승인 대기자',
                        'ASSEMBLY', 'DEFECT_SCRAP', 'RESERVED', 1, 0
                    )
                    """,
                    (ACTOR_ID,),
                )
                db.execute(
                    """
                    INSERT INTO stock_request_lines (
                        line_id, request_id, item_id, item_name_snapshot,
                        quantity, from_bucket, from_department, to_bucket,
                        status, defect_quarantine_record_id
                    ) VALUES (
                        '90000000000000000000000000000002',
                        '90000000000000000000000000000001', ?,
                        'Legacy reconstructed item', 1, 'DEFECTIVE',
                        'ASSEMBLY', 'NONE', 'RESERVED', NULL
                    )
                    """,
                    (ITEM_ID,),
                )

        command.upgrade(config, MIGRATION_REVISION)

        with sqlite3.connect(path) as db:
            parent_remaining = db.execute(
                "SELECT remaining_quantity FROM defect_quarantine_records WHERE record_id = ?",
                (PARENT_ID,),
            ).fetchone()[0]
            child_count = db.execute(
                "SELECT COUNT(*) FROM defect_quarantine_reconstructions "
                "WHERE parent_record_id = ?",
                (PARENT_ID,),
            ).fetchone()[0]

        assert parent_remaining == 2, case
        assert child_count == 0, case


def test_reconstruction_is_idempotent_when_revision_is_replayed(tmp_path: Path) -> None:
    path = tmp_path / "reconstruct-idempotent.db"
    config = _prepare(path, quantity=3)
    with sqlite3.connect(path) as db:
        _insert_log(
            db,
            log_id="a0000000000000000000000000000001",
            delta=1,
            created_at="2026-08-24 00:36:29",
            memo="첫 메모",
            transaction_type="MARK_DEFECTIVE",
        )
        _insert_log(
            db,
            log_id="a0000000000000000000000000000002",
            delta=2,
            created_at="2026-08-24 00:37:17",
            memo="둘째 메모",
            transaction_type="MARK_DEFECTIVE",
        )

    command.upgrade(config, MIGRATION_REVISION)
    with sqlite3.connect(path) as db:
        db.execute("UPDATE alembic_version SET version_num = ?", (PREVIOUS_REVISION,))
    command.upgrade(config, MIGRATION_REVISION)

    with sqlite3.connect(path) as db:
        child_count = db.execute(
            "SELECT COUNT(*) FROM defect_quarantine_reconstructions "
            "WHERE parent_record_id = ?",
            (PARENT_ID,),
        ).fetchone()[0]
        revision_count = db.execute(
            """
            SELECT COUNT(*)
            FROM defect_quarantine_memo_revisions AS revision
            JOIN defect_quarantine_records AS record
              ON record.record_id = revision.record_id
            JOIN defect_quarantine_reconstructions AS reconstruction
              ON reconstruction.child_record_id = record.record_id
            WHERE reconstruction.parent_record_id = ?
            """,
            (PARENT_ID,),
        ).fetchone()[0]

    assert child_count == 2
    assert revision_count == 2


def test_validator_rejects_missing_source_log_record_link(tmp_path: Path) -> None:
    path = tmp_path / "reconstruct-validator.db"
    config = _prepare(path, quantity=1)
    source_log_id = "c0000000000000000000000000000001"
    with sqlite3.connect(path) as db:
        _insert_log(
            db,
            log_id=source_log_id,
            delta=1,
            created_at="2026-08-24 00:36:29",
            memo="출처 검증 메모",
            transaction_type="MARK_DEFECTIVE",
        )

    command.upgrade(config, MIGRATION_REVISION)

    with sqlite3.connect(path) as db:
        db.execute(
            "UPDATE transaction_logs SET defect_quarantine_record_id = NULL "
            "WHERE log_id = ?",
            (source_log_id,),
        )
        validator_result = db.execute(
            _migration_module().EMPLOYEE_AUTO_DEPLOY_POLICY["validator_sql"]
        ).fetchone()[0]

    assert validator_result == 1


def test_downgrade_is_blocked_to_preserve_reconstructed_audit_history(tmp_path: Path) -> None:
    path = tmp_path / "reconstruct-downgrade.db"
    config = _prepare(path, quantity=3)
    with sqlite3.connect(path) as db:
        _insert_log(
            db,
            log_id="b0000000000000000000000000000001",
            delta=1,
            created_at="2026-08-24 00:36:29",
            memo="첫 메모",
            transaction_type="MARK_DEFECTIVE",
        )
        _insert_log(
            db,
            log_id="b0000000000000000000000000000002",
            delta=2,
            created_at="2026-08-24 00:37:17",
            memo="둘째 메모",
            transaction_type="MARK_DEFECTIVE",
        )

    command.upgrade(config, MIGRATION_REVISION)
    with pytest.raises(RuntimeError, match="downgrade"):
        command.downgrade(config, PREVIOUS_REVISION)

    with sqlite3.connect(path) as db:
        tables = {
            row[0]
            for row in db.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        parent_remaining = db.execute(
            "SELECT remaining_quantity FROM defect_quarantine_records WHERE record_id = ?",
            (PARENT_ID,),
        ).fetchone()[0]
        record_count = db.execute(
            "SELECT COUNT(*) FROM defect_quarantine_records"
        ).fetchone()[0]
        linked_records = {
            row[0]
            for row in db.execute(
                "SELECT defect_quarantine_record_id FROM transaction_logs "
                "WHERE log_id LIKE 'b000000000000000000000000000000%'"
            )
        }

    assert "defect_quarantine_reconstructions" in tables
    assert "defect_quarantine_reconstruction_allocations" in tables
    assert parent_remaining == 0
    assert record_count == 3
    assert PARENT_ID not in linked_records


def test_pending_reservation_query_avoids_postgresql_enum_lower_call() -> None:
    source = MIGRATION_FILE.read_text(encoding="utf-8")

    assert "LOWER(status)" not in source
    assert "CAST(status AS VARCHAR) = 'RESERVED'" in source
