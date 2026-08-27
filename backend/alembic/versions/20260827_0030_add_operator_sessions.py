"""Add DB-backed operator sessions and explicit initial-PIN state."""

from __future__ import annotations

import hashlib
import re
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260827_0030"
down_revision: Union[str, None] = "20260826_0029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_LEGACY_DEFAULT_PIN_HASH = hashlib.sha256(b"0000").hexdigest()

EMPLOYEE_AUTO_DEPLOY_POLICY = {
    "kind": "data-change",
    "allowed_tables": [
        "admin_audit_logs",
        "employees",
        "operator_sessions",
        "shipping_request_events",
    ],
    "validator_sql": (
        "SELECT COUNT(*) FROM employees WHERE pin_requires_change IS NULL"
    ),
    "validator_expected": 0,
}

_SESSION_COLUMNS = {
    "session_id",
    "token_hash",
    "employee_id",
    "purpose",
    "issued_at",
    "expires_at",
    "revoked_at",
    "consumed_at",
    "boot_id",
}

_SESSION_INDEXES: tuple[tuple[str, list[str], bool], ...] = (
    ("uq_operator_sessions_token_hash", ["token_hash"], True),
    (
        "ix_operator_sessions_employee_purpose_revoked",
        ["employee_id", "purpose", "revoked_at"],
        False,
    ),
    ("ix_operator_sessions_expires_at", ["expires_at"], False),
)

_SESSION_COLUMN_SHAPES: dict[str, tuple[type[sa.TypeEngine], int | None, bool]] = {
    "session_id": (sa.String, 32, False),
    "token_hash": (sa.String, 64, False),
    "employee_id": (sa.String, 32, False),
    "purpose": (sa.String, 20, False),
    "issued_at": (sa.DateTime, None, False),
    "expires_at": (sa.DateTime, None, False),
    "revoked_at": (sa.DateTime, None, True),
    "consumed_at": (sa.DateTime, None, True),
    "boot_id": (sa.String, 64, False),
}

_SHIPPING_EVENT_ACTOR_COLUMN_SHAPES: dict[
    str,
    tuple[type[sa.TypeEngine], int | None, bool],
] = {
    "actor_employee_id": (sa.String, 32, True),
    "actor_employee_code": (sa.String, 30, True),
    "actor_name": (sa.String, 100, True),
}

_SHIPPING_EVENT_ACTOR_INDEX = "ix_shipping_request_events_actor_employee_id"
_SHIPPING_EVENT_ACTOR_FK = "fk_shipping_request_events_actor_employee"
_ADMIN_AUDIT_ACTOR_CODE_LENGTH = 30
_ADMIN_AUDIT_BOOTSTRAP_COLUMN = "bootstrap_employee_id"
_ADMIN_AUDIT_BOOTSTRAP_INDEX = "ix_admin_audit_logs_bootstrap_employee_id"
_PIN_STATE_COLUMN = "pin_requires_change"


def _column_shape_issues(
    columns: dict[str, dict[str, object]],
    expected: dict[str, tuple[type[sa.TypeEngine], int | None, bool]],
) -> list[str]:
    issues: list[str] = []
    for name, (type_class, length, nullable) in expected.items():
        column = columns.get(name)
        if column is None:
            issues.append(f"missing column {name}")
            continue
        reflected_type = column["type"]
        if not isinstance(reflected_type, type_class):
            issues.append(f"{name} type={reflected_type}")
        elif length is not None and getattr(reflected_type, "length", None) != length:
            issues.append(f"{name} length={getattr(reflected_type, 'length', None)}")
        if bool(column["nullable"]) is not nullable:
            issues.append(f"{name} nullable={column['nullable']}")
        if column.get("default") is not None:
            issues.append(f"{name} default={column['default']}")
    return issues


def _boolean_default_is_true(value: object) -> bool:
    compact = re.sub(r"\s+", "", str(value or "").lower())
    compact = compact.replace("::boolean", "")
    while compact.startswith("(") and compact.endswith(")"):
        compact = compact[1:-1]
    return compact.strip("'\"") in {"1", "true"}


