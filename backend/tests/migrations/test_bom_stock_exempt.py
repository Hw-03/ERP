"""BOM 자동 재고 미반영 마이그레이션 회귀 테스트."""

from __future__ import annotations

import sqlite3
import uuid
from pathlib import Path

from alembic import command
from alembic.config import Config
import sqlalchemy as sa
from sqlalchemy.orm import Session

from app.services.bom_stock_policy import has_valid_bom_auto_token, io_bom_auto_claims


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
PREVIOUS_REVISION = "20260813_0020"
MIGRATION_REVISION = "20260818_0022"


def _config(path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def test_bom_stock_exempt_migration_adds_flags_and_enables_only_selected_item(tmp_path: Path) -> None:
    path = tmp_path / "bom-stock-exempt.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)
    parent_id = "11111111-1111-1111-1111-111111111111"
    target_id = "22222222-2222-2222-2222-222222222222"
    other_id = "33333333-3333-3333-3333-333333333333"
    batch_id = "44444444-4444-4444-4444-444444444444"
    bundle_id = "55555555-5555-5555-5555-555555555555"
    line_id = "66666666-6666-6666-6666-666666666666"

    with sqlite3.connect(path) as db:
        db.execute(
            "INSERT INTO process_types (code, prefix, suffix, stage_order) VALUES ('HR', 'H', 'R', 1)"
        )
        db.executemany(
            """
            INSERT INTO items (
                item_id, item_name, unit, model_symbol, process_type_code,
                serial_no, sales_review_required, deleted_at
            ) VALUES (?, ?, 'EA', ?, 'HR', ?, 0, NULL)
            """,
            [
                (parent_id, "상위 품목", "346", 23),
                (target_id, "고압선", "346", 24),
                (other_id, "다른 고압선", "346", 25),
            ],
        )
        db.execute(
            "INSERT INTO bom (bom_id, parent_item_id, child_item_id, quantity, unit) "
            "VALUES (?, ?, ?, 1, 'EA')",
            ("77777777-7777-7777-7777-777777777777", parent_id, target_id),
        )
        db.execute(
            """
            INSERT INTO io_batches (
                batch_id, work_type, sub_type, status, requester_employee_id,
                requester_name, requester_department, requires_approval
            ) VALUES (?, 'process', 'produce', 'draft', ?, '테스터', 'ASSEMBLY', 0)
            """,
            (batch_id, "88888888-8888-8888-8888-888888888888"),
        )
        db.execute(
            """
            INSERT INTO io_bundles (
                bundle_id, batch_id, source_kind, source_item_id, title_snapshot, quantity, expanded_level
            ) VALUES (?, ?, 'bom_parent', ?, '상위 품목', 1, 1)
            """,
            (bundle_id, batch_id, parent_id),
        )
        db.execute(
            """
            INSERT INTO io_lines (
                line_id, bundle_id, item_id, item_name_snapshot, unit, direction,
                from_bucket, to_bucket, quantity, origin, included, edited,
                has_children_snapshot, shortage
            ) VALUES (?, ?, ?, '고압선', 'EA', 'out', 'production', 'none', 1, 'bom_auto', 1, 0, 0, 0)
            """,
            (line_id, bundle_id, target_id),
        )

    command.upgrade(config, MIGRATION_REVISION)

    with sqlite3.connect(path) as db:
        flags = dict(db.execute("SELECT mes_code, bom_stock_exempt FROM items"))
        item_columns = {row[1] for row in db.execute("PRAGMA table_info(items)")}
        io_line_columns = {row[1] for row in db.execute("PRAGMA table_info(io_lines)")}
        token_secret = db.execute(
            "SELECT setting_value FROM system_settings "
            "WHERE setting_key = 'security.bom_auto_token_secret'"
        ).fetchone()
        backfilled_token = db.execute(
            "SELECT bom_auto_token FROM io_lines WHERE line_id = ?", (line_id,)
        ).fetchone()
        revision = db.execute("SELECT version_num FROM alembic_version").fetchone()[0]

    assert flags == {"346-HR-0023": 0, "346-HR-0024": 1, "346-HR-0025": 0}
    assert "bom_stock_exempt" in item_columns
    assert "bom_stock_exempt" in io_line_columns
    assert "bom_auto_token" in io_line_columns
    assert token_secret is not None
    assert len(token_secret[0]) >= 32
    assert backfilled_token is not None
    assert len(backfilled_token[0]) == 64
    assert revision == MIGRATION_REVISION

    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")
    try:
        with Session(engine) as session:
            assert has_valid_bom_auto_token(
                session,
                flow="io",
                claims=io_bom_auto_claims(
                    bundle_id=uuid.UUID(bundle_id),
                    line_id=uuid.UUID(line_id),
                    source_kind="bom_parent",
                    source_item_id=uuid.UUID(parent_id),
                    item_id=uuid.UUID(target_id),
                    work_type="process",
                    sub_type="produce",
                    direction="out",
                    from_bucket="production",
                    from_department=None,
                    to_bucket="none",
                    to_department=None,
                ),
                token=backfilled_token[0],
            )
    finally:
        engine.dispose()
