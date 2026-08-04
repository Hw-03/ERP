"""Add the singleton data revision used by realtime clients."""

from __future__ import annotations

from datetime import datetime
import re
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa
from sqlalchemy.engine import Connection


revision: str = "20260804_0013"
down_revision: Union[str, None] = "20260804_0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}


def _fail_contract(detail: str) -> None:
    raise RuntimeError(f"existing data_revision violates canonical contract: {detail}")


def _validate_existing_schema(bind: Connection) -> None:
    """Accept only the canonical table produced by ORM metadata or this migration."""

    inspector = sa.inspect(bind)
    columns = {
        str(column["name"]): column
        for column in inspector.get_columns("data_revision")
    }
    if set(columns) != {"id", "revision", "updated_at"}:
        _fail_contract(f"columns={sorted(columns)}")
    if not isinstance(columns["id"]["type"], sa.Integer) or isinstance(
        columns["id"]["type"], sa.BigInteger
    ):
        _fail_contract("id must be INTEGER")
    if not isinstance(columns["revision"]["type"], sa.BigInteger):
        _fail_contract("revision must be BIGINT")
    if not isinstance(columns["updated_at"]["type"], sa.DateTime):
        _fail_contract("updated_at must be DateTime")
    if any(columns[name].get("nullable", True) for name in columns):
        _fail_contract("all columns must be NOT NULL")

    primary_key = inspector.get_pk_constraint("data_revision")
    if list(primary_key.get("constrained_columns") or ()) != ["id"]:
        _fail_contract("id must be the sole primary key")

    checks = inspector.get_check_constraints("data_revision")
    normalized_checks = {
        re.sub(r'[\s()"]', "", str(check.get("sqltext") or "").lower())
        for check in checks
    }
    if not normalized_checks.intersection({"id=1", "1=id"}):
        _fail_contract("singleton CHECK id = 1 is required")

    updated_default = re.sub(
        r"\s+",
        "",
        str(columns["updated_at"].get("default") or "").lower(),
    )
    canonical_default = {
        "sqlite": "current_timestamp",
        "postgresql": "now()",
    }.get(bind.dialect.name)
    if canonical_default is None or updated_default != canonical_default:
        _fail_contract("updated_at requires a current timestamp default")


def _valid_updated_at(value: object) -> bool:
    if isinstance(value, datetime):
        return True
    if not isinstance(value, str) or not value.strip():
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return True


def _seed_or_validate_singleton(bind: Connection) -> None:
    """Seed only an empty canonical table; otherwise require one valid row."""

    singleton_query = sa.text(
        "SELECT id, revision, updated_at FROM data_revision ORDER BY id"
    )
    rows = bind.execute(singleton_query).all()
    if not rows:
        bind.execute(
            sa.text(
                "INSERT INTO data_revision (id, revision) VALUES (1, 0)"
            )
        )
        rows = bind.execute(singleton_query).all()
    row = rows[0]
    if (
        len(rows) != 1
        or row.id != 1
        or isinstance(row.revision, bool)
        or not isinstance(row.revision, int)
        or row.revision < 0
        or not _valid_updated_at(row.updated_at)
    ):
        raise RuntimeError(
            "existing data_revision singleton row must be "
            "(id=1, revision>=0, valid updated_at)"
        )


def upgrade() -> None:
    if not context.is_offline_mode():
        bind = op.get_bind()
        if "data_revision" in sa.inspect(bind).get_table_names():
            _validate_existing_schema(bind)
            _seed_or_validate_singleton(bind)
            return

    table = op.create_table(
        "data_revision",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("revision", sa.BigInteger(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("id = 1", name="ck_data_revision_singleton"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.bulk_insert(table, [{"id": 1, "revision": 0}])


def downgrade() -> None:
    raise RuntimeError("data revision downgrade is disabled")