def _assert_pin_state_shape(inspector: sa.Inspector) -> None:
    columns = {
        column["name"]: column for column in inspector.get_columns("employees")
    }
    column = columns.get(_PIN_STATE_COLUMN)
    issues: list[str] = []
    if column is None:
        issues.append(f"missing column {_PIN_STATE_COLUMN}")
    else:
        if not isinstance(column.get("type"), sa.Boolean):
            issues.append(f"type={column.get('type')!s}")
        if bool(column.get("nullable")):
            issues.append("nullable=true")
        if not _boolean_default_is_true(column.get("default")):
            issues.append(f"default={column.get('default')!s}")
    if issues:
        raise RuntimeError(
            "employees pin state schema is partially present: " + "; ".join(issues)
        )


def _ensure_pin_state_shape(inspector: sa.Inspector | None) -> bool:
    """부분 배포 컬럼을 fail-closed Boolean/NOT NULL/default true로 복구한다."""
    columns = (
        {}
        if inspector is None
        else {
            column["name"]: column
            for column in inspector.get_columns("employees")
        }
    )
    column = columns.get(_PIN_STATE_COLUMN)
    if column is None:
        op.add_column(
            "employees",
            sa.Column(
                _PIN_STATE_COLUMN,
                sa.Boolean(),
                server_default=sa.true(),
                nullable=False,
            ),
        )
        return True
    if inspector is None:
        return True

    column_type = column.get("type")
    if not isinstance(column_type, sa.Boolean):
        raise RuntimeError(
            "employees pin state schema is partially present: "
            f"{_PIN_STATE_COLUMN} type={column_type!s}"
        )
    nullable = bool(column.get("nullable"))
    default_is_true = _boolean_default_is_true(column.get("default"))
    if nullable:
        op.execute(
            sa.text(
                f"UPDATE employees SET {_PIN_STATE_COLUMN} = :requires_change"
                f" WHERE {_PIN_STATE_COLUMN} IS NULL"
            ).bindparams(requires_change=True)
        )
    if nullable or not default_is_true:
        if op.get_bind().dialect.name == "sqlite":
            with op.batch_alter_table("employees") as batch_op:
                batch_op.alter_column(
                    _PIN_STATE_COLUMN,
                    existing_type=sa.Boolean(),
                    nullable=False,
                    server_default=sa.true(),
                )
        else:
            op.alter_column(
                "employees",
                _PIN_STATE_COLUMN,
                existing_type=sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            )
    _assert_pin_state_shape(sa.inspect(op.get_bind()))
    return False


def _ensure_admin_audit_actor_code_shape(inspector: sa.Inspector | None) -> None:
    """기존 16자 감사 snapshot을 Employee 계약과 같은 30자로 안전하게 넓힌다."""
    if inspector is None:
        op.alter_column(
            "admin_audit_logs",
            "actor_employee_code",
            existing_type=sa.String(length=16),
            type_=sa.String(length=_ADMIN_AUDIT_ACTOR_CODE_LENGTH),
            existing_nullable=True,
        )
        return

    columns = {
        column["name"]: column
        for column in inspector.get_columns("admin_audit_logs")
    }
    column = columns.get("actor_employee_code")
    if column is None:
        raise RuntimeError(
            "admin_audit_logs schema is partially present: missing actor_employee_code"
        )
    column_type = column.get("type")
    nullable = bool(column.get("nullable"))
    length = getattr(column_type, "length", None)
    if not isinstance(column_type, sa.String) or not nullable or length not in {16, 30}:
        raise RuntimeError(
            "admin_audit_logs schema is partially present: "
            f"actor_employee_code type={column_type!s} nullable={nullable}"
        )
    if length == _ADMIN_AUDIT_ACTOR_CODE_LENGTH:
        return

    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("admin_audit_logs") as batch_op:
            batch_op.alter_column(
                "actor_employee_code",
                existing_type=sa.String(length=16),
                type_=sa.String(length=_ADMIN_AUDIT_ACTOR_CODE_LENGTH),
                existing_nullable=True,
            )
    else:
        op.alter_column(
            "admin_audit_logs",
            "actor_employee_code",
            existing_type=sa.String(length=16),
            type_=sa.String(length=_ADMIN_AUDIT_ACTOR_CODE_LENGTH),
            existing_nullable=True,
        )


