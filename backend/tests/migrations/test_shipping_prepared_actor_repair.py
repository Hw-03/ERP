"""Regression tests for the shipping prepared-actor schema repair."""

from __future__ import annotations

import io
from collections import Counter
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import event
from sqlalchemy.engine import Engine


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
PREPARED_ACTOR_REVISION = "20260728_0009"
PREVIOUS_REVISION = "20260728_0010"
MIGRATION_REVISION = "20260728_0011"


def _config(path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def _offline_config(url: str, output: io.StringIO) -> Config:
    config = Config(str(ALEMBIC_INI), output_buffer=output)
    config.set_main_option("sqlalchemy.url", url)
    return config


def _seed_shipping_dependencies(path: Path) -> None:
    with sqlite3.connect(path) as db:
        db.execute(
            "INSERT INTO process_types (code, prefix, suffix, stage_order) VALUES ('PF', 'P', 'F', 80)"
        )
        db.execute(
            """
            INSERT INTO items (
                item_id, item_name, unit, model_symbol, process_type_code, serial_no,
                sales_review_required
            ) VALUES ('pf-item', 'Prepared actor PF', 'EA', '4', 'PF', 1, FALSE)
            """
        )
        db.execute(
            """
            INSERT INTO employees (
                employee_id, employee_code, name, role, department, level,
                display_order, is_active
            ) VALUES ('actor-id', 'ACTOR-01', 'Prepared Actor', 'worker', 'shipping', 'STAFF', 0, 'true')
            """
        )
        db.execute(
            """
            INSERT INTO shipping_requests (
                request_id, status, base_pf_item_id, request_quantity, requested_by_name
            ) VALUES ('shipping-request', 'PREPARED', 'pf-item', 1, 'Original Requester')
            """
        )
        db.execute(
            """
            INSERT INTO shipping_request_events (event_id, request_id, event_type)
            VALUES ('shipping-event', 'shipping-request', 'PREPARED')
            """
        )
        db.execute(
            """
            INSERT INTO io_batches (
                batch_id, work_type, sub_type, status, requester_employee_id,
                requester_name, requester_department, requires_approval, shipping_request_id
            ) VALUES (
                'linked-batch', 'process', 'produce', 'completed', 'actor-id',
                'Prepared Actor', 'shipping', FALSE, 'shipping-request'
            )
            """
        )
        db.execute(
            """
            INSERT INTO transaction_logs (
                log_id, item_id, transaction_type, quantity_change,
                shipping_request_id, shipping_phase, inventory_effect
            ) VALUES (
                'shipping-log', 'pf-item', 'PRODUCE', 1,
                'shipping-request', 'PREPARE', '[]'
            )
            """
        )
        db.commit()


def _upgrade_with_sqlite_foreign_keys(config: Config, revision: str) -> None:
    observed_states: list[int] = []

    def enable_foreign_keys(dbapi_connection: sqlite3.Connection, _connection_record: object) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys = ON")
        observed_states.append(cursor.execute("PRAGMA foreign_keys").fetchone()[0])
        cursor.close()

    event.listen(Engine, "connect", enable_foreign_keys)
    try:
        command.upgrade(config, revision)
    finally:
        event.remove(Engine, "connect", enable_foreign_keys)

    assert observed_states and all(state == 1 for state in observed_states)


def _shipping_schema_signature(db: sqlite3.Connection) -> tuple[list[tuple], list[tuple]]:
    return (
        list(db.execute("PRAGMA foreign_key_list(shipping_requests)")),
        list(db.execute("PRAGMA index_list(shipping_requests)")),
    )


def _primary_database_path() -> Path:
    local_database = BACKEND_DIR / "mes.db"
    if local_database.exists():
        return local_database

    result = subprocess.run(
        ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
        check=True,
    )
    return Path(result.stdout.strip()).resolve().parent / "backend" / "mes.db"


def _shipping_dependent_rows(
    path: Path,
) -> dict[str, Counter[tuple[tuple[type[object], object], ...]]]:
    snapshots: dict[str, Counter[tuple[tuple[type[object], object], ...]]] = {}
    with sqlite3.connect(path) as db:
        remaining = {
            row[0]
            for row in db.execute(
                "SELECT name FROM sqlite_master "
                "WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
            )
        }
        parents = {"shipping_requests"}
        while True:
            children = sorted(
                table_name
                for table_name in remaining
                if any(
                    row[2] in parents
                    for row in db.execute(
                        "PRAGMA foreign_key_list("
                        + '"'
                        + table_name.replace('"', '""')
                        + '"'
                        + ")"
                    )
                )
            )
            if not children:
                break
            for table_name in children:
                quoted_table = '"' + table_name.replace('"', '""') + '"'
                rows = db.execute(f"SELECT * FROM {quoted_table}").fetchall()
                snapshots[table_name] = Counter(
                    tuple((type(value), value) for value in row) for row in rows
                )
            remaining.difference_update(children)
            parents.update(children)
    return snapshots


def test_repair_offline_sql_stops_before_emitting_ddl() -> None:
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "alembic",
            "upgrade",
            f"{PREVIOUS_REVISION}:{MIGRATION_REVISION}",
            "--sql",
        ],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode != 0
    assert "shipping prepared-actor repair requires online schema inspection" in result.stderr
    assert not any(
        statement in result.stdout.upper()
        for statement in ("ALTER TABLE", "CREATE TABLE", "DROP TABLE")
    )


