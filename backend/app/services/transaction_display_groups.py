"""입출고 이력과 일일 작업 활동이 공유하는 거래 표시 묶음 규칙."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Generic, Optional, TypeVar

from app.models import TransactionTypeEnum
from app.schemas import TransactionDisplayGroupResponse, TransactionLogResponse


@dataclass(frozen=True)
class DisplayGroupRecord:
    """Only fields needed for grouping, search membership and cursor ordering."""
    log_id: uuid.UUID
    item_id: uuid.UUID
    transaction_type: TransactionTypeEnum
    quantity_change: Decimal
    created_at: datetime
    requested_at: datetime
    operation_id: Optional[uuid.UUID]
    operation_batch_id: Optional[uuid.UUID]
    reference_no: Optional[str]
    shipping_phase: Optional[str]
    produced_by: Optional[str]
    requester_name: Optional[str]
    department: Optional[str]
    reason_category: Optional[str]
    reason_memo: Optional[str]
    operation_kind: Optional[str]
    operation_effective_status: Optional[str]
    submission_id: Optional[uuid.UUID] = None
    reverses_log_id: Optional[uuid.UUID] = None


GroupLog = TypeVar("GroupLog", TransactionLogResponse, DisplayGroupRecord)


@dataclass
class DisplayGroup(Generic[GroupLog]):
    """Internal group keeps original records without constructing detail responses."""
    type: str
    key: str
    logs: list[GroupLog]
    work_groups: list[DisplayGroup[GroupLog]] = field(default_factory=list)


def _reference_group_key(log: TransactionLogResponse | DisplayGroupRecord) -> str:
    return f"{log.reference_no or ''}::{log.shipping_phase or ''}"


def _defect_actor(log: TransactionLogResponse | DisplayGroupRecord) -> Optional[str]:
    return (log.requester_name or log.produced_by or "").strip() or None


def _defect_reason_key(log: TransactionLogResponse | DisplayGroupRecord) -> Optional[str]:
    category = (log.reason_category or "").strip()
    memo = (log.reason_memo or "").strip()
    return f"{category}::{memo}" if category or memo else None


def _is_matching_defect_lifecycle(
    parent: TransactionLogResponse | DisplayGroupRecord,
    child: TransactionLogResponse | DisplayGroupRecord,
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
    logs: list[GroupLog],
) -> list[tuple[GroupLog, GroupLog]]:
    chronological = sorted(logs, key=lambda log: log.created_at)
    used: set[uuid.UUID] = set()
    pairs: list[tuple[GroupLog, GroupLog]] = []
    for index, parent in enumerate(chronological):
        if parent.transaction_type != TransactionTypeEnum.MARK_DEFECTIVE or parent.log_id in used:
            continue
        child = None
        for candidate in chronological[index + 1 :]:
            if candidate.log_id in used:
                continue
            # 안정된 시간순 정렬이므로 60초 뒤의 기록은 모두 연결 후보에서 제외된다.
            if (candidate.created_at - parent.created_at).total_seconds() > 60:
                break
            if _is_matching_defect_lifecycle(parent, candidate):
                child = candidate
                break
        if child is not None:
            used.update({parent.log_id, child.log_id})
            pairs.append((parent, child))
    return pairs


def group_display_records(
    logs: list[GroupLog],
    *,
    include_submissions: bool = False,
    _work_units: bool = False,
) -> list[DisplayGroup[GroupLog]]:
    """기존 입출고 이력과 동일한 논리 단위로 거래 상세를 묶는다."""
    if include_submissions:
        return _group_history_submissions(logs)
    operations: dict[uuid.UUID, list[GroupLog]] = {}
    op_batches: dict[uuid.UUID, list[GroupLog]] = {}
    reference_batches: dict[str, list[GroupLog]] = {}
    pairs = _find_defect_lifecycle_pairs(logs)
    pair_by_log_id: dict[
        uuid.UUID,
        tuple[GroupLog, GroupLog, uuid.UUID],
    ] = {}
    log_positions = {log.log_id: index for index, log in enumerate(logs)}
    for parent, child in pairs:
        anchor_id = parent.log_id if log_positions[parent.log_id] <= log_positions[child.log_id] else child.log_id
        pair_by_log_id[parent.log_id] = (parent, child, anchor_id)
        pair_by_log_id[child.log_id] = (parent, child, anchor_id)
    for log in logs:
        if log.operation_id:
            operations.setdefault(log.operation_id, []).append(log)
        if log.operation_batch_id and (not _work_units or log.operation_id is None):
            op_batches.setdefault(log.operation_batch_id, []).append(log)
        elif log.reference_no and (not _work_units or log.operation_id is None):
            reference_batches.setdefault(_reference_group_key(log), []).append(log)

    grouped_operation_batch_ids = {
        batch_id
        for batch_id, batch_logs in op_batches.items()
        if (all(log.operation_id is None for log in batch_logs) if _work_units else any(log.operation_id is None for log in batch_logs))
        or (
            not _work_units
            and
            len({log.operation_id for log in batch_logs if log.operation_id}) > 1
            and all(log.operation_kind == "BUSINESS" for log in batch_logs)
            and all(log.operation_effective_status == "active" for log in batch_logs)
        )
    }

    groups: list[DisplayGroup[GroupLog]] = []
    seen_operation_batches: set[uuid.UUID] = set()
    seen_operations: set[uuid.UUID] = set()
    seen_reference_batches: set[str] = set()
    for log in logs:
        if log.operation_batch_id is not None and log.operation_batch_id in grouped_operation_batch_ids and (not _work_units or log.operation_id is None):
            batch_id = log.operation_batch_id
            if batch_id in seen_operation_batches:
                continue
            seen_operation_batches.add(batch_id)
            groups.append(
                DisplayGroup(
                    type="op_batch",
                    key=str(batch_id),
                    logs=op_batches[batch_id],
                )
            )
            continue
        if log.operation_id:
            if log.operation_id in seen_operations:
                continue
            seen_operations.add(log.operation_id)
            operation_logs = operations[log.operation_id]
            groups.append(
                DisplayGroup(
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
                    DisplayGroup(
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
                DisplayGroup(
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
                DisplayGroup(
                    type="solo" if len(reference_logs) == 1 else "batch",
                    key=reference_key if len(reference_logs) > 1 else f"solo:{reference_logs[0].log_id}",
                    logs=reference_logs,
                )
            )
        else:
            groups.append(
                DisplayGroup(
                    type="solo",
                    key=f"solo:{log.log_id}",
                    logs=[log],
                )
            )
    return groups


def _group_history_submissions(logs: list[GroupLog]) -> list[DisplayGroup[GroupLog]]:
    """제출 원본만 포장하고 자식은 실제 작업별 취소 단위를 보존한다."""
    buckets: dict[str, list[GroupLog]] = {}
    independent: list[GroupLog] = []
    for log in logs:
        original = log.operation_kind != "CANCELLATION" and not getattr(log, "reverses_log_id", None)
        submission_id = getattr(log, "submission_id", None)
        key = (f"submission:{submission_id}" if submission_id else
               f"io-submission:{log.operation_batch_id}" if log.operation_batch_id else None)
        if original and key:
            buckets.setdefault(key, []).append(log)
        else:
            independent.append(log)
    groups = group_display_records(independent, _work_units=True)
    for key, originals in buckets.items():
        work_groups = group_display_records(originals, _work_units=True)
        if len(work_groups) > 1:
            groups.append(DisplayGroup(type="submission", key=key, logs=originals, work_groups=work_groups))
        else:
            groups.extend(work_groups)
    positions = {log.log_id: index for index, log in enumerate(logs)}
    groups.sort(key=lambda group: min(positions[log.log_id] for log in group.logs))
    return groups


def build_display_groups(logs: list[TransactionLogResponse]) -> list[TransactionDisplayGroupResponse]:
    """Preserve the public detail response contract for existing consumers."""
    return [
        TransactionDisplayGroupResponse(type=group.type, key=group.key, logs=group.logs)
        for group in group_display_records(logs)
    ]
