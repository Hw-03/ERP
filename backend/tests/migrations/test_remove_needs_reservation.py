"""Removing the legacy placeholder must preserve stock, work and its ledgers."""
from __future__ import annotations

import importlib.util
from collections.abc import Iterator
from io import StringIO
from pathlib import Path
from types import ModuleType

from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
import pytest
import sqlalchemy as sa

from test_work_reservations import _config, _seed


PREVIOUS = "20261020_0047"
HEAD_REVISION = "20261029_0051"
MIGRATION = Path(__file__).resolve().parents[2] / "alembic/versions/20261021_0048_remove_needs_reservation.py"
LegacyDatabase = tuple[Config, sa.Engine]


def _migration() -> ModuleType:
    """Load the fixed migration so fault injection never touches production DBs."""
    assert MIGRATION.exists(), "The reservation placeholder removal migration is missing"
    spec = importlib.util.spec_from_file_location("remove_needs_reservation", MIGRATION)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def legacy_database(tmp_path: Path) -> Iterator[LegacyDatabase]:
    """Keep the old default/CHECK even when current ORM metadata has advanced."""
    config = _config(tmp_path / "old-reservations.db")
    command.upgrade(config, PREVIOUS)
    engine = sa.create_engine(config.get_main_option("sqlalchemy.url"))
    with engine.begin() as connection:
        _seed(connection)
        connection.exec_driver_sql("UPDATE io_batches SET revision=7, reservation_status='needs_reservation', reservation_issue='{\"code\":\"legacy_unprocessed\"}', effective_plan='{\"version\":1}', creation_payload_hash='keep' WHERE batch_id='draft'")
        connection.exec_driver_sql("UPDATE io_batches SET revision=9, reservation_status='needs_reservation', reservation_issue='{\"code\":\"returned_after_rejection\",\"message\":\"Keep warning\"}' WHERE batch_id='submitted'")
        connection.exec_driver_sql("UPDATE io_batches SET reservation_status='reserved' WHERE batch_id='completed'")
        connection.exec_driver_sql("INSERT INTO io_draft_reservations (reservation_id,batch_id,item_id,source_bucket,quantity) VALUES ('active','completed','item','warehouse',2)")
        connection.exec_driver_sql("INSERT INTO io_work_reservation_events (event_id,batch_id,action,actor_name,from_revision,to_revision) VALUES ('audit','draft','returned','Owner',6,7)")
        connection.exec_driver_sql("INSERT INTO io_bundles (bundle_id,batch_id,source_kind,title_snapshot,quantity,expanded_level) VALUES ('bundle','draft','manual','Old bundle',2,1)")
        connection.exec_driver_sql("INSERT INTO io_lines (line_id,bundle_id,item_id,item_name_snapshot,unit,direction,from_bucket,to_bucket,quantity,bom_stock_exempt,included,selected,origin,edited,has_children_snapshot,shortage) VALUES ('line','bundle','item','Synthetic','EA','out','warehouse','none',2,0,1,1,'manual',0,0,0)")
    try:
        yield config, engine
    finally:
        engine.dispose()


def _snapshot(connection: sa.Connection) -> dict[str, list[sa.Row]]:
    """Record all business values outside the two permitted batch fields."""
    result = {
        name: connection.exec_driver_sql(f"SELECT * FROM {name}").all()
        for name in ("inventory", "io_bundles", "io_lines", "io_draft_reservations", "io_work_reservation_events", "transaction_logs", "data_revision")
    }
    columns = [row[1] for row in connection.exec_driver_sql("PRAGMA table_info(io_batches)") if row[1] not in {"reservation_status", "reservation_issue"}]
    result["io_batches"] = connection.exec_driver_sql(f"SELECT {','.join(columns)} FROM io_batches ORDER BY batch_id").all()
    return result


def test_upgrade_removes_placeholder_preserving_data_and_foreign_keys(legacy_database: LegacyDatabase) -> None:
    config, engine = legacy_database
    with engine.connect() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        before = _snapshot(connection)
        foreign_keys = {name: connection.exec_driver_sql(f"PRAGMA foreign_key_list({name})").all() for name in ("io_batches", "io_bundles", "io_lines", "io_draft_reservations", "io_work_reservation_events")}
        rootpage = connection.exec_driver_sql("SELECT rootpage FROM sqlite_schema WHERE name='io_batches'").scalar_one()
        connection.commit()
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
        assert dict(connection.exec_driver_sql("SELECT batch_id,reservation_status FROM io_batches").all()) == {"draft": "inactive", "submitted": "inactive", "completed": "reserved", "cancelled": "inactive"}
        assert connection.exec_driver_sql("SELECT reservation_issue FROM io_batches WHERE batch_id='draft'").scalar_one() is None
        assert "returned_after_rejection" in connection.exec_driver_sql("SELECT reservation_issue FROM io_batches WHERE batch_id='submitted'").scalar_one()
        assert _snapshot(connection) == before
        assert connection.exec_driver_sql("SELECT rootpage FROM sqlite_schema WHERE name='io_batches'").scalar_one() == rootpage
        assert {name: connection.exec_driver_sql(f"PRAGMA foreign_key_list({name})").all() for name in foreign_keys} == foreign_keys
        assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
        assert connection.exec_driver_sql("PRAGMA writable_schema").scalar_one() == 0
        assert connection.exec_driver_sql("PRAGMA integrity_check").all() == [("ok",)]
        assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []
        assert connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar_one() == HEAD_REVISION
        default = next(row[4] for row in connection.exec_driver_sql("PRAGMA table_info(io_batches)") if row[1] == "reservation_status")
        assert default == "'inactive'"
        with pytest.raises(sa.exc.IntegrityError):
            connection.exec_driver_sql("UPDATE io_batches SET reservation_status='needs_reservation' WHERE batch_id='draft'")


