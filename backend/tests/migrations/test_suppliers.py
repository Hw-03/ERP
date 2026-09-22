"""공급업체 스키마 마이그레이션 회귀 테스트."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config
import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
REVISION = "20260921_0036"
PREVIOUS_REVISION = "20260917_0035"


def _config(path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def _upgrade_with_sqlite_foreign_keys(config: Config, revision: str) -> None:
    """FK가 켜진 실제 SQLite 배포 조건으로 revision을 실행한다."""
    def enable_foreign_keys(
        dbapi_connection: sqlite3.Connection,
        _connection_record: object,
    ) -> None:
        dbapi_connection.execute("PRAGMA foreign_keys = ON")

    event.listen(Engine, "connect", enable_foreign_keys)
    try:
        command.upgrade(config, revision)
    finally:
        event.remove(Engine, "connect", enable_foreign_keys)


def _seed_io_batch_dependents(db: sqlite3.Connection) -> None:
    """io_batches 재생성 시 보존해야 할 직접·간접 하위 행을 만든다."""
    db.execute("PRAGMA foreign_keys = ON")
    db.execute(
        "INSERT INTO process_types (code, prefix, suffix, stage_order) "
        "VALUES ('PF', 'P', 'F', 1)"
    )
    db.execute(
        "INSERT INTO items "
        "(item_id, item_name, unit, model_symbol, process_type_code, serial_no) "
        "VALUES ('supplier-child-item', '공급업체 자식 품목', 'EA', '9', 'PF', 1)"
    )
    db.execute(
        "INSERT INTO employees "
        "(employee_id, employee_code, name, role, department, level, display_order, is_active) "
        "VALUES ('supplier-actor', 'SUP-01', '공급업체 작업자', 'worker', '창고', 'STAFF', 0, TRUE)"
    )
    db.execute(
        "INSERT INTO io_batches "
        "(batch_id, work_type, sub_type, status, requester_employee_id, requester_name, "
        "requester_department, requires_approval) "
        "VALUES ('supplier-io-batch', 'receive', 'receive_supplier', 'completed', "
        "'supplier-actor', '공급업체 작업자', '창고', 0)"
    )
    db.execute(
        "INSERT INTO io_bundles "
        "(bundle_id, batch_id, source_kind, source_item_id, title_snapshot, quantity, expanded_level) "
        "VALUES ('supplier-io-bundle', 'supplier-io-batch', 'item', 'supplier-child-item', "
        "'기존 묶음', 1, 1)"
    )
    db.execute(
        "INSERT INTO io_lines "
        "(line_id, bundle_id, item_id, item_name_snapshot, unit, direction, from_bucket, to_bucket, "
        "quantity, bom_stock_exempt, included, selected, origin, edited, has_children_snapshot, shortage) "
        "VALUES ('supplier-io-line', 'supplier-io-bundle', 'supplier-child-item', "
        "'공급업체 자식 품목', 'EA', 'in', 'none', 'warehouse', 1, 0, 1, 1, 'direct', 0, 0, 0)"
    )


def test_supplier_revision_adds_master_and_nullable_io_batch_snapshot_columns(tmp_path: Path):
    """신규 revision은 초기 데이터 없이 공급업체·배치 스냅샷 구조만 추가한다."""
    path = tmp_path / "suppliers.db"
    config = _config(path)

    command.upgrade(config, REVISION)

    with sqlite3.connect(path) as db:
        supplier_columns = {row[1] for row in db.execute("PRAGMA table_info(suppliers)")}
        batch_columns = {row[1] for row in db.execute("PRAGMA table_info(io_batches)")}
        suppliers = db.execute("SELECT COUNT(*) FROM suppliers").fetchone()[0]
        revision = db.execute("SELECT version_num FROM alembic_version").fetchone()[0]

    assert {"supplier_id", "name", "normalized_name", "is_active", "created_at", "updated_at"} <= supplier_columns
    assert {"supplier_id", "supplier_name_snapshot"} <= batch_columns
    assert suppliers == 0
    assert revision == REVISION


def test_supplier_revision_preserves_io_batch_dependents_with_sqlite_foreign_keys(
    tmp_path: Path,
):
    """SQLite FK가 켜져도 io_batches 재생성은 기존 묶음·라인을 보존한다."""
    path = tmp_path / "supplier-io-dependents.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)
    with sqlite3.connect(path) as db:
        _seed_io_batch_dependents(db)
        before = {
            table: db.execute(f"SELECT * FROM {table} ORDER BY 1").fetchall()
            for table in ("io_batches", "io_bundles", "io_lines")
        }

    _upgrade_with_sqlite_foreign_keys(config, REVISION)

    with sqlite3.connect(path) as db:
        after = {
            table: db.execute(f"SELECT * FROM {table} ORDER BY 1").fetchall()
            for table in ("io_batches", "io_bundles", "io_lines")
        }
        foreign_key_errors = db.execute("PRAGMA foreign_key_check").fetchall()

    assert after["io_bundles"] == before["io_bundles"]
    assert after["io_lines"] == before["io_lines"]
    assert after["io_batches"][0][: len(before["io_batches"][0])] == before["io_batches"][0]
    assert foreign_key_errors == []


def test_supplier_revision_repairs_partial_io_batch_column_with_fk_and_index(tmp_path: Path):
    """부분 적용으로 supplier_id만 있으면 FK와 조회 인덱스를 보완한다."""
    path = tmp_path / "partial-supplier-column.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)
    with sqlite3.connect(path) as db:
        db.execute("ALTER TABLE io_batches ADD COLUMN supplier_id VARCHAR(32)")

    command.upgrade(config, REVISION)

    with sqlite3.connect(path) as db:
        foreign_keys = list(db.execute("PRAGMA foreign_key_list(io_batches)"))
        indexes = list(db.execute("PRAGMA index_list(io_batches)"))
        index_columns = {
            index[1]: [column[2] for column in db.execute(f"PRAGMA index_info({index[1]})")]
            for index in indexes
        }

    assert any(
        foreign_key[3] == "supplier_id"
        and foreign_key[2] == "suppliers"
        and foreign_key[4] == "supplier_id"
        and foreign_key[6].upper() == "RESTRICT"
        for foreign_key in foreign_keys
    )
    assert index_columns["ix_io_batches_supplier_id"] == ["supplier_id"]


def _create_partial_suppliers_table(path: Path, *, supplier_id_primary_key: bool) -> None:
    """중단된 배포에서 남을 수 있는 suppliers 테이블만 만든다."""
    primary_key = " PRIMARY KEY" if supplier_id_primary_key else ""
    with sqlite3.connect(path) as db:
        db.execute(
            "CREATE TABLE suppliers ("
            f"supplier_id VARCHAR(32) NOT NULL{primary_key}, "
            "name VARCHAR(100) NOT NULL, "
            "normalized_name VARCHAR(100) NOT NULL, "
            "is_active BOOLEAN NOT NULL DEFAULT 1, "
            "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "
            "updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"
            ")"
        )
        db.execute("CREATE UNIQUE INDEX uq_partial_suppliers_normalized_name ON suppliers(normalized_name)")


def test_supplier_revision_repairs_partial_supplier_table_active_index(tmp_path: Path):
    """부분 적용된 유효 suppliers 테이블에는 활성 조회 인덱스를 보완한다."""
    path = tmp_path / "partial-suppliers.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)
    _create_partial_suppliers_table(path, supplier_id_primary_key=True)

    command.upgrade(config, REVISION)

    with sqlite3.connect(path) as db:
        index_columns = {
            row[1]: [column[2] for column in db.execute(f"PRAGMA index_info({row[1]})")]
            for row in db.execute("PRAGMA index_list(suppliers)")
        }
    assert index_columns["ix_suppliers_is_active"] == ["is_active"]


def test_supplier_revision_rejects_non_primary_supplier_id_before_sqlite_fk_mismatch(tmp_path: Path):
    """참조 대상 PK가 없으면 SQLite FK mismatch를 남기지 않고 즉시 중단한다."""
    path = tmp_path / "invalid-suppliers-pk.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)
    _create_partial_suppliers_table(path, supplier_id_primary_key=False)

    with pytest.raises(RuntimeError, match="supplier_id primary key"):
        command.upgrade(config, REVISION)
