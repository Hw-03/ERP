"""제출 식별자·사유 마스터 추가가 기존 감사 이력을 보존하는지 검증한다."""

from __future__ import annotations

import io
import sqlite3
import uuid
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from app.models import Base
from app.models.defect_reason_category import (
    DEFAULT_DEFECT_REASON_CATEGORIES,
    defect_reason_category_id,
    normalize_defect_reason_name,
)
from bootstrap.schema import schema_differences
from bootstrap.legacy_profiles import sqlite_business_data_fingerprint


BACKEND_DIR = Path(__file__).resolve().parents[2]
REVISION = "20261007_0040"
PREVIOUS_REVISION = "20261007_0039"
DEFAULT_NAMES = (
    "외관 불량", "치수 불량", "기능 불량", "검사 통과", "누유", "이물질", "고압",
    "10A", "선광불량", "mA 불량", "KV 불량", "파형 불량", "기타",
)
CATEGORY_NAMESPACE = uuid.UUID("09d4f985-54b0-5d11-b9d9-30bf2606baaf")
SUBMISSION_NAMESPACE = uuid.UUID("2242e165-5e07-5fd4-a138-47a031a7e46b")
BULK_BASE = "5396dc6b-9fb0-4791-a9e0-8e624f771511"
LONG_REASON = "긴사유" * 40
EXPANDING_REASON = chr(0xFDFA) * 6


@pytest.mark.parametrize("name,expected", [(" ＡＢＣ ", "abc"), ("  mA 불량  ", "ma 불량"), (" \t ", "")])
def test_category_identity_helpers_match_frozen_migration_contract(name: str, expected: str) -> None:
    """런타임 기본 시드와 과거 migration의 동일 이름이 동일 ID를 갖는다."""
    assert DEFAULT_DEFECT_REASON_CATEGORIES == DEFAULT_NAMES
    assert normalize_defect_reason_name(name) == expected
    assert defect_reason_category_id(name) == uuid.uuid5(CATEGORY_NAMESPACE, expected)


def _config(path: Path) -> Config:
    """실제 DB와 분리된 테스트 파일만 migration 대상으로 삼는다."""
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def _seed_old_history(db: sqlite3.Connection) -> None:
    """모든 변경 테이블과 cascade 대상에 과거 행을 구성한다."""
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("INSERT INTO process_types (code,prefix,suffix,stage_order) VALUES ('PF','P','F',1)")
    db.execute("INSERT INTO items (item_id,item_name,unit,model_symbol,process_type_code,serial_no) VALUES ('item','기존 품목','EA','9','PF',1)")
    db.execute("INSERT INTO employees (employee_id,employee_code,name,role,department,display_order,is_active) VALUES ('actor','H-01','기존 작업자','worker','창고',0,'true')")
    db.execute("INSERT INTO io_batches (batch_id,work_type,sub_type,status,requester_employee_id,requester_name,requester_department,requires_approval,notes) VALUES ('batch','receive','receive_supplier','cancelled','actor','기존 작업자','창고',0,'기존 메모')")
    db.execute("INSERT INTO io_bundles (bundle_id,batch_id,source_kind,source_item_id,title_snapshot,quantity,expanded_level) VALUES ('bundle','batch','item','item','기존 묶음',7,1)")
    db.execute("INSERT INTO io_lines (line_id,bundle_id,item_id,item_name_snapshot,unit,direction,from_bucket,to_bucket,quantity,bom_stock_exempt,included,selected,origin,edited,has_children_snapshot,shortage) VALUES ('io-line','bundle','item','기존 품목','EA','in','none','warehouse',7,0,1,1,'direct',0,0,0)")
    for record_id, reason in (("record", " ＡＢＣ "), ("long-record", LONG_REASON), ("expanding-record", EXPANDING_REASON), ("blank-record", " \t ")):
        db.execute("INSERT INTO defect_quarantine_records (record_id,item_id,department,original_quantity,remaining_quantity,reason_category) VALUES (?,'item','고압',7,3,?)", (record_id, reason))
    db.execute("INSERT INTO defect_quarantine_memo_revisions (revision_id,record_id,next_memo,edited_by_name) VALUES ('memo-revision','record','기존 격리 메모','기존 작업자')")
    db.execute("INSERT INTO stock_requests (request_id,requester_employee_id,requester_name,requester_department,request_type,status,requires_warehouse_approval,operation_batch_id,reason_category) VALUES ('request','actor','기존 작업자','창고','RAW_RECEIVE','CANCELLED',1,'batch','abc')")
    db.execute("INSERT INTO stock_requests (request_id,requester_employee_id,requester_name,requester_department,request_type,status,requires_warehouse_approval,reason_category) VALUES ('long-request','actor','기존 작업자','창고','RAW_RECEIVE','CANCELLED',1,?)", (LONG_REASON,))
    db.execute("INSERT INTO stock_request_lines (line_id,request_id,item_id,item_name_snapshot,quantity,from_bucket,to_bucket,status,operation_line_id,defect_quarantine_record_id) VALUES ('request-line','request','item','기존 품목',7,'NONE','WAREHOUSE','CANCELLED','io-line','record')")
    logs = (
        ("io-log", "RECEIVE", "batch", "io-line", None, None, None, "mA 불량", 1),
        ("long-log", "MARK_DEFECTIVE", None, None, "long-record", None, None, LONG_REASON, 0),
        ("bulk-0", "MARK_DEFECTIVE", None, None, "record", f"{BULK_BASE}:0", None, "ＡＢＣ", 1),
        ("bulk-1", "MARK_DEFECTIVE", None, None, "record", f"{BULK_BASE}:12", None, "abc", 0),
        ("uncertain", "MARK_DEFECTIVE", None, None, "record", "same-looking:0", None, "사용자 과거 사유", 0),
        ("single", "MARK_DEFECTIVE", None, None, "record", BULK_BASE, None, None, 0),
        ("wrong-action", "DEFECT_SCRAP", None, None, "record", f"{BULK_BASE}:2", None, None, 0),
        ("no-record", "MARK_DEFECTIVE", None, None, None, f"{BULK_BASE}:3", None, None, 0),
        ("reversal", "UNMARK_DEFECTIVE", "batch", "io-line", "record", None, "bulk-0", None, 0),
    )
    for log_id, tx_type, batch_id, line_id, record_id, client_id, reverses_id, reason, cancelled in logs:
        db.execute("INSERT INTO transaction_logs (log_id,item_id,transaction_type,quantity_change,operation_batch_id,operation_line_id,defect_quarantine_record_id,client_request_id,reverses_log_id,reason_category,cancelled) VALUES (?,'item',?,7,?,?,?,?,?,?,?)", (log_id, tx_type, batch_id, line_id, record_id, client_id, reverses_id, reason, cancelled))
    db.execute("INSERT INTO transaction_edit_logs (edit_id,original_log_id,edited_by_employee_id,edited_by_name,reason,before_payload,after_payload) VALUES ('edit','bulk-0','actor','기존 작업자','정정','{}','{}')")
    db.execute("INSERT INTO defect_quarantine_reconstruction_allocations (allocation_id,transaction_log_id,record_id,quantity) VALUES ('allocation','bulk-0','record',2)")