def _assert_admin_audit_actor_code_shape(inspector: sa.Inspector) -> None:
    columns = {
        column["name"]: column
        for column in inspector.get_columns("admin_audit_logs")
    }
    issues = _column_shape_issues(
        columns,
        {
            "actor_employee_code": (
                sa.String,
                _ADMIN_AUDIT_ACTOR_CODE_LENGTH,
                True,
            )
        },
    )
    if issues:
        raise RuntimeError(
            "admin_audit_logs schema is partially present: " + "; ".join(issues)
        )


def _bootstrap_index_is_exact(index: dict[str, object]) -> bool:
    return (
        list(index.get("column_names") or ()) == [_ADMIN_AUDIT_BOOTSTRAP_COLUMN]
        and not bool(index.get("unique"))
    )


def _assert_admin_audit_bootstrap_shape(inspector: sa.Inspector) -> None:
    columns = {
        column["name"]: column
        for column in inspector.get_columns("admin_audit_logs")
    }
    issues = _column_shape_issues(
        columns,
        {_ADMIN_AUDIT_BOOTSTRAP_COLUMN: (sa.String, 32, True)},
    )
    indexes = {
        index["name"]: index
        for index in inspector.get_indexes("admin_audit_logs")
    }
    index = indexes.get(_ADMIN_AUDIT_BOOTSTRAP_INDEX)
    if index is None:
        issues.append(f"missing index {_ADMIN_AUDIT_BOOTSTRAP_INDEX}")
    elif not _bootstrap_index_is_exact(index):
        issues.append(
            f"{_ADMIN_AUDIT_BOOTSTRAP_INDEX} "
            f"columns={index.get('column_names')} unique={index.get('unique')}"
        )
    if issues:
        raise RuntimeError(
            "admin_audit_logs bootstrap schema is partially present: "
            + "; ".join(issues)
        )


def _ensure_admin_audit_bootstrap_shape(inspector: sa.Inspector | None) -> None:
    """bootstrap challenge 감사 snapshot 컬럼·인덱스를 exact shape로 복구한다."""
    if inspector is None:
        op.add_column(
            "admin_audit_logs",
            sa.Column(
                _ADMIN_AUDIT_BOOTSTRAP_COLUMN,
                sa.String(length=32),
                nullable=True,
            ),
        )
        op.create_index(
            _ADMIN_AUDIT_BOOTSTRAP_INDEX,
            "admin_audit_logs",
            [_ADMIN_AUDIT_BOOTSTRAP_COLUMN],
        )
        return

    columns = {
        column["name"]: column
        for column in inspector.get_columns("admin_audit_logs")
    }
    column = columns.get(_ADMIN_AUDIT_BOOTSTRAP_COLUMN)
    if column is None:
        op.add_column(
            "admin_audit_logs",
            sa.Column(
                _ADMIN_AUDIT_BOOTSTRAP_COLUMN,
                sa.String(length=32),
                nullable=True,
            ),
        )
    else:
        column_type = column.get("type")
        if not isinstance(column_type, sa.String):
            raise RuntimeError(
                "admin_audit_logs bootstrap schema is partially present: "
                f"{_ADMIN_AUDIT_BOOTSTRAP_COLUMN} type={column_type!s}"
            )
        length = getattr(column_type, "length", None)
        nullable = bool(column.get("nullable"))
        default = column.get("default")
        if length != 32 or not nullable or default is not None:
            if length is None or length > 32:
                oversized = op.get_bind().execute(
                    sa.text(
                        "SELECT COUNT(*) FROM admin_audit_logs "
                        f"WHERE length({_ADMIN_AUDIT_BOOTSTRAP_COLUMN}) > 32"
                    )
                ).scalar_one()
                if oversized:
                    raise RuntimeError(
                        "admin_audit_logs bootstrap schema is partially present: "
                        f"{_ADMIN_AUDIT_BOOTSTRAP_COLUMN} contains values longer than 32"
                    )
            if op.get_bind().dialect.name == "sqlite":
                with op.batch_alter_table("admin_audit_logs") as batch_op:
                    batch_op.alter_column(
                        _ADMIN_AUDIT_BOOTSTRAP_COLUMN,
                        existing_type=column_type,
                        type_=sa.String(length=32),
                        nullable=True,
                        server_default=None,
                    )
            else:
                op.alter_column(
                    "admin_audit_logs",
                    _ADMIN_AUDIT_BOOTSTRAP_COLUMN,
                    existing_type=column_type,
                    type_=sa.String(length=32),
                    nullable=True,
                    server_default=None,
                )

    refreshed = sa.inspect(op.get_bind())
    indexes = {
        index["name"]: index
        for index in refreshed.get_indexes("admin_audit_logs")
    }
    existing_index = indexes.get(_ADMIN_AUDIT_BOOTSTRAP_INDEX)
    if existing_index is not None and not _bootstrap_index_is_exact(existing_index):
        op.drop_index(_ADMIN_AUDIT_BOOTSTRAP_INDEX, table_name="admin_audit_logs")
        existing_index = None
    if existing_index is None:
        op.create_index(
            _ADMIN_AUDIT_BOOTSTRAP_INDEX,
            "admin_audit_logs",
            [_ADMIN_AUDIT_BOOTSTRAP_COLUMN],
        )
    _assert_admin_audit_bootstrap_shape(sa.inspect(op.get_bind()))


