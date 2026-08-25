"""Reconstruct evidence-backed legacy defect aggregates into source records."""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any, Mapping, Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260825_0028"
down_revision: Union[str, None] = "20260824_0027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {
    "kind": "data-change",
    "allowed_tables": [
        "defect_quarantine_records",
        "defect_quarantine_memo_revisions",
        "defect_quarantine_reconstructions",
        "defect_quarantine_reconstruction_allocations",
        "transaction_logs",
    ],
    "validator_sql": (
        "SELECT "
        "(SELECT COUNT(*) FROM inventory_locations AS location "
        "WHERE location.status = 'DEFECTIVE' AND location.quantity > 0 "
        "AND location.quantity <> COALESCE(("
        "SELECT SUM(record.remaining_quantity) "
        "FROM defect_quarantine_records AS record "
        "WHERE record.item_id = location.item_id "
        "AND record.department = location.department), 0)) + "
        "(SELECT COUNT(*) FROM ("
        "SELECT record.item_id, record.department, "
        "SUM(record.remaining_quantity) AS total_quantity "
        "FROM defect_quarantine_records AS record "
        "GROUP BY record.item_id, record.department) AS totals "
        "WHERE totals.total_quantity > 0 "
        "AND NOT EXISTS ("
        "SELECT 1 FROM inventory_locations AS location "
        "WHERE location.item_id = totals.item_id "
        "AND location.department = totals.department "
        "AND location.status = 'DEFECTIVE' "
        "AND location.quantity = totals.total_quantity)) + "
        "(SELECT COUNT(*) "
        "FROM defect_quarantine_reconstructions AS reconstruction "
        "JOIN defect_quarantine_records AS child "
        "ON child.record_id = reconstruction.child_record_id "
        "JOIN defect_quarantine_records AS parent "
        "ON parent.record_id = reconstruction.parent_record_id "
        "JOIN transaction_logs AS source_log "
        "ON source_log.log_id = reconstruction.source_transaction_log_id "
        "WHERE child.is_legacy = false "
        "OR parent.remaining_quantity <> 0 "
        "OR source_log.defect_quarantine_record_id IS NULL "
        "OR source_log.defect_quarantine_record_id <> child.record_id)"
    ),
    "validator_expected": 0,
}

RECONSTRUCTION_TABLE = "defect_quarantine_reconstructions"
ALLOCATION_TABLE = "defect_quarantine_reconstruction_allocations"


def _tables() -> set[str]:
    if context.is_offline_mode():
        return set()
    return set(sa.inspect(op.get_bind()).get_table_names())