def _upgrade_seeded(path: Path) -> dict[str, tuple[list[str], list[tuple]]]:
    """FK 활성화 연결로 신규 migration을 실행하고 이전 행을 반환한다."""
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)
    with sqlite3.connect(path) as db:
        _seed_old_history(db)
        tables = ("employees", "io_batches", "io_bundles", "io_lines", "stock_requests", "stock_request_lines", "transaction_logs", "transaction_edit_logs", "defect_quarantine_records", "defect_quarantine_memo_revisions", "defect_quarantine_reconstruction_allocations")
        before = {
            table: ([row[1] for row in db.execute(f"PRAGMA table_info({table})")], db.execute(f"SELECT * FROM {table} ORDER BY 1").fetchall())
            for table in tables
        }
    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            connection.commit()
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
            assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
            assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []
    finally:
        engine.dispose()
    return before


def test_head_adds_master_nullable_indexes_and_matches_model_metadata(tmp_path: Path) -> None:
    path = tmp_path / "schema.db"
    command.upgrade(_config(path), "head")
    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")
    try:
        inspector = sa.inspect(engine)
        assert "defect_reason_categories" in inspector.get_table_names()
        master_columns = {column["name"]: column for column in inspector.get_columns("defect_reason_categories")}
        assert isinstance(master_columns["name"]["type"], sa.Text)
        assert isinstance(master_columns["normalized_name"]["type"], sa.Text)
        for table in ("defect_quarantine_records", "transaction_logs", "stock_requests", "io_batches"):
            columns = {column["name"]: column for column in inspector.get_columns(table)}
            assert columns["reason_category_id"]["nullable"] is True
            with engine.connect() as connection:
                foreign_keys = connection.exec_driver_sql(f"PRAGMA foreign_key_list({table})").all()
                assert any(row[3] == "reason_category_id" and row[2] == "defect_reason_categories" and row[4] == "category_id" and row[6] == "RESTRICT" for row in foreign_keys)
            assert any(index["column_names"] == ["reason_category_id"] for index in inspector.get_indexes(table))
        for table in ("transaction_logs", "stock_requests"):
            assert any(index["column_names"] == ["submission_id"] for index in inspector.get_indexes(table))
            assert not any(fk["constrained_columns"] == ["submission_id"] for fk in inspector.get_foreign_keys(table))
        with engine.connect() as connection:
            assert connection.scalar(sa.text("SELECT version_num FROM alembic_version")) == REVISION
            assert schema_differences(connection) == ()
        metadata_engine = sa.create_engine("sqlite:///:memory:")
        try:
            Base.metadata.create_all(metadata_engine)
            with metadata_engine.connect() as connection:
                assert schema_differences(connection) == ()
        finally:
            metadata_engine.dispose()
    finally:
        engine.dispose()


