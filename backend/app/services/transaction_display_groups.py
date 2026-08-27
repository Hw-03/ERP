"""입출고 이력과 일일 작업 활동이 공유하는 거래 표시 묶음 규칙."""

from __future__ import annotations

import uuid
from typing import Optional

from app.models import TransactionTypeEnum
from app.schemas import TransactionDisplayGroupResponse, TransactionLogResponse


def _reference_group_key(log: TransactionLogResponse) -> str:
    return f"{log.reference_no or ''}::{log.shipping_phase or ''}"


def _defect_actor(log: TransactionLogResponse) -> Optional[str]:
    return (log.requester_name or log.produced_by or "").strip() or None


def _defect_reason_key(log: TransactionLogResponse) -> Optional[str]:
    category = (log.reason_category or "").strip()
    memo = (log.reason_memo or "").strip()
    return f"{category}::{memo}" if category or memo else None


def _is_matching_defect_lifecycle(
    parent: TransactionLogResponse,
    child: TransactionLogResponse,
) -> bool:
    if child.transaction_type not in {
        TransactionTypeEnum.DEFECT_SCRAP,
        TransactionTypeEnum.SUPPLIER_RETURN,
        TransactionTypeEnum.DISASSEMBLE,
    }:
        return False
    if parent.item_id != child.item_id or abs(parent.quantity_change) != abs(child.quantity_change):
        return False
    parent_actor, child_actor = _defect_actor(parent), _defect_actor(child)
    if not parent_actor or parent_actor != child_actor:
        return False
    parent_department = (parent.department or "").strip()
    child_department = (child.department or "").strip()
    if not parent_department or parent_department != child_department:
        return False
    parent_reason, child_reason = _defect_reason_key(parent), _defect_reason_key(child)
    if not parent_reason or parent_reason != child_reason:
        return False
    elapsed = (child.created_at - parent.created_at).total_seconds()
    return 0 <= elapsed <= 60


def _find_defect_lifecycle_pairs(
    logs: list[TransactionLogResponse],
) -> list[tuple[TransactionLogResponse, TransactionLogResponse]]:
    chronological = sorted(logs, key=lambda log: log.created_at)
    used: set[uuid.UUID] = set()
    pairs: list[tuple[TransactionLogResponse, TransactionLogResponse]] = []
    for index, parent in enumerate(chronological):
        if parent.transaction_type != TransactionTypeEnum.MARK_DEFECTIVE or parent.log_id in used:
            continue
        child = next(
            (
                candidate
                for candidate in chronological[index + 1 :]
                if candidate.log_id not in used and _is_matching_defect_lifecycle(parent, candidate)
            ),
            None,
        )
        if child is not None:
            used.update({parent.log_id, child.log_id})
            pairs.append((parent, child))
    return pairs


def build_display_groups(
    logs: list[TransactionLogResponse],
) -> list[TransactionDisplayGroupResponse]:
    """기존 입출고 이력과 동일한 논리 단위로 거래 상세를 묶는다."""
    operations: dict[uuid.UUID, list[TransactionLogResponse]] = {}
    op_batches: dict[uuid.UUID, list[TransactionLogResponse]] = {}
    reference_batches: dict[str, list[TransactionLogResponse]] = {}
    pairs = _find_defect_lifecycle_pairs(logs)
    pair_by_log_id: dict[
        uuid.UUID,
        tuple[TransactionLogResponse, TransactionLogResponse, uuid.UUID],
    ] = {}
    log_positions = {log.log_id: index for index, log in enumerate(logs)}
    for parent, child in pairs:
        anchor_id = parent.log_id if log_positions[parent.log_id] <= log_positions[child.log_id] else child.log_id
        pair_by_log_id[parent.log_id] = (parent, child, anchor_id)
        pair_by_log_id[child.log_id] = (parent, child, anchor_id)
    for log in logs:
        if log.operation_id:
            operations.setdefault(log.operation_id, []).append(log)
        elif log.operation_batch_id:
            op_batches.setdefault(log.operation_batch_id, []).append(log)
        elif log.reference_no:
            reference_batches.setdefault(_reference_group_key(log), []).append(log)

    groups: list[TransactionDisplayGroupResponse] = []
    seen_operation_batches: set[uuid.UUID] = set()
    seen_operations: set[uuid.UUID] = set()
    seen_reference_batches: set[str] = set()
    for log in logs:
        if log.operation_id:
            if log.operation_id in seen_operations:
                continue
            seen_operations.add(log.operation_id)
            operation_logs = operations[log.operation_id]
            groups.append(
                TransactionDisplayGroupResponse(
                    type="operation",
                    key=str(log.operation_id),
                    logs=operation_logs,
                )
            )
            continue
        pair = pair_by_log_id.get(log.log_id)
        if pair:
            parent, child, anchor_id = pair
            if anchor_id == log.log_id:
                groups.append(
                    TransactionDisplayGroupResponse(
                        type="defect_lifecycle",
                        key=f"defect-lifecycle:{parent.log_id}:{child.log_id}",
                        logs=[parent, child],
                    )
                )
            continue
        if log.operation_batch_id:
            batch_id = log.operation_batch_id
            if batch_id in seen_operation_batches:
                continue
            seen_operation_batches.add(batch_id)
            batch_logs = op_batches[batch_id]
            groups.append(
                TransactionDisplayGroupResponse(
                    type="solo" if len(batch_logs) == 1 else "op_batch",
                    key=str(batch_id) if len(batch_logs) > 1 else f"solo:{batch_logs[0].log_id}",
                    logs=batch_logs,
                )
            )
        elif log.reference_no:
            reference_key = _reference_group_key(log)
            if reference_key in seen_reference_batches:
                continue
            seen_reference_batches.add(reference_key)
            reference_logs = reference_batches[reference_key]
            groups.append(
                TransactionDisplayGroupResponse(
                    type="solo" if len(reference_logs) == 1 else "batch",
                    key=reference_key if len(reference_logs) > 1 else f"solo:{reference_logs[0].log_id}",
                    logs=reference_logs,
                )
            )
        else:
            groups.append(
                TransactionDisplayGroupResponse(
                    type="solo",
                    key=f"solo:{log.log_id}",
                    logs=[log],
                )
            )
    return groups
