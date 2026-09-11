"""S0의 두 migration 계보를 단일 DDL-free head로 결합하는 계약."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

from alembic import command
from alembic.config import Config
import pytest
import sqlalchemy as sa

from bootstrap.legacy_profiles import sqlite_business_data_fingerprint
from bootstrap.schema import schema_differences


BACKEND_DIR = Path(__file__).resolve().parents[2]
MAIN_HEAD = "20260903_0032"
QUALITY_HEAD = "20260831_0033"
QUALITY_MERGE_HEAD = "20260907_0034"
DEFECT_HEAD = "20260910_0033"
MERGE_HEAD = "20260911_0035"
MERGE_PARENTS = (QUALITY_MERGE_HEAD, DEFECT_HEAD)
ORIGINS = ("base", MAIN_HEAD, QUALITY_HEAD)
EMPLOYEE_ID = "e" * 32
QUALITY_ITEM_ID = "a" * 32
QUALITY_RECORD_ID = "b" * 32
QUALITY_BOX_ID = "c" * 32
QUALITY_BOX_ROW_ID = "d" * 32
QUALITY_ZONE_ROW_ID = "f" * 32
CUTOVER = "2026-08-26T22:26:50.262415+00:00"
TEST_POSTGRES_URL = os.getenv("TEST_POSTGRES_URL")


def _config(database_url: str) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    return config


def _insert_employee(connection: sa.Connection) -> None:
    connection.execute(
        sa.text(
            "INSERT INTO employees "
            "(employee_id, employee_code, name, role, department, level, display_order, is_active) "
            "VALUES (:employee_id, 'S0-MERGE', 'S0 merge employee', 'worker', "
            "'assembly', 'STAFF', 0, TRUE)"
        ),
        {"employee_id": EMPLOYEE_ID},
    )


def _employee_fingerprint(connection: sa.Connection) -> str:
    rows = connection.execute(
        sa.text(
            "SELECT employee_id, employee_code, name, role, department, level, display_order "
            "FROM employees ORDER BY employee_id"
        )
    ).all()
    payload = json.dumps([list(row) for row in rows], ensure_ascii=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _revisions(connection: sa.Connection) -> list[str]:
    return list(
        connection.execute(
            sa.text("SELECT version_num FROM alembic_version ORDER BY version_num")
        ).scalars()
    )


def _seed_quality_head_business_state(connection: sa.Connection) -> None:
    from tests.migrations.test_inventory_location_ledger import (
        _insert_angle,
        _insert_box,
        _insert_box_item,
        _insert_item,
        _insert_zone,
        _insert_zone_item,
        _seed_process_type,
    )

    _seed_process_type(connection)
    _insert_item(
        connection,
        item_id=QUALITY_ITEM_ID,
        warehouse_qty=10,
        serial_no=42,
    )
    _insert_angle(connection)
    _insert_box(connection, box_id=QUALITY_BOX_ID)
    _insert_box_item(
        connection,
        row_id=QUALITY_BOX_ROW_ID,
        box_id=QUALITY_BOX_ID,
        item_id=QUALITY_ITEM_ID,
        quantity=3,
    )
    _insert_zone(connection)
    _insert_zone_item(
        connection,
        row_id=QUALITY_ZONE_ROW_ID,
        zone_id=1,
        item_id=QUALITY_ITEM_ID,
        quantity=2,
    )
    connection.execute(
        sa.text(
            "INSERT INTO warehouse_unplaced_items (id, item_id, quantity) "
            "VALUES (:id, :item_id, 5)"
        ),
        {"id": "0" * 32, "item_id": QUALITY_ITEM_ID},
    )
    connection.execute(
        sa.text(
            "INSERT INTO system_settings (setting_key, setting_value) "
            "VALUES ('inventory_operation_cutover_at', :cutover)"
        ),
        {"cutover": CUTOVER},
    )
    connection.execute(
        sa.text(
            "INSERT INTO defect_quarantine_records "
            "(record_id, item_id, department, original_quantity, remaining_quantity, "
            "quarantined_at, quarantined_by_name, is_legacy) "
            "VALUES (:record_id, :item_id, '진공', 5, 2, "
            "'2026-08-24 05:44:46', 'S0 migration test', TRUE)"
        ),
        {"record_id": QUALITY_RECORD_ID, "item_id": QUALITY_ITEM_ID},
    )


def _quality_business_state(connection: sa.Connection) -> tuple:
    statements = (
        "SELECT item_id, quantity, warehouse_qty FROM inventory WHERE item_id = :item_id",
        "SELECT id, box_id, item_id, quantity FROM warehouse_box_items WHERE item_id = :item_id",
        "SELECT id, zone_id, item_id, quantity FROM warehouse_special_zone_items WHERE item_id = :item_id",
        "SELECT id, item_id, quantity FROM warehouse_unplaced_items WHERE item_id = :item_id",
        "SELECT record_id, item_id, original_quantity, remaining_quantity "
        "FROM defect_quarantine_records WHERE record_id = :record_id",
    )
    params = {"item_id": QUALITY_ITEM_ID, "record_id": QUALITY_RECORD_ID}
    return tuple(tuple(connection.execute(sa.text(statement), params).one()) for statement in statements)


def _assert_single_defect_baseline(connection: sa.Connection) -> None:
    assert connection.execute(
        sa.text(
            "SELECT quantity_delta, movement_type, role "
            "FROM defect_inventory_movements WHERE record_id = :record_id"
        ),
        {"record_id": QUALITY_RECORD_ID},
    ).one() == (2, "CUTOVER_BASELINE", "OPENING_BALANCE")
    assert connection.scalar(
        sa.text(
            "SELECT count(*) FROM inventory_operations "
            "WHERE action = 'defect_cutover_baseline'"
        )
    ) == 1


@pytest.mark.parametrize("origin", ORIGINS)
def test_sqlite_each_origin_upgrades_to_matching_merge_schema_without_business_data_loss(
    tmp_path: Path,
    origin: str,
) -> None:
    database_path = tmp_path / f"s0-{origin}.db"
    database_url = f"sqlite:///{database_path.as_posix()}"
    config = _config(database_url)
    command.upgrade(config, origin)

    engine = sa.create_engine(database_url)
    expected_employee_fingerprint: str | None = None
    try:
        if origin != "base":
            with engine.begin() as connection:
                _insert_employee(connection)
                expected_employee_fingerprint = _employee_fingerprint(connection)

        command.upgrade(config, MERGE_HEAD)
        with engine.connect() as connection:
            assert _revisions(connection) == [MERGE_HEAD]
            if expected_employee_fingerprint is None:
                assert connection.scalar(sa.text("SELECT count(*) FROM employees")) == 0
            else:
                assert _employee_fingerprint(connection) == expected_employee_fingerprint
        with engine.connect() as connection:
            assert schema_differences(connection) == ()

        command.upgrade(config, MERGE_HEAD)
        with engine.connect() as connection:
            if expected_employee_fingerprint is not None:
                assert _employee_fingerprint(connection) == expected_employee_fingerprint
    finally:
        engine.dispose()


def test_sqlite_explicit_parent_restamp_and_retry_are_schema_and_data_free(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "s0-merge-retry.db"
    database_url = f"sqlite:///{database_path.as_posix()}"
    config = _config(database_url)
    command.upgrade(config, MERGE_HEAD)
    engine = sa.create_engine(database_url)
    try:
        with engine.begin() as connection:
            _insert_employee(connection)
        with engine.connect() as connection:
            before = sqlite_business_data_fingerprint(connection)

        command.stamp(config, list(MERGE_PARENTS), purge=True)
        with engine.connect() as connection:
            assert _revisions(connection) == sorted(MERGE_PARENTS)
            assert sqlite_business_data_fingerprint(connection) == before

        command.upgrade(config, MERGE_HEAD)
        with engine.connect() as connection:
            assert _revisions(connection) == [MERGE_HEAD]
            assert sqlite_business_data_fingerprint(connection) == before
    finally:
        engine.dispose()


def test_sqlite_quality_head_to_merge_preserves_defect_and_bzu_state(
    tmp_path: Path,
) -> None:
    database_url = f"sqlite:///{(tmp_path / 's0-quality-state.db').as_posix()}"
    engine = sa.create_engine(database_url)
    config = _config(database_url)
    try:
        command.upgrade(config, QUALITY_HEAD)
        with engine.begin() as connection:
            _seed_quality_head_business_state(connection)
            before = _quality_business_state(connection)

        command.upgrade(config, MERGE_HEAD)
        command.upgrade(config, MERGE_HEAD)
        with engine.connect() as connection:
            assert _quality_business_state(connection) == before
            _assert_single_defect_baseline(connection)
    finally:
        engine.dispose()


@pytest.mark.parametrize("origin", ORIGINS)
@pytest.mark.skipif(TEST_POSTGRES_URL is None, reason="TEST_POSTGRES_URL is required")
def test_postgresql_each_origin_upgrades_to_matching_merge_schema_without_business_data_loss(
    origin: str,
) -> None:
    from tests.migrations.test_inventory_location_ledger import _postgres_database

    with _postgres_database(f"test_s0_merge_{origin}") as database_url:
        config = _config(database_url)
        command.upgrade(config, origin)
        engine = sa.create_engine(database_url, poolclass=sa.pool.NullPool)
        expected_employee_fingerprint: str | None = None
        try:
            if origin != "base":
                with engine.begin() as connection:
                    _insert_employee(connection)
                    expected_employee_fingerprint = _employee_fingerprint(connection)

            command.upgrade(config, MERGE_HEAD)
            with engine.connect() as connection:
                assert _revisions(connection) == [MERGE_HEAD]
                if expected_employee_fingerprint is None:
                    assert connection.scalar(sa.text("SELECT count(*) FROM employees")) == 0
                else:
                    assert _employee_fingerprint(connection) == expected_employee_fingerprint
            with engine.connect() as connection:
                assert schema_differences(connection) == ()
        finally:
            engine.dispose()


@pytest.mark.skipif(TEST_POSTGRES_URL is None, reason="TEST_POSTGRES_URL is required")
def test_postgresql_explicit_parent_restamp_and_retry_preserve_data() -> None:
    from tests.migrations.test_inventory_location_ledger import _postgres_database

    with _postgres_database("test_s0_merge_retry") as database_url:
        config = _config(database_url)
        command.upgrade(config, MERGE_HEAD)
        engine = sa.create_engine(database_url, poolclass=sa.pool.NullPool)
        try:
            with engine.begin() as connection:
                _insert_employee(connection)
            with engine.connect() as connection:
                before = _employee_fingerprint(connection)

            command.stamp(config, list(MERGE_PARENTS), purge=True)
            with engine.connect() as connection:
                assert _revisions(connection) == sorted(MERGE_PARENTS)
                assert _employee_fingerprint(connection) == before

            command.upgrade(config, MERGE_HEAD)
            with engine.connect() as connection:
                assert _revisions(connection) == [MERGE_HEAD]
                assert _employee_fingerprint(connection) == before
        finally:
            engine.dispose()


@pytest.mark.skipif(TEST_POSTGRES_URL is None, reason="TEST_POSTGRES_URL is required")
def test_postgresql_quality_head_to_merge_preserves_defect_and_bzu_state() -> None:
    from tests.migrations.test_inventory_location_ledger import _postgres_database

    with _postgres_database("test_s0_merge_quality_state") as database_url:
        config = _config(database_url)
        command.upgrade(config, QUALITY_HEAD)
        engine = sa.create_engine(database_url, poolclass=sa.pool.NullPool)
        try:
            with engine.begin() as connection:
                _seed_quality_head_business_state(connection)
                before = _quality_business_state(connection)

            command.upgrade(config, MERGE_HEAD)
            command.upgrade(config, MERGE_HEAD)
            with engine.connect() as connection:
                assert _quality_business_state(connection) == before
                _assert_single_defect_baseline(connection)
        finally:
            engine.dispose()
