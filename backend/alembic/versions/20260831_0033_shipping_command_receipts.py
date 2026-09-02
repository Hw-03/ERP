"""Add durable shipping command receipts."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260831_0033"
down_revision: Union[str, None] = "20260831_0032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE_NAME = "shipping_command_receipts"
UNIQUE_NAME = "uq_shipping_command_receipt_actor_route_key"
ACTOR_INDEX = "ix_shipping_command_receipts_actor_employee_id"
OPERATION_INDEX = "ix_shipping_command_receipts_operation_id"
CREATED_INDEX = "ix_shipping_command_receipts_created_at"

EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "data-preserving"}

EXPECTED_COLUMNS = {
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
NULLABLE_COLUMNS = {"expected_status", "operation_id"}
STRING_LENGTHS = {
    "receipt_id": 32,
    "actor_employee_id": 32,
    "route": 200,
    "command_kind": 40,
    "client_request_id": 32,
    "semantic_fingerprint": 64,
    "expected_status": 20,
    "result_status": 20,
    "operation_id": 32,
}
EXPECTED_INDEXES = {
    ACTOR_INDEX: ["actor_employee_id"],
    OPERATION_INDEX: ["operation_id"],
    CREATED_INDEX: ["created_at"],
}


def _create_schema() -> None:
    op.create_table(
        TABLE_NAME,
        sa.Column("receipt_id", sa.String(length=32), nullable=False),
        sa.Column("actor_employee_id", sa.String(length=32), nullable=False),
        sa.Column("route", sa.String(length=200), nullable=False),
        sa.Column("command_kind", sa.String(length=40), nullable=False),
        sa.Column("client_request_id", sa.String(length=32), nullable=False),
        sa.Column("semantic_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("expected_status", sa.String(length=20), nullable=True),
        sa.Column("result_status", sa.String(length=20), nullable=False),
        sa.Column("operation_id", sa.String(length=32), nullable=True),
        sa.Column("response_snapshot", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["actor_employee_id"],
            ["employees.employee_id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["operation_id"],
            ["inventory_operations.operation_id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("receipt_id"),
        sa.UniqueConstraint(
            "actor_employee_id",
            "route",
            "client_request_id",
            name=UNIQUE_NAME,
        ),
    )
    op.create_index(ACTOR_INDEX, TABLE_NAME, ["actor_employee_id"])
    op.create_index(OPERATION_INDEX, TABLE_NAME, ["operation_id"])
    op.create_index(CREATED_INDEX, TABLE_NAME, ["created_at"])


def _assert_compatible_existing_schema() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {
        column["name"]: column for column in inspector.get_columns(TABLE_NAME)
    }
    if set(columns) != EXPECTED_COLUMNS:
        raise RuntimeError(
            "incompatible pre-existing shipping_command_receipts columns"
        )
    for name, column in columns.items():
        expected_nullable = name in NULLABLE_COLUMNS
        if bool(column["nullable"]) != expected_nullable:
            raise RuntimeError(
                "incompatible pre-existing shipping_command_receipts nullability"
            )
    for name, expected_length in STRING_LENGTHS.items():
        column_type = columns[name]["type"]
        if not isinstance(column_type, sa.String) or column_type.length != expected_length:
            raise RuntimeError(
                "incompatible pre-existing shipping_command_receipts column type"
            )
    if not isinstance(columns["response_snapshot"]["type"], sa.JSON):
        raise RuntimeError(
            "incompatible pre-existing shipping_command_receipts response type"
        )
    if not isinstance(columns["created_at"]["type"], sa.DateTime):
        raise RuntimeError(
            "incompatible pre-existing shipping_command_receipts timestamp type"
        )

    primary_key = inspector.get_pk_constraint(TABLE_NAME)
    if primary_key.get("constrained_columns") != ["receipt_id"]:
        raise RuntimeError(
            "incompatible pre-existing shipping_command_receipts primary key"
        )
    unique_constraints = {
        constraint["name"]: constraint["column_names"]
        for constraint in inspector.get_unique_constraints(TABLE_NAME)
    }
    if unique_constraints.get(UNIQUE_NAME) != [
        "actor_employee_id",
        "route",
        "client_request_id",
    ]:
        raise RuntimeError(
            "incompatible pre-existing shipping_command_receipts unique key"
        )
    indexes = {
        index["name"]: index["column_names"]
        for index in inspector.get_indexes(TABLE_NAME)
    }
    if any(indexes.get(name) != columns for name, columns in EXPECTED_INDEXES.items()):
        raise RuntimeError(
            "incompatible pre-existing shipping_command_receipts indexes"
        )
    foreign_keys = {
        tuple(foreign_key["constrained_columns"]): (
            foreign_key["referred_table"],
            foreign_key["referred_columns"],
            str(foreign_key.get("options", {}).get("ondelete", "")).upper(),
        )
        for foreign_key in inspector.get_foreign_keys(TABLE_NAME)
    }
    if foreign_keys.get(("actor_employee_id",)) != (
        "employees",
        ["employee_id"],
        "RESTRICT",
    ) or foreign_keys.get(("operation_id",)) != (
        "inventory_operations",
        ["operation_id"],
        "RESTRICT",
    ):
        raise RuntimeError(
            "incompatible pre-existing shipping_command_receipts foreign keys"
        )


def _create_or_validate_schema() -> None:
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table(TABLE_NAME):
        _assert_compatible_existing_schema()
        return
    _create_schema()


def _drop_schema() -> None:
    op.drop_index(CREATED_INDEX, table_name=TABLE_NAME)
    op.drop_index(OPERATION_INDEX, table_name=TABLE_NAME)
    op.drop_index(ACTOR_INDEX, table_name=TABLE_NAME)
    op.drop_table(TABLE_NAME)


def _sqlite_atomic(action, savepoint: str) -> None:
    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        action()
        return
    bind.exec_driver_sql(f"SAVEPOINT {savepoint}")
    try:
        action()
    except Exception:
        bind.exec_driver_sql(f"ROLLBACK TO SAVEPOINT {savepoint}")
        bind.exec_driver_sql(f"RELEASE SAVEPOINT {savepoint}")
        raise
    bind.exec_driver_sql(f"RELEASE SAVEPOINT {savepoint}")


def upgrade() -> None:
    _sqlite_atomic(_create_or_validate_schema, "shipping_command_receipts_0033")


def downgrade() -> None:
    _sqlite_atomic(_drop_schema, "shipping_command_receipts_0033_downgrade")