def _purpose_check_is_exact(sqltext: object) -> bool:
    """SQLite IN 또는 PostgreSQL ANY의 canonical 두 값 식만 허용한다."""
    compact = re.sub(r"\s+", "", str(sqltext or "").lower())
    compact = (
        compact.replace('"purpose"', "purpose")
        .replace("`purpose`", "purpose")
        .replace("[purpose]", "purpose")
    )
    compact = re.sub(
        r"::(?:text|varchar|charactervarying)(?:\[\])?",
        "",
        compact,
    )
    literal_operator = r"\(*'operator'\)*"
    literal_pin_change = r"\(*'pin_change'\)*"
    in_pattern = re.compile(
        rf"^\(*purpose\)*in\({literal_operator},{literal_pin_change}\)\)*$"
    )
    any_pattern = re.compile(
        rf"^\(*purpose\)*=any\(\(*array\["
        rf"{literal_operator},{literal_pin_change}\]\)*\)\)*$"
    )
    return bool(in_pattern.fullmatch(compact) or any_pattern.fullmatch(compact))


def _assert_operator_session_schema(
    inspector: sa.Inspector,
    *,
    allow_missing_indexes: bool = False,
) -> None:
    columns = {
        column["name"]: column for column in inspector.get_columns("operator_sessions")
    }
    issues = _column_shape_issues(columns, _SESSION_COLUMN_SHAPES)
    if set(columns) != _SESSION_COLUMNS:
        issues.append(f"columns={sorted(columns)}")

    primary_key = inspector.get_pk_constraint("operator_sessions")
    if primary_key.get("constrained_columns") != ["session_id"]:
        issues.append(f"primary_key={primary_key.get('constrained_columns')}")

    foreign_keys = inspector.get_foreign_keys("operator_sessions")
    employee_fk = next(
        (
            foreign_key
            for foreign_key in foreign_keys
            if foreign_key.get("constrained_columns") == ["employee_id"]
            and foreign_key.get("referred_table") == "employees"
            and foreign_key.get("referred_columns") == ["employee_id"]
        ),
        None,
    )
    ondelete = (
        str((employee_fk.get("options") or {}).get("ondelete", "")).upper()
        if employee_fk is not None
        else ""
    )
    if employee_fk is None or ondelete != "CASCADE":
        issues.append("employee_id FK must reference employees.employee_id ON DELETE CASCADE")

    checks = inspector.get_check_constraints("operator_sessions")
    purpose_check = next(
        (
            check
            for check in checks
            if check.get("name") == "ck_operator_sessions_purpose"
        ),
        None,
    )
    if purpose_check is None or not _purpose_check_is_exact(purpose_check.get("sqltext")):
        issues.append("ck_operator_sessions_purpose is missing or invalid")

    indexes = {index["name"]: index for index in inspector.get_indexes("operator_sessions")}
    for name, expected_columns, expected_unique in _SESSION_INDEXES:
        index = indexes.get(name)
        if index is None:
            if not allow_missing_indexes:
                issues.append(f"missing index {name}")
            continue
        if index.get("column_names") != expected_columns:
            issues.append(f"{name} columns={index.get('column_names')}")
        if bool(index.get("unique")) is not expected_unique:
            issues.append(f"{name} unique={index.get('unique')}")

    if issues:
        raise RuntimeError(
            "operator_sessions schema is partially present: " + "; ".join(issues)
        )


