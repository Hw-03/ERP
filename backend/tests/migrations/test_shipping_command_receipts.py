"""IC-08 shipping command receipt migration contract."""

from __future__ import annotations

import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
import pytest
import sqlalchemy as sa

from app.models import ShippingCommandReceipt


BACKEND_DIR = Path(__file__).resolve().parents[2]
PREVIOUS_REVISION = "20260831_0032"
MIGRATION_REVISION = "20260831_0033"
TABLE_NAME = "shipping_command_receipts"
UNIQUE_NAME = "uq_shipping_command_receipt_actor_route_key"
ACTOR_INDEX = "ix_shipping_command_receipts_actor_employee_id"
OPERATION_INDEX = "ix_shipping_command_receipts_operation_id"
CREATED_INDEX = "ix_shipping_command_receipts_created_at"
TEST_POSTGRES_URL = os.getenv("TEST_POSTGRES_URL")


def _config(database_url: str) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    return config


def _sqlite_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


def _assert_receipt_schema(engine: sa.Engine) -> None:
    inspector = sa.inspect(engine)
    columns = {column["name"]: column for column in inspector.get_columns(TABLE_NAME)}
    assert set(columns) == {
        "receipt_id",
        "actor_employee_id",
        "route",
        "command_kind",
        "client_request_id",
        "semantic_fingerprint",
        "expected_status",
        "result_status",
        "operation_id",
        "response_snapshot",
        "created_at",
    }
    assert columns["expected_status"]["nullable"] is True
    assert columns["operation_id"]["nullable"] is True
    assert all(
        columns[name]["nullable"] is False
        for name in set(columns) - {"expected_status", "operation_id"}
    )
    uniques = {
        constraint["name"]: constraint["column_names"]
        for constraint in inspector.get_unique_constraints(TABLE_NAME)
    }
    assert uniques[UNIQUE_NAME] == [
        "actor_employee_id",
        "route",
        "client_request_id",
    ]
    indexes = {
        index["name"]: index["column_names"]
        for index in inspector.get_indexes(TABLE_NAME)
        if not index.get("unique")
    }
    assert indexes == {
        ACTOR_INDEX: ["actor_employee_id"],
        OPERATION_INDEX: ["operation_id"],
        CREATED_INDEX: ["created_at"],
    }
    foreign_keys = {
        tuple(foreign_key["constrained_columns"]): (
            foreign_key["referred_table"],
            foreign_key["referred_columns"],
            str(foreign_key.get("options", {}).get("ondelete", "")).upper(),
        )
        for foreign_key in inspector.get_foreign_keys(TABLE_NAME)
    }
    assert foreign_keys[("actor_employee_id",)] == (
        "employees",
        ["employee_id"],
        "RESTRICT",
    )
    assert foreign_keys[("operation_id",)] == (
        "inventory_operations",
        ["operation_id"],
        "RESTRICT",
    )


def test_0033_is_the_single_head() -> None:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    script = ScriptDirectory.from_config(config)

    assert script.get_heads() == [MIGRATION_REVISION]
    assert script.get_revision(MIGRATION_REVISION).down_revision == PREVIOUS_REVISION


@pytest.mark.parametrize("start_revision", ["base", PREVIOUS_REVISION])
def test_sqlite_upgrade_to_0033_creates_exact_receipt_schema(
    tmp_path: Path,
    start_revision: str,
) -> None:
    database_path = tmp_path / f"shipping-receipts-{start_revision}.db"
    database_url = _sqlite_url(database_path)
    config = _config(database_url)
    if start_revision != "base":
        command.upgrade(config, start_revision)

    command.upgrade(config, MIGRATION_REVISION)

    engine = sa.create_engine(database_url)
    try:
        _assert_receipt_schema(engine)
        with engine.connect() as connection:
            assert connection.execute(
                sa.text("SELECT version_num FROM alembic_version")
            ).scalar_one() == MIGRATION_REVISION
    finally:
        engine.dispose()


def test_sqlite_0033_downgrade_removes_only_receipt_table(tmp_path: Path) -> None:
    database_path = tmp_path / "shipping-receipts-downgrade.db"
    database_url = _sqlite_url(database_path)
    config = _config(database_url)
    command.upgrade(config, MIGRATION_REVISION)

    command.downgrade(config, PREVIOUS_REVISION)

    engine = sa.create_engine(database_url)
    try:
        inspector = sa.inspect(engine)
        assert TABLE_NAME not in inspector.get_table_names()
        assert "shipping_requests" in inspector.get_table_names()
        with engine.connect() as connection:
            assert connection.execute(
                sa.text("SELECT version_num FROM alembic_version")
            ).scalar_one() == PREVIOUS_REVISION
    finally:
        engine.dispose()