def test_seeded_upgrade_preserves_every_old_column_and_dependent_row(tmp_path: Path) -> None:
    path = tmp_path / "preserve.db"
    before = _upgrade_seeded(path)
    with sqlite3.connect(path) as db:
        for table, (columns, rows) in before.items():
            assert db.execute(f"SELECT {','.join(columns)} FROM {table} ORDER BY 1").fetchall() == rows


def test_reason_backfill_normalizes_links_but_preserves_snapshots_and_long_names(tmp_path: Path) -> None:
    path = tmp_path / "reasons.db"
    _upgrade_seeded(path)
    with sqlite3.connect(path) as db:
        categories = {row[1]: row for row in db.execute("SELECT category_id,normalized_name,name,is_active,is_other FROM defect_reason_categories")}
        for name in DEFAULT_NAMES:
            row = categories[name.casefold()]
            assert row == (uuid.uuid5(CATEGORY_NAMESPACE, name.casefold()).hex, name.casefold(), name, 1, int(name == "기타"))
        abc_id = uuid.uuid5(CATEGORY_NAMESPACE, "abc").hex
        assert categories["abc"][0] == abc_id
        assert categories["abc"][3:] == (0, 0)
        assert categories["사용자 과거 사유"][3:] == (0, 0)
        assert db.execute("SELECT reason_category,reason_category_id FROM defect_quarantine_records WHERE record_id='record'").fetchone() == (" ＡＢＣ ", abc_id)
        assert db.execute("SELECT reason_category_id FROM stock_requests WHERE request_id='request'").fetchone() == (abc_id,)
        for reason, record_id in ((LONG_REASON, "long-record"), (EXPANDING_REASON, "expanding-record")):
            normalized = normalize_defect_reason_name(reason)
            category_id = uuid.uuid5(CATEGORY_NAMESPACE, normalized).hex
            assert categories[normalized] == (category_id, normalized, reason, 0, 0)
            assert db.execute("SELECT reason_category,reason_category_id FROM defect_quarantine_records WHERE record_id=?", (record_id,)).fetchone() == (reason, category_id)
        long_id = uuid.uuid5(CATEGORY_NAMESPACE, LONG_REASON).hex
        for table, identity, value in (("transaction_logs", "log_id", "long-log"), ("stock_requests", "request_id", "long-request")):
            assert db.execute(f"SELECT reason_category,reason_category_id FROM {table} WHERE {identity}=?", (value,)).fetchone() == (LONG_REASON, long_id)
        assert db.execute("SELECT reason_category_id FROM defect_quarantine_records WHERE record_id='blank-record'").fetchone() == (None,)
        assert db.execute("SELECT reason_category,reason_category_id,notes FROM io_batches WHERE batch_id='batch'").fetchone() == (None, None, "기존 메모")
        db.execute("PRAGMA foreign_keys=ON")
        with pytest.raises(sqlite3.IntegrityError):
            db.execute("DELETE FROM defect_reason_categories WHERE category_id=?", (abc_id,))


def test_submission_backfill_uses_only_explicit_batch_or_exact_quarantine_bulk_evidence(tmp_path: Path) -> None:
    path = tmp_path / "submissions.db"
    _upgrade_seeded(path)
    with sqlite3.connect(path) as db:
        logs = dict(db.execute("SELECT log_id,submission_id FROM transaction_logs"))
        expected_bulk = uuid.uuid5(SUBMISSION_NAMESPACE, BULK_BASE).hex
        assert logs["io-log"] == "batch"
        assert logs["bulk-0"] == logs["bulk-1"] == expected_bulk
        assert all(logs[name] is None for name in ("uncertain", "single", "wrong-action", "no-record", "reversal"))
        assert db.execute("SELECT submission_id FROM stock_requests WHERE request_id='request'").fetchone() == ("batch",)
        assert logs["long-log"] is None


