"""Persist server-issued BOM auto provenance tokens."""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import uuid
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260818_0022"
down_revision: Union[str, None] = "20260818_0021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TOKEN_SETTING_KEY = "security.bom_auto_token_secret"

EMPLOYEE_AUTO_DEPLOY_POLICY = {
    "kind": "data-change",
    "allowed_tables": ["io_lines", "system_settings"],
    "validator_sql": (
        "SELECT CASE WHEN EXISTS ("
        "SELECT 1 FROM system_settings "
        "WHERE setting_key = 'security.bom_auto_token_secret' "
        "AND LENGTH(setting_value) >= 32"
        ") THEN 0 ELSE 1 END"
    ),
    "validator_expected": 0,
}


def _columns(table_name: str) -> set[str]:
    if context.is_offline_mode():
        return set()
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _uuid_text(value: object) -> str | None:
    """UUIDString 저장 형식과 무관하게 런타임 서명 형식으로 정규화한다."""
    if value is None:
        return None
    return str(uuid.UUID(str(value)))


def _token_for_row(secret: str, row: sa.RowMapping) -> str:
    claims = {
        "bundle_id": _uuid_text(row["bundle_id"]),
        "line_id": _uuid_text(row["line_id"]),
        "source_kind": row["source_kind"],
        "source_item_id": _uuid_text(row["source_item_id"]),
        "item_id": _uuid_text(row["item_id"]),
        "work_type": row["work_type"],
        "sub_type": row["sub_type"],
        "direction": row["direction"],
        "from_bucket": row["from_bucket"],
        "from_department": row["from_department"],
        "to_bucket": row["to_bucket"],
        "to_department": row["to_department"],
    }
    payload = json.dumps(
        {"flow": "io", "claims": {key: value for key, value in sorted(claims.items())}},
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def _ensure_token_secret(bind: sa.Connection) -> str:
    secret = bind.execute(
        sa.text(
            "SELECT setting_value FROM system_settings "
            "WHERE setting_key = :setting_key"
        ),
        {"setting_key": _TOKEN_SETTING_KEY},
    ).scalar()
    if secret:
        return str(secret)
    secret = secrets.token_urlsafe(48)
    bind.execute(
        sa.text(
            "INSERT INTO system_settings (setting_key, setting_value) "
            "VALUES (:setting_key, :setting_value)"
        ),
        {"setting_key": _TOKEN_SETTING_KEY, "setting_value": secret},
    )
    return secret


def _backfill_existing_bom_auto_lines(bind: sa.Connection, secret: str) -> None:
    """저장된 실제 자동 BOM 초안만 토큰을 부여해 제출 시 재평가할 수 있게 한다."""
    rows = bind.execute(
        sa.text(
            """
            SELECT
                line.line_id,
                bundle.bundle_id,
                bundle.source_kind,
                bundle.source_item_id,
                line.item_id,
                batch.work_type,
                batch.sub_type,
                line.direction,
                line.from_bucket,
                line.from_department,
                line.to_bucket,
                line.to_department
            FROM io_lines AS line
            JOIN io_bundles AS bundle ON bundle.bundle_id = line.bundle_id
            JOIN io_batches AS batch ON batch.batch_id = bundle.batch_id
            JOIN bom
                ON bom.parent_item_id = bundle.source_item_id
                AND bom.child_item_id = line.item_id
            WHERE bundle.source_kind = 'bom_parent'
              AND line.origin = 'bom_auto'
              AND (line.bom_auto_token IS NULL OR line.bom_auto_token = '')
            """
        )
    ).mappings()
    for row in rows:
        bind.execute(
            sa.text(
                "UPDATE io_lines SET bom_auto_token = :token "
                "WHERE line_id = :line_id AND (bom_auto_token IS NULL OR bom_auto_token = '')"
            ),
            {"token": _token_for_row(secret, row), "line_id": row["line_id"]},
        )


def upgrade() -> None:
    if "bom_auto_token" not in _columns("io_lines"):
        op.add_column("io_lines", sa.Column("bom_auto_token", sa.String(length=64), nullable=True))
    if context.is_offline_mode():
        return
    bind = op.get_bind()
    secret = _ensure_token_secret(bind)
    _backfill_existing_bom_auto_lines(bind, secret)


def downgrade() -> None:
    raise RuntimeError("BOM 자동 근거 토큰 이력의 downgrade는 지원하지 않습니다.")
