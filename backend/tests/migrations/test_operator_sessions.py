"""IC-01 작업자 세션 additive migration 계약."""

from __future__ import annotations

import hashlib
import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config
import pytest
import sqlalchemy as sa

from bootstrap.schema import schema_differences


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
PREVIOUS_REVISION = "20260826_0029"
MIGRATION_REVISION = "20260827_0030"
RESET_PBKDF2_HASH = "pbkdf2_sha256$600000$reset-salt$reset-digest"


def _config(path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def _sqlite_schema_snapshot(path: Path) -> tuple[tuple[object, ...], ...]:
    """거부된 migration이 SQLite DDL을 일부 남기지 않았는지 비교한다."""
    with sqlite3.connect(path) as db:
        return tuple(
            db.execute(
                "SELECT type, name, tbl_name, sql FROM sqlite_master "
                "WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
            ).fetchall()
        )


def _legacy_hash(pin: str) -> str:
    return hashlib.sha256(pin.encode("utf-8")).hexdigest()


def _create_named_operator_session_schema(
    db: sqlite3.Connection,
    *,
    purpose_check: str,
    revoked_default: str = "",
) -> None:
    db.executescript(
        f"""
        PRAGMA foreign_keys=ON;
        CREATE TABLE operator_sessions (
            session_id VARCHAR(32) NOT NULL PRIMARY KEY,
            token_hash VARCHAR(64) NOT NULL,
            employee_id VARCHAR(32) NOT NULL,
            purpose VARCHAR(20) NOT NULL,
            issued_at DATETIME NOT NULL,
            expires_at DATETIME NOT NULL,
            revoked_at DATETIME {revoked_default},
            consumed_at DATETIME,
            boot_id VARCHAR(64) NOT NULL,
            CONSTRAINT ck_operator_sessions_purpose CHECK ({purpose_check}),
            FOREIGN KEY(employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE
        );
        CREATE UNIQUE INDEX uq_operator_sessions_token_hash
            ON operator_sessions (token_hash);
        CREATE INDEX ix_operator_sessions_employee_purpose_revoked
            ON operator_sessions (employee_id, purpose, revoked_at);
        CREATE INDEX ix_operator_sessions_expires_at
            ON operator_sessions (expires_at);
        """
    )


def test_operator_session_migration_backfills_pin_state_and_preserves_hashes(
    tmp_path: Path,
) -> None:
    path = tmp_path / "operator-session.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)
    rows = [
        ("1" * 32, "PIN-NULL", None),
        ("2" * 32, "PIN-DEFAULT", _legacy_hash("0000")),
        ("3" * 32, "PIN-CUSTOM", _legacy_hash("2468")),
    ]
    full_employee_code = "E" * 30
    with sqlite3.connect(path) as db:
        db.executemany(
            """
            INSERT INTO employees (
                employee_id, employee_code, name, role, department, level,
                display_order, is_active, pin_hash
            ) VALUES (?, ?, 'operator', 'worker', 'assembly', 'STAFF', 0, 'true', ?)
            """,
            rows,
        )
        db.execute("PRAGMA foreign_keys=ON")
        db.execute(
            "INSERT INTO process_types (code, prefix, suffix, stage_order) "
            "VALUES ('PF', 'P', 'F', 1)"
        )
        db.execute(
            "INSERT INTO items (item_id, item_name, unit, model_symbol, "
            "process_type_code, serial_no) "
            "VALUES (?, 'migration shipping item', 'EA', '9', 'PF', 1)",
            ("4" * 32,),
        )
        db.execute(
            "INSERT INTO shipping_requests (request_id, base_pf_item_id) VALUES (?, ?)",
            ("5" * 32, "4" * 32),
        )
        db.execute(
            "INSERT INTO shipping_request_events ("
            "event_id, request_id, event_type, message"
            ") VALUES (?, ?, 'REQUEST_CREATED', 'legacy event')",
            ("7" * 32, "5" * 32),
        )
        db.execute(
            "INSERT INTO admin_audit_logs ("
            "audit_id, actor_pin_role, actor_employee_code, action, target_type"
            ") VALUES (?, 'admin', ?, 'legacy.action', 'employee')",
            ("8" * 32, full_employee_code),
        )
        db.commit()

    command.upgrade(config, MIGRATION_REVISION)
    with sqlite3.connect(path) as db:
        db.execute(
            "UPDATE employees SET pin_hash = ?, pin_requires_change = 1 "
            "WHERE employee_code = 'PIN-DEFAULT'",
            (RESET_PBKDF2_HASH,),
        )
        db.commit()
    command.stamp(config, PREVIOUS_REVISION)
    command.upgrade(config, MIGRATION_REVISION)

    with sqlite3.connect(path) as db:
        db.execute("PRAGMA foreign_keys=ON")
        db.execute(
            "INSERT INTO shipping_request_events ("
            "event_id, request_id, event_type, actor_employee_id, "
            "actor_employee_code, actor_name"
            ") VALUES (?, ?, 'REQUEST_CREATED', ?, 'PIN-CUSTOM', 'operator')",
            ("6" * 32, "5" * 32, "3" * 32),
        )
        db.commit()
        employee_columns = {
            row[1]: row for row in db.execute("PRAGMA table_info(employees)")
        }
        audit_columns = {
            row[1]: row for row in db.execute("PRAGMA table_info(admin_audit_logs)")
        }
        legacy_audit = db.execute(
            "SELECT actor_employee_code, action, target_type "
            "FROM admin_audit_logs WHERE audit_id = ?",
            ("8" * 32,),
        ).fetchone()
        migrated = db.execute(
            "SELECT employee_code, pin_hash, pin_requires_change "
            "FROM employees ORDER BY employee_code"
        ).fetchall()
        session_columns = {
            row[1] for row in db.execute("PRAGMA table_info(operator_sessions)")
        }
        session_indexes = {
            row[1] for row in db.execute("PRAGMA index_list(operator_sessions)")
        }
        session_foreign_keys = db.execute(
            "PRAGMA foreign_key_list(operator_sessions)"
        ).fetchall()
        event_columns = {
            row[1]: row for row in db.execute("PRAGMA table_info(shipping_request_events)")
        }
        event_indexes = {
            row[1]: row for row in db.execute("PRAGMA index_list(shipping_request_events)")
        }
        event_foreign_keys = db.execute(
            "PRAGMA foreign_key_list(shipping_request_events)"
        ).fetchall()
        event_actor = db.execute(
            "SELECT actor_employee_id, actor_employee_code, actor_name "
            "FROM shipping_request_events WHERE event_id = ?",
            ("6" * 32,),
        ).fetchone()
        legacy_event = db.execute(
            "SELECT request_id, event_type, message, actor_employee_id, "
            "actor_employee_code, actor_name "
            "FROM shipping_request_events WHERE event_id = ?",
            ("7" * 32,),
        ).fetchone()
        revision = db.execute("SELECT version_num FROM alembic_version").fetchone()[0]

    assert employee_columns["pin_requires_change"][3] == 1
    assert "bootstrap_employee_id" in audit_columns
    assert audit_columns["actor_employee_code"][2].upper() == "VARCHAR(30)"
    assert legacy_audit == (full_employee_code, "legacy.action", "employee")
    assert migrated == [
        ("PIN-CUSTOM", _legacy_hash("2468"), 0),
        ("PIN-DEFAULT", RESET_PBKDF2_HASH, 1),
        ("PIN-NULL", None, 1),
    ]
    assert session_columns == {
        "session_id",
        "token_hash",
        "employee_id",
        "purpose",
        "issued_at",
        "expires_at",
        "revoked_at",
        "consumed_at",
        "boot_id",
    }
    assert {
        "uq_operator_sessions_token_hash",
        "ix_operator_sessions_employee_purpose_revoked",
        "ix_operator_sessions_expires_at",
    } <= session_indexes
    assert any(
        row[2] == "employees" and row[3] == "employee_id" and row[4] == "employee_id"
        for row in session_foreign_keys
    )
    assert {
        "actor_employee_id",
        "actor_employee_code",
        "actor_name",
    } <= set(event_columns)
    assert "ix_shipping_request_events_actor_employee_id" in event_indexes
    assert any(
        row[2] == "employees"
        and row[3] == "actor_employee_id"
        and row[4] == "employee_id"
        and row[6].upper() == "SET NULL"
        for row in event_foreign_keys
    )
    assert event_actor == ("3" * 32, "PIN-CUSTOM", "operator")
    assert legacy_event == (
        "5" * 32,
        "REQUEST_CREATED",
        "legacy event",
        None,
        None,
        None,
    )
    assert revision == MIGRATION_REVISION


def test_operator_session_migration_normalizes_partial_pin_state_column(
    tmp_path: Path,
) -> None:
    path = tmp_path / "operator-session-partial-pin-state.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)

    with sqlite3.connect(path) as db:
        db.execute(
            "ALTER TABLE employees ADD COLUMN pin_requires_change BOOLEAN DEFAULT 0"
        )
        db.execute(
            """
            INSERT INTO employees (
                employee_id, employee_code, name, role, department, level,
                display_order, is_active, pin_hash, pin_requires_change
            ) VALUES (?, 'PIN-PARTIAL', 'operator', 'worker', 'assembly',
                      'STAFF', 0, 'true', ?, NULL)
            """,
            ("9" * 32, _legacy_hash("2468")),
        )
        db.commit()

    command.upgrade(config, MIGRATION_REVISION)

    with sqlite3.connect(path) as db:
        column = {
            row[1]: row for row in db.execute("PRAGMA table_info(employees)")
        }["pin_requires_change"]
        migrated_value = db.execute(
            "SELECT pin_requires_change FROM employees WHERE employee_code = ?",
            ("PIN-PARTIAL",),
        ).fetchone()[0]
        db.execute(
            """
            INSERT INTO employees (
                employee_id, employee_code, name, role, department, level,
                display_order, is_active, pin_hash
            ) VALUES (?, 'PIN-NEW-DEFAULT', 'operator', 'worker', 'assembly',
                      'STAFF', 0, 'true', ?)
            """,
            ("a" * 32, _legacy_hash("2468")),
        )
        default_value = db.execute(
            "SELECT pin_requires_change FROM employees WHERE employee_code = ?",
            ("PIN-NEW-DEFAULT",),
        ).fetchone()[0]

    assert column[2].upper() == "BOOLEAN"
    assert column[3] == 1
    assert str(column[4]).strip("'\"").lower() in {"1", "true"}
    assert migrated_value == 1
    assert default_value == 1


def test_operator_session_partial_true_default_matches_bootstrap_fingerprint(
    tmp_path: Path,
) -> None:
    path = tmp_path / "operator-session-partial-true-default.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)

    with sqlite3.connect(path) as db:
        db.execute(
            "ALTER TABLE employees ADD COLUMN "
            "pin_requires_change BOOLEAN NOT NULL DEFAULT TRUE"
        )
        db.commit()

    command.upgrade(config, MIGRATION_REVISION)
    command.upgrade(config, "head")
    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")
    try:
        with engine.connect() as connection:
            differences = schema_differences(connection)
    finally:
        engine.dispose()

    assert differences == ()


def test_operator_session_migration_rejects_wrong_pin_state_type(
    tmp_path: Path,
) -> None:
    path = tmp_path / "operator-session-wrong-pin-state-type.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)

    with sqlite3.connect(path) as db:
        db.execute(
            "ALTER TABLE employees ADD COLUMN "
            "pin_requires_change VARCHAR(5) NOT NULL DEFAULT 'true'"
        )
        db.commit()

    with pytest.raises(RuntimeError, match="pin_requires_change type=VARCHAR"):
        command.upgrade(config, MIGRATION_REVISION)


def test_operator_session_migration_repairs_partial_bootstrap_audit_shape(
    tmp_path: Path,
) -> None:
    path = tmp_path / "operator-session-partial-bootstrap-audit.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)

    with sqlite3.connect(path) as db:
        db.execute(
            "ALTER TABLE admin_audit_logs ADD COLUMN "
            "bootstrap_employee_id VARCHAR(16) NOT NULL DEFAULT ''"
        )
        db.execute(
            "CREATE UNIQUE INDEX ix_admin_audit_logs_bootstrap_employee_id "
            "ON admin_audit_logs (action)"
        )
        db.commit()

    command.upgrade(config, MIGRATION_REVISION)

    with sqlite3.connect(path) as db:
        column = {
            row[1]: row for row in db.execute("PRAGMA table_info(admin_audit_logs)")
        }["bootstrap_employee_id"]
        index = next(
            row
            for row in db.execute("PRAGMA index_list(admin_audit_logs)")
            if row[1] == "ix_admin_audit_logs_bootstrap_employee_id"
        )
        index_columns = [
            row[2]
            for row in db.execute(
                "PRAGMA index_info(ix_admin_audit_logs_bootstrap_employee_id)"
            )
        ]
        db.execute(
            "INSERT INTO admin_audit_logs ("
            "audit_id, actor_pin_role, bootstrap_employee_id, action, target_type"
            ") VALUES (?, 'bootstrap', ?, 'employee.complete_pin_change', 'employee')",
            ("b" * 32, "c" * 32),
        )

    assert column[2].upper() == "VARCHAR(32)"
    assert column[3] == 0
    assert column[4] is None
    assert index[2] == 0
    assert index_columns == ["bootstrap_employee_id"]


def test_operator_session_migration_rejects_wrong_bootstrap_audit_type(
    tmp_path: Path,
) -> None:
    path = tmp_path / "operator-session-wrong-bootstrap-audit-type.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)

    with sqlite3.connect(path) as db:
        db.execute(
            "ALTER TABLE admin_audit_logs ADD COLUMN bootstrap_employee_id INTEGER"
        )
        db.commit()
    before = _sqlite_schema_snapshot(path)

    with pytest.raises(RuntimeError, match="bootstrap_employee_id type=INTEGER"):
        command.upgrade(config, MIGRATION_REVISION)

    assert _sqlite_schema_snapshot(path) == before


def test_operator_session_migration_rejects_named_but_structurally_invalid_table(
    tmp_path: Path,
) -> None:
    path = tmp_path / "operator-session-partial.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)
    with sqlite3.connect(path) as db:
        db.executescript(
            """
            CREATE TABLE operator_sessions (
                session_id TEXT,
                token_hash TEXT,
                employee_id TEXT,
                purpose TEXT,
                issued_at TEXT,
                expires_at TEXT,
                revoked_at TEXT,
                consumed_at TEXT,
                boot_id TEXT
            );
            CREATE INDEX uq_operator_sessions_token_hash
                ON operator_sessions (token_hash);
            CREATE INDEX ix_operator_sessions_employee_purpose_revoked
                ON operator_sessions (purpose, employee_id, revoked_at);
            CREATE INDEX ix_operator_sessions_expires_at
                ON operator_sessions (boot_id);
            """
        )

    with pytest.raises(RuntimeError, match="operator_sessions schema is partially present"):
        command.upgrade(config, MIGRATION_REVISION)


def test_operator_session_migration_rejection_leaves_sqlite_schema_unchanged(
    tmp_path: Path,
) -> None:
    path = tmp_path / "operator-session-rejection-rollback.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)
    with sqlite3.connect(path) as db:
        db.executescript(
            """
            CREATE TABLE operator_sessions (
                session_id TEXT,
                token_hash TEXT,
                employee_id TEXT,
                purpose TEXT,
                issued_at TEXT,
                expires_at TEXT,
                revoked_at TEXT,
                consumed_at TEXT,
                boot_id TEXT
            );
            CREATE INDEX uq_operator_sessions_token_hash
                ON operator_sessions (token_hash);
            """
        )
    before = _sqlite_schema_snapshot(path)

    with pytest.raises(RuntimeError, match="operator_sessions schema is partially present"):
        command.upgrade(config, MIGRATION_REVISION)

    assert _sqlite_schema_snapshot(path) == before
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT version_num FROM alembic_version").fetchone() == (
            PREVIOUS_REVISION,
        )


