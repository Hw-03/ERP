from __future__ import annotations

import shutil
import sqlite3
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from app.models import Base
from bootstrap.schema import (
    BackupError,
    BackupReceipt,
    DataPreflightError,
    RevisionStateError,
    SchemaMismatchError,
    SchemaState,
    check_schema,
    ensure_schema,
    validate_unversioned_data,
)


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
HEAD_REVISION = "20260715_0001"


def _config(path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


@pytest.fixture(scope="module")
def head_database(tmp_path_factory: pytest.TempPathFactory) -> Path:
    path = tmp_path_factory.mktemp("schema-state") / "head.db"
    command.upgrade(_config(path), "head")
    return path


def _copy_head(head_database: Path, target: Path, *, unversioned: bool = False) -> Path:
    shutil.copyfile(head_database, target)
    if unversioned:
        with sqlite3.connect(target) as db:
            db.execute("DROP TABLE alembic_version")
    return target


def _engine(path: Path) -> sa.Engine:
    return sa.create_engine(f"sqlite:///{path.as_posix()}")


def _version_rows(path: Path) -> list[str]:
    with sqlite3.connect(path) as db:
        exists = db.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='alembic_version'"
        ).fetchone()
        if not exists:
            return []
        return [row[0] for row in db.execute("SELECT version_num FROM alembic_version")]


def _receipt_provider(receipt_path: Path, calls: list[bool]):
    def provider(connection: sa.Connection) -> BackupReceipt:
        calls.append("alembic_version" not in sa.inspect(connection).get_table_names())
        receipt_path.write_text("verified test receipt", encoding="utf-8")
        return BackupReceipt(path=receipt_path, verified=True)

    return provider