def test_sqlite_0033_accepts_compatible_precreated_receipt_table(
    tmp_path: Path,
) -> None:
    """Current-metadata onboarding may create the additive table before stamping."""

    database_path = tmp_path / "shipping-receipts-precreated.db"
    database_url = _sqlite_url(database_path)
    config = _config(database_url)
    command.upgrade(config, PREVIOUS_REVISION)
    engine = sa.create_engine(database_url)
    try:
        ShippingCommandReceipt.__table__.create(engine)

        command.upgrade(config, MIGRATION_REVISION)

        _assert_receipt_schema(engine)
        with engine.connect() as connection:
            assert connection.execute(
                sa.text("SELECT version_num FROM alembic_version")
            ).scalar_one() == MIGRATION_REVISION
    finally:
        engine.dispose()


def test_sqlite_0033_rejects_incompatible_precreated_receipt_table(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "shipping-receipts-incompatible.db"
    database_url = _sqlite_url(database_path)
    config = _config(database_url)
    command.upgrade(config, PREVIOUS_REVISION)
    engine = sa.create_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(
                sa.text(
                    "CREATE TABLE shipping_command_receipts "
                    "(receipt_id VARCHAR(32) PRIMARY KEY)"
                )
            )

        with pytest.raises(RuntimeError, match="incompatible pre-existing"):
            command.upgrade(config, MIGRATION_REVISION)

        assert set(sa.inspect(engine).get_columns(TABLE_NAME)[0]) >= {
            "name",
            "type",
        }
        assert [
            column["name"] for column in sa.inspect(engine).get_columns(TABLE_NAME)
        ] == ["receipt_id"]
        with engine.connect() as connection:
            assert connection.execute(
                sa.text("SELECT version_num FROM alembic_version")
            ).scalar_one() == PREVIOUS_REVISION
    finally:
        engine.dispose()


def test_sqlite_0033_rolls_back_late_upgrade_failure(tmp_path: Path) -> None:
    database_path = tmp_path / "shipping-receipts-upgrade-failure.db"
    database_url = _sqlite_url(database_path)
    config = _config(database_url)
    command.upgrade(config, PREVIOUS_REVISION)
    engine = sa.create_engine(database_url)

    def fail_last_index(
        connection: sa.Connection,
        _cursor: object,
        statement: str,
        _parameters: object,
        _context: object,
        _executemany: bool,
    ) -> None:
        if (
            Path(str(connection.engine.url.database)).resolve()
            == database_path.resolve()
            and CREATED_INDEX in statement
        ):
            raise RuntimeError("forced late shipping receipt migration failure")

    sa.event.listen(sa.engine.Engine, "before_cursor_execute", fail_last_index)
    try:
        with pytest.raises(RuntimeError, match="forced late shipping receipt"):
            command.upgrade(config, MIGRATION_REVISION)
    finally:
        sa.event.remove(sa.engine.Engine, "before_cursor_execute", fail_last_index)

    try:
        assert TABLE_NAME not in sa.inspect(engine).get_table_names()
        with engine.connect() as connection:
            assert connection.execute(
                sa.text("SELECT version_num FROM alembic_version")
            ).scalar_one() == PREVIOUS_REVISION
        command.upgrade(config, MIGRATION_REVISION)
        _assert_receipt_schema(engine)
    finally:
        engine.dispose()


def test_sqlite_0033_rolls_back_late_downgrade_failure(tmp_path: Path) -> None:
    database_path = tmp_path / "shipping-receipts-downgrade-failure.db"
    database_url = _sqlite_url(database_path)
    config = _config(database_url)
    command.upgrade(config, MIGRATION_REVISION)
    engine = sa.create_engine(database_url)

    def fail_drop_table(
        connection: sa.Connection,
        _cursor: object,
        statement: str,
        _parameters: object,
        _context: object,
        _executemany: bool,
    ) -> None:
        if (
            Path(str(connection.engine.url.database)).resolve()
            == database_path.resolve()
            and statement.strip().startswith(f"DROP TABLE {TABLE_NAME}")
        ):
            raise RuntimeError("forced late shipping receipt downgrade failure")

    sa.event.listen(sa.engine.Engine, "before_cursor_execute", fail_drop_table)
    try:
        with pytest.raises(RuntimeError, match="forced late shipping receipt downgrade"):
            command.downgrade(config, PREVIOUS_REVISION)
    finally:
        sa.event.remove(sa.engine.Engine, "before_cursor_execute", fail_drop_table)

    try:
        _assert_receipt_schema(engine)
        with engine.connect() as connection:
            assert connection.execute(
                sa.text("SELECT version_num FROM alembic_version")
            ).scalar_one() == MIGRATION_REVISION
    finally:
        engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
@pytest.mark.parametrize("start_revision", ["base", PREVIOUS_REVISION])
def test_postgresql_upgrade_to_0033_creates_exact_receipt_schema(
    start_revision: str,
) -> None:
    from tests.migrations.test_inventory_location_ledger import _postgres_database

    with _postgres_database(f"test_ic08_{start_revision}") as database_url:
        config = _config(database_url)
        if start_revision != "base":
            command.upgrade(config, start_revision)
        command.upgrade(config, MIGRATION_REVISION)

        engine = sa.create_engine(database_url, poolclass=sa.pool.NullPool)
        try:
            _assert_receipt_schema(engine)
            with engine.connect() as connection:
                assert connection.execute(
                    sa.text("SELECT version_num FROM alembic_version")
                ).scalar_one() == MIGRATION_REVISION
        finally:
            engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
def test_postgresql_0033_downgrade_and_reupgrade() -> None:
    from tests.migrations.test_inventory_location_ledger import _postgres_database

    with _postgres_database("test_ic08_downgrade") as database_url:
        config = _config(database_url)
        command.upgrade(config, MIGRATION_REVISION)
        command.downgrade(config, PREVIOUS_REVISION)

        engine = sa.create_engine(database_url, poolclass=sa.pool.NullPool)
        try:
            inspector = sa.inspect(engine)
            assert TABLE_NAME not in inspector.get_table_names()
            assert "shipping_requests" in inspector.get_table_names()
            with engine.connect() as connection:
                assert connection.execute(
                    sa.text("SELECT version_num FROM alembic_version")
                ).scalar_one() == PREVIOUS_REVISION

            command.upgrade(config, MIGRATION_REVISION)
            _assert_receipt_schema(engine)
        finally:
            engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
def test_postgresql_0033_late_failure_rolls_back_and_retry_succeeds() -> None:
    from tests.migrations.test_inventory_location_ledger import _postgres_database

    with _postgres_database("test_ic08_failure") as database_url:
        config = _config(database_url)
        command.upgrade(config, PREVIOUS_REVISION)
        target_database = sa.engine.make_url(database_url).database

        def fail_last_index(
            connection: sa.Connection,
            _cursor: object,
            statement: str,
            _parameters: object,
            _context: object,
            _executemany: bool,
        ) -> None:
            if (
                connection.engine.url.database == target_database
                and CREATED_INDEX in statement
            ):
                raise RuntimeError("forced PostgreSQL shipping receipt failure")

        sa.event.listen(sa.engine.Engine, "before_cursor_execute", fail_last_index)
        try:
            with pytest.raises(RuntimeError, match="forced PostgreSQL shipping"):
                command.upgrade(config, MIGRATION_REVISION)
        finally:
            sa.event.remove(sa.engine.Engine, "before_cursor_execute", fail_last_index)

        engine = sa.create_engine(database_url, poolclass=sa.pool.NullPool)
        try:
            assert TABLE_NAME not in sa.inspect(engine).get_table_names()
            with engine.connect() as connection:
                assert connection.execute(
                    sa.text("SELECT version_num FROM alembic_version")
                ).scalar_one() == PREVIOUS_REVISION

            command.upgrade(config, MIGRATION_REVISION)
            _assert_receipt_schema(engine)
        finally:
            engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
def test_postgresql_0033_late_downgrade_failure_rolls_back_and_retry_succeeds() -> None:
    from tests.migrations.test_inventory_location_ledger import _postgres_database

    with _postgres_database("test_ic08_downgrade_failure") as database_url:
        config = _config(database_url)
        command.upgrade(config, MIGRATION_REVISION)
        target_database = sa.engine.make_url(database_url).database

        def fail_drop_table(
            connection: sa.Connection,
            _cursor: object,
            statement: str,
            _parameters: object,
            _context: object,
            _executemany: bool,
        ) -> None:
            if (
                connection.engine.url.database == target_database
                and statement.strip().startswith(f"DROP TABLE {TABLE_NAME}")
            ):
                raise RuntimeError(
                    "forced PostgreSQL shipping receipt downgrade failure"
                )

        sa.event.listen(sa.engine.Engine, "before_cursor_execute", fail_drop_table)
        try:
            with pytest.raises(
                RuntimeError,
                match="forced PostgreSQL shipping receipt downgrade",
            ):
                command.downgrade(config, PREVIOUS_REVISION)
        finally:
            sa.event.remove(
                sa.engine.Engine,
                "before_cursor_execute",
                fail_drop_table,
            )

        engine = sa.create_engine(database_url, poolclass=sa.pool.NullPool)
        try:
            _assert_receipt_schema(engine)
            with engine.connect() as connection:
                assert connection.execute(
                    sa.text("SELECT version_num FROM alembic_version")
                ).scalar_one() == MIGRATION_REVISION

            command.downgrade(config, PREVIOUS_REVISION)
            assert TABLE_NAME not in sa.inspect(engine).get_table_names()
            with engine.connect() as connection:
                assert connection.execute(
                    sa.text("SELECT version_num FROM alembic_version")
                ).scalar_one() == PREVIOUS_REVISION

            command.upgrade(config, MIGRATION_REVISION)
            _assert_receipt_schema(engine)
        finally:
            engine.dispose()
