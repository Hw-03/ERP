"""IC-06 physical warehouse ledger migration contract."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import os
from pathlib import Path
import time
import uuid
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
import pytest
import sqlalchemy as sa


BACKEND_DIR = Path(__file__).resolve().parents[2]
PREVIOUS_REVISION = "20260828_0031"
MIGRATION_REVISION = "20260831_0032"
BOX_UNIQUE_INDEX = "uq_warehouse_box_items_box_item"
ZONE_UNIQUE_INDEX = "uq_warehouse_zone_items_zone_item"
UNPLACED_UNIQUE_INDEX = "uq_warehouse_unplaced_items_item_id"
TEST_POSTGRES_URL = os.getenv("TEST_POSTGRES_URL")
CURRENT_HEAD = "20260831_0033"


def _config(database_url: str) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    return config


def _sqlite_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


def _postgres_url_with_application_name(database_url: str, name: str) -> str:
    parsed = urlsplit(database_url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query["application_name"] = name
    return urlunsplit(
        (parsed.scheme, parsed.netloc, parsed.path, urlencode(query), parsed.fragment)
    )


@contextmanager
def _postgres_database(prefix: str):
    assert TEST_POSTGRES_URL is not None
    base_url = sa.engine.make_url(TEST_POSTGRES_URL)
    admin_url = base_url.set(database="postgres")
    admin_engine = sa.create_engine(admin_url, poolclass=sa.pool.NullPool)
    assert admin_engine.dialect.name == "postgresql"
    database_name = f"{prefix}_{uuid.uuid4().hex}"
    quoted_database = f'"{database_name}"'
    try:
        with admin_engine.connect().execution_options(
            isolation_level="AUTOCOMMIT"
        ) as connection:
            connection.exec_driver_sql(f"CREATE DATABASE {quoted_database}")
        yield base_url.set(database=database_name).render_as_string(
            hide_password=False
        )
    finally:
        with admin_engine.connect().execution_options(
            isolation_level="AUTOCOMMIT"
        ) as connection:
            connection.execute(
                sa.text(
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                    "WHERE datname = :database_name AND pid <> pg_backend_pid()"
                ),
                {"database_name": database_name},
            )
            connection.exec_driver_sql(
                f"DROP DATABASE IF EXISTS {quoted_database}"
            )
        admin_engine.dispose()


def _seed_process_type(connection: sa.Connection) -> None:
    connection.execute(
        sa.text(
            "INSERT INTO process_types "
            "(code, prefix, suffix, stage_order, description) "
            "VALUES ('TR', 'T', 'R', 1, 'test')"
        )
    )


def _insert_item(
    connection: sa.Connection,
    *,
    item_id: str,
    warehouse_qty: int,
    serial_no: int,
    deleted: bool = False,
    create_inventory: bool = True,
) -> None:
    connection.execute(
        sa.text(
            "INSERT INTO items "
            "(item_id, item_name, unit, model_symbol, process_type_code, serial_no, "
            "deleted_at) VALUES "
            "(:item_id, :item_name, 'EA', :model_symbol, 'TR', :serial_no, "
            ":deleted_at)"
        ),
        {
            "item_id": item_id,
            "item_name": f"item-{serial_no}",
            "model_symbol": str(serial_no),
            "serial_no": serial_no,
            "deleted_at": "2026-08-31 00:00:00" if deleted else None,
        },
    )
    if not create_inventory:
        return
    connection.execute(
        sa.text(
            "INSERT INTO inventory "
            "(inventory_id, item_id, quantity, warehouse_qty, pending_quantity) "
            "VALUES (:inventory_id, :item_id, :quantity, :warehouse_qty, 0)"
        ),
        {
            "inventory_id": uuid.uuid4().hex,
            "item_id": item_id,
            "quantity": warehouse_qty,
            "warehouse_qty": warehouse_qty,
        },
    )


def _insert_angle(connection: sa.Connection, *, angle_id: int = 1) -> None:
    connection.execute(
        sa.text(
            "INSERT INTO warehouse_angles "
            "(id, label, angle_type, rows, layers, jaris_per_cell, pos_x, pos_y, "
            "width, height, display_order, is_active) VALUES "
            "(:id, :label, 'angle', 1, 1, 3, 0, 0, 72, 60, :id, true)"
        ),
        {"id": angle_id, "label": f"angle-{angle_id}"},
    )


def _insert_box(
    connection: sa.Connection,
    *,
    box_id: str,
    angle_id: int = 1,
) -> None:
    connection.execute(
        sa.text(
            "INSERT INTO warehouse_boxes "
            "(box_id, angle_id, row_no, layer_no, jari_index, size, stack_order) "
            "VALUES (:box_id, :angle_id, 1, 1, 0, 'SMALL', 0)"
        ),
        {"box_id": box_id, "angle_id": angle_id},
    )


def _insert_box_item(
    connection: sa.Connection,
    *,
    row_id: str,
    box_id: str,
    item_id: str,
    quantity: int,
) -> None:
    connection.execute(
        sa.text(
            "INSERT INTO warehouse_box_items (id, box_id, item_id, quantity) "
            "VALUES (:id, :box_id, :item_id, :quantity)"
        ),
        {
            "id": row_id,
            "box_id": box_id,
            "item_id": item_id,
            "quantity": quantity,
        },
    )


def _insert_zone(
    connection: sa.Connection,
    *,
    zone_id: int = 1,
    active: bool = True,
) -> None:
    connection.execute(
        sa.text(
            "INSERT INTO warehouse_special_zones "
            "(id, label, zone_type, pos_x, pos_y, width, height, display_order, "
            "is_active) VALUES "
            "(:id, :label, 'pallet', 0, 0, 80, 40, :id, :active)"
        ),
        {"id": zone_id, "label": f"zone-{zone_id}", "active": active},
    )


def _insert_zone_item(
    connection: sa.Connection,
    *,
    row_id: str,
    zone_id: int,
    item_id: str,
    quantity: int,
) -> None:
    connection.execute(
        sa.text(
            "INSERT INTO warehouse_special_zone_items "
            "(id, zone_id, item_id, quantity) "
            "VALUES (:id, :zone_id, :item_id, :quantity)"
        ),
        {
            "id": row_id,
            "zone_id": zone_id,
            "item_id": item_id,
            "quantity": quantity,
        },
    )


def _seed_valid_0031(connection: sa.Connection) -> dict[str, str]:
    item_a = "1" * 32
    item_b = "2" * 32
    deleted_item = "3" * 32
    box_id = "4" * 32
    box_row_id = "5" * 32
    zone_row_id = "6" * 32
    _seed_process_type(connection)
    _insert_item(connection, item_id=item_a, warehouse_qty=10, serial_no=1)
    _insert_item(connection, item_id=item_b, warehouse_qty=4, serial_no=2)
    _insert_item(
        connection,
        item_id=deleted_item,
        warehouse_qty=7,
        serial_no=3,
        deleted=True,
    )
    _insert_angle(connection)
    _insert_box(connection, box_id=box_id)
    _insert_box_item(
        connection,
        row_id=box_row_id,
        box_id=box_id,
        item_id=item_a,
        quantity=3,
    )
    _insert_zone(connection)
    _insert_zone_item(
        connection,
        row_id=zone_row_id,
        zone_id=1,
        item_id=item_a,
        quantity=2,
    )
    return {
        "item_a": item_a,
        "item_b": item_b,
        "deleted_item": deleted_item,
        "box_id": box_id,
        "box_row_id": box_row_id,
        "zone_row_id": zone_row_id,
    }


def _assert_ledger_schema_and_backfill(
    engine: sa.Engine,
    ids: dict[str, str],
) -> None:
    inspector = sa.inspect(engine)
    assert "warehouse_unplaced_items" in inspector.get_table_names()
    assert {
        index["name"]: (index["column_names"], bool(index["unique"]))
        for index in inspector.get_indexes("warehouse_box_items")
    }[BOX_UNIQUE_INDEX] == (["box_id", "item_id"], True)
    assert {
        index["name"]: (index["column_names"], bool(index["unique"]))
        for index in inspector.get_indexes("warehouse_special_zone_items")
    }[ZONE_UNIQUE_INDEX] == (["zone_id", "item_id"], True)
    assert {
        index["name"]: (index["column_names"], bool(index["unique"]))
        for index in inspector.get_indexes("warehouse_unplaced_items")
    }[UNPLACED_UNIQUE_INDEX] == (["item_id"], True)

    with engine.connect() as connection:
        assert connection.execute(
            sa.text(
                "SELECT item_id, quantity FROM warehouse_unplaced_items "
                "ORDER BY item_id"
            )
        ).all() == [
            (ids["item_a"], 5),
            (ids["item_b"], 4),
            (ids["deleted_item"], 7),
        ]
        assert connection.execute(
            sa.text(
                "SELECT id, box_id, item_id, quantity FROM warehouse_box_items"
            )
        ).one() == (
            ids["box_row_id"],
            ids["box_id"],
            ids["item_a"],
            3,
        )
        assert connection.execute(
            sa.text(
                "SELECT id, zone_id, item_id, quantity "
                "FROM warehouse_special_zone_items"
            )
        ).one() == (ids["zone_row_id"], 1, ids["item_a"], 2)
        assert connection.execute(
            sa.text("SELECT version_num FROM alembic_version")
        ).scalar_one() == MIGRATION_REVISION


def _apply_anomaly(
    connection: sa.Connection,
    anomaly: str,
    ids: dict[str, str],
) -> None:
    if anomaly == "duplicate_box":
        _insert_box_item(
            connection,
            row_id="7" * 32,
            box_id=ids["box_id"],
            item_id=ids["item_a"],
            quantity=1,
        )
    elif anomaly == "duplicate_zone":
        _insert_zone_item(
            connection,
            row_id="7" * 32,
            zone_id=1,
            item_id=ids["item_a"],
            quantity=1,
        )
    elif anomaly == "orphan":
        _insert_item(
            connection,
            item_id="8" * 32,
            warehouse_qty=0,
            serial_no=8,
            create_inventory=False,
        )
    elif anomaly == "inactive_positive":
        connection.execute(
            sa.text("UPDATE warehouse_special_zones SET is_active = false WHERE id = 1")
        )
    elif anomaly == "negative":
        if connection.dialect.name != "postgresql":  # pragma: no cover - PG fixture
            raise AssertionError("negative dirty fixture requires PostgreSQL")
        connection.execute(
            sa.text(
                "ALTER TABLE warehouse_box_items "
                "DROP CONSTRAINT ck_wh_boxitem_qty_nonneg"
            )
        )
        connection.execute(
            sa.text(
                "UPDATE warehouse_box_items SET quantity = -1 WHERE id = :row_id"
            ),
            {"row_id": ids["box_row_id"]},
        )
    elif anomaly == "overplaced":
        connection.execute(
            sa.text(
                "UPDATE warehouse_box_items SET quantity = 9 WHERE id = :row_id"
            ),
            {"row_id": ids["box_row_id"]},
        )
    else:  # pragma: no cover - test helper misuse
        raise AssertionError(anomaly)


def test_0032_is_the_direct_predecessor_of_the_single_head() -> None:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    script = ScriptDirectory.from_config(config)
    assert script.get_heads() == [CURRENT_HEAD]
    assert script.get_revision(CURRENT_HEAD).down_revision == MIGRATION_REVISION


def test_fresh_base_to_0032_creates_empty_unplaced_ledger(tmp_path: Path) -> None:
    database_path = tmp_path / "ic06-fresh.db"
    database_url = _sqlite_url(database_path)

    command.upgrade(_config(database_url), MIGRATION_REVISION)

    engine = sa.create_engine(database_url)
    try:
        inspector = sa.inspect(engine)
        assert "warehouse_unplaced_items" in inspector.get_table_names()
        with engine.connect() as connection:
            assert connection.execute(
                sa.text("SELECT COUNT(*) FROM warehouse_unplaced_items")
            ).scalar_one() == 0
    finally:
        engine.dispose()


def test_0032_offline_upgrade_fails_closed() -> None:
    config = _config(
        "postgresql+psycopg2://migration-test:unused@invalid/migration-test"
    )

    with pytest.raises(RuntimeError, match="requires online"):
        command.upgrade(config, MIGRATION_REVISION, sql=True)


def test_sqlite_0032_rejects_partial_target_schema(tmp_path: Path) -> None:
    database_path = tmp_path / "ic06-partial-schema.db"
    database_url = _sqlite_url(database_path)
    command.upgrade(_config(database_url), PREVIOUS_REVISION)
    engine = sa.create_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(
                sa.text(
                    "CREATE TABLE warehouse_unplaced_items ("
                    "id VARCHAR(32) PRIMARY KEY, "
                    "item_id VARCHAR(32) NOT NULL REFERENCES items(item_id), "
                    "quantity INTEGER NOT NULL CHECK (quantity >= 0))"
                )
            )

        with pytest.raises(RuntimeError, match="target schema is partial"):
            command.upgrade(_config(database_url), MIGRATION_REVISION)

        with engine.connect() as connection:
            assert connection.execute(
                sa.text("SELECT version_num FROM alembic_version")
            ).scalar_one() == PREVIOUS_REVISION
    finally:
        engine.dispose()


def test_sqlite_0032_rejects_named_but_type_incompatible_target_schema(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "ic06-incompatible-schema.db"
    database_url = _sqlite_url(database_path)
    command.upgrade(_config(database_url), PREVIOUS_REVISION)
    engine = sa.create_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(
                sa.text(
                    f"CREATE UNIQUE INDEX {BOX_UNIQUE_INDEX} "
                    "ON warehouse_box_items (box_id, item_id)"
                )
            )
            connection.execute(
                sa.text(
                    f"CREATE UNIQUE INDEX {ZONE_UNIQUE_INDEX} "
                    "ON warehouse_special_zone_items (zone_id, item_id)"
                )
            )
            connection.execute(
                sa.text(
                    "CREATE TABLE warehouse_unplaced_items ("
                    "id VARCHAR(64) NOT NULL PRIMARY KEY, "
                    "item_id VARCHAR(32) NOT NULL REFERENCES items(item_id) "
                    "ON DELETE CASCADE, "
                    "quantity INTEGER NOT NULL, "
                    "CONSTRAINT ck_warehouse_unplaced_items_quantity_nonnegative "
                    "CHECK (quantity >= 0))"
                )
            )
            connection.execute(
                sa.text(
                    f"CREATE UNIQUE INDEX {UNPLACED_UNIQUE_INDEX} "
                    "ON warehouse_unplaced_items (item_id)"
                )
            )

        with pytest.raises(RuntimeError, match="target schema is incompatible"):
            command.upgrade(_config(database_url), MIGRATION_REVISION)
    finally:
        engine.dispose()


def test_sqlite_0032_rejects_named_partial_unique_indexes(tmp_path: Path) -> None:
    database_path = tmp_path / "ic06-partial-indexes.db"
    database_url = _sqlite_url(database_path)
    command.upgrade(_config(database_url), PREVIOUS_REVISION)
    engine = sa.create_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(
                sa.text(
                    f"CREATE UNIQUE INDEX {BOX_UNIQUE_INDEX} "
                    "ON warehouse_box_items (box_id, item_id) "
                    "WHERE item_id IS NOT NULL"
                )
            )
            connection.execute(
                sa.text(
                    f"CREATE UNIQUE INDEX {ZONE_UNIQUE_INDEX} "
                    "ON warehouse_special_zone_items (zone_id, item_id) "
                    "WHERE item_id IS NOT NULL"
                )
            )
            connection.execute(
                sa.text(
                    "CREATE TABLE warehouse_unplaced_items ("
                    "id VARCHAR(32) NOT NULL PRIMARY KEY, "
                    "item_id VARCHAR(32) NOT NULL REFERENCES items(item_id) "
                    "ON DELETE CASCADE, "
                    "quantity INTEGER NOT NULL, "
                    "CONSTRAINT ck_warehouse_unplaced_items_quantity_nonnegative "
                    "CHECK (quantity >= 0))"
                )
            )
            connection.execute(
                sa.text(
                    f"CREATE UNIQUE INDEX {UNPLACED_UNIQUE_INDEX} "
                    "ON warehouse_unplaced_items (item_id)"
                )
            )

        with pytest.raises(RuntimeError, match="target schema is partial"):
            command.upgrade(_config(database_url), MIGRATION_REVISION)
    finally:
        engine.dispose()


def test_sqlite_0031_to_0032_backfills_u_and_preserves_bz_row_ids(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "ic06-upgrade.db"
    database_url = _sqlite_url(database_path)
    command.upgrade(_config(database_url), PREVIOUS_REVISION)
    engine = sa.create_engine(database_url)
    try:
        with engine.begin() as connection:
            ids = _seed_valid_0031(connection)

        command.upgrade(_config(database_url), MIGRATION_REVISION)

        _assert_ledger_schema_and_backfill(engine, ids)
    finally:
        engine.dispose()


def test_sqlite_0032_rolls_back_ddl_when_final_invariant_check_fails(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "ic06-late-invariant.db"
    database_url = _sqlite_url(database_path)
    command.upgrade(_config(database_url), PREVIOUS_REVISION)
    engine = sa.create_engine(database_url)

    def fail_final_invariant(
        connection: sa.Connection,
        cursor: object,
        statement: str,
        parameters: object,
        context: object,
        executemany: bool,
    ) -> None:
        if (
            connection.dialect.name == "sqlite"
            and Path(str(connection.engine.url.database)).resolve()
            == database_path.resolve()
            and "JOIN warehouse_unplaced_items AS u" in statement
            and "WHERE COALESCE(boxes.quantity, 0)" in statement
        ):
            raise RuntimeError("forced late final invariant failure")

    sa.event.listen(sa.engine.Engine, "before_cursor_execute", fail_final_invariant)
    try:
        with engine.begin() as connection:
            _seed_valid_0031(connection)

        with pytest.raises(RuntimeError, match="forced late final invariant failure"):
            command.upgrade(_config(database_url), MIGRATION_REVISION)
    finally:
        sa.event.remove(sa.engine.Engine, "before_cursor_execute", fail_final_invariant)

    try:
        assert "warehouse_unplaced_items" not in sa.inspect(engine).get_table_names()
        with engine.connect() as connection:
            assert connection.execute(
                sa.text("SELECT version_num FROM alembic_version")
            ).scalar_one() == PREVIOUS_REVISION

        command.upgrade(_config(database_url), MIGRATION_REVISION)
        assert "warehouse_unplaced_items" in sa.inspect(engine).get_table_names()
    finally:
        engine.dispose()


def test_sqlite_0032_downgrade_refuses_contract_v2_operations(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "ic06-v2-downgrade.db"
    database_url = _sqlite_url(database_path)
    command.upgrade(_config(database_url), MIGRATION_REVISION)
    engine = sa.create_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(
                sa.text(
                    "INSERT INTO inventory_operations "
                    "(operation_id, kind, domain, action, status, display_label, "
                    "actor_name, contract_version) VALUES "
                    "(:operation_id, 'BUSINESS', 'test', 'receive', 'COMMITTED', "
                    "'v2 test', 'tester', 2)"
                ),
                {"operation_id": uuid.uuid4().hex},
            )

        with pytest.raises(RuntimeError, match="contract v2"):
            command.downgrade(_config(database_url), PREVIOUS_REVISION)

        assert "warehouse_unplaced_items" in sa.inspect(engine).get_table_names()
        with engine.connect() as connection:
            assert connection.execute(
                sa.text("SELECT version_num FROM alembic_version")
            ).scalar_one() == MIGRATION_REVISION
    finally:
        engine.dispose()


def test_sqlite_0032_downgrade_rolls_back_partial_ddl_on_late_failure(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "ic06-downgrade-late-failure.db"
    database_url = _sqlite_url(database_path)
    command.upgrade(_config(database_url), MIGRATION_REVISION)
    engine = sa.create_engine(database_url)

    def fail_last_drop(
        connection: sa.Connection,
        cursor: object,
        statement: str,
        parameters: object,
        context: object,
        executemany: bool,
    ) -> None:
        if (
            connection.dialect.name == "sqlite"
            and Path(str(connection.engine.url.database)).resolve()
            == database_path.resolve()
            and statement.strip() == f"DROP INDEX {BOX_UNIQUE_INDEX}"
        ):
            raise RuntimeError("forced late downgrade failure")

    sa.event.listen(sa.engine.Engine, "before_cursor_execute", fail_last_drop)
    try:
        with pytest.raises(RuntimeError, match="forced late downgrade failure"):
            command.downgrade(_config(database_url), PREVIOUS_REVISION)
    finally:
        sa.event.remove(sa.engine.Engine, "before_cursor_execute", fail_last_drop)

    try:
        inspector = sa.inspect(engine)
        assert "warehouse_unplaced_items" in inspector.get_table_names()
        assert {index["name"] for index in inspector.get_indexes(
            "warehouse_box_items"
        )} >= {BOX_UNIQUE_INDEX}
        assert {index["name"] for index in inspector.get_indexes(
            "warehouse_special_zone_items"
        )} >= {ZONE_UNIQUE_INDEX}
        with engine.connect() as connection:
            assert connection.execute(
                sa.text("SELECT version_num FROM alembic_version")
            ).scalar_one() == MIGRATION_REVISION

        command.downgrade(_config(database_url), PREVIOUS_REVISION)
        assert "warehouse_unplaced_items" not in sa.inspect(engine).get_table_names()
    finally:
        engine.dispose()


@pytest.mark.parametrize(
    "anomaly, message",
    [
        ("duplicate_box", "duplicate"),
        ("duplicate_zone", "duplicate"),
        ("orphan", "orphan"),
        ("inactive_positive", "inactive"),
        ("overplaced", "overplaced"),
    ],
)
def test_sqlite_anomaly_fails_before_ddl_and_keeps_0031(
    tmp_path: Path,
    anomaly: str,
    message: str,
) -> None:
    database_path = tmp_path / f"ic06-{anomaly}.db"
    database_url = _sqlite_url(database_path)
    command.upgrade(_config(database_url), PREVIOUS_REVISION)
    engine = sa.create_engine(database_url)
    try:
        with engine.begin() as connection:
            ids = _seed_valid_0031(connection)
            _apply_anomaly(connection, anomaly, ids)
            before_box_rows = connection.execute(
                sa.text(
                    "SELECT id, box_id, item_id, quantity FROM warehouse_box_items "
                    "ORDER BY id"
                )
            ).all()
            before_zone_rows = connection.execute(
                sa.text(
                    "SELECT id, zone_id, item_id, quantity "
                    "FROM warehouse_special_zone_items ORDER BY id"
                )
            ).all()

        with pytest.raises(RuntimeError, match=message):
            command.upgrade(_config(database_url), MIGRATION_REVISION)

        assert "warehouse_unplaced_items" not in sa.inspect(engine).get_table_names()
        with engine.connect() as connection:
            assert connection.execute(
                sa.text("SELECT version_num FROM alembic_version")
            ).scalar_one() == PREVIOUS_REVISION
            assert connection.execute(
                sa.text(
                    "SELECT id, box_id, item_id, quantity FROM warehouse_box_items "
                    "ORDER BY id"
                )
            ).all() == before_box_rows
            assert connection.execute(
                sa.text(
                    "SELECT id, zone_id, item_id, quantity "
                    "FROM warehouse_special_zone_items ORDER BY id"
                )
            ).all() == before_zone_rows
    finally:
        engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
def test_postgresql_fresh_and_0031_to_0032_preserve_rows() -> None:
    with _postgres_database("test_ic06_migration") as database_url:
        command.upgrade(_config(database_url), PREVIOUS_REVISION)
        engine = sa.create_engine(database_url, poolclass=sa.pool.NullPool)
        try:
            with engine.begin() as connection:
                ids = _seed_valid_0031(connection)
            command.upgrade(_config(database_url), MIGRATION_REVISION)
            _assert_ledger_schema_and_backfill(engine, ids)
        finally:
            engine.dispose()

    with _postgres_database("test_ic06_fresh") as database_url:
        command.upgrade(_config(database_url), MIGRATION_REVISION)
        engine = sa.create_engine(database_url, poolclass=sa.pool.NullPool)
        try:
            assert "warehouse_unplaced_items" in sa.inspect(engine).get_table_names()
        finally:
            engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
def test_postgresql_0032_source_lock_serializes_a_concurrent_writer() -> None:
    with _postgres_database("test_ic06_migration_lock") as database_url:
        command.upgrade(_config(database_url), PREVIOUS_REVISION)
        engine = sa.create_engine(database_url, poolclass=sa.pool.NullPool)
        application_name = f"ic06_migration_{uuid.uuid4().hex}"
        migration_url = _postgres_url_with_application_name(
            database_url,
            application_name,
        )
        writer = engine.connect()
        writer_transaction = writer.begin()
        try:
            with engine.begin() as connection:
                ids = _seed_valid_0031(connection)
            writer.execute(
                sa.text(
                    "UPDATE inventory SET warehouse_qty = warehouse_qty "
                    "WHERE item_id = :item_id"
                ),
                {"item_id": ids["item_a"]},
            )

            with ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(
                    command.upgrade,
                    _config(migration_url),
                    MIGRATION_REVISION,
                )
                deadline = time.monotonic() + 10
                waiting_query = None
                while time.monotonic() < deadline:
                    with engine.connect() as observer:
                        waiting_query = observer.execute(
                            sa.text(
                                "SELECT query FROM pg_stat_activity "
                                "WHERE application_name = :application_name "
                                "AND wait_event_type = 'Lock' LIMIT 1"
                            ),
                            {"application_name": application_name},
                        ).scalar_one_or_none()
                    if waiting_query is not None:
                        break
                    if future.done():
                        future.result()
                        pytest.fail("0032 migration completed while a source writer held a lock")
                    time.sleep(0.05)

                assert waiting_query is not None
                assert "LOCK TABLE" in waiting_query.upper()
                writer_transaction.rollback()
                future.result(timeout=30)

            with engine.connect() as connection:
                assert connection.execute(
                    sa.text("SELECT version_num FROM alembic_version")
                ).scalar_one() == MIGRATION_REVISION
        finally:
            if writer_transaction.is_active:
                writer_transaction.rollback()
            writer.close()
            engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
def test_postgresql_0032_downgrade_blocks_concurrent_v2_operation_insert() -> None:
    with _postgres_database("test_ic06_downgrade_lock") as database_url:
        command.upgrade(_config(database_url), MIGRATION_REVISION)
        engine = sa.create_engine(database_url, poolclass=sa.pool.NullPool)
        application_name = f"ic06_downgrade_{uuid.uuid4().hex}"
        migration_url = _postgres_url_with_application_name(
            database_url,
            application_name,
        )
        blocker = engine.connect()
        blocker_transaction = blocker.begin()
        writer = engine.connect()
        try:
            blocker.exec_driver_sql(
                "LOCK TABLE warehouse_unplaced_items IN ACCESS SHARE MODE"
            )
            with ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(
                    command.downgrade,
                    _config(migration_url),
                    PREVIOUS_REVISION,
                )
                deadline = time.monotonic() + 10
                locked = None
                while time.monotonic() < deadline:
                    with engine.connect() as observer:
                        locked = observer.execute(
                            sa.text(
                                "SELECT 1 FROM pg_locks AS lock "
                                "JOIN pg_stat_activity AS activity "
                                "ON activity.pid = lock.pid "
                                "JOIN pg_class AS relation ON relation.oid = lock.relation "
                                "WHERE activity.application_name = :application_name "
                                "AND relation.relname = 'inventory_operations' "
                                "AND lock.mode = 'ShareRowExclusiveLock' "
                                "AND lock.granted"
                            ),
                            {"application_name": application_name},
                        ).scalar_one_or_none()
                    if locked:
                        break
                    if future.done():
                        future.result()
                        pytest.fail("0032 downgrade completed before inventory_operations lock")
                    time.sleep(0.05)

                if not locked and blocker_transaction.is_active:
                    blocker_transaction.rollback()
                assert locked
                writer.exec_driver_sql("SET lock_timeout TO '250ms'")
                with pytest.raises(sa.exc.OperationalError):
                    writer.execute(
                        sa.text(
                            "INSERT INTO inventory_operations "
                            "(operation_id, kind, domain, action, status, display_label, "
                            "actor_name, contract_version) VALUES "
                            "(:operation_id, 'BUSINESS', 'test', 'receive', 'COMMITTED', "
                            "'v2 concurrent test', 'tester', 2)"
                        ),
                        {"operation_id": uuid.uuid4().hex},
                    )
                writer.rollback()
                blocker_transaction.rollback()
                future.result(timeout=30)

            with engine.connect() as connection:
                assert connection.execute(
                    sa.text("SELECT version_num FROM alembic_version")
                ).scalar_one() == PREVIOUS_REVISION
                assert connection.execute(
                    sa.text(
                        "SELECT COUNT(*) FROM inventory_operations "
                        "WHERE contract_version >= 2"
                    )
                ).scalar_one() == 0
        finally:
            if writer.in_transaction():
                writer.rollback()
            writer.close()
            if blocker_transaction.is_active:
                blocker_transaction.rollback()
            blocker.close()
            engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
@pytest.mark.parametrize(
    "anomaly, message",
    [
        ("duplicate_box", "duplicate"),
        ("duplicate_zone", "duplicate"),
        ("orphan", "orphan"),
        ("inactive_positive", "inactive"),
        ("negative", "negative"),
        ("overplaced", "overplaced"),
    ],
)
def test_postgresql_anomaly_rolls_back_without_orphan_ddl(
    anomaly: str,
    message: str,
) -> None:
    with _postgres_database(f"test_ic06_{anomaly}") as database_url:
        command.upgrade(_config(database_url), PREVIOUS_REVISION)
        engine = sa.create_engine(database_url, poolclass=sa.pool.NullPool)
        try:
            with engine.begin() as connection:
                ids = _seed_valid_0031(connection)
                _apply_anomaly(connection, anomaly, ids)
            with pytest.raises(RuntimeError, match=message):
                command.upgrade(_config(database_url), MIGRATION_REVISION)
            assert "warehouse_unplaced_items" not in sa.inspect(engine).get_table_names()
            with engine.connect() as connection:
                assert connection.execute(
                    sa.text("SELECT version_num FROM alembic_version")
                ).scalar_one() == PREVIOUS_REVISION
        finally:
            engine.dispose()
