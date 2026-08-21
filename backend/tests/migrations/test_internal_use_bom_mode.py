"""연구 사용출고 BOM 차감 방식 저장 마이그레이션 회귀 테스트."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
PREVIOUS_REVISION = "20260819_0023"
MIGRATION_REVISION = "20260820_0024"


def _config(path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def test_internal_use_bom_mode_migration_adds_contract_and_backfills_legacy_draft(
    tmp_path: Path,
) -> None:
    path = tmp_path / "internal-use-bom-mode.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)

    batch_id = "11111111-1111-1111-1111-111111111111"
    bundle_id = "22222222-2222-2222-2222-222222222222"
    parent_id = "33333333-3333-3333-3333-333333333333"
    child_id = "44444444-4444-4444-4444-444444444444"
    employee_id = "55555555-5555-5555-5555-555555555555"
    request_id = "66666666-6666-6666-6666-666666666666"

    with sqlite3.connect(path) as db:
        db.execute(
            "INSERT INTO process_types (code, prefix, suffix, stage_order) "
            "VALUES ('AF', 'A', 'F', 1)"
        )
        db.executemany(
            """
            INSERT INTO items (
                item_id, item_name, unit, model_symbol, process_type_code,
                serial_no, sales_review_required, deleted_at
            ) VALUES (?, ?, 'EA', '7', 'AF', ?, 0, NULL)
            """,
            [(parent_id, "기존 상위 품목", 1), (child_id, "기존 하위 품목", 2)],
        )
        db.execute(
            """
            INSERT INTO io_batches (
                batch_id, work_type, sub_type, status, requester_employee_id,
                requester_name, requester_department, requires_approval
            ) VALUES (?, 'internal_use', 'internal_use_out', 'draft', ?, '연구원', '연구', 1)
            """,
            (batch_id, employee_id),
        )
        db.execute(
            """
            INSERT INTO io_bundles (
                bundle_id, batch_id, source_kind, source_item_id,
                title_snapshot, quantity, expanded_level
            ) VALUES (?, ?, 'bom_parent', ?, '기존 상위 품목', 1, 1)
            """,
            (bundle_id, batch_id, parent_id),
        )
        db.execute(
            """
            INSERT INTO io_lines (
                line_id, bundle_id, item_id, item_name_snapshot, unit, direction,
                from_bucket, to_bucket, quantity, origin, included, edited,
                has_children_snapshot, shortage, bom_stock_exempt
            ) VALUES (?, ?, ?, '기존 하위 품목', 'EA', 'out',
                      'production', 'none', 1, 'bom_auto', 0, 0, 0, 0, 1)
            """,
            (
                "77777777-7777-7777-7777-777777777777",
                bundle_id,
                child_id,
            ),
        )
        db.execute(
            """
            INSERT INTO stock_requests (
                request_id, requester_employee_id, requester_name,
                requester_department, request_type, status,
                requires_warehouse_approval, requires_department_approval
            ) VALUES (?, ?, '연구원', '연구', 'MANUAL_ADJUSTMENT', 'SUBMITTED', 0, 1)
            """,
            (request_id, employee_id),
        )

    command.upgrade(config, MIGRATION_REVISION)

    with sqlite3.connect(path) as db:
        bundle_columns = {row[1] for row in db.execute("PRAGMA table_info(io_bundles)")}
        line_columns = {row[1] for row in db.execute("PRAGMA table_info(io_lines)")}
        request_columns = {
            row[1] for row in db.execute("PRAGMA table_info(stock_requests)")
        }
        bundle = db.execute(
            "SELECT internal_use_bom_mode, source_location FROM io_bundles "
            "WHERE bundle_id = ?",
            (bundle_id,),
        ).fetchone()
        selected = db.execute(
            "SELECT selected FROM io_lines WHERE bundle_id = ?", (bundle_id,)
        ).fetchone()
        approval_department = db.execute(
            "SELECT approval_department FROM stock_requests WHERE request_id = ?",
            (request_id,),
        ).fetchone()
        revision = db.execute("SELECT version_num FROM alembic_version").fetchone()[0]

    assert {"internal_use_bom_mode", "source_location"} <= bundle_columns
    assert "selected" in line_columns
    assert "approval_department" in request_columns
    assert bundle == ("children_only", "department")
    assert selected == (0,)
    assert approval_department == ("연구",)
    assert revision == MIGRATION_REVISION
