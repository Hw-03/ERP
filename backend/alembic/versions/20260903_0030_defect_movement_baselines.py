"""Backfill opening balances for pre-cutover defect movement ledgers."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260903_0030"
down_revision: Union[str, None] = "20260826_0029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {
    "kind": "data-change",
    "allowed_tables": ["inventory_operations", "defect_inventory_movements"],
    "validator_sql": (
        "SELECT COUNT(*) FROM defect_quarantine_records AS record "
        "JOIN system_settings AS setting "
        "ON setting.setting_key = 'inventory_operation_cutover_at' "
        "LEFT JOIN (SELECT record_id, SUM(quantity_delta) AS total_quantity "
        "FROM defect_inventory_movements GROUP BY record_id) AS movement "
        "ON movement.record_id = record.record_id "
        "WHERE datetime(record.quarantined_at) < datetime(setting.setting_value) "
        "AND record.remaining_quantity <> COALESCE(movement.total_quantity, 0)"
    ),
    "validator_expected": 0,
}

BASELINE_ACTION = "defect_cutover_baseline"
BASELINE_MOVEMENT_TYPE = "CUTOVER_BASELINE"
BASELINE_ROLE = "OPENING_BALANCE"


def _parse_datetime(value: object, *, label: str) -> datetime:
    """SQLite 문자열과 DB datetime 값을 UTC-naive 시각으로 정규화한다."""
    try:
        parsed = value if isinstance(value, datetime) else datetime.fromisoformat(str(value))
    except (TypeError, ValueError) as exc:
        raise RuntimeError(f"invalid {label} datetime: {value!r}") from exc
    if parsed.tzinfo is not None:
        return parsed.astimezone(UTC).replace(tzinfo=None)
    return parsed


def _load_candidates(
    bind: sa.Connection,
    *,
    cutover: datetime,
) -> list[dict[str, object]]:
    """모든 대상의 기준선을 먼저 검증하여 부분 적용을 막는다."""
    rows = bind.execute(
        sa.text(
            """
            SELECT record.record_id, record.item_id, record.department,
                   record.original_quantity, record.remaining_quantity,
                   record.quarantined_at,
                   COALESCE(SUM(movement.quantity_delta), 0) AS movement_total,
                   COALESCE(SUM(CASE WHEN movement.movement_type = :movement_type
                                     THEN 1 ELSE 0 END), 0) AS baseline_count
            FROM defect_quarantine_records AS record
            LEFT JOIN defect_inventory_movements AS movement
              ON movement.record_id = record.record_id
            GROUP BY record.record_id, record.item_id, record.department,
                     record.original_quantity, record.remaining_quantity,
                     record.quarantined_at
            ORDER BY record.record_id
            """
        ),
        {"movement_type": BASELINE_MOVEMENT_TYPE},
    ).mappings()

    candidates: list[dict[str, object]] = []
    for row in rows:
        if _parse_datetime(row["quarantined_at"], label="quarantined_at") >= cutover:
            continue
        opening_balance = int(row["remaining_quantity"]) - int(row["movement_total"])
        baseline_count = int(row["baseline_count"])
        if baseline_count > 1 or (baseline_count and opening_balance != 0):
            raise RuntimeError(
                f"duplicate or damaged defect opening balance: {row['record_id']}"
            )
        if opening_balance < 0 or opening_balance > int(row["original_quantity"]):
            raise RuntimeError(
                f"invalid defect opening balance: {row['record_id']}={opening_balance}"
            )
        if opening_balance > 0:
            candidates.append({**dict(row), "opening_balance": opening_balance})
    return candidates


def _backfill_baselines() -> None:
    bind = op.get_bind()
    cutover_value = bind.execute(
        sa.text(
            "SELECT setting_value FROM system_settings "
            "WHERE setting_key = 'inventory_operation_cutover_at'"
        )
    ).scalar_one_or_none()
    if cutover_value is None:
        return

    cutover = _parse_datetime(cutover_value, label="cutover")
    candidates = _load_candidates(bind, cutover=cutover)
    if not candidates:
        return

    idempotency_key = f"defect-cutover-baseline:{cutover_value}"
    operation = bind.execute(
        sa.text(
            "SELECT operation_id, action FROM inventory_operations "
            "WHERE idempotency_key = :idempotency_key"
        ),
        {"idempotency_key": idempotency_key},
    ).mappings().one_or_none()
    if operation is None:
        operation_id = uuid.uuid4().hex
        bind.execute(
            sa.text(
                """
                INSERT INTO inventory_operations (
                    operation_id, kind, domain, action, status, display_label,
                    actor_name, reason, idempotency_key, effective_at,
                    contract_version, created_at
                ) VALUES (
                    :operation_id, 'BUSINESS', 'inventory_integrity', :action,
                    'COMMITTED', :display_label, :actor_name, :reason,
                    :idempotency_key, :effective_at, 1, :created_at
                )
                """
            ),
            {
                "operation_id": operation_id,
                "action": BASELINE_ACTION,
                "display_label": "불량 원장 전환 기준선",
                "actor_name": "시스템 전환",
                "reason": "전환 전 격리 기록의 감사 원장 시작 잔량",
                "idempotency_key": idempotency_key,
                "effective_at": cutover,
                "created_at": datetime.utcnow(),
            },
        )
    else:
        if operation["action"] != BASELINE_ACTION:
            raise RuntimeError("defect baseline idempotency key belongs to another operation")
        operation_id = str(operation["operation_id"])

    created_at = datetime.utcnow()
    for candidate in candidates:
        bind.execute(
            sa.text(
                """
                INSERT INTO defect_inventory_movements (
                    movement_id, operation_id, record_id, item_id, department,
                    movement_type, quantity_delta, role, actor_name,
                    effective_at, created_at
                ) VALUES (
                    :movement_id, :operation_id, :record_id, :item_id, :department,
                    :movement_type, :quantity_delta, :role, :actor_name,
                    :effective_at, :created_at
                )
                """
            ),
            {
                "movement_id": uuid.uuid4().hex,
                "operation_id": operation_id,
                "record_id": candidate["record_id"],
                "item_id": candidate["item_id"],
                "department": candidate["department"],
                "movement_type": BASELINE_MOVEMENT_TYPE,
                "quantity_delta": candidate["opening_balance"],
                "role": BASELINE_ROLE,
                "actor_name": "시스템 전환",
                "effective_at": cutover,
                "created_at": created_at,
            },
        )


def upgrade() -> None:
    if context.is_offline_mode():
        return
    _backfill_baselines()


def downgrade() -> None:
    if context.is_offline_mode():
        return
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "DELETE FROM defect_inventory_movements WHERE operation_id IN ("
            "SELECT operation_id FROM inventory_operations "
            "WHERE action = :action AND idempotency_key LIKE :key_prefix)"
        ),
        {"action": BASELINE_ACTION, "key_prefix": "defect-cutover-baseline:%"},
    )
    bind.execute(
        sa.text(
            "DELETE FROM inventory_operations "
            "WHERE action = :action AND idempotency_key LIKE :key_prefix"
        ),
        {"action": BASELINE_ACTION, "key_prefix": "defect-cutover-baseline:%"},
    )
