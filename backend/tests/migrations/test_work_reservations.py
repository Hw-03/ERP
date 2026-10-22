"""Work reservation schema upgrades never acquire stock or change physical data."""
import json
from io import StringIO
from pathlib import Path

from alembic import command
from alembic.config import Config
import pytest
import sqlalchemy as sa

from app.models import Base, Employee, Inventory, Item, ProcessType
from bootstrap.schema import schema_differences


PREVIOUS = "20261014_0046"
REVISION = "20261020_0047"


def _config(path: Path) -> Config:
    """Always target a disposable database, including Alembic's own engine."""
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def _seed(connection: sa.Connection) -> None:
    """Use synthetic stock and old IO columns so this also runs before upgrade."""
    connection.execute(sa.insert(Employee).values(employee_id="owner", employee_code="owner", name="Owner", role="staff"))
    connection.execute(sa.insert(ProcessType).values(code="TR", prefix="T", suffix="R", stage_order=1))
    connection.execute(sa.insert(Item).values(item_id="item", item_name="Synthetic", model_symbol="1", process_type_code="TR", serial_no=1))
    connection.execute(sa.insert(Inventory).values(item_id="item", quantity=10, warehouse_qty=10, pending_quantity=2))
    for status in ["draft", "submitted", "completed", "cancelled"]:
        connection.exec_driver_sql(
            "INSERT INTO io_batches (batch_id, work_type, sub_type, status, requester_employee_id, requester_name, requester_department, requires_approval) "
            "VALUES (?, 'manual', 'manual_out', ?, 'owner', 'Owner', 'TR', 0)",
            (status, status),
        )


def test_upgrade_marks_legacy_drafts_without_reserving_stock(tmp_path: Path) -> None:
    config = _config(tmp_path / "legacy.db")
    command.upgrade(config, PREVIOUS)
    engine = sa.create_engine(config.get_main_option("sqlalchemy.url"))
    try:
        with engine.begin() as connection:
            _seed(connection)
            before = connection.exec_driver_sql("SELECT * FROM inventory").all()
        command.upgrade(config, REVISION)
        with engine.connect() as connection:
            columns = {row["name"] for row in sa.inspect(connection).get_columns("io_batches")}
            assert "revision" in columns, "work reservation revision is missing"
            rows = connection.exec_driver_sql("SELECT batch_id, revision, reservation_status, reservation_issue, effective_plan, creation_payload_hash FROM io_batches ORDER BY batch_id").all()
            assert {row[0]: (row[1], row[2]) for row in rows} == {
                "draft": (0, "needs_reservation"), "submitted": (0, "inactive"),
                "completed": (0, "inactive"), "cancelled": (0, "inactive"),
            }
            draft = next(row for row in rows if row[0] == "draft")
            assert json.loads(draft[3])["code"] == "legacy_unprocessed"
            assert all(row[4] is None and row[5] is None for row in rows)
            assert connection.exec_driver_sql("SELECT * FROM inventory").all() == before
            assert connection.exec_driver_sql("SELECT count(*) FROM transaction_logs").scalar_one() == 0
            for table in ["io_draft_reservations", "io_work_reservation_events"]:
                assert connection.exec_driver_sql(f"SELECT count(*) FROM {table}").scalar_one() == 0
            assert connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar_one() == REVISION
    finally:
        engine.dispose()


def test_fresh_upgrade_matches_models(tmp_path: Path) -> None:
    config = _config(tmp_path / "fresh.db")
    command.upgrade(config, "head")
    engine = sa.create_engine(config.get_main_option("sqlalchemy.url"))
    try:
        with engine.connect() as connection:
            assert "io_draft_reservations" in sa.inspect(connection).get_table_names()
            assert schema_differences(connection) == ()
    finally:
        engine.dispose()


def test_metadata_first_replay_preserves_active_reservations(tmp_path: Path) -> None:
    config = _config(tmp_path / "metadata.db")
    engine = sa.create_engine(config.get_main_option("sqlalchemy.url"))
    try:
        Base.metadata.create_all(engine)
        with engine.begin() as connection:
            _seed(connection)
            assert "io_draft_reservations" in sa.inspect(connection).get_table_names()
            connection.exec_driver_sql("UPDATE io_batches SET revision=5, reservation_status='reserved', effective_plan='{\"version\":1}', creation_payload_hash='first' WHERE batch_id='draft'")
            connection.exec_driver_sql("INSERT INTO io_draft_reservations (reservation_id,batch_id,item_id,source_bucket,source_department,quantity) VALUES ('r','draft','item','warehouse','',2)")
            connection.exec_driver_sql("INSERT INTO io_work_reservation_events (event_id,batch_id,action,actor_name,from_revision,to_revision) VALUES ('e','draft','saved','Owner',4,5)")
        command.stamp(config, PREVIOUS)
        command.upgrade(config, "head")
        with engine.connect() as connection:
            assert connection.exec_driver_sql("SELECT revision,reservation_status,creation_payload_hash FROM io_batches WHERE batch_id='draft'").one() == (5, "reserved", "first")
            assert connection.exec_driver_sql("SELECT quantity FROM io_draft_reservations").scalar_one() == 2
            assert connection.exec_driver_sql("SELECT from_revision,to_revision FROM io_work_reservation_events").one() == (4,5)
            assert schema_differences(connection) == ()
    finally:
        engine.dispose()


