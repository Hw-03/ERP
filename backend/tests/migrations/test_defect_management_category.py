"""관리 분류 원장 스키마와 기존 기록 최초 이력 backfill 회귀 테스트."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
import pytest
import sqlalchemy as sa


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
def _config(path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


@pytest.mark.parametrize("start_revision", ["20260903_0032", "20260907_0034"])
def test_management_category_migration_adds_default_and_initial_revision(
    tmp_path: Path,
    start_revision: str,
) -> None:
    path = tmp_path / "management-category.db"
    config = _config(path)
    command.upgrade(config, start_revision)
    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")
    with engine.begin() as connection:
        connection.execute(sa.text(
            "INSERT INTO process_types (code, prefix, suffix, stage_order) VALUES ('TR', 'T', 'R', 1)"
        ))
        connection.execute(sa.text(
            "INSERT INTO items (item_id, item_name, unit, model_symbol, process_type_code, serial_no) "
            "VALUES ('11111111111111111111111111111111', 'legacy', 'EA', '', 'TR', 1)"
        ))
        connection.execute(sa.text(
            "INSERT INTO inventory "
            "(inventory_id, item_id, quantity, warehouse_qty, pending_quantity) "
            "VALUES ('33333333333333333333333333333333', "
            "'11111111111111111111111111111111', 0, 0, 0)"
        ))
        if sa.inspect(connection).has_table("warehouse_unplaced_items"):
            connection.execute(sa.text(
                "INSERT INTO warehouse_unplaced_items (id, item_id, quantity) "
                "VALUES ('44444444444444444444444444444444', "
                "'11111111111111111111111111111111', 0)"
            ))
        connection.execute(sa.text(
            "INSERT INTO defect_quarantine_records "
            "(record_id, item_id, department, original_quantity, remaining_quantity, quarantined_at, quarantined_by_name, current_memo, is_legacy) "
            "VALUES ('22222222222222222222222222222222', '11111111111111111111111111111111', '조립', 3, 3, '2026-09-01 00:00:00', '기존 작업자', '기존 메모', 0)"
        ))

    command.upgrade(config, "head")
    with engine.connect() as connection:
        category = connection.execute(sa.text(
            "SELECT management_category FROM defect_quarantine_records WHERE record_id = '22222222222222222222222222222222'"
        )).scalar_one()
        revision = connection.execute(sa.text(
            "SELECT previous_category, next_category, memo, edited_by_name, is_initial "
            "FROM defect_quarantine_management_category_revisions "
            "WHERE record_id = '22222222222222222222222222222222'"
        )).one()

    assert category == "DEFECT"
    assert tuple(revision) == (None, "DEFECT", "기존 메모", "기존 작업자", 1)