def test_postgresql_offline_sql_uses_idempotent_repair_ddl() -> None:
    output = io.StringIO()
    config = _offline_config(
        "postgresql+psycopg2://migration-test:unused@invalid/migration-test",
        output,
    )

    command.upgrade(config, f"{PREVIOUS_REVISION}:{MIGRATION_REVISION}", sql=True)

    sql = output.getvalue().lower()
    assert "add column if not exists prepared_by_employee_id varchar(32)" in sql
    assert "add column if not exists prepared_by_name varchar(100)" in sql
    assert "from pg_constraint" in sql
    assert "fk_shipping_requests_prepared_by_employee" in sql


def test_repair_upgrades_actual_0010_database_copy_without_data_loss(tmp_path: Path) -> None:
    source = _primary_database_path()
    if not source.exists():
        pytest.skip("actual backend/mes.db is not available")

    path = tmp_path / "actual-mes-0010.db"
    shutil.copy2(source, path)
    with sqlite3.connect(path) as db:
        source_revision = db.execute(
            "SELECT version_num FROM alembic_version"
        ).fetchone()[0]
    if source_revision != PREVIOUS_REVISION:
        pytest.skip(f"actual backend/mes.db is at {source_revision}, not 0010")
    before = _shipping_dependent_rows(path)

    _upgrade_with_sqlite_foreign_keys(_config(path), MIGRATION_REVISION)

    with sqlite3.connect(path) as db:
        revision = db.execute("SELECT version_num FROM alembic_version").fetchone()[0]
        foreign_key_violations = list(db.execute("PRAGMA foreign_key_check"))

    assert _shipping_dependent_rows(path) == before
    assert revision == MIGRATION_REVISION
    assert foreign_key_violations == []


def test_repair_preserves_raw_sqlite_values_and_cascading_descendants(
    tmp_path: Path,
) -> None:
    path = tmp_path / "shipping-raw-dependent-values.db"
    config = _config(path)
    command.upgrade(config, "20260727_0007")
    _seed_shipping_dependencies(path)
    with sqlite3.connect(path) as db:
        db.executescript(
            """
            CREATE TABLE shipping_raw_dependents (
                row_id NUMERIC PRIMARY KEY,
                request_id TEXT NOT NULL,
                text_value TEXT,
                blob_value BLOB,
                null_value TEXT,
                FOREIGN KEY (request_id) REFERENCES shipping_requests(request_id)
                    ON DELETE CASCADE
            );
            CREATE TABLE shipping_raw_descendants (
                row_id TEXT PRIMARY KEY,
                parent_id NUMERIC NOT NULL,
                blob_value BLOB,
                FOREIGN KEY (parent_id) REFERENCES shipping_raw_dependents(row_id)
                    ON DELETE CASCADE
            );
            """
        )
        db.execute(
            """
            INSERT INTO shipping_raw_dependents (
                row_id, request_id, text_value, blob_value, null_value
            ) VALUES (?, ?, ?, ?, ?)
            """,
            (
                "uuid-in-numeric-column",
                "shipping-request",
                "raw text",
                sqlite3.Binary(b"\x00\xffraw"),
                None,
            ),
        )
        db.execute(
            "INSERT INTO shipping_raw_descendants (row_id, parent_id, blob_value) "
            "VALUES (?, ?, ?)",
            (
                "raw-child",
                "uuid-in-numeric-column",
                sqlite3.Binary(b"\x10\x00child"),
            ),
        )
        db.commit()
    command.stamp(config, PREVIOUS_REVISION)
    before = _shipping_dependent_rows(path)

    _upgrade_with_sqlite_foreign_keys(config, MIGRATION_REVISION)

    with sqlite3.connect(path) as db:
        storage_classes = db.execute(
            """
            SELECT typeof(row_id), typeof(text_value), typeof(blob_value), typeof(null_value)
            FROM shipping_raw_dependents
            """
        ).fetchone()
        foreign_key_violations = list(db.execute("PRAGMA foreign_key_check"))

    assert _shipping_dependent_rows(path) == before
    assert storage_classes == ("text", "text", "blob", "null")
    assert foreign_key_violations == []