def test_conflicting_legacy_ledger_fails_before_any_change(legacy_database: LegacyDatabase) -> None:
    config, engine = legacy_database
    with engine.begin() as connection:
        connection.exec_driver_sql("INSERT INTO io_draft_reservations (reservation_id,batch_id,item_id,source_bucket,quantity) VALUES ('conflict','draft','item','warehouse',1)")
        before = connection.exec_driver_sql("SELECT * FROM io_batches ORDER BY batch_id").all()
        schema = connection.exec_driver_sql("SELECT sql FROM sqlite_schema WHERE name='io_batches'").scalar_one()
    with pytest.raises(RuntimeError, match="active reservation"):
        command.upgrade(config, "head")
    with engine.connect() as connection:
        assert connection.exec_driver_sql("SELECT * FROM io_batches ORDER BY batch_id").all() == before
        assert connection.exec_driver_sql("SELECT sql FROM sqlite_schema WHERE name='io_batches'").scalar_one() == schema
        assert connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar_one() == PREVIOUS


def test_replay_is_idempotent_without_revision_or_audit_changes(legacy_database: LegacyDatabase) -> None:
    config, engine = legacy_database
    command.upgrade(config, "head")
    with engine.begin() as connection:
        before = _snapshot(connection)
        batches = connection.exec_driver_sql("SELECT * FROM io_batches ORDER BY batch_id").all()
        schema_version = connection.exec_driver_sql("PRAGMA schema_version").scalar_one()
        with Operations.context(MigrationContext.configure(connection)):
            _migration().upgrade()
        assert _snapshot(connection) == before
        assert connection.exec_driver_sql("SELECT * FROM io_batches ORDER BY batch_id").all() == batches
        assert connection.exec_driver_sql("PRAGMA schema_version").scalar_one() == schema_version


def test_0046_work_upgrades_through_both_revisions_without_a_placeholder(tmp_path: Path) -> None:
    config = _config(tmp_path / "pre-reservations.db")
    command.upgrade(config, "20261014_0046")
    engine = sa.create_engine(config.get_main_option("sqlalchemy.url"))
    try:
        with engine.begin() as connection:
            _seed(connection)
            inventory = connection.exec_driver_sql("SELECT * FROM inventory").all()
        command.upgrade(config, "head")
        with engine.connect() as connection:
            assert connection.exec_driver_sql("SELECT revision,reservation_status,reservation_issue FROM io_batches").all() == [(0, "inactive", None)] * 4
            assert connection.exec_driver_sql("SELECT * FROM inventory").all() == inventory
            assert connection.exec_driver_sql("SELECT count(*) FROM io_draft_reservations").scalar_one() == 0
            assert connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar_one() == HEAD_REVISION
    finally:
        engine.dispose()


def test_failed_alembic_version_write_rolls_back_the_whole_migration(legacy_database: LegacyDatabase) -> None:
    config, engine = legacy_database
    with engine.connect() as connection:
        before = _snapshot(connection)
        batches = connection.exec_driver_sql("SELECT * FROM io_batches ORDER BY batch_id").all()
        schema = connection.exec_driver_sql("SELECT sql FROM sqlite_schema WHERE name='io_batches'").scalar_one()
        connection.commit()

        def fail_version_write(conn: sa.Connection, cursor: object, statement: str, parameters: object, context: object, executemany: bool) -> None:
            """Fail outside the migration's savepoint to exercise Alembic rollback."""
            if statement.startswith("UPDATE alembic_version"):
                raise RuntimeError("injected version write failure")

        sa.event.listen(connection, "before_cursor_execute", fail_version_write)
        config.attributes["connection"] = connection
        try:
            with pytest.raises(RuntimeError, match="injected version write failure"):
                command.upgrade(config, "head")
        finally:
            sa.event.remove(connection, "before_cursor_execute", fail_version_write)
        assert _snapshot(connection) == before
        assert connection.exec_driver_sql("SELECT * FROM io_batches ORDER BY batch_id").all() == batches
        assert connection.exec_driver_sql("SELECT sql FROM sqlite_schema WHERE name='io_batches'").scalar_one() == schema
        assert connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar_one() == PREVIOUS
        assert connection.exec_driver_sql("PRAGMA writable_schema").scalar_one() == 0