@pytest.mark.parametrize("driver", ["psycopg", "psycopg2"])
def test_postgresql_offline_upgrade_adds_named_foreign_keys_without_table_recreation(driver: str) -> None:
    output = io.StringIO()
    config = Config(str(BACKEND_DIR / "alembic.ini"), output_buffer=output)
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", f"postgresql+{driver}://localhost/unused")
    command.upgrade(config, f"{PREVIOUS_REVISION}:head", sql=True)
    sql = output.getvalue()
    assert "CREATE TABLE defect_reason_categories" in sql
    assert "name TEXT NOT NULL" in sql
    assert "normalized_name TEXT NOT NULL" in sql
    assert "ALTER TABLE io_batches ADD COLUMN reason_category TEXT" in sql
    assert "ALTER TABLE transaction_logs ADD COLUMN submission_id" in sql
    assert "FOREIGN KEY(reason_category_id) REFERENCES defect_reason_categories (category_id) ON DELETE RESTRICT" in sql
    assert "DROP TABLE" not in sql
    for table in ("defect_quarantine_records", "transaction_logs", "stock_requests"):
        assert f"ALTER TABLE {table} ALTER COLUMN reason_category TYPE TEXT" in sql


def test_completed_revision_replay_preserves_runtime_choices_links_and_submission_ids(tmp_path: Path) -> None:
    """현행 unversioned 등록 때 숨김·이름 수정·신규 사유와 제출 연결을 건드리지 않는다."""
    path = tmp_path / "completed-replay.db"
    config = _config(path)
    command.upgrade(config, "head")
    custom_id = uuid.uuid4().hex
    submission_id = uuid.uuid4().hex
    with sqlite3.connect(path) as db:
        _seed_old_history(db)
        db.execute("UPDATE defect_reason_categories SET name='새 이름',normalized_name='새 이름' WHERE normalized_name='ma 불량'")
        db.execute("UPDATE defect_reason_categories SET is_active=0 WHERE normalized_name='외관 불량'")
        db.execute("INSERT INTO defect_reason_categories (category_id,name,normalized_name,is_active,is_other) VALUES (?,'사용자 등록 사유','사용자 등록 사유',1,0)", (custom_id,))
        db.execute("UPDATE transaction_logs SET reason_category_id=?,submission_id=? WHERE log_id='io-log'", (custom_id, submission_id))
        db.execute("UPDATE stock_requests SET reason_category_id=?,submission_id=? WHERE request_id='request'", (custom_id, submission_id))
    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")
    try:
        with engine.connect() as connection:
            before = sqlite_business_data_fingerprint(connection)
            config.attributes["connection"] = connection
            command.stamp(config, PREVIOUS_REVISION)
            command.upgrade(config, "head")
            assert sqlite_business_data_fingerprint(connection) == before
            assert schema_differences(connection) == ()
    finally:
        engine.dispose()


@pytest.mark.parametrize("drift", ["column", "index", "foreign_key", "master_name", "master_normalized_name"])
def test_completed_revision_replay_rejects_partial_schema_drift(tmp_path: Path, drift: str) -> None:
    """이미 마스터가 존재하더라도 누락된 컬럼·인덱스·FK를 완성 스키마로 인정하지 않는다."""
    path = tmp_path / f"partial-{drift}.db"
    config = _config(path)
    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")
    try:
        metadata = sa.MetaData()
        for table in Base.metadata.tables.values():
            table.to_metadata(metadata)
        if drift.startswith("master_"):
            metadata.tables["defect_reason_categories"].c[drift.removeprefix("master_")].type = sa.String(100)
        if drift == "foreign_key":
            table = metadata.tables["transaction_logs"]
            reason_fk = next(fk for fk in table.foreign_key_constraints if list(fk.column_keys) == ["reason_category_id"])
            table.constraints.remove(reason_fk)
        metadata.create_all(engine)
        with engine.begin() as connection:
            if drift == "index":
                connection.exec_driver_sql("DROP INDEX ix_stock_requests_reason_category_id")
            elif drift == "column":
                connection.exec_driver_sql("DROP INDEX ix_transaction_logs_submission_id")
                connection.exec_driver_sql("ALTER TABLE transaction_logs DROP COLUMN submission_id")
        command.stamp(config, PREVIOUS_REVISION)
        with pytest.raises(RuntimeError, match="incompatible.*manual schema repair"):
            command.upgrade(config, "head")
    finally:
        engine.dispose()


@pytest.mark.parametrize("driver", ["psycopg", "psycopg2"])
@pytest.mark.parametrize("table", ["defect_quarantine_records", "transaction_logs", "stock_requests", "io_batches"])
def test_postgresql_snapshot_metadata_accepts_restored_legacy_names(driver: str, table: str) -> None:
    """사유 스냅샷은 드라이버 내부 타입과 무관하게 길이 제한 없는 TEXT를 생성한다."""
    from sqlalchemy.dialects.postgresql import psycopg, psycopg2

    dialect = {"psycopg": psycopg.dialect, "psycopg2": psycopg2.dialect}[driver]()
    column = Base.metadata.tables[table].c.reason_category
    assert str(sa.schema.CreateColumn(column).compile(dialect=dialect)) == "reason_category TEXT"
