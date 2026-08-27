"""CP4 correction·semantic idempotency 스키마 계약."""

from __future__ import annotations

import io
import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
import sqlalchemy as sa
import pytest


BACKEND_DIR = Path(__file__).resolve().parents[2]
PREVIOUS_REVISION = "20260827_0030"
MIGRATION_REVISION = "20260828_0031"
CORRECTION_UNIQUE_INDEX = "uq_transaction_edit_log_quantity_correction"


def _config(database_path: Path) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{database_path.as_posix()}")
    return config


def _postgres_config(database_url: str) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def test_cp4_revision_is_the_single_head() -> None:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))

    script = ScriptDirectory.from_config(config)

    assert script.get_heads() == [MIGRATION_REVISION]


def test_0030_to_0031_adds_and_rollback_removes_correction_unique_index(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "cp4-upgrade.db"
    config = _config(database_path)
    command.upgrade(config, PREVIOUS_REVISION)
    engine = sa.create_engine(f"sqlite:///{database_path.as_posix()}")

    command.upgrade(config, MIGRATION_REVISION)

    inspector = sa.inspect(engine)
    indexes = {
        index["name"]: index
        for index in inspector.get_indexes("transaction_edit_logs")
    }
    assert indexes[CORRECTION_UNIQUE_INDEX]["column_names"] == ["original_log_id"]
    assert bool(indexes[CORRECTION_UNIQUE_INDEX]["unique"]) is True
    with engine.connect() as connection:
        index_sql = connection.execute(
            sa.text(
                "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = :name"
            ),
            {"name": CORRECTION_UNIQUE_INDEX},
        ).scalar_one()
        assert "WHERE correction_log_id IS NOT NULL" in index_sql
        assert connection.execute(
            sa.text("SELECT version_num FROM alembic_version")
        ).scalar_one() == MIGRATION_REVISION

    command.downgrade(config, PREVIOUS_REVISION)

    inspector = sa.inspect(engine)
    assert CORRECTION_UNIQUE_INDEX not in {
        index["name"]
        for index in inspector.get_indexes("transaction_edit_logs")
    }
    with engine.connect() as connection:
        assert connection.execute(
            sa.text("SELECT version_num FROM alembic_version")
        ).scalar_one() == PREVIOUS_REVISION
    engine.dispose()


def test_fresh_upgrade_contains_cp4_correction_unique_index(tmp_path: Path) -> None:
    database_path = tmp_path / "cp4-fresh.db"
    config = _config(database_path)

    command.upgrade(config, "head")

    engine = sa.create_engine(f"sqlite:///{database_path.as_posix()}")
    indexes = {
        index["name"]: index
        for index in sa.inspect(engine).get_indexes("transaction_edit_logs")
    }
    assert CORRECTION_UNIQUE_INDEX in indexes
    engine.dispose()


def test_correction_index_allows_meta_edits_and_rejects_second_correction(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "cp4-unique.db"
    config = _config(database_path)
    command.upgrade(config, "head")
    engine = sa.create_engine(f"sqlite:///{database_path.as_posix()}")
    insert = sa.text(
        "INSERT INTO transaction_edit_logs "
        "(edit_id, original_log_id, edited_by_employee_id, edited_by_name, reason, "
        "before_payload, after_payload, correction_log_id) VALUES "
        "(:edit_id, :original_log_id, :employee_id, 'tester', 'reason', '{}', '{}', "
        ":correction_log_id)"
    )
    common = {
        "original_log_id": "1" * 32,
        "employee_id": "2" * 32,
    }
    with engine.begin() as connection:
        connection.execute(
            insert,
            {**common, "edit_id": "3" * 32, "correction_log_id": None},
        )
        connection.execute(
            insert,
            {**common, "edit_id": "4" * 32, "correction_log_id": None},
        )
        connection.execute(
            insert,
            {
                **common,
                "edit_id": "5" * 32,
                "correction_log_id": "6" * 32,
            },
        )
        with pytest.raises(sa.exc.IntegrityError):
            connection.execute(
                insert,
                {
                    **common,
                    "edit_id": "7" * 32,
                    "correction_log_id": "8" * 32,
                },
            )
    engine.dispose()


def test_duplicate_correction_preflight_keeps_0030_and_retry_succeeds(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "cp4-duplicate-preflight.db"
    config = _config(database_path)
    command.upgrade(config, PREVIOUS_REVISION)
    engine = sa.create_engine(f"sqlite:///{database_path.as_posix()}")
    insert = sa.text(
        "INSERT INTO transaction_edit_logs "
        "(edit_id, original_log_id, edited_by_employee_id, edited_by_name, reason, "
        "before_payload, after_payload, correction_log_id) VALUES "
        "(:edit_id, :original_log_id, :employee_id, 'tester', 'reason', '{}', '{}', "
        ":correction_log_id)"
    )
    common = {
        "original_log_id": "1" * 32,
        "employee_id": "2" * 32,
    }
    with engine.begin() as connection:
        connection.execute(
            insert,
            {**common, "edit_id": "3" * 32, "correction_log_id": "4" * 32},
        )
        connection.execute(
            insert,
            {**common, "edit_id": "5" * 32, "correction_log_id": "6" * 32},
        )

    with pytest.raises(RuntimeError, match="duplicate quantity corrections"):
        command.upgrade(config, MIGRATION_REVISION)

    with engine.connect() as connection:
        assert connection.execute(
            sa.text("SELECT version_num FROM alembic_version")
        ).scalar_one() == PREVIOUS_REVISION
    assert CORRECTION_UNIQUE_INDEX not in {
        index["name"]
        for index in sa.inspect(engine).get_indexes("transaction_edit_logs")
    }
    with engine.connect() as connection:
        rows = connection.execute(
            sa.text(
                "SELECT edit_id, correction_log_id FROM transaction_edit_logs "
                "ORDER BY edit_id"
            )
        ).all()
        assert rows == [("3" * 32, "4" * 32), ("5" * 32, "6" * 32)]

    with engine.begin() as connection:
        connection.execute(
            sa.text(
                "DELETE FROM transaction_edit_logs WHERE edit_id = :edit_id"
            ),
            {"edit_id": "5" * 32},
        )
    command.upgrade(config, MIGRATION_REVISION)
    assert CORRECTION_UNIQUE_INDEX in {
        index["name"]
        for index in sa.inspect(engine).get_indexes("transaction_edit_logs")
    }
    engine.dispose()


def test_upgrade_accepts_exact_preexisting_correction_index(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "cp4-preexisting-exact.db"
    config = _config(database_path)
    command.upgrade(config, PREVIOUS_REVISION)
    engine = sa.create_engine(f"sqlite:///{database_path.as_posix()}")
    with engine.begin() as connection:
        connection.execute(
            sa.text(
                f"CREATE UNIQUE INDEX {CORRECTION_UNIQUE_INDEX} "
                "ON transaction_edit_logs (original_log_id) "
                "WHERE correction_log_id IS NOT NULL"
            )
        )

    command.upgrade(config, MIGRATION_REVISION)

    with engine.connect() as connection:
        assert connection.execute(
            sa.text("SELECT version_num FROM alembic_version")
        ).scalar_one() == MIGRATION_REVISION
    assert CORRECTION_UNIQUE_INDEX in {
        index["name"]
        for index in sa.inspect(engine).get_indexes("transaction_edit_logs")
    }
    engine.dispose()


@pytest.mark.parametrize(
    "index_sql",
    [
        "CREATE INDEX {name} ON transaction_edit_logs (original_log_id) "
        "WHERE correction_log_id IS NOT NULL",
        "CREATE UNIQUE INDEX {name} ON transaction_edit_logs (correction_log_id) "
        "WHERE correction_log_id IS NOT NULL",
        "CREATE UNIQUE INDEX {name} ON transaction_edit_logs (original_log_id) "
        "WHERE correction_log_id IS NULL",
    ],
    ids=["non-unique", "wrong-column", "wrong-predicate"],
)
def test_upgrade_rejects_incompatible_preexisting_correction_index(
    tmp_path: Path,
    index_sql: str,
) -> None:
    database_path = tmp_path / "cp4-preexisting-incompatible.db"
    config = _config(database_path)
    command.upgrade(config, PREVIOUS_REVISION)
    engine = sa.create_engine(f"sqlite:///{database_path.as_posix()}")
    with engine.begin() as connection:
        connection.execute(
            sa.text(index_sql.format(name=CORRECTION_UNIQUE_INDEX))
        )

    with pytest.raises(RuntimeError, match="incompatible contract"):
        command.upgrade(config, MIGRATION_REVISION)

    with engine.connect() as connection:
        assert connection.execute(
            sa.text("SELECT version_num FROM alembic_version")
        ).scalar_one() == PREVIOUS_REVISION
    engine.dispose()


def test_postgresql_offline_upgrade_emits_partial_unique_index() -> None:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option(
        "sqlalchemy.url",
        "postgresql+psycopg2://migration-test:unused@invalid/migration-test",
    )
    output = io.StringIO()
    config.output_buffer = output

    command.upgrade(config, f"{PREVIOUS_REVISION}:{MIGRATION_REVISION}", sql=True)

    sql = output.getvalue()
    assert (
        "CREATE UNIQUE INDEX uq_transaction_edit_log_quantity_correction "
        "ON transaction_edit_logs (original_log_id) "
        "WHERE correction_log_id IS NOT NULL"
    ) in sql


@pytest.mark.skipif(
    not os.getenv("TEST_POSTGRES_URL"),
    reason="TEST_POSTGRES_URL이 설정된 전용 PostgreSQL에서만 실행",
)
def test_postgresql_fresh_upgrade_0030_to_0031_and_rollback() -> None:
    """빈 전용 DB에서 CP4 전후 revision과 partial unique index를 왕복한다."""
    database_url = os.environ["TEST_POSTGRES_URL"]
    engine = sa.create_engine(database_url, poolclass=sa.pool.NullPool)
    try:
        with engine.connect() as connection:
            outer = connection.begin()
            try:
                config = _postgres_config(database_url)
                config.attributes["connection"] = connection

                command.upgrade(config, PREVIOUS_REVISION)
                assert connection.execute(
                    sa.text("SELECT version_num FROM alembic_version")
                ).scalar_one() == PREVIOUS_REVISION

                command.upgrade(config, MIGRATION_REVISION)
                assert connection.execute(
                    sa.text("SELECT version_num FROM alembic_version")
                ).scalar_one() == MIGRATION_REVISION
                assert connection.execute(
                    sa.text(
                        "SELECT indexdef FROM pg_indexes "
                        "WHERE schemaname = current_schema() "
                        "AND tablename = 'transaction_edit_logs' "
                        "AND indexname = :name"
                    ),
                    {"name": CORRECTION_UNIQUE_INDEX},
                ).scalar_one().endswith(
                    "WHERE (correction_log_id IS NOT NULL)"
                )

                command.downgrade(config, PREVIOUS_REVISION)
                assert connection.execute(
                    sa.text("SELECT version_num FROM alembic_version")
                ).scalar_one() == PREVIOUS_REVISION
                assert connection.execute(
                    sa.text(
                        "SELECT count(*) FROM pg_indexes "
                        "WHERE schemaname = current_schema() "
                        "AND indexname = :name"
                    ),
                    {"name": CORRECTION_UNIQUE_INDEX},
                ).scalar_one() == 0

                connection.execute(
                    sa.text(
                        f"CREATE UNIQUE INDEX {CORRECTION_UNIQUE_INDEX} "
                        "ON transaction_edit_logs (original_log_id) "
                        "WHERE correction_log_id IS NOT NULL"
                    )
                )
                command.upgrade(config, "head")
                assert connection.execute(
                    sa.text("SELECT version_num FROM alembic_version")
                ).scalar_one() == MIGRATION_REVISION
            finally:
                outer.rollback()
    finally:
        engine.dispose()


@pytest.mark.skipif(
    not os.getenv("TEST_POSTGRES_URL"),
    reason="TEST_POSTGRES_URL이 설정된 전용 PostgreSQL에서만 실행",
)
def test_postgresql_head_0031_downgrade_and_reupgrade() -> None:
    """CI의 head DB에서 CP4 rollback/re-upgrade를 실제 PostgreSQL로 강제한다."""
    database_url = os.environ["TEST_POSTGRES_URL"]
    engine = sa.create_engine(database_url, poolclass=sa.pool.NullPool)
    try:
        with engine.connect() as connection:
            outer = connection.begin()
            try:
                config = _postgres_config(database_url)
                config.attributes["connection"] = connection
                assert connection.execute(
                    sa.text("SELECT version_num FROM alembic_version")
                ).scalar_one() == MIGRATION_REVISION

                command.downgrade(config, PREVIOUS_REVISION)
                assert connection.execute(
                    sa.text("SELECT version_num FROM alembic_version")
                ).scalar_one() == PREVIOUS_REVISION
                assert connection.execute(
                    sa.text(
                        "SELECT count(*) FROM pg_indexes "
                        "WHERE schemaname = current_schema() AND indexname = :name"
                    ),
                    {"name": CORRECTION_UNIQUE_INDEX},
                ).scalar_one() == 0

                connection.execute(
                    sa.text(
                        f"CREATE UNIQUE INDEX {CORRECTION_UNIQUE_INDEX} "
                        "ON transaction_edit_logs (original_log_id) "
                        "WHERE correction_log_id IS NOT NULL"
                    )
                )
                command.upgrade(config, MIGRATION_REVISION)
                assert connection.execute(
                    sa.text("SELECT version_num FROM alembic_version")
                ).scalar_one() == MIGRATION_REVISION
                assert connection.execute(
                    sa.text(
                        "SELECT count(*) FROM pg_indexes "
                        "WHERE schemaname = current_schema() AND indexname = :name"
                    ),
                    {"name": CORRECTION_UNIQUE_INDEX},
                ).scalar_one() == 1
            finally:
                outer.rollback()

        with engine.connect() as verify:
            assert verify.execute(
                sa.text("SELECT version_num FROM alembic_version")
            ).scalar_one() == MIGRATION_REVISION
            assert verify.execute(
                sa.text(
                    "SELECT count(*) FROM pg_indexes "
                    "WHERE schemaname = current_schema() AND indexname = :name"
                ),
                {"name": CORRECTION_UNIQUE_INDEX},
            ).scalar_one() == 1
    finally:
        engine.dispose()
