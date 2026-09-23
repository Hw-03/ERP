"""Add supplier snapshots to defect-return requests and transaction logs."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260922_0037"
down_revision: Union[str, None] = "20260921_0036"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}


def _quote_identifier(identifier: str) -> str:
    """동적 SQLite 식별자를 안전하게 인용한다."""
    return '"' + identifier.replace('"', '""') + '"'


def _snapshot_sqlite_dependents(
    bind: sa.Connection,
    root_table: str,
) -> list[tuple[str, list[str], list[str], list[tuple[object, ...]]]]:
    """SQLite 테이블 재생성 전에 직접·간접 하위 행을 보관한다."""
    if bind.dialect.name != "sqlite":
        return []

    inspector = sa.inspect(bind)
    remaining = set(inspector.get_table_names())
    remaining.discard(root_table)
    parents = {root_table}
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
                    f"SQLite {root_table} dependent table has no primary key: {table_name}"
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

    snapshots_by_name = {snapshot[0]: snapshot for snapshot in snapshots}
    pending = set(snapshots_by_name)
    ordered: list[tuple[str, list[str], list[str], list[tuple[object, ...]]]] = []
    while pending:
        ready = sorted(
            table_name
            for table_name in pending
            if not any(
                foreign_key["referred_table"] in pending
                and foreign_key["referred_table"] != table_name
                for foreign_key in inspector.get_foreign_keys(table_name)
            )
        )
        if not ready:
            raise RuntimeError(
                f"SQLite {root_table} dependent tables contain a foreign key cycle: "
                + ", ".join(sorted(pending))
            )
        ordered.extend(snapshots_by_name[table_name] for table_name in ready)
        pending.difference_update(ready)
    return ordered


def _restore_sqlite_dependents(
    bind: sa.Connection,
    snapshots: list[tuple[str, list[str], list[str], list[tuple[object, ...]]]],
) -> None:
    """SQLite cascade로 삭제된 하위 행을 원래 키와 값으로 복원한다."""
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


def _clear_sqlite_dependents(
    bind: sa.Connection,
    snapshots: list[tuple[str, list[str], list[str], list[tuple[object, ...]]]],
) -> None:
    """RESTRICT FK가 원본 테이블 교체를 막지 않도록 자식부터 임시 제거한다."""
    for table_name, _columns, _primary_keys, rows in reversed(snapshots):
        if rows:
            _clear_sqlite_table_self_references(bind, table_name)
            bind.exec_driver_sql(f"DELETE FROM {_quote_identifier(table_name)}")


def _snapshot_sqlite_self_references(
    bind: sa.Connection,
    table_name: str,
) -> list[tuple[str, str, list[tuple[object, object]]]]:
    """SQLite 재생성 전에 단일 열 자기참조를 보관한다."""
    if bind.dialect.name != "sqlite":
        return []

    inspector = sa.inspect(bind)
    primary_keys = list(
        inspector.get_pk_constraint(table_name).get("constrained_columns") or []
    )
    snapshots: list[tuple[str, str, list[tuple[object, object]]]] = []
    for foreign_key in inspector.get_foreign_keys(table_name):
        if foreign_key.get("referred_table") != table_name:
            continue
        constrained_columns = list(foreign_key.get("constrained_columns") or [])
        referred_columns = list(foreign_key.get("referred_columns") or [])
        if (
            len(primary_keys) != 1
            or len(constrained_columns) != 1
            or referred_columns != primary_keys
        ):
            raise RuntimeError(
                f"SQLite {table_name} self foreign key is not a single primary-key reference"
            )
        primary_key, foreign_key_column = primary_keys[0], constrained_columns[0]
        rows = [
            tuple(row)
            for row in bind.exec_driver_sql(
                f"SELECT {_quote_identifier(primary_key)}, {_quote_identifier(foreign_key_column)} "
                f"FROM {_quote_identifier(table_name)} "
                f"WHERE {_quote_identifier(foreign_key_column)} IS NOT NULL"
            ).fetchall()
        ]
        snapshots.append((primary_key, foreign_key_column, rows))
    return snapshots


def _clear_sqlite_self_references(
    bind: sa.Connection,
    table_name: str,
    snapshots: list[tuple[str, str, list[tuple[object, object]]]],
) -> None:
    """원본 테이블 삭제를 막는 SQLite 자기참조를 잠시 비운다."""
    for _primary_key, foreign_key_column, rows in snapshots:
        if rows:
            bind.exec_driver_sql(
                f"UPDATE {_quote_identifier(table_name)} "
                f"SET {_quote_identifier(foreign_key_column)} = NULL "
                f"WHERE {_quote_identifier(foreign_key_column)} IS NOT NULL"
            )


def _clear_sqlite_table_self_references(
    bind: sa.Connection,
    table_name: str,
) -> None:
    """스냅샷으로 복원할 하위 테이블의 단일 열 자기참조를 임시 해제한다."""
    inspector = sa.inspect(bind)
    primary_keys = list(
        inspector.get_pk_constraint(table_name).get("constrained_columns") or []
    )
    for foreign_key in inspector.get_foreign_keys(table_name):
        if foreign_key.get("referred_table") != table_name:
            continue
        constrained_columns = list(foreign_key.get("constrained_columns") or [])
        referred_columns = list(foreign_key.get("referred_columns") or [])
        if (
            len(primary_keys) != 1
            or len(constrained_columns) != 1
            or referred_columns != primary_keys
        ):
            raise RuntimeError(
                f"SQLite {table_name} self foreign key is not a single primary-key reference"
            )
        foreign_key_column = constrained_columns[0]
        bind.exec_driver_sql(
            f"UPDATE {_quote_identifier(table_name)} "
            f"SET {_quote_identifier(foreign_key_column)} = NULL "
            f"WHERE {_quote_identifier(foreign_key_column)} IS NOT NULL"
        )


def _restore_sqlite_self_references(
    bind: sa.Connection,
    table_name: str,
    snapshots: list[tuple[str, str, list[tuple[object, object]]]],
) -> None:
    """재생성된 SQLite 테이블에 원래 자기참조를 되돌린다."""
    for primary_key, foreign_key_column, rows in snapshots:
        if rows:
            bind.exec_driver_sql(
                f"UPDATE {_quote_identifier(table_name)} "
                f"SET {_quote_identifier(foreign_key_column)} = ? "
                f"WHERE {_quote_identifier(primary_key)} = ?",
                [(foreign_key_value, primary_key_value) for primary_key_value, foreign_key_value in rows],
            )


def _compatible_nullable_string(column: dict[str, object], length: int) -> bool:
    column_type = column["type"]
    return (
        bool(column.get("nullable"))
        and isinstance(column_type, sa.String)
        and column_type.length == length
    )


def _add_supplier_snapshot_columns(table_name: str) -> None:
    inspector = sa.inspect(op.get_bind()) if not context.is_offline_mode() else None
    columns = (
        {column["name"]: column for column in inspector.get_columns(table_name)}
        if inspector is not None
        else {}
    )
    expected = {"supplier_id": 32, "supplier_name_snapshot": 100}
    for name, length in expected.items():
        existing = columns.get(name)
        if existing is not None and not _compatible_nullable_string(existing, length):
            raise RuntimeError(
                f"{table_name}.{name} is incompatible; manual schema repair is required before upgrade"
            )

    supplier_id_missing = "supplier_id" not in columns
    snapshot_missing = "supplier_name_snapshot" not in columns
    foreign_key_missing = supplier_id_missing
    if not supplier_id_missing and inspector is not None:
        foreign_keys = [
            foreign_key
            for foreign_key in inspector.get_foreign_keys(table_name)
            if foreign_key.get("constrained_columns") == ["supplier_id"]
        ]
        if len(foreign_keys) > 1:
            raise RuntimeError(
                f"{table_name}.supplier_id foreign key is duplicated; manual schema repair is required before upgrade"
            )
        foreign_key_missing = not foreign_keys
        if foreign_keys:
            foreign_key = foreign_keys[0]
            options = foreign_key.get("options") or {}
            if (
                foreign_key.get("referred_table") != "suppliers"
                or foreign_key.get("referred_columns") != ["supplier_id"]
                or str(options.get("ondelete") or "").upper() != "RESTRICT"
            ):
                raise RuntimeError(
                    f"{table_name}.supplier_id foreign key is incompatible; manual schema repair is required before upgrade"
                )

    if supplier_id_missing or snapshot_missing or foreign_key_missing:
        bind = None if context.is_offline_mode() else op.get_bind()
        snapshots = (
            _snapshot_sqlite_dependents(bind, table_name) if bind is not None else []
        )
        self_references = (
            _snapshot_sqlite_self_references(bind, table_name)
            if bind is not None
            else []
        )
        if bind is not None:
            _clear_sqlite_dependents(bind, snapshots)
            _clear_sqlite_self_references(bind, table_name, self_references)
        with op.batch_alter_table(table_name) as batch_op:
            if supplier_id_missing:
                batch_op.add_column(
                    sa.Column(
                        "supplier_id",
                        sa.String(length=32),
                        sa.ForeignKey(
                            "suppliers.supplier_id",
                            name=f"fk_{table_name}_supplier_id",
                            ondelete="RESTRICT",
                        ),
                        nullable=True,
                    )
                )
            elif foreign_key_missing:
                batch_op.create_foreign_key(
                    f"fk_{table_name}_supplier_id",
                    "suppliers",
                    ["supplier_id"],
                    ["supplier_id"],
                    ondelete="RESTRICT",
                )
            if snapshot_missing:
                batch_op.add_column(
                    sa.Column(
                        "supplier_name_snapshot", sa.String(length=100), nullable=True
                    )
                )
        if bind is not None:
            _restore_sqlite_self_references(bind, table_name, self_references)
            _restore_sqlite_dependents(bind, snapshots)

    if inspector is not None and not supplier_id_missing and foreign_key_missing:
        refreshed_foreign_keys = [
            foreign_key
            for foreign_key in sa.inspect(op.get_bind()).get_foreign_keys(table_name)
            if foreign_key.get("constrained_columns") == ["supplier_id"]
        ]
        if len(refreshed_foreign_keys) != 1:
            raise RuntimeError(
                f"{table_name}.supplier_id foreign key could not be created"
            )

    index_name = f"ix_{table_name}_supplier_id"
    indexes = (
        sa.inspect(op.get_bind()).get_indexes(table_name)
        if inspector is not None
        else []
    )
    matching = [index for index in indexes if index.get("name") == index_name]
    if not matching:
        op.create_index(index_name, table_name, ["supplier_id"], unique=False)
    elif len(matching) != 1 or matching[0].get("column_names") != ["supplier_id"]:
        raise RuntimeError(
            f"{index_name} is incompatible; manual schema repair is required before upgrade"
        )


def upgrade() -> None:
    _add_supplier_snapshot_columns("stock_requests")
    _add_supplier_snapshot_columns("transaction_logs")


def downgrade() -> None:
    raise RuntimeError("불량 반품 공급업체 스냅샷 downgrade는 지원하지 않습니다.")