def _create_independent_legacy_items_database(path: Path) -> None:
    """Create the pre-Alembic SQLite items contract without using a revision."""
    engine = _engine(path)
    try:
        Base.metadata.create_all(engine)
    finally:
        engine.dispose()

    with sqlite3.connect(path) as db:
        db.execute("PRAGMA foreign_keys=OFF")
        db.execute("DROP TABLE model_pf_pins")
        db.execute("DROP TABLE items")
        db.execute(
            """
            CREATE TABLE items (
                item_id VARCHAR(32) NOT NULL,
                item_name VARCHAR(200) NOT NULL,
                sort_order INTEGER,
                unit VARCHAR(20) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
                legacy_part VARCHAR(50),
                legacy_item_type VARCHAR(50),
                supplier VARCHAR(200),
                min_stock INTEGER,
                model_symbol VARCHAR(20) NOT NULL,
                process_type_code VARCHAR(2) NOT NULL,
                serial_no INTEGER NOT NULL,
                bom_completed_at DATETIME,
                mes_code VARCHAR(40) GENERATED ALWAYS AS (
                    model_symbol || '-' || process_type_code || '-' ||
                    printf('%04d', serial_no)
                ) STORED,
                deleted_at DATETIME,
                PRIMARY KEY (item_id),
                CONSTRAINT ck_items_min_stock_nonneg
                    CHECK (min_stock >= 0 OR min_stock IS NULL),
                FOREIGN KEY(process_type_code) REFERENCES process_types (code)
            )
            """
        )
        db.execute("CREATE INDEX ix_items_legacy_part ON items (legacy_part)")
        db.execute("CREATE UNIQUE INDEX ix_items_mes_code ON items (mes_code)")
        db.execute("CREATE INDEX ix_items_model_symbol ON items (model_symbol)")
        db.execute(
            "CREATE INDEX ix_items_process_type_code ON items (process_type_code)"
        )
        db.execute("CREATE INDEX ix_items_sort_order ON items (sort_order)")
        db.execute(
            """
            CREATE TABLE model_pf_pins (
                model_symbol TEXT PRIMARY KEY,
                pf_item_id CHAR(36) NOT NULL
                    REFERENCES items(item_id) ON DELETE CASCADE,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        db.execute("PRAGMA foreign_keys=ON")
        db.execute(
            "INSERT INTO process_types "
            "(code, prefix, suffix, stage_order) VALUES ('TR', 'T', 'R', 1)"
        )
        db.execute(
            "INSERT INTO items "
            "(item_id, item_name, unit, model_symbol, process_type_code, serial_no) "
            "VALUES ('11111111111111111111111111111111', 'legacy', 'EA', '9', 'TR', 1)"
        )
        db.execute(
            "INSERT INTO inventory "
            "(inventory_id, item_id, quantity, warehouse_qty, pending_quantity) "
            "VALUES ('22222222222222222222222222222222', "
            "'11111111111111111111111111111111', 3, 3, 0)"
        )
        db.execute(
            "INSERT INTO model_pf_pins (model_symbol, pf_item_id) "
            "VALUES ('9', '11111111111111111111111111111111')"
        )

        items_sql = db.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='items'"
        ).fetchone()[0]
        assert "printf('%04d', serial_no)" in items_sql
        assert "model_symbol VARCHAR(20) NOT NULL" in items_sql
        assert "process_type_code VARCHAR(2) NOT NULL" in items_sql
        assert "serial_no INTEGER NOT NULL" in items_sql
        assert "ck_items_serial_no_positive" not in items_sql
        pins_sql = db.execute(
            "SELECT sql FROM sqlite_master "
            "WHERE type='table' AND name='model_pf_pins'"
        ).fetchone()[0]
        assert "model_symbol TEXT PRIMARY KEY" in pins_sql
        assert "pf_item_id CHAR(36) NOT NULL" in pins_sql
        assert "updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP" in pins_sql


def test_independent_legacy_items_schema_is_backed_up_then_stamped(
    tmp_path: Path,
):
    path = tmp_path / "independent-legacy.db"
    _create_independent_legacy_items_database(path)
    receipt_path = tmp_path / "legacy-receipt.db"
    calls: list[bool] = []
    engine = _engine(path)
    try:
        result = ensure_schema(
            engine=engine,
            backup_provider=_receipt_provider(receipt_path, calls),
        )
    finally:
        engine.dispose()

    assert calls == [True]
    assert result.previous_state is SchemaState.UNVERSIONED_CURRENT
    assert result.backup == BackupReceipt(path=receipt_path, verified=True)
    assert _version_rows(path) == [HEAD_REVISION]
    with sqlite3.connect(path) as db:
        assert db.execute(
            "SELECT mes_code FROM items WHERE item_name='legacy'"
        ).fetchone() == ("9-TR-0001",)
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
        assert db.execute(
            "SELECT warehouse_qty FROM inventory WHERE item_id=?",
            ("11111111111111111111111111111111",),
        ).fetchone() == (3,)


def test_empty_database_upgrades_to_head_and_is_idempotent(tmp_path: Path):
    path = tmp_path / "empty.db"
    engine = _engine(path)
    try:
        first = ensure_schema(engine=engine)
        second = ensure_schema(engine=engine)
    finally:
        engine.dispose()

    assert first.previous_state is SchemaState.EMPTY
    assert first.revision == HEAD_REVISION
    assert first.changed is True
    assert second.previous_state is SchemaState.VERSIONED
    assert second.revision == HEAD_REVISION
    assert second.changed is False
    assert _version_rows(path) == [HEAD_REVISION]


def test_exact_unversioned_database_is_backed_up_before_stamp(
    tmp_path: Path, head_database: Path
):
    path = _copy_head(head_database, tmp_path / "unversioned.db", unversioned=True)
    receipt_path = tmp_path / "receipt.db"
    calls: list[bool] = []
    engine = _engine(path)
    try:
        first = ensure_schema(
            engine=engine,
            backup_provider=_receipt_provider(receipt_path, calls),
        )
        second = ensure_schema(engine=engine)
    finally:
        engine.dispose()

    assert calls == [True]
    assert first.previous_state is SchemaState.UNVERSIONED_CURRENT
    assert first.backup == BackupReceipt(path=receipt_path, verified=True)
    assert first.changed is True
    assert second.previous_state is SchemaState.VERSIONED
    assert second.changed is False
    assert _version_rows(path) == [HEAD_REVISION]


def test_exact_unversioned_sqlite_uses_verified_runtime_backup(
    tmp_path: Path, head_database: Path, monkeypatch: pytest.MonkeyPatch
):
    path = _copy_head(head_database, tmp_path / "default-backup.db", unversioned=True)
    runtime_root = tmp_path / "runtime"
    monkeypatch.setenv("MES_RUNTIME_ROOT", str(runtime_root))
    engine = _engine(path)
    try:
        result = ensure_schema(engine=engine)
    finally:
        engine.dispose()

    assert result.backup is not None
    assert result.backup.verified is True
    assert result.backup.path.is_file()
    assert result.backup.path.parent == runtime_root / "backups" / "sqlite"
    assert _version_rows(path) == [HEAD_REVISION]


def test_backup_failure_never_creates_version_table(tmp_path: Path, head_database: Path):
    path = _copy_head(head_database, tmp_path / "backup-fails.db", unversioned=True)

    def fail_backup(_connection: sa.Connection) -> BackupReceipt:
        raise OSError("backup unavailable")

    engine = _engine(path)
    try:
        with pytest.raises(BackupError, match="backup unavailable"):
            ensure_schema(engine=engine, backup_provider=fail_backup)
    finally:
        engine.dispose()

    assert _version_rows(path) == []


@pytest.mark.parametrize(
    "receipt",
    [
        BackupReceipt(path=Path("missing-backup.db"), verified=True),
        BackupReceipt(path=Path("unverified-backup.db"), verified=False),
    ],
)
def test_invalid_backup_receipt_never_stamps(
    tmp_path: Path,
    head_database: Path,
    receipt: BackupReceipt,
):
    path = _copy_head(head_database, tmp_path / receipt.path.name, unversioned=True)
    engine = _engine(path)
    try:
        with pytest.raises(BackupError):
            ensure_schema(engine=engine, backup_provider=lambda _connection: receipt)
    finally:
        engine.dispose()

    assert _version_rows(path) == []


@pytest.mark.parametrize(
    ("rows", "message"),
    [
        ([], "empty"),
        (["unknown_revision"], "unknown"),
        ([HEAD_REVISION, "unknown_revision"], "exactly one"),
    ],
)
def test_invalid_version_table_is_rejected(
    tmp_path: Path, rows: list[str], message: str
):
    path = tmp_path / f"invalid-version-{len(rows)}.db"
    with sqlite3.connect(path) as db:
        db.execute("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)")
        db.executemany("INSERT INTO alembic_version VALUES (?)", [(row,) for row in rows])

    engine = _engine(path)
    try:
        with pytest.raises(RevisionStateError, match=message):
            ensure_schema(engine=engine)
    finally:
        engine.dispose()


def _replace_items_schema(path: Path, old: str, new: str) -> None:
    with sqlite3.connect(path) as db:
        db.execute("PRAGMA foreign_keys=OFF")
        create_sql = db.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='items'"
        ).fetchone()[0]
        assert old in create_sql
        index_sql = [
            row[0]
            for row in db.execute(
                "SELECT sql FROM sqlite_master "
                "WHERE type='index' AND tbl_name='items' AND sql IS NOT NULL"
            )
        ]
        db.execute("DROP TABLE items")
        db.execute(create_sql.replace(old, new))
        for statement in index_sql:
            db.execute(statement)


@pytest.mark.parametrize(
    ("mutation", "evidence"),
    [
        ("missing", "notifications"),
        ("extra", "unexpected_table"),
        ("index", "ix_items_sort_order"),
        ("type", "serial_no"),
        ("nullable", "model_symbol"),
        ("default", "created_at"),
        ("check", "check constraint"),
        ("computed", "computed"),
        ("primary-key", "primary key"),
        ("foreign-key", "foreign key mismatch"),
        ("unique", "ix_items_mes_code"),
    ],
)
def test_unversioned_schema_drift_is_rejected_with_evidence(
    tmp_path: Path,
    head_database: Path,
    mutation: str,
    evidence: str,
):
    path = _copy_head(
        head_database,
        tmp_path / f"mismatch-{mutation}.db",
        unversioned=True,
    )
    if mutation == "missing":
        with sqlite3.connect(path) as db:
            db.execute("DROP TABLE notifications")
    elif mutation == "extra":
        with sqlite3.connect(path) as db:
            db.execute("CREATE TABLE unexpected_table (id INTEGER PRIMARY KEY)")
    elif mutation == "index":
        with sqlite3.connect(path) as db:
            db.execute("DROP INDEX ix_items_sort_order")
    elif mutation == "type":
        _replace_items_schema(path, "serial_no INTEGER NOT NULL", "serial_no TEXT NOT NULL")
    elif mutation == "nullable":
        _replace_items_schema(
            path,
            "model_symbol VARCHAR(20) NOT NULL",
            "model_symbol VARCHAR(20)",
        )
    elif mutation == "default":
        _replace_items_schema(
            path,
            "created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL",
            "created_at DATETIME DEFAULT (now()) NOT NULL",
        )
    elif mutation == "check":
        _replace_items_schema(
            path,
            "CHECK (min_stock >= 0 OR min_stock IS NULL)",
            "CHECK (min_stock > 0 OR min_stock IS NULL)",
        )
    elif mutation == "computed":
        _replace_items_schema(path, "printf('%04d'", "printf('%05d'")
    elif mutation == "primary-key":
        _replace_items_schema(path, "PRIMARY KEY (item_id), \n\t", "")
    elif mutation == "foreign-key":
        _replace_items_schema(
            path,
            ", \n\tFOREIGN KEY(process_type_code) REFERENCES process_types (code)",
            "",
        )
    elif mutation == "unique":
        with sqlite3.connect(path) as db:
            db.execute("DROP INDEX ix_items_mes_code")
            db.execute("CREATE INDEX ix_items_mes_code ON items (mes_code)")

    engine = _engine(path)
    try:
        with pytest.raises(SchemaMismatchError) as exc_info:
            ensure_schema(
                engine=engine,
                backup_provider=lambda _connection: pytest.fail(
                    "schema mismatch must fail before backup"
                ),
            )
    finally:
        engine.dispose()

    assert evidence in str(exc_info.value).lower()
    assert exc_info.value.differences
    assert _version_rows(path) == []


@pytest.mark.parametrize(
    ("row", "message"),
    [
        ((None, "TR", 1, None), "null"),
        (("3", "TR", 1, "9-TR-0001"), "model_symbol='9'"),
    ],
)
def test_unversioned_data_preflight_rejects_invalid_items(
    row: tuple[object, ...], message: str
):
    engine = sa.create_engine("sqlite://")
    try:
        with engine.begin() as connection:
            connection.execute(
                sa.text(
                    "CREATE TABLE items ("
                    "model_symbol TEXT, process_type_code TEXT, "
                    "serial_no INTEGER, mes_code TEXT)"
                )
            )
            connection.execute(
                sa.text(
                    "INSERT INTO items "
                    "(model_symbol, process_type_code, serial_no, mes_code) "
                    "VALUES (:model, :process, :serial, :mes_code)"
                ),
                dict(zip(("model", "process", "serial", "mes_code"), row)),
            )
            with pytest.raises(DataPreflightError, match=message):
                validate_unversioned_data(connection)
    finally:
        engine.dispose()


def test_read_only_check_does_not_stamp_exact_unversioned_database(
    tmp_path: Path, head_database: Path
):
    path = _copy_head(head_database, tmp_path / "read-only.db", unversioned=True)
    engine = _engine(path)
    try:
        result = check_schema(engine=engine)
    finally:
        engine.dispose()

    assert result.state is SchemaState.UNVERSIONED_CURRENT
    assert result.ready is False
    assert result.revision is None
    assert _version_rows(path) == []


def test_versioned_head_manual_drift_is_not_ready_and_ensure_fails(
    tmp_path: Path,
    head_database: Path,
):
    path = _copy_head(head_database, tmp_path / "managed-drift.db")
    with sqlite3.connect(path) as db:
        db.execute("DROP INDEX ix_items_sort_order")

    engine = _engine(path)
    try:
        check = check_schema(engine=engine)
        with pytest.raises(SchemaMismatchError, match="ix_items_sort_order"):
            ensure_schema(engine=engine)
    finally:
        engine.dispose()

    assert check.state is SchemaState.VERSIONED
    assert check.revision == HEAD_REVISION
    assert check.ready is False
    assert any("ix_items_sort_order" in difference for difference in check.differences)
    assert _version_rows(path) == [HEAD_REVISION]


def test_postgresql_unversioned_backup_without_provider_fails_closed():
    class PostgreSQLDialect:
        name = "postgresql"

    class PostgreSQLConnection:
        dialect = PostgreSQLDialect()

    from bootstrap.schema import take_verified_backup

    with pytest.raises(BackupError, match="PostgreSQL"):
        take_verified_backup(PostgreSQLConnection(), backup_provider=None)  # type: ignore[arg-type]