@pytest.mark.parametrize("damage", [
    "DROP TABLE io_work_reservation_events",
    "DROP INDEX ix_io_draft_reservations_item_id",
    "ALTER TABLE io_batches DROP COLUMN effective_plan",
])
def test_partial_schema_is_rejected_without_changing_stock(tmp_path: Path, damage: str) -> None:
    config = _config(tmp_path / "partial.db")
    command.upgrade(config, "head")
    engine = sa.create_engine(config.get_main_option("sqlalchemy.url"))
    try:
        with engine.begin() as connection:
            assert "io_draft_reservations" in sa.inspect(connection).get_table_names()
            connection.exec_driver_sql(damage)
        command.stamp(config, PREVIOUS)
        with pytest.raises(RuntimeError, match="[Ww]ork reservation"):
            command.upgrade(config, "head")
    finally:
        engine.dispose()


@pytest.mark.parametrize("values", [
    ("warehouse", "", 0), ("warehouse", "TR", 1), ("production", "", 1),
    ("defective", "TR", 1), ("production", " TR ", 1),
])
def test_source_cell_and_quantity_constraints(tmp_path: Path, values: tuple[str, str, int]) -> None:
    config = _config(tmp_path / "constraints.db")
    command.upgrade(config, "head")
    engine = sa.create_engine(config.get_main_option("sqlalchemy.url"))
    try:
        with engine.begin() as connection:
            _seed(connection)
            assert "io_draft_reservations" in sa.inspect(connection).get_table_names()
            with pytest.raises(sa.exc.IntegrityError):
                connection.exec_driver_sql("INSERT INTO io_draft_reservations (reservation_id,batch_id,item_id,source_bucket,source_department,quantity) VALUES ('r','draft','item',?,?,?)", values)
    finally:
        engine.dispose()


def test_warehouse_cell_uniqueness_and_revision_nonnegative(tmp_path: Path) -> None:
    config = _config(tmp_path / "unique.db")
    command.upgrade(config, "head")
    engine = sa.create_engine(config.get_main_option("sqlalchemy.url"))
    try:
        with engine.begin() as connection:
            _seed(connection)
            assert "io_draft_reservations" in sa.inspect(connection).get_table_names()
            connection.exec_driver_sql("INSERT INTO io_draft_reservations (reservation_id,batch_id,item_id,source_bucket,quantity) VALUES ('r1','draft','item','warehouse',1)")
            with pytest.raises(sa.exc.IntegrityError):
                connection.exec_driver_sql("INSERT INTO io_draft_reservations (reservation_id,batch_id,item_id,source_bucket,quantity) VALUES ('r2','draft','item','warehouse',1)")
            with pytest.raises(sa.exc.IntegrityError):
                connection.exec_driver_sql("UPDATE io_batches SET revision=-1 WHERE batch_id='draft'")
    finally:
        engine.dispose()


def test_upgrade_with_foreign_keys_on_preserves_old_bundles_and_delete_actions(tmp_path: Path) -> None:
    config = _config(tmp_path / "fk-upgrade.db")
    command.upgrade(config, PREVIOUS)
    engine = sa.create_engine(config.get_main_option("sqlalchemy.url"))
    try:
        with engine.begin() as connection:
            _seed(connection)
            connection.exec_driver_sql("INSERT INTO io_bundles (bundle_id,batch_id,source_kind,title_snapshot,quantity,expanded_level) VALUES ('bundle','draft','manual','Old bundle',2,1)")
        with engine.connect() as connection:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
            connection.commit()
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
            assert connection.exec_driver_sql("SELECT title_snapshot,quantity FROM io_bundles").one() == ("Old bundle", 2)
            assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []
            assert schema_differences(connection) == ()
    finally:
        engine.dispose()