@pytest.mark.parametrize(
    ("purpose_check", "revoked_default"),
    [
        ("purpose NOT IN ('operator', 'pin_change')", ""),
        ("purpose IN ('operator', 'pin_change') OR 1 = 1", ""),
        ("purpose IN ('operator', 'pin_change') OR length(purpose) = 7", ""),
        ("purpose IN ('operator', 'pin_change')", "DEFAULT CURRENT_TIMESTAMP"),
    ],
)
def test_operator_session_migration_rejects_semantically_invalid_partial_schema(
    tmp_path: Path,
    purpose_check: str,
    revoked_default: str,
) -> None:
    path = tmp_path / f"operator-session-invalid-{abs(hash((purpose_check, revoked_default)))}.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)
    with sqlite3.connect(path) as db:
        _create_named_operator_session_schema(
            db,
            purpose_check=purpose_check,
            revoked_default=revoked_default,
        )

    with pytest.raises(RuntimeError, match="operator_sessions schema is partially present"):
        command.upgrade(config, MIGRATION_REVISION)


def test_operator_session_migration_accepts_structurally_valid_named_table(
    tmp_path: Path,
) -> None:
    path = tmp_path / "operator-session-valid-partial.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)
    with sqlite3.connect(path) as db:
        _create_named_operator_session_schema(
            db,
            purpose_check="purpose IN ('operator', 'pin_change')",
        )

    command.upgrade(config, MIGRATION_REVISION)