def _create_operator_sessions_table() -> None:
    op.create_table(
        "operator_sessions",
        sa.Column("session_id", sa.String(length=32), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("employee_id", sa.String(length=32), nullable=False),
        sa.Column("purpose", sa.String(length=20), nullable=False),
        sa.Column("issued_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("consumed_at", sa.DateTime(), nullable=True),
        sa.Column("boot_id", sa.String(length=64), nullable=False),
        sa.CheckConstraint(
            "purpose IN ('operator', 'pin_change')",
            name="ck_operator_sessions_purpose",
        ),
        sa.ForeignKeyConstraint(
            ["employee_id"],
            ["employees.employee_id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("session_id"),
    )


def _create_session_indexes(existing: set[str] | None = None) -> None:
    existing = existing or set()
    for name, columns, unique in _SESSION_INDEXES:
        if name not in existing:
            op.create_index(name, "operator_sessions", columns, unique=unique)


def _assert_shipping_event_actor_schema(inspector: sa.Inspector) -> None:
    columns = {
        column["name"]: column
        for column in inspector.get_columns("shipping_request_events")
    }
    issues = _column_shape_issues(columns, _SHIPPING_EVENT_ACTOR_COLUMN_SHAPES)
    foreign_keys = inspector.get_foreign_keys("shipping_request_events")
    actor_fk = next(
        (
            foreign_key
            for foreign_key in foreign_keys
            if foreign_key.get("constrained_columns") == ["actor_employee_id"]
            and foreign_key.get("referred_table") == "employees"
            and foreign_key.get("referred_columns") == ["employee_id"]
        ),
        None,
    )
    ondelete = (
        str((actor_fk.get("options") or {}).get("ondelete", "")).upper()
        if actor_fk is not None
        else ""
    )
    if actor_fk is None or ondelete != "SET NULL":
        issues.append(
            "actor_employee_id FK must reference employees.employee_id ON DELETE SET NULL"
        )
    indexes = {
        index["name"]: index
        for index in inspector.get_indexes("shipping_request_events")
    }
    actor_index = indexes.get(_SHIPPING_EVENT_ACTOR_INDEX)
    if actor_index is None:
        issues.append(f"missing index {_SHIPPING_EVENT_ACTOR_INDEX}")
    elif actor_index.get("column_names") != ["actor_employee_id"] or bool(
        actor_index.get("unique")
    ):
        issues.append(
            f"{_SHIPPING_EVENT_ACTOR_INDEX} shape="
            f"{actor_index.get('column_names')}/{actor_index.get('unique')}"
        )
    if issues:
        raise RuntimeError(
            "shipping_request_events actor schema is partially present: "
            + "; ".join(issues)
        )


def _ensure_shipping_event_actor_schema(inspector: sa.Inspector | None) -> None:
    columns = (
        set()
        if inspector is None
        else {
            column["name"]
            for column in inspector.get_columns("shipping_request_events")
        }
    )
    for name, (type_class, length, nullable) in _SHIPPING_EVENT_ACTOR_COLUMN_SHAPES.items():
        if inspector is None or name not in columns:
            op.add_column(
                "shipping_request_events",
                sa.Column(name, type_class(length=length), nullable=nullable),
            )

    if inspector is None:
        op.create_foreign_key(
            _SHIPPING_EVENT_ACTOR_FK,
            "shipping_request_events",
            "employees",
            ["actor_employee_id"],
            ["employee_id"],
            ondelete="SET NULL",
        )
        op.create_index(
            _SHIPPING_EVENT_ACTOR_INDEX,
            "shipping_request_events",
            ["actor_employee_id"],
        )
        return

    refreshed = sa.inspect(op.get_bind())
    actor_fk = next(
        (
            foreign_key
            for foreign_key in refreshed.get_foreign_keys("shipping_request_events")
            if foreign_key.get("constrained_columns") == ["actor_employee_id"]
        ),
        None,
    )
    if actor_fk is None:
        with op.batch_alter_table("shipping_request_events") as batch:
            batch.create_foreign_key(
                _SHIPPING_EVENT_ACTOR_FK,
                "employees",
                ["actor_employee_id"],
                ["employee_id"],
                ondelete="SET NULL",
            )
        refreshed = sa.inspect(op.get_bind())
    existing_indexes = {
        index["name"]
        for index in refreshed.get_indexes("shipping_request_events")
    }
    if _SHIPPING_EVENT_ACTOR_INDEX not in existing_indexes:
        op.create_index(
            _SHIPPING_EVENT_ACTOR_INDEX,
            "shipping_request_events",
            ["actor_employee_id"],
        )
    _assert_shipping_event_actor_schema(sa.inspect(op.get_bind()))


def _preflight_upgrade(inspector: sa.Inspector) -> None:
    """거부할 부분 schema를 SQLite DDL보다 먼저 읽기 전용으로 검증한다."""
    employee_columns = {
        column["name"]: column for column in inspector.get_columns("employees")
    }
    pin_state = employee_columns.get(_PIN_STATE_COLUMN)
    if pin_state is not None and not isinstance(pin_state.get("type"), sa.Boolean):
        raise RuntimeError(
            "employees pin state schema is partially present: "
            f"{_PIN_STATE_COLUMN} type={pin_state.get('type')!s}"
        )

    audit_columns = {
        column["name"]: column
        for column in inspector.get_columns("admin_audit_logs")
    }
    actor_code = audit_columns.get("actor_employee_code")
    if actor_code is None:
        raise RuntimeError(
            "admin_audit_logs schema is partially present: missing actor_employee_code"
        )
    actor_code_type = actor_code.get("type")
    actor_code_nullable = bool(actor_code.get("nullable"))
    actor_code_length = getattr(actor_code_type, "length", None)
    if (
        not isinstance(actor_code_type, sa.String)
        or not actor_code_nullable
        or actor_code_length not in {16, _ADMIN_AUDIT_ACTOR_CODE_LENGTH}
    ):
        raise RuntimeError(
            "admin_audit_logs schema is partially present: "
            f"actor_employee_code type={actor_code_type!s} "
            f"nullable={actor_code_nullable}"
        )

    bootstrap_column = audit_columns.get(_ADMIN_AUDIT_BOOTSTRAP_COLUMN)
    if bootstrap_column is not None:
        bootstrap_type = bootstrap_column.get("type")
        if not isinstance(bootstrap_type, sa.String):
            raise RuntimeError(
                "admin_audit_logs bootstrap schema is partially present: "
                f"{_ADMIN_AUDIT_BOOTSTRAP_COLUMN} type={bootstrap_type!s}"
            )
        bootstrap_length = getattr(bootstrap_type, "length", None)
        if bootstrap_length is None or bootstrap_length > 32:
            oversized = op.get_bind().execute(
                sa.text(
                    "SELECT COUNT(*) FROM admin_audit_logs "
                    f"WHERE length({_ADMIN_AUDIT_BOOTSTRAP_COLUMN}) > 32"
                )
            ).scalar_one()
            if oversized:
                raise RuntimeError(
                    "admin_audit_logs bootstrap schema is partially present: "
                    f"{_ADMIN_AUDIT_BOOTSTRAP_COLUMN} contains values longer than 32"
                )

    event_columns = {
        column["name"]: column
        for column in inspector.get_columns("shipping_request_events")
    }
    event_issues: list[str] = []
    for name, expected_shape in _SHIPPING_EVENT_ACTOR_COLUMN_SHAPES.items():
        column = event_columns.get(name)
        if column is not None:
            event_issues.extend(
                _column_shape_issues({name: column}, {name: expected_shape})
            )
    if event_issues:
        raise RuntimeError(
            "shipping_request_events actor schema is partially present: "
            + "; ".join(event_issues)
        )

    actor_column_present = "actor_employee_id" in event_columns
    if actor_column_present:
        actor_foreign_keys = [
            foreign_key
            for foreign_key in inspector.get_foreign_keys("shipping_request_events")
            if foreign_key.get("constrained_columns") == ["actor_employee_id"]
        ]
        valid_actor_fk = next(
            (
                foreign_key
                for foreign_key in actor_foreign_keys
                if foreign_key.get("referred_table") == "employees"
                and foreign_key.get("referred_columns") == ["employee_id"]
                and str(
                    (foreign_key.get("options") or {}).get("ondelete", "")
                ).upper()
                == "SET NULL"
            ),
            None,
        )
        if actor_foreign_keys and valid_actor_fk is None:
            raise RuntimeError(
                "shipping_request_events actor schema is partially present: "
                "actor_employee_id FK must reference employees.employee_id "
                "ON DELETE SET NULL"
            )
        if valid_actor_fk is None:
            orphan_count = op.get_bind().execute(
                sa.text(
                    "SELECT COUNT(*) FROM shipping_request_events AS event "
                    "LEFT JOIN employees AS employee "
                    "ON employee.employee_id = event.actor_employee_id "
                    "WHERE event.actor_employee_id IS NOT NULL "
                    "AND employee.employee_id IS NULL"
                )
            ).scalar_one()
            if orphan_count:
                raise RuntimeError(
                    "shipping_request_events actor schema is partially present: "
                    f"actor_employee_id has {orphan_count} orphan rows"
                )
        event_indexes = {
            index["name"]: index
            for index in inspector.get_indexes("shipping_request_events")
        }
        actor_index = event_indexes.get(_SHIPPING_EVENT_ACTOR_INDEX)
        if actor_index is not None and (
            actor_index.get("column_names") != ["actor_employee_id"]
            or bool(actor_index.get("unique"))
        ):
            raise RuntimeError(
                "shipping_request_events actor schema is partially present: "
                f"{_SHIPPING_EVENT_ACTOR_INDEX} shape="
                f"{actor_index.get('column_names')}/{actor_index.get('unique')}"
            )

    if inspector.has_table("operator_sessions"):
        _assert_operator_session_schema(inspector, allow_missing_indexes=True)
        existing_session_indexes = {
            index["name"]
            for index in inspector.get_indexes("operator_sessions")
        }
        if "uq_operator_sessions_token_hash" not in existing_session_indexes:
            duplicate_tokens = op.get_bind().execute(
                sa.text(
                    "SELECT COUNT(*) FROM ("
                    "SELECT token_hash FROM operator_sessions "
                    "GROUP BY token_hash HAVING COUNT(*) > 1"
                    ") AS duplicate_tokens"
                )
            ).scalar_one()
            if duplicate_tokens:
                raise RuntimeError(
                    "operator_sessions schema is partially present: "
                    f"token_hash has {duplicate_tokens} duplicate values"
                )


def upgrade() -> None:
    inspector = None if context.is_offline_mode() else sa.inspect(op.get_bind())
    if inspector is not None:
        _preflight_upgrade(inspector)
    pin_state_added = _ensure_pin_state_shape(inspector)
    if inspector is not None:
        inspector = sa.inspect(op.get_bind())
    _ensure_admin_audit_actor_code_shape(inspector)
    if inspector is not None:
        inspector = sa.inspect(op.get_bind())
        _assert_admin_audit_actor_code_shape(inspector)
    _ensure_admin_audit_bootstrap_shape(inspector)
    _ensure_shipping_event_actor_schema(inspector)
    op.execute(
        sa.text(
            "UPDATE employees SET pin_requires_change = :requires_change"
            " WHERE pin_hash IS NULL OR pin_hash = :default_hash"
        ).bindparams(
            requires_change=True,
            default_hash=_LEGACY_DEFAULT_PIN_HASH,
        )
    )
    if pin_state_added:
        op.execute(
            sa.text(
                "UPDATE employees SET pin_requires_change = :requires_change"
                " WHERE pin_hash IS NOT NULL AND pin_hash <> :default_hash"
            ).bindparams(
                requires_change=False,
                default_hash=_LEGACY_DEFAULT_PIN_HASH,
            )
        )

    if inspector is None or not inspector.has_table("operator_sessions"):
        _create_operator_sessions_table()
        _create_session_indexes()
        return

    existing_indexes = {
        index["name"] for index in inspector.get_indexes("operator_sessions")
    }
    _create_session_indexes(existing_indexes)
    _assert_operator_session_schema(sa.inspect(op.get_bind()))


def downgrade() -> None:
    raise RuntimeError("operator session credential data downgrade is disabled")
