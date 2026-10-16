"""PostgreSQL reflection must preserve schema meaning across SQL deparsing."""
from __future__ import annotations

import os

import pytest
import sqlalchemy as sa

from app.models import Base, Item
from bootstrap.schema import schema_differences


pytestmark = pytest.mark.skipif(
    not os.environ.get("TEST_POSTGRES_URL"),
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)


@pytest.fixture
def current_postgresql_schema(
    postgres_migration_schema_connection: tuple[sa.Connection, str],
) -> sa.Connection:
    connection, _schema = postgres_migration_schema_connection
    Base.metadata.create_all(connection)
    return connection


def _has_difference(differences: tuple[str, ...], prefix: str) -> bool:
    return any(difference.startswith(prefix) for difference in differences)


def test_fresh_postgresql_metadata_has_no_schema_drift(
    current_postgresql_schema: sa.Connection,
) -> None:
    assert schema_differences(current_postgresql_schema) == ()


def test_fresh_postgresql_metadata_is_inspected_in_read_only_snapshot(
    current_postgresql_schema: sa.Connection,
) -> None:
    current_postgresql_schema.commit()
    current_postgresql_schema.exec_driver_sql(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"
    )
    assert current_postgresql_schema.scalar(sa.text("SHOW transaction_read_only")) == "on"
    assert schema_differences(current_postgresql_schema) == ()
    assert current_postgresql_schema.scalar(sa.text("SHOW transaction_read_only")) == "on"
    assert current_postgresql_schema.scalar(sa.text("SELECT txid_current_if_assigned()")) is None


def test_postgresql_boolean_default_flip_is_drift(
    current_postgresql_schema: sa.Connection,
) -> None:
    current_postgresql_schema.exec_driver_sql(
        "ALTER TABLE items ALTER COLUMN sales_review_required SET DEFAULT true"
    )
    assert _has_difference(
        schema_differences(current_postgresql_schema),
        "server default mismatch: items.sales_review_required",
    )


def test_postgresql_string_default_case_is_drift(
    current_postgresql_schema: sa.Connection,
) -> None:
    prefix = "server default mismatch: shipping_allocations.status"
    before = {
        difference
        for difference in schema_differences(current_postgresql_schema)
        if difference.startswith(prefix)
    }
    current_postgresql_schema.exec_driver_sql(
        "ALTER TABLE shipping_allocations ALTER COLUMN status SET DEFAULT 'reserved'"
    )
    after = {
        difference
        for difference in schema_differences(current_postgresql_schema)
        if difference.startswith(prefix)
    }
    assert after and after != before


def test_postgresql_enum_default_value_is_drift(
    current_postgresql_schema: sa.Connection,
) -> None:
    current_postgresql_schema.exec_driver_sql(
        "ALTER TABLE shipping_requests ALTER COLUMN status SET DEFAULT 'PREPARED'"
    )
    assert _has_difference(
        schema_differences(current_postgresql_schema),
        "server default mismatch: shipping_requests.status",
    )


@pytest.mark.parametrize(
    "replacement",
    ["scope IN ('warehouse', 'tubes')", "scope NOT IN ('warehouse', 'tube')"],
)
def test_postgresql_check_values_and_operator_are_drift(
    current_postgresql_schema: sa.Connection,
    replacement: str,
) -> None:
    current_postgresql_schema.exec_driver_sql(
        "ALTER TABLE suppliers DROP CONSTRAINT ck_suppliers_scope"
    )
    current_postgresql_schema.exec_driver_sql(
        "ALTER TABLE suppliers ADD CONSTRAINT ck_suppliers_scope "
        f"CHECK ({replacement})"
    )
    assert _has_difference(
        schema_differences(current_postgresql_schema),
        "check constraint mismatch: suppliers",
    )


def test_postgresql_dump_restored_check_array_casts_are_equivalent(
    current_postgresql_schema: sa.Connection,
) -> None:
    current_postgresql_schema.exec_driver_sql(
        "ALTER TABLE suppliers DROP CONSTRAINT ck_suppliers_scope"
    )
    current_postgresql_schema.exec_driver_sql(
        "ALTER TABLE suppliers ADD CONSTRAINT ck_suppliers_scope CHECK ("
        "scope::text = ANY (ARRAY["
        "'warehouse'::character varying::text, "
        "'tube'::character varying::text]))"
    )
    assert schema_differences(current_postgresql_schema) == ()


@pytest.mark.parametrize(
    "old,new",
    [
        ("|| '-' ||", "|| ':' ||"),
        ("|| '-' ||", "|| ' - ' ||"),
        ("serial_no < 10", "serial_no < 11"),
    ],
)
def test_postgresql_computed_expression_change_is_drift(
    current_postgresql_schema: sa.Connection,
    old: str,
    new: str,
) -> None:
    expression = str(
        Item.__table__.c.mes_code.computed.sqltext.compile(
            dialect=current_postgresql_schema.dialect
        )
    )
    assert old in expression
    current_postgresql_schema.exec_driver_sql("ALTER TABLE items DROP COLUMN mes_code CASCADE")
    current_postgresql_schema.exec_driver_sql(
        "ALTER TABLE items ADD COLUMN mes_code VARCHAR(40) "
        f"GENERATED ALWAYS AS ({expression.replace(old, new, 1)}) STORED"
    )
    assert _has_difference(
        schema_differences(current_postgresql_schema),
        "computed column mismatch: items.mes_code",
    )


def test_postgresql_sequence_target_change_is_drift(
    current_postgresql_schema: sa.Connection,
) -> None:
    current_postgresql_schema.exec_driver_sql("CREATE SEQUENCE wrong_departments_id_seq")
    current_postgresql_schema.exec_driver_sql(
        "ALTER TABLE departments ALTER COLUMN id "
        "SET DEFAULT nextval('wrong_departments_id_seq'::regclass)"
    )
    assert _has_difference(
        schema_differences(current_postgresql_schema),
        "server default mismatch: departments.id",
    )


def test_postgresql_sequence_ownership_change_is_drift(
    current_postgresql_schema: sa.Connection,
) -> None:
    current_postgresql_schema.exec_driver_sql(
        "ALTER SEQUENCE departments_id_seq OWNED BY NONE"
    )
    assert _has_difference(
        schema_differences(current_postgresql_schema),
        "server default mismatch: departments.id",
    )