def test_repair_adds_missing_columns_fk_and_preserves_shipping_dependents(tmp_path: Path) -> None:
    path = tmp_path / "shipping-prepared-actor-drift.db"
    config = _config(path)
    command.upgrade(config, "20260727_0007")
    _seed_shipping_dependencies(path)
    command.stamp(config, PREVIOUS_REVISION)

    _upgrade_with_sqlite_foreign_keys(config, MIGRATION_REVISION)

    with sqlite3.connect(path) as db:
        db.execute("PRAGMA foreign_keys = ON")
        columns = {row[1] for row in db.execute("PRAGMA table_info(shipping_requests)")}
        foreign_keys = list(db.execute("PRAGMA foreign_key_list(shipping_requests)"))
        prepared_actor = db.execute(
            """
            SELECT prepared_by_employee_id, prepared_by_name
            FROM shipping_requests WHERE request_id = 'shipping-request'
            """
        ).fetchone()
        event_request_id = db.execute(
            "SELECT request_id FROM shipping_request_events WHERE event_id = 'shipping-event'"
        ).fetchone()[0]
        batch_request_id = db.execute(
            "SELECT shipping_request_id FROM io_batches WHERE batch_id = 'linked-batch'"
        ).fetchone()[0]
        log_shipping_context = db.execute(
            """
            SELECT shipping_request_id, shipping_phase
            FROM transaction_logs WHERE log_id = 'shipping-log'
            """
        ).fetchone()
        foreign_key_violations = list(db.execute("PRAGMA foreign_key_check"))

    assert {"prepared_by_employee_id", "prepared_by_name"} <= columns
    assert any(
        row[2] == "employees"
        and row[3] == "prepared_by_employee_id"
        and row[4] == "employee_id"
        and row[6].upper() == "SET NULL"
        for row in foreign_keys
    )
    assert prepared_actor == (None, None)
    assert event_request_id == "shipping-request"
    assert batch_request_id == "shipping-request"
    assert log_shipping_context == ("shipping-request", "PREPARE")
    assert foreign_key_violations == []


def test_repair_is_a_noop_for_a_normal_prepared_actor_schema(tmp_path: Path) -> None:
    path = tmp_path / "shipping-prepared-actor-normal.db"
    config = _config(path)
    command.upgrade(config, PREPARED_ACTOR_REVISION)
    _seed_shipping_dependencies(path)
    command.stamp(config, PREVIOUS_REVISION)

    with sqlite3.connect(path) as db:
        db.execute(
            """
            UPDATE shipping_requests
            SET prepared_by_employee_id = 'actor-id', prepared_by_name = 'Prepared Actor'
            WHERE request_id = 'shipping-request'
            """
        )
        db.commit()
        schema_before = _shipping_schema_signature(db)

    _upgrade_with_sqlite_foreign_keys(config, MIGRATION_REVISION)

    with sqlite3.connect(path) as db:
        db.execute("PRAGMA foreign_keys = ON")
        prepared_actor = db.execute(
            """
            SELECT prepared_by_employee_id, prepared_by_name
            FROM shipping_requests WHERE request_id = 'shipping-request'
            """
        ).fetchone()
        revision = db.execute("SELECT version_num FROM alembic_version").fetchone()[0]
        schema_after = _shipping_schema_signature(db)
        dependent_links = (
            db.execute(
                "SELECT request_id FROM shipping_request_events WHERE event_id = 'shipping-event'"
            ).fetchone()[0],
            db.execute(
                "SELECT shipping_request_id FROM io_batches WHERE batch_id = 'linked-batch'"
            ).fetchone()[0],
            db.execute(
                "SELECT shipping_request_id FROM transaction_logs WHERE log_id = 'shipping-log'"
            ).fetchone()[0],
        )
        foreign_key_violations = list(db.execute("PRAGMA foreign_key_check"))

    assert prepared_actor == ("actor-id", "Prepared Actor")
    assert revision == MIGRATION_REVISION
    assert schema_after == schema_before
    assert dependent_links == ("shipping-request", "shipping-request", "shipping-request")
    assert foreign_key_violations == []