def test_ledger_delete_actions_and_nullable_verified_actor(tmp_path: Path) -> None:
    config = _config(tmp_path / "fk-ledger.db")
    command.upgrade(config, "head")
    engine = sa.create_engine(config.get_main_option("sqlalchemy.url"))
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            connection.commit()
            with connection.begin():
                _seed(connection)
                connection.execute(sa.insert(Employee).values(employee_id="actor", employee_code="actor", name="Actor", role="staff"))
                connection.exec_driver_sql("INSERT INTO io_draft_reservations (reservation_id,batch_id,item_id,source_bucket,quantity) VALUES ('r','draft','item','warehouse',1)")
                connection.exec_driver_sql("INSERT INTO io_work_reservation_events (event_id,batch_id,action,actor_employee_id,actor_name,from_revision,to_revision) VALUES ('e','draft','saved','actor','Actor',0,1)")
                with pytest.raises(sa.exc.IntegrityError):
                    connection.exec_driver_sql("DELETE FROM items WHERE item_id='item'")
                connection.exec_driver_sql("DELETE FROM employees WHERE employee_id='actor'")
                assert connection.exec_driver_sql("SELECT actor_employee_id,actor_name FROM io_work_reservation_events").one() == (None, "Actor")
                connection.exec_driver_sql("DELETE FROM io_batches WHERE batch_id='draft'")
                assert connection.exec_driver_sql("SELECT count(*) FROM io_draft_reservations").scalar_one() == 0
                assert connection.exec_driver_sql("SELECT count(*) FROM io_work_reservation_events").scalar_one() == 0
    finally:
        engine.dispose()


def test_downgrade_retains_old_work_and_stock(tmp_path: Path) -> None:
    config = _config(tmp_path / "downgrade.db")
    command.upgrade(config, REVISION)
    engine = sa.create_engine(config.get_main_option("sqlalchemy.url"))
    try:
        with engine.begin() as connection:
            _seed(connection)
        command.downgrade(config, PREVIOUS)
        with engine.connect() as connection:
            assert connection.exec_driver_sql("SELECT count(*) FROM io_batches").scalar_one() == 4
            assert connection.exec_driver_sql("SELECT quantity,pending_quantity FROM inventory").one() == (10, 2)
            assert "revision" not in {row["name"] for row in sa.inspect(connection).get_columns("io_batches")}
            assert "io_draft_reservations" not in sa.inspect(connection).get_table_names()
    finally:
        engine.dispose()


def test_downgrade_rejects_active_reservations_before_any_schema_change(tmp_path: Path) -> None:
    config = _config(tmp_path / "active-downgrade.db")
    command.upgrade(config, REVISION)
    engine = sa.create_engine(config.get_main_option("sqlalchemy.url"))
    try:
        with engine.begin() as connection:
            _seed(connection)
            connection.exec_driver_sql("UPDATE io_batches SET revision=1,reservation_status='reserved' WHERE batch_id='draft'")
            connection.exec_driver_sql("INSERT INTO io_draft_reservations (reservation_id,batch_id,item_id,source_bucket,quantity) VALUES ('r','draft','item','warehouse',2)")
            connection.exec_driver_sql("INSERT INTO io_work_reservation_events (event_id,batch_id,action,actor_name,from_revision,to_revision) VALUES ('e','draft','saved','Owner',0,1)")
            before_schema = connection.exec_driver_sql("SELECT type,name,sql FROM sqlite_master ORDER BY type,name").all()
        with pytest.raises(RuntimeError, match="active work reservations"):
            command.downgrade(config, PREVIOUS)
        with engine.connect() as connection:
            assert connection.exec_driver_sql("SELECT type,name,sql FROM sqlite_master ORDER BY type,name").all() == before_schema
            assert connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar_one() == REVISION
            assert connection.exec_driver_sql("SELECT revision,reservation_status FROM io_batches WHERE batch_id='draft'").one() == (1, "reserved")
            assert connection.exec_driver_sql("SELECT quantity,pending_quantity FROM inventory").one() == (10, 2)
            assert connection.exec_driver_sql("SELECT quantity FROM io_draft_reservations").scalar_one() == 2
            assert connection.exec_driver_sql("SELECT count(*) FROM io_work_reservation_events").scalar_one() == 1
    finally:
        engine.dispose()


def test_offline_downgrade_rejects_unverifiable_reservations() -> None:
    output = StringIO()
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"), output_buffer=output)
    config.set_main_option("sqlalchemy.url", "sqlite:///synthetic.db")
    with pytest.raises(RuntimeError, match="online downgrade"):
        command.downgrade(config, f"{REVISION}:{PREVIOUS}", sql=True)
    assert "DROP TABLE" not in output.getvalue()
    assert "ALTER TABLE" not in output.getvalue()


@pytest.mark.parametrize("url", ["sqlite:///synthetic.db", "postgresql://unused/unused"])
def test_offline_upgrade_renders_without_a_database(url: str) -> None:
    output = StringIO()
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"), output_buffer=output)
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, f"{PREVIOUS}:{REVISION}", sql=True)
    ddl = output.getvalue()
    assert "CREATE TABLE io_draft_reservations" in ddl
    assert "legacy_unprocessed" in ddl