@pytest.mark.parametrize("failure_point", ["after_data", "after_schema"])
def test_partial_failure_rolls_back_schema_data_and_pragma(legacy_database: LegacyDatabase, failure_point: str) -> None:
    _, engine = legacy_database
    module = _migration()
    with engine.connect() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        before = _snapshot(connection)
        batches = connection.exec_driver_sql("SELECT * FROM io_batches ORDER BY batch_id").all()
        schema = connection.exec_driver_sql("SELECT sql FROM sqlite_schema WHERE name='io_batches'").scalar_one()
        schema_version = connection.exec_driver_sql("PRAGMA schema_version").scalar_one()
        connection.commit()

        def fail_selected_statement(conn: sa.Connection, cursor: object, statement: str, parameters: object, context: object, executemany: bool) -> None:
            """Interrupt both before schema edits and after schema reload."""
            if (failure_point == "after_data" and statement.startswith("PRAGMA writable_schema=ON")) or (failure_point == "after_schema" and statement == "PRAGMA integrity_check"):
                raise RuntimeError("injected migration failure")

        sa.event.listen(connection, "before_cursor_execute", fail_selected_statement)
        try:
            with pytest.raises(RuntimeError, match="injected migration failure"):
                with Operations.context(MigrationContext.configure(connection)):
                    module.upgrade()
        finally:
            sa.event.remove(connection, "before_cursor_execute", fail_selected_statement)
        assert _snapshot(connection) == before
        assert connection.exec_driver_sql("SELECT * FROM io_batches ORDER BY batch_id").all() == batches
        assert connection.exec_driver_sql("SELECT sql FROM sqlite_schema WHERE name='io_batches'").scalar_one() == schema
        assert connection.exec_driver_sql("PRAGMA schema_version").scalar_one() == schema_version
        assert connection.exec_driver_sql("PRAGMA writable_schema").scalar_one() == 0
        assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
        assert connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar_one() == PREVIOUS
        assert connection.exec_driver_sql("PRAGMA integrity_check").all() == [("ok",)]
        assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []


@pytest.mark.parametrize("damage", [
    ("DEFAULT 'needs_reservation'", "DEFAULT 'reserved'"),
    ("DEFAULT 'needs_reservation'", "DEFAULT 'inactive'"),
    ("'needs_reservation', 'not_required'", "'unexpected', 'needs_reservation', 'not_required'"),
    ("CONSTRAINT ck_io_batch_reservation_status", "CONSTRAINT custom_status"),
    ("CREATE TABLE", "CREATE TABLE invalid("),
])
def test_unrecognized_or_malformed_definition_fails_closed(legacy_database: LegacyDatabase, damage: tuple[str, str]) -> None:
    _, engine = legacy_database
    with engine.connect() as connection:
        original = connection.exec_driver_sql("SELECT sql FROM sqlite_schema WHERE name='io_batches'").scalar_one()
    damaged = original.replace(*damage)
    assert damaged != original
    with pytest.raises(RuntimeError, match="reservation schema"):
        _migration()._sqlite_definition(damaged)


def test_policy_allows_only_batch_data_with_no_legacy_status_or_issue(legacy_database: LegacyDatabase) -> None:
    config, engine = legacy_database
    policy = _migration().EMPLOYEE_AUTO_DEPLOY_POLICY
    assert policy["kind"] == "data-change"
    assert policy["allowed_tables"] == ["io_batches"]
    with engine.connect() as connection:
        assert connection.exec_driver_sql(policy["validator_sql"]).scalar_one() > 0
    command.upgrade(config, "head")
    with engine.connect() as connection:
        assert connection.exec_driver_sql(policy["validator_sql"]).scalar_one() == policy["validator_expected"] == 0


def test_offline_postgresql_uses_normal_constraint_and_default_ddl() -> None:
    output = StringIO()
    config = Config(str(MIGRATION.parents[2] / "alembic.ini"), output_buffer=output)
    config.set_main_option("sqlalchemy.url", "postgresql://unused/unused")
    command.upgrade(config, f"{PREVIOUS}:head", sql=True)
    ddl = output.getvalue()
    assert "ALTER TABLE io_batches ALTER COLUMN reservation_status SET DEFAULT 'inactive'" in ddl
    assert "DROP CONSTRAINT ck_io_batch_reservation_status" in ddl
    assert "CHECK (reservation_status IN ('reserved', 'not_required', 'inactive'))" in ddl
    assert "RAISE EXCEPTION" in ddl and "io_draft_reservations" in ddl
    assert "writable_schema" not in ddl


def test_sqlite_offline_and_lossy_downgrade_are_rejected() -> None:
    module = _migration()
    output = StringIO()
    context = MigrationContext.configure(url="sqlite:///unused.db", opts={"as_sql": True, "output_buffer": output})
    with Operations.context(context):
        with pytest.raises(RuntimeError, match="online"):
            module.upgrade()
        with pytest.raises(RuntimeError, match="cannot reconstruct"):
            module.downgrade()
    assert output.getvalue() == ""
