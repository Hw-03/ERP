"""Add supplier master and raw-material receipt supplier snapshots."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260921_0036"
down_revision: Union[str, None] = "20260917_0035"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}


def _quote_identifier(identifier: str) -> str:
    """동적 SQLite 식별자를 안전하게 인용한다."""
    return '"' + identifier.replace('"', '""') + '"'


def _snapshot_sqlite_dependents(
    bind: sa.Connection,
) -> list[tuple[str, list[str], list[str], list[tuple[object, ...]]]]:
    """io_batches 재생성 전에 직접·간접 하위 행을 보관한다."""
    if bind.dialect.name != "sqlite":
        return []

    inspector = sa.inspect(bind)
    remaining = set(inspector.get_table_names())
    remaining.discard("io_batches")
    parents = {"io_batches"}
    snapshots: list[tuple[str, list[str], list[str], list[tuple[object, ...]]]] = []
    while True:
        children = sorted(
            table_name
            for table_name in remaining
            if any(
                foreign_key["referred_table"] in parents
                for foreign_key in inspector.get_foreign_keys(table_name)
            )
        )
        if not children:
            break
        for table_name in children:
            columns = [column["name"] for column in inspector.get_columns(table_name)]
            primary_keys = list(
                inspector.get_pk_constraint(table_name).get("constrained_columns") or []
            )
            if not primary_keys:
                raise RuntimeError(
                    f"SQLite io_batches dependent table has no primary key: {table_name}"
                )
            selected = ", ".join(_quote_identifier(column) for column in columns)
            rows = [
                tuple(row)
                for row in bind.exec_driver_sql(
                    f"SELECT {selected} FROM {_quote_identifier(table_name)}"
                ).fetchall()
            ]
            snapshots.append((table_name, columns, primary_keys, rows))
        remaining.difference_update(children)
        parents.update(children)
    return snapshots


def _restore_sqlite_dependents(
    bind: sa.Connection,
    snapshots: list[tuple[str, list[str], list[str], list[tuple[object, ...]]]],
) -> None:
    """SQLite batch 재생성 cascade 뒤 보관한 하위 행을 복원한다."""
    for table_name, columns, primary_keys, rows in snapshots:
        if not rows:
            continue
        column_sql = ", ".join(_quote_identifier(column) for column in columns)
        placeholders = ", ".join("?" for _ in columns)
        primary_key_sql = ", ".join(_quote_identifier(column) for column in primary_keys)
        update_columns = [column for column in columns if column not in primary_keys]
        if update_columns:
            updates = ", ".join(
                f"{_quote_identifier(column)} = excluded.{_quote_identifier(column)}"
                for column in update_columns
            )
            conflict = f"DO UPDATE SET {updates}"
        else:
            conflict = "DO NOTHING"
        bind.exec_driver_sql(
            f"INSERT INTO {_quote_identifier(table_name)} ({column_sql}) "
            f"VALUES ({placeholders}) ON CONFLICT ({primary_key_sql}) {conflict}",
            rows,
        )


def _alter_io_batches(
    additions: list[sa.Column[object]],
    *,
    add_supplier_foreign_key: bool,
) -> None:
    """SQLite에서 io_batches 변경 중 손실되는 종속 데이터를 보존한다."""
    bind = None if context.is_offline_mode() else op.get_bind()
    snapshots = _snapshot_sqlite_dependents(bind) if bind is not None else []
    with op.batch_alter_table("io_batches") as batch_op:
        for column in additions:
            batch_op.add_column(column)
        if add_supplier_foreign_key:
            batch_op.create_foreign_key(
                "fk_io_batches_supplier_id",
                "suppliers",
                ["supplier_id"],
                ["supplier_id"],
                ondelete="RESTRICT",
            )
    if bind is not None:
        _restore_sqlite_dependents(bind, snapshots)


def _compatible_column(
    column: dict[str, object],
    *,
    nullable: bool,
    length: int | None = None,
    type_class: type[sa.types.TypeEngine] | None = None,
) -> bool:
    """기존 열이 이번 스키마 계약과 양립 가능한지 확인한다."""
    column_type = column["type"]
    if bool(column.get("nullable")) != nullable:
        return False
    if length is not None:
        return isinstance(column_type, sa.String) and column_type.length == length
    return type_class is not None and isinstance(column_type, type_class)


def _assert_supplier_table_compatible(inspector: sa.Inspector) -> None:
    """이미 존재하는 suppliers 테이블을 조용히 덮어쓰지 않고 검증한다."""
    columns = {column["name"]: column for column in inspector.get_columns("suppliers")}
    expected = {
        "supplier_id": (False, 32),
        "name": (False, 100),
        "normalized_name": (False, 100),
        "is_active": (False, None, sa.Boolean),
        "created_at": (False, None, sa.DateTime),
        "updated_at": (False, None, sa.DateTime),
    }
    for name, values in expected.items():
        nullable, length, *type_class = values
        column = columns.get(name)
        if column is None or not _compatible_column(
            column,
            nullable=nullable,
            length=length,
            type_class=type_class[0] if type_class else None,
        ):
            raise RuntimeError(f"suppliers.{name} is incompatible; manual schema repair is required before upgrade")
    if inspector.get_pk_constraint("suppliers").get("constrained_columns") != ["supplier_id"]:
        raise RuntimeError("suppliers.supplier_id primary key is missing; manual schema repair is required before upgrade")
    unique_names = {
        tuple(constraint["column_names"])
        for constraint in inspector.get_unique_constraints("suppliers")
        if constraint.get("column_names")
    }
    indexes = {
        tuple(index["column_names"])
        for index in inspector.get_indexes("suppliers")
        if index.get("unique") and index.get("column_names")
    }
    if ("normalized_name",) not in unique_names | indexes:
        raise RuntimeError("suppliers.normalized_name unique constraint is missing; manual schema repair is required before upgrade")


def _supplier_active_index_missing_or_fail(inspector: sa.Inspector) -> bool:
    """활성 공급업체 조회 인덱스를 검사하고, 없을 때만 보완 대상으로 표시한다."""
    matching = [
        index
        for index in inspector.get_indexes("suppliers")
        if index.get("name") == "ix_suppliers_is_active"
    ]
    if not matching:
        return True
    if len(matching) != 1:
        raise RuntimeError("ix_suppliers_is_active is duplicated; manual schema repair is required before upgrade")
    index = matching[0]
    if index.get("column_names") != ["is_active"] or bool(index.get("unique")):
        raise RuntimeError("ix_suppliers_is_active is incompatible; manual schema repair is required before upgrade")
    return False


def _supplier_foreign_key_missing_or_fail(inspector: sa.Inspector) -> bool:
    """io_batches.supplier_id FK를 검사하고, 없을 때만 보완 대상으로 표시한다."""
    foreign_keys = [
        foreign_key
        for foreign_key in inspector.get_foreign_keys("io_batches")
        if foreign_key.get("constrained_columns") == ["supplier_id"]
    ]
    if not foreign_keys:
        return True
    if len(foreign_keys) != 1:
        raise RuntimeError("io_batches.supplier_id has multiple foreign keys; manual schema repair is required before upgrade")
    foreign_key = foreign_keys[0]
    options = foreign_key.get("options") or {}
    if (
        foreign_key.get("referred_table") != "suppliers"
        or foreign_key.get("referred_columns") != ["supplier_id"]
        or str(options.get("ondelete") or "").upper() != "RESTRICT"
    ):
        raise RuntimeError("io_batches.supplier_id foreign key is incompatible; manual schema repair is required before upgrade")
    return False


def _supplier_index_missing_or_fail(inspector: sa.Inspector) -> bool:
    """정해진 supplier 조회 인덱스를 검사하고, 없을 때만 생성 대상으로 표시한다."""
    matching = [
        index
        for index in inspector.get_indexes("io_batches")
        if index.get("name") == "ix_io_batches_supplier_id"
    ]
    if not matching:
        return True
    if len(matching) != 1:
        raise RuntimeError("ix_io_batches_supplier_id is duplicated; manual schema repair is required before upgrade")
    index = matching[0]
    if index.get("column_names") != ["supplier_id"] or bool(index.get("unique")):
        raise RuntimeError("ix_io_batches_supplier_id is incompatible; manual schema repair is required before upgrade")
    return False


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind()) if not context.is_offline_mode() else None
    if inspector is None or "suppliers" not in inspector.get_table_names():
        op.create_table(
            "suppliers",
            sa.Column("supplier_id", sa.String(length=32), nullable=False),
            sa.Column("name", sa.String(length=100), nullable=False),
            sa.Column("normalized_name", sa.String(length=100), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.PrimaryKeyConstraint("supplier_id"),
            sa.UniqueConstraint("normalized_name", name="uq_suppliers_normalized_name"),
        )
        op.create_index("ix_suppliers_is_active", "suppliers", ["is_active"], unique=False)
        supplier_active_index_missing = False
    else:
        _assert_supplier_table_compatible(inspector)
        supplier_active_index_missing = _supplier_active_index_missing_or_fail(inspector)

    if supplier_active_index_missing:
        op.create_index("ix_suppliers_is_active", "suppliers", ["is_active"], unique=False)

    if inspector is not None:
        columns = {column["name"]: column for column in inspector.get_columns("io_batches")}
        for name, length in {"supplier_id": 32, "supplier_name_snapshot": 100}.items():
            existing = columns.get(name)
            if existing is not None and not _compatible_column(existing, nullable=True, length=length):
                raise RuntimeError(f"io_batches.{name} is incompatible; manual schema repair is required before upgrade")
        supplier_fk_missing = (
            _supplier_foreign_key_missing_or_fail(inspector)
            if "supplier_id" in columns
            else True
        )
        supplier_index_missing = _supplier_index_missing_or_fail(inspector)
    else:
        columns = {}
        supplier_fk_missing = True
        supplier_index_missing = True

    additions = []
    if "supplier_id" not in columns:
        additions.append(sa.Column("supplier_id", sa.String(length=32), sa.ForeignKey("suppliers.supplier_id", name="fk_io_batches_supplier_id", ondelete="RESTRICT"), nullable=True))
    if "supplier_name_snapshot" not in columns:
        additions.append(sa.Column("supplier_name_snapshot", sa.String(length=100), nullable=True))
    if additions:
        _alter_io_batches(
            additions,
            add_supplier_foreign_key="supplier_id" in columns and supplier_fk_missing,
        )
    elif supplier_fk_missing:
        _alter_io_batches([], add_supplier_foreign_key=True)
    if supplier_index_missing:
        op.create_index("ix_io_batches_supplier_id", "io_batches", ["supplier_id"], unique=False)


def downgrade() -> None:
    raise RuntimeError("공급업체 스키마의 downgrade는 지원하지 않습니다.")