def _create_reconstruction_table() -> None:
    op.create_table(
        RECONSTRUCTION_TABLE,
        sa.Column("child_record_id", sa.String(length=32), nullable=False),
        sa.Column("parent_record_id", sa.String(length=32), nullable=False),
        sa.Column("source_transaction_log_id", sa.String(length=32), nullable=False),
        sa.Column(
            "reconstructed_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "child_record_id <> parent_record_id",
            name="ck_defect_reconstruction_distinct_records",
        ),
        sa.ForeignKeyConstraint(
            ["child_record_id"],
            ["defect_quarantine_records.record_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["parent_record_id"],
            ["defect_quarantine_records.record_id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["source_transaction_log_id"],
            ["transaction_logs.log_id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("child_record_id"),
        sa.UniqueConstraint(
            "source_transaction_log_id",
            name="uq_defect_reconstruction_source_log",
        ),
    )
    op.create_index(
        "ix_defect_reconstruction_parent",
        RECONSTRUCTION_TABLE,
        ["parent_record_id"],
    )


def _create_allocation_table() -> None:
    op.create_table(
        ALLOCATION_TABLE,
        sa.Column("allocation_id", sa.String(length=32), nullable=False),
        sa.Column("transaction_log_id", sa.String(length=32), nullable=False),
        sa.Column("record_id", sa.String(length=32), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "quantity > 0",
            name="ck_defect_reconstruction_allocation_positive",
        ),
        sa.ForeignKeyConstraint(
            ["transaction_log_id"],
            ["transaction_logs.log_id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["record_id"],
            ["defect_quarantine_records.record_id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("allocation_id"),
        sa.UniqueConstraint(
            "transaction_log_id",
            "record_id",
            name="uq_defect_reconstruction_allocation_log_record",
        ),
    )
    op.create_index(
        "ix_defect_reconstruction_allocation_log",
        ALLOCATION_TABLE,
        ["transaction_log_id"],
    )
    op.create_index(
        "ix_defect_reconstruction_allocation_record",
        ALLOCATION_TABLE,
        ["record_id"],
    )


def _effects(value: Any) -> list[Mapping[str, Any]]:
    """DB별 JSON 반환 형태를 동일한 효과 목록으로 정규화한다."""
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            return []
    if isinstance(value, Mapping):
        value = [value]
    if not isinstance(value, list):
        return []
    return [effect for effect in value if isinstance(effect, Mapping)]


def _defective_delta(value: Any, department: str) -> int:
    """한 거래가 선택 부서의 불량 위치에 남긴 정수 증감을 합산한다."""
    total = 0
    for effect in _effects(value):
        if (
            effect.get("scope") != "location"
            or str(effect.get("department")) != department
            or str(effect.get("status")) != "DEFECTIVE"
        ):
            continue
        try:
            total += int(effect.get("delta", 0))
        except (TypeError, ValueError):
            return 0
    return total


def _stable_id(kind: str, *parts: object) -> str:
    """마이그레이션 재실행에도 같은 감사 행 식별자를 만든다."""
    token = ":".join([kind, *(str(part) for part in parts)])
    return uuid.uuid5(uuid.NAMESPACE_URL, token).hex


def _has_pending_reservation(
    bind: sa.Connection,
    *,
    parent_id: str,
    item_id: str,
    department: str,
    legacy_location_id: str,
) -> bool:
    """연결 전 legacy 예약까지 찾아 복원 중 예약 출처가 끊기지 않게 한다."""
    location_pending = bind.execute(
        sa.text(
            "SELECT pending_quantity FROM inventory_locations "
            "WHERE location_id = :location_id"
        ),
        {"location_id": legacy_location_id},
    ).scalar_one_or_none()
    if location_pending is not None and int(location_pending) > 0:
        return True

    count = bind.execute(
        sa.text(
            "SELECT COUNT(*) FROM stock_request_lines "
            "WHERE CAST(status AS VARCHAR) = 'RESERVED' "
            "AND (defect_quarantine_record_id = :parent_id OR ("
            "defect_quarantine_record_id IS NULL "
            "AND item_id = :item_id "
            "AND CAST(from_bucket AS VARCHAR) = 'DEFECTIVE' "
            "AND from_department = :department))"
        ),
        {
            "parent_id": parent_id,
            "item_id": item_id,
            "department": department,
        },
    ).scalar_one()
    return bool(count)


def _candidate_logs(
    bind: sa.Connection,
    *,
    item_id: str,
    department: str,
    parent_id: str,
) -> list[dict[str, Any]]:
    """다른 건별 원장에 이미 귀속된 거래를 제외하고 합산 근거만 읽는다."""
    rows = bind.execute(
        sa.text(
            """
            SELECT log_id, transaction_type, produced_by, producer_employee_id,
                   notes, reason_category, reason_memo, department,
                   defect_quarantine_record_id, inventory_effect, created_at
            FROM transaction_logs
            WHERE item_id = :item_id AND cancelled = :cancelled
            ORDER BY created_at, log_id
            """
        ),
        {"item_id": item_id, "cancelled": False},
    ).mappings()
    result: list[dict[str, Any]] = []
    for row in rows:
        delta = _defective_delta(row["inventory_effect"], department)
        if delta == 0:
            continue
        linked_record_id = row["defect_quarantine_record_id"]
        if linked_record_id is not None and str(linked_record_id) != parent_id:
            continue
        result.append({**dict(row), "delta": delta})
    return result


def _replay_fifo(
    logs: list[dict[str, Any]],
    *,
    parent_id: str,
    expected_remaining: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]] | None:
    """양수 거래를 자식으로 만들고 음수 거래를 오래된 자식부터 배분한다."""
    children: list[dict[str, Any]] = []
    allocations: list[dict[str, Any]] = []
    balance = 0

    for log in logs:
        delta = int(log["delta"])
        if delta > 0:
            child_id = _stable_id(
                "defect-reconstruction-child",
                parent_id,
                log["log_id"],
            )
            children.append(
                {
                    "record_id": child_id,
                    "source_log": log,
                    "original_quantity": delta,
                    "remaining_quantity": delta,
                }
            )
            balance += delta
            continue

        needed = -delta
        if balance < needed:
            return None
        for child in children:
            available = int(child["remaining_quantity"])
            if available <= 0:
                continue
            allocated = min(available, needed)
            child["remaining_quantity"] = available - allocated
            allocations.append(
                {
                    "allocation_id": _stable_id(
                        "defect-reconstruction-allocation",
                        log["log_id"],
                        child["record_id"],
                    ),
                    "transaction_log_id": log["log_id"],
                    "record_id": child["record_id"],
                    "quantity": allocated,
                    "created_at": log["created_at"],
                }
            )
            needed -= allocated
            if needed == 0:
                break
        if needed != 0:
            return None
        balance += delta

    if not children or balance != expected_remaining:
        return None
    return children, allocations


def _insert_reconstruction(
    bind: sa.Connection,
    *,
    parent: Mapping[str, Any],
    children: list[dict[str, Any]],
    allocations: list[dict[str, Any]],
) -> None:
    """검증된 복원 결과와 메모·출처·FIFO 할당을 같은 마이그레이션에 기록한다."""
    reconstructed_at = datetime.utcnow()
    for child in children:
        log = child["source_log"]
        actor_name = log["produced_by"] or "기존 복원 마이그레이션"
        memo = log["reason_memo"] if log["reason_memo"] is not None else log["notes"]
        child_id = child["record_id"]
        bind.execute(
            sa.text(
                """
                INSERT INTO defect_quarantine_records (
                    record_id, item_id, department, original_quantity,
                    remaining_quantity, quarantined_at,
                    quarantined_by_employee_id, quarantined_by_name,
                    reason_category, current_memo, is_legacy,
                    legacy_location_id, created_at, updated_at
                ) VALUES (
                    :record_id, :item_id, :department, :original_quantity,
                    :remaining_quantity, :quarantined_at,
                    :actor_employee_id, :actor_name,
                    :reason_category, :memo, :is_legacy,
                    NULL, :quarantined_at, :quarantined_at
                )
                """
            ),
            {
                "record_id": child_id,
                "item_id": parent["item_id"],
                "department": parent["department"],
                "original_quantity": child["original_quantity"],
                "remaining_quantity": child["remaining_quantity"],
                "quarantined_at": log["created_at"] or reconstructed_at,
                "actor_employee_id": log["producer_employee_id"],
                "actor_name": log["produced_by"],
                "reason_category": log["reason_category"],
                "memo": memo,
                "is_legacy": True,
            },
        )
        bind.execute(
            sa.text(
                """
                INSERT INTO defect_quarantine_memo_revisions (
                    revision_id, record_id, previous_memo, next_memo,
                    edited_by_employee_id, edited_by_name, edited_at, is_initial
                ) VALUES (
                    :revision_id, :record_id, NULL, :memo,
                    :actor_employee_id, :actor_name, :edited_at, :is_initial
                )
                """
            ),
            {
                "revision_id": _stable_id("defect-reconstruction-memo", child_id),
                "record_id": child_id,
                "memo": memo,
                "actor_employee_id": log["producer_employee_id"],
                "actor_name": actor_name,
                "edited_at": log["created_at"] or reconstructed_at,
                "is_initial": True,
            },
        )
        bind.execute(
            sa.text(
                f"""
                INSERT INTO {RECONSTRUCTION_TABLE} (
                    child_record_id, parent_record_id,
                    source_transaction_log_id, reconstructed_at
                ) VALUES (
                    :child_record_id, :parent_record_id,
                    :source_transaction_log_id, :reconstructed_at
                )
                """
            ),
            {
                "child_record_id": child_id,
                "parent_record_id": parent["record_id"],
                "source_transaction_log_id": log["log_id"],
                "reconstructed_at": reconstructed_at,
            },
        )
        bind.execute(
            sa.text(
                "UPDATE transaction_logs "
                "SET defect_quarantine_record_id = :child_record_id "
                "WHERE log_id = :source_log_id"
            ),
            {
                "child_record_id": child_id,
                "source_log_id": log["log_id"],
            },
        )

    for allocation in allocations:
        bind.execute(
            sa.text(
                f"""
                INSERT INTO {ALLOCATION_TABLE} (
                    allocation_id, transaction_log_id, record_id,
                    quantity, created_at
                ) VALUES (
                    :allocation_id, :transaction_log_id, :record_id,
                    :quantity, :created_at
                )
                """
            ),
            allocation,
        )

    bind.execute(
        sa.text(
            "UPDATE defect_quarantine_records "
            "SET remaining_quantity = 0, updated_at = :updated_at "
            "WHERE record_id = :parent_id"
        ),
        {"parent_id": parent["record_id"], "updated_at": reconstructed_at},
    )


def _reconstruct_legacy_records() -> None:
    bind = op.get_bind()
    parents = bind.execute(
        sa.text(
            f"""
            SELECT record_id, item_id, department, remaining_quantity,
                   legacy_location_id
            FROM defect_quarantine_records AS parent
            WHERE parent.is_legacy = :is_legacy
              AND parent.legacy_location_id IS NOT NULL
              AND parent.remaining_quantity > 0
              AND NOT EXISTS (
                  SELECT 1 FROM {RECONSTRUCTION_TABLE} AS reconstruction
                  WHERE reconstruction.parent_record_id = parent.record_id
              )
            ORDER BY parent.created_at, parent.record_id
            """
        ),
        {"is_legacy": True},
    ).mappings()

    for parent in parents:
        parent_id = str(parent["record_id"])
        if _has_pending_reservation(
            bind,
            parent_id=parent_id,
            item_id=str(parent["item_id"]),
            department=str(parent["department"]),
            legacy_location_id=str(parent["legacy_location_id"]),
        ):
            continue
        logs = _candidate_logs(
            bind,
            item_id=str(parent["item_id"]),
            department=str(parent["department"]),
            parent_id=parent_id,
        )
        replayed = _replay_fifo(
            logs,
            parent_id=parent_id,
            expected_remaining=int(parent["remaining_quantity"]),
        )
        if replayed is None:
            continue
        children, allocations = replayed
        _insert_reconstruction(
            bind,
            parent=parent,
            children=children,
            allocations=allocations,
        )


def upgrade() -> None:
    tables = _tables()
    if RECONSTRUCTION_TABLE not in tables:
        _create_reconstruction_table()
    if ALLOCATION_TABLE not in tables:
        _create_allocation_table()
    if not context.is_offline_mode():
        _reconstruct_legacy_records()


def downgrade() -> None:
    raise RuntimeError("복원된 격리 감사 이력의 downgrade는 지원하지 않습니다.")
