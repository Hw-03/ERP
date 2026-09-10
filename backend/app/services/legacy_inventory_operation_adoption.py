"""같은 주 레거시 거래를 검증한 뒤 공통 취소 원장에 편입한다."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import or_
from sqlalchemy.orm import Query, Session

from app.database import _is_sqlite
from app.models import (
    DefectQuarantineRecord,
    DefectQuarantineReconstructionAllocation,
    Employee,
    InventoryOperation,
    InventoryOperationEffectKindEnum,
    InventoryOperationRoleEnum,
    IoBatch,
    ShippingAllocation,
    ShippingRequest,
    ShippingRequestStatusEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services import inventory_operation_cancellation as cancellation_svc
from app.services import inventory_operations as operation_svc


DEFECT_LEGACY_CANCEL_MESSAGE = (
    "전환 전에 생성된 불량·재작업 내역은 안전하게 취소할 수 없습니다. "
    "현재 불량 상태를 확인한 뒤 새 작업으로 처리해 주세요."
)
INCOMPLETE_LEGACY_EFFECT_MESSAGE = (
    "전환 전 작업의 전체 재고 영향을 확인할 수 없어 취소할 수 없습니다. "
    "현재 재고를 확인한 뒤 새 작업으로 처리해 주세요."
)


class LegacyCancellationAdoptionError(ValueError):
    """레거시 거래를 하나의 원 작업으로 안전하게 확정할 수 없음."""


@dataclass(frozen=True)
class LegacyCancellationAdoption:
    """편입된 원 작업과 그 즉시 생성된 역전 작업."""

    original: InventoryOperation
    cancellation: InventoryOperation


@dataclass(frozen=True)
class LegacyDefectMovementSpec:
    """편입할 레거시 거래가 과거 불량 잔량에 적용한 검증된 증감."""

    record_id: uuid.UUID
    item_id: uuid.UUID
    department: str
    quantity_delta: int
    movement_type: str
    role: str


_DEFECT_TYPES = {
    TransactionTypeEnum.MARK_DEFECTIVE,
    TransactionTypeEnum.UNMARK_DEFECTIVE,
    TransactionTypeEnum.DEFECT_SCRAP,
    TransactionTypeEnum.DISASSEMBLE,
    TransactionTypeEnum.SUPPLIER_RETURN,
}
_SUPPORTED_TYPES = {
    TransactionTypeEnum.RECEIVE,
    TransactionTypeEnum.SHIP,
    TransactionTypeEnum.ADJUST,
    TransactionTypeEnum.PRODUCE,
    TransactionTypeEnum.BACKFLUSH,
    TransactionTypeEnum.TRANSFER_TO_PROD,
    TransactionTypeEnum.TRANSFER_TO_WH,
    TransactionTypeEnum.TRANSFER_DEPT,
    TransactionTypeEnum.INTERNAL_USE,
} | _DEFECT_TYPES
_TRANSFER_TYPES = {
    TransactionTypeEnum.TRANSFER_TO_PROD,
    TransactionTypeEnum.TRANSFER_TO_WH,
    TransactionTypeEnum.TRANSFER_DEPT,
}
_BATCH_TYPES: dict[str, set[TransactionTypeEnum]] = {
    "receive_supplier": {TransactionTypeEnum.RECEIVE},
    "produce": {TransactionTypeEnum.PRODUCE, TransactionTypeEnum.BACKFLUSH},
    "adjust_in": {TransactionTypeEnum.ADJUST},
    "adjust_out": {TransactionTypeEnum.ADJUST},
    "warehouse_adjust_in": {TransactionTypeEnum.ADJUST},
    "warehouse_adjust_out": {TransactionTypeEnum.ADJUST},
    "warehouse_to_dept": {TransactionTypeEnum.TRANSFER_TO_PROD},
    "dept_to_warehouse": {TransactionTypeEnum.TRANSFER_TO_WH},
    "dept_transfer": {TransactionTypeEnum.TRANSFER_DEPT},
    "internal_use_out": {TransactionTypeEnum.INTERNAL_USE},
}
_BATCH_DISPLAY_LABELS = {
    "receive_supplier": "창고 입출고",
    "produce": "부서 입출고",
    "adjust_in": "부서 입출고",
    "adjust_out": "부서 입출고",
    "warehouse_adjust_in": "창고 입출고",
    "warehouse_adjust_out": "창고 입출고",
    "warehouse_to_dept": "창고 입출고",
    "dept_to_warehouse": "창고 입출고",
    "dept_transfer": "부서 입출고",
    "internal_use_out": "AS·연구 사용출고",
}


def _locked(query: Query) -> Query:
    """PostgreSQL에서는 편입 대상을 잠그고 SQLite의 BEGIN IMMEDIATE는 그대로 쓴다."""
    return query if _is_sqlite else query.with_for_update()


def _is_rework_scrap_child(log: TransactionLog) -> bool:
    return (
        (log.reference_no or "").startswith("defect-disassemble:")
        and log.transaction_type == TransactionTypeEnum.DEFECT_SCRAP
        and log.notes == "[rework:scrap_child]"
        and log.inventory_effect == []
    )


def _defective_delta(log: TransactionLog, department: str) -> int:
    effects = cancellation_svc.normalized_effect_for_cancellation(log)
    return sum(
        int(effect["delta"])
        for effect in effects
        if effect.get("scope") == "location"
        and str(effect.get("department")) == department
        and str(effect.get("status")) == "DEFECTIVE"
    )


def _has_downstream_defect_usage(
    db: Session,
    *,
    record_id: uuid.UUID,
    source_log_id: uuid.UUID,
) -> bool:
    direct_log = (
        db.query(TransactionLog.log_id)
        .filter(
            TransactionLog.defect_quarantine_record_id == record_id,
            TransactionLog.log_id != source_log_id,
            TransactionLog.cancelled.is_(False),
        )
        .first()
    )
    if direct_log is not None:
        return True
    allocated_log = (
        db.query(DefectQuarantineReconstructionAllocation.allocation_id)
        .join(
            TransactionLog,
            TransactionLog.log_id
            == DefectQuarantineReconstructionAllocation.transaction_log_id,
        )
        .filter(
            DefectQuarantineReconstructionAllocation.record_id == record_id,
            TransactionLog.cancelled.is_(False),
        )
        .first()
    )
    if allocated_log is not None:
        return True
    return (
        db.query(StockRequestLine.line_id)
        .filter(
            StockRequestLine.defect_quarantine_record_id == record_id,
            StockRequestLine.status == StockRequestStatusEnum.RESERVED,
        )
        .first()
        is not None
    )


def _record_for_movement(
    db: Session,
    *,
    record_id: uuid.UUID,
    log: TransactionLog,
) -> DefectQuarantineRecord:
    record = _locked(
        db.query(DefectQuarantineRecord).filter(
            DefectQuarantineRecord.record_id == record_id
        )
    ).one_or_none()
    if (
        record is None
        or record.item_id != log.item_id
        or str(record.department) != str(log.department)
    ):
        raise LegacyCancellationAdoptionError(DEFECT_LEGACY_CANCEL_MESSAGE)
    return record


def _defect_movement_specs(
    db: Session,
    log: TransactionLog,
) -> tuple[LegacyDefectMovementSpec, ...]:
    allocations = (
        _locked(
            db.query(DefectQuarantineReconstructionAllocation).filter(
                DefectQuarantineReconstructionAllocation.transaction_log_id == log.log_id
            )
        )
        .order_by(DefectQuarantineReconstructionAllocation.created_at)
        .all()
    )
    if allocations:
        if log.defect_quarantine_record_id is not None:
            raise LegacyCancellationAdoptionError(DEFECT_LEGACY_CANCEL_MESSAGE)
        delta = _defective_delta(log, str(log.department))
        if delta >= 0 or sum(int(row.quantity) for row in allocations) != -delta:
            raise LegacyCancellationAdoptionError(DEFECT_LEGACY_CANCEL_MESSAGE)
        specs: list[LegacyDefectMovementSpec] = []
        for allocation in allocations:
            record = _record_for_movement(
                db,
                record_id=allocation.record_id,
                log=log,
            )
            specs.append(
                LegacyDefectMovementSpec(
                    record_id=record.record_id,
                    item_id=record.item_id,
                    department=str(record.department),
                    quantity_delta=-int(allocation.quantity),
                    movement_type=f"LEGACY_{log.transaction_type.value}_FIFO",
                    role=_role_for(log).value,
                )
            )
        return tuple(specs)

    if log.defect_quarantine_record_id is not None:
        record = _record_for_movement(
            db,
            record_id=log.defect_quarantine_record_id,
            log=log,
        )
        delta = _defective_delta(log, str(record.department))
        if delta == 0:
            raise LegacyCancellationAdoptionError(DEFECT_LEGACY_CANCEL_MESSAGE)
        if log.transaction_type == TransactionTypeEnum.MARK_DEFECTIVE and delta <= 0:
            raise LegacyCancellationAdoptionError(DEFECT_LEGACY_CANCEL_MESSAGE)
        if log.transaction_type in {
            TransactionTypeEnum.UNMARK_DEFECTIVE,
            TransactionTypeEnum.DEFECT_SCRAP,
            TransactionTypeEnum.DISASSEMBLE,
            TransactionTypeEnum.SUPPLIER_RETURN,
        } and delta >= 0:
            raise LegacyCancellationAdoptionError(DEFECT_LEGACY_CANCEL_MESSAGE)
        if delta > 0 and (
            int(record.original_quantity or 0) != delta
            or int(record.remaining_quantity or 0) != delta
            or _has_downstream_defect_usage(
                db,
                record_id=record.record_id,
                source_log_id=log.log_id,
            )
        ):
            raise LegacyCancellationAdoptionError(DEFECT_LEGACY_CANCEL_MESSAGE)
        return (
            LegacyDefectMovementSpec(
                record_id=record.record_id,
                item_id=record.item_id,
                department=str(record.department),
                quantity_delta=delta,
                movement_type=f"LEGACY_{log.transaction_type.value}",
                role=_role_for(log).value,
            ),
        )

    if log.transaction_type in _DEFECT_TYPES and not _is_rework_scrap_child(log):
        raise LegacyCancellationAdoptionError(DEFECT_LEGACY_CANCEL_MESSAGE)
    return ()


def _scope_logs(
    db: Session,
    selected_log_id: uuid.UUID,
) -> tuple[TransactionLog, list[TransactionLog], str, IoBatch | None, ShippingRequest | None]:
    selected = _locked(
        db.query(TransactionLog).filter(TransactionLog.log_id == selected_log_id)
    ).one_or_none()
    if selected is None:
        raise LegacyCancellationAdoptionError("취소할 거래를 찾을 수 없습니다.")

    batch: IoBatch | None = None
    shipping_request: ShippingRequest | None = None
    if selected.operation_batch_id is not None:
        scope = f"batch:{selected.operation_batch_id}"
        logs_query = db.query(TransactionLog).filter(
            TransactionLog.operation_batch_id == selected.operation_batch_id
        )
        batch = _locked(
            db.query(IoBatch).filter(IoBatch.batch_id == selected.operation_batch_id)
        ).one_or_none()
        if batch is None:
            raise LegacyCancellationAdoptionError(INCOMPLETE_LEGACY_EFFECT_MESSAGE)
    elif (
        selected.shipping_request_id is not None
        and selected.transaction_type == TransactionTypeEnum.SHIP
        and (selected.reference_no or "").startswith("SHIP-")
    ):
        scope = f"shipping:{selected.shipping_request_id}"
        logs_query = db.query(TransactionLog).filter(
            TransactionLog.shipping_request_id == selected.shipping_request_id,
            TransactionLog.reference_no == selected.reference_no,
        )
        shipping_request = _locked(
            db.query(ShippingRequest).filter(
                ShippingRequest.request_id == selected.shipping_request_id
            )
        ).one_or_none()
        if shipping_request is None:
            raise LegacyCancellationAdoptionError(INCOMPLETE_LEGACY_EFFECT_MESSAGE)
    elif (selected.reference_no or "").startswith("defect-disassemble:"):
        scope = f"reference:{selected.reference_no}"
        logs_query = db.query(TransactionLog).filter(
            TransactionLog.reference_no == selected.reference_no
        )
    else:
        scope = f"log:{selected.log_id}"
        logs_query = db.query(TransactionLog).filter(
            TransactionLog.log_id == selected.log_id
        )

    logs = (
        _locked(logs_query)
        .order_by(TransactionLog.created_at.asc(), TransactionLog.log_id.asc())
        .all()
    )
    if not logs:
        raise LegacyCancellationAdoptionError(INCOMPLETE_LEGACY_EFFECT_MESSAGE)
    if shipping_request is not None and any(
        log.transaction_type != TransactionTypeEnum.SHIP for log in logs
    ):
        raise LegacyCancellationAdoptionError(INCOMPLETE_LEGACY_EFFECT_MESSAGE)
    return selected, logs, scope, batch, shipping_request


def _validate_scope(
    db: Session,
    logs: list[TransactionLog],
    *,
    batch: IoBatch | None,
) -> dict[uuid.UUID, tuple[LegacyDefectMovementSpec, ...]]:
    if batch is not None and batch.sub_type == "disassemble":
        raise LegacyCancellationAdoptionError(DEFECT_LEGACY_CANCEL_MESSAGE)
    if any(log.transaction_type not in _SUPPORTED_TYPES for log in logs):
        raise LegacyCancellationAdoptionError(INCOMPLETE_LEGACY_EFFECT_MESSAGE)
    if any(
        log.cancelled
        or log.operation_id is not None
        or log.operation_role is not None
        or log.reverses_log_id is not None
        for log in logs
    ):
        raise LegacyCancellationAdoptionError(INCOMPLETE_LEGACY_EFFECT_MESSAGE)

    actor_ids = {log.producer_employee_id for log in logs if log.producer_employee_id}
    actor_names = {(log.produced_by or "").strip() for log in logs if (log.produced_by or "").strip()}
    if len(actor_ids) > 1 or len(actor_names) > 1:
        raise LegacyCancellationAdoptionError(INCOMPLETE_LEGACY_EFFECT_MESSAGE)

    rework_logs = [
        log
        for log in logs
        if (log.reference_no or "").startswith("defect-disassemble:")
        or (log.notes or "").startswith("[rework:")
    ]
    if rework_logs:
        references = {log.reference_no for log in logs}
        parents = [
            log
            for log in logs
            if log.transaction_type == TransactionTypeEnum.DISASSEMBLE
            and (log.notes or "").startswith("[rework:defective]")
            and log.defect_quarantine_record_id is not None
        ]
        valid_children = all(
            log in parents
            or (
                log.transaction_type == TransactionTypeEnum.RECEIVE
                and log.notes == "[rework:normal_child]"
            )
            or (
                log.transaction_type == TransactionTypeEnum.MARK_DEFECTIVE
                and log.notes == "[rework:defective_child]"
                and log.defect_quarantine_record_id is not None
            )
            or _is_rework_scrap_child(log)
            for log in logs
        )
        if (
            len(rework_logs) != len(logs)
            or len(references) != 1
            or not str(next(iter(references)) or "").startswith("defect-disassemble:")
            or len(parents) != 1
            or not valid_children
        ):
            raise LegacyCancellationAdoptionError(DEFECT_LEGACY_CANCEL_MESSAGE)

    if batch is not None:
        expected_types = _BATCH_TYPES.get(batch.sub_type)
        actual_types = {log.transaction_type for log in logs}
        if (
            expected_types is None
            or not actual_types.issubset(expected_types)
            or batch.status != "completed"
            or (
                batch.sub_type in {"produce", "disassemble"}
                and TransactionTypeEnum.PRODUCE not in actual_types
            )
        ):
            raise LegacyCancellationAdoptionError(INCOMPLETE_LEGACY_EFFECT_MESSAGE)

    movement_specs: dict[uuid.UUID, tuple[LegacyDefectMovementSpec, ...]] = {}
    for log in logs:
        try:
            effects = cancellation_svc.normalized_effect_for_cancellation(log)
            movement_specs[log.log_id] = _defect_movement_specs(db, log)
        except cancellation_svc.CancellationNotAllowed as exc:
            raise LegacyCancellationAdoptionError(
                INCOMPLETE_LEGACY_EFFECT_MESSAGE
            ) from exc
        deltas = [
            int(effect["delta"])
            for effect in effects
            if effect.get("scope") in {"warehouse", "location"}
        ]
        warehouse_delta = sum(
            int(effect["delta"])
            for effect in effects
            if effect.get("scope") == "warehouse"
        )
        physical_delta = sum(
            int(effect["delta"])
            for effect in effects
            if effect.get("scope")
            in {"warehouse_box", "warehouse_zone", "warehouse_unplaced"}
        )
        if _is_rework_scrap_child(log):
            continue
        if not deltas or any(delta == 0 for delta in deltas):
            raise LegacyCancellationAdoptionError(INCOMPLETE_LEGACY_EFFECT_MESSAGE)
        if physical_delta and physical_delta != warehouse_delta:
            raise LegacyCancellationAdoptionError(INCOMPLETE_LEGACY_EFFECT_MESSAGE)
        if log.transaction_type in _TRANSFER_TYPES:
            if len(deltas) < 2 or min(deltas) >= 0 or max(deltas) <= 0 or sum(deltas) != 0:
                raise LegacyCancellationAdoptionError(INCOMPLETE_LEGACY_EFFECT_MESSAGE)
        elif sum(deltas) != int(log.quantity_change or 0):
            raise LegacyCancellationAdoptionError(INCOMPLETE_LEGACY_EFFECT_MESSAGE)
    return movement_specs


def _role_for(log: TransactionLog) -> InventoryOperationRoleEnum:
    if (log.reference_no or "").startswith("defect-disassemble:"):
        if (log.notes or "").startswith("[rework:defective]"):
            return InventoryOperationRoleEnum.REWORK_PARENT_DEFECTIVE
        if log.notes == "[rework:normal_child]":
            return InventoryOperationRoleEnum.REWORK_CHILD_NORMAL
        if log.notes == "[rework:defective_child]":
            return InventoryOperationRoleEnum.REWORK_CHILD_DEFECTIVE
        if log.notes == "[rework:scrap_child]":
            return InventoryOperationRoleEnum.REWORK_CHILD_SCRAP
    if log.transaction_type == TransactionTypeEnum.PRODUCE:
        return InventoryOperationRoleEnum.PRODUCT_OUTPUT
    if log.transaction_type == TransactionTypeEnum.BACKFLUSH:
        return InventoryOperationRoleEnum.COMPONENT_INPUT
    if log.transaction_type in _TRANSFER_TYPES:
        return InventoryOperationRoleEnum.TRANSFER
    if log.transaction_type == TransactionTypeEnum.ADJUST:
        return InventoryOperationRoleEnum.CORRECTION
    return InventoryOperationRoleEnum.PRIMARY


def _operation_metadata(
    logs: list[TransactionLog],
    *,
    batch: IoBatch | None,
    shipping_request: ShippingRequest | None,
) -> tuple[str, str, str, str, uuid.UUID | None, str | None, str | None]:
    actor_id = next(
        (log.producer_employee_id for log in logs if log.producer_employee_id),
        batch.requester_employee_id if batch is not None else None,
    )
    actor_name = next(
        ((log.produced_by or "").strip() for log in logs if (log.produced_by or "").strip()),
        batch.requester_name if batch is not None else "시스템",
    )
    if batch is not None:
        display_label = _BATCH_DISPLAY_LABELS.get(batch.sub_type)
        if display_label is None:
            raise LegacyCancellationAdoptionError(INCOMPLETE_LEGACY_EFFECT_MESSAGE)
        return (
            "inventory_io",
            batch.sub_type,
            display_label,
            actor_name,
            actor_id,
            batch.requester_department,
            batch.notes,
        )
    if shipping_request is not None:
        return (
            "shipping",
            "pickup",
            "출하 픽업",
            actor_name,
            actor_id,
            logs[0].department,
            shipping_request.notes,
        )
    transaction_type = logs[0].transaction_type
    if (logs[0].reference_no or "").startswith("defect-disassemble:"):
        return (
            "defect",
            "rework_defective",
            "재작업",
            actor_name,
            actor_id,
            logs[0].department,
            logs[0].reason_memo or logs[0].notes,
        )
    domain, action, label = {
        TransactionTypeEnum.RECEIVE: ("inventory_io", "receive", "원자재 입고"),
        TransactionTypeEnum.SHIP: ("inventory_io", "ship", "출고"),
        TransactionTypeEnum.ADJUST: ("inventory_io", "adjust", "수량 조정"),
        TransactionTypeEnum.PRODUCE: ("production", "receipt", "생산"),
        TransactionTypeEnum.BACKFLUSH: ("production", "backflush", "BOM 투입"),
        TransactionTypeEnum.TRANSFER_TO_PROD: ("inventory_io", "transfer", "창고 입출고"),
        TransactionTypeEnum.TRANSFER_TO_WH: ("inventory_io", "transfer", "창고 입출고"),
        TransactionTypeEnum.TRANSFER_DEPT: ("inventory_io", "transfer", "부서 입출고"),
        TransactionTypeEnum.INTERNAL_USE: ("inventory_io", "internal_use", "내부 사용"),
        TransactionTypeEnum.MARK_DEFECTIVE: ("defect", "quarantine", "불량 격리"),
        TransactionTypeEnum.UNMARK_DEFECTIVE: ("defect", "restore", "정상 복귀"),
        TransactionTypeEnum.DEFECT_SCRAP: ("defect", "scrap", "불량 폐기"),
        TransactionTypeEnum.SUPPLIER_RETURN: ("defect", "return", "불량 반품"),
        TransactionTypeEnum.DISASSEMBLE: ("defect", "rework_defective", "재작업"),
    }[transaction_type]
    return (
        domain,
        action,
        label,
        actor_name,
        actor_id,
        logs[0].department,
        logs[0].notes,
    )


def _record_batch_workflows(
    db: Session,
    *,
    operation: InventoryOperation,
    batch: IoBatch,
) -> None:
    operation_svc._record_effect(
        db,
        operation=operation,
        effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
        subject_type="IoBatch",
        subject_id=batch.batch_id,
        role="EXECUTION_STATUS",
        before_state={"status": None},
        after_state={"status": batch.status},
    )
    request_query = db.query(StockRequest).filter(
        or_(
            StockRequest.operation_batch_id == batch.batch_id,
            StockRequest.request_id == batch.stock_request_id,
        )
    )
    requests = _locked(request_query).all()
    if batch.stock_request_id is not None and not any(
        request.request_id == batch.stock_request_id for request in requests
    ):
        raise LegacyCancellationAdoptionError(INCOMPLETE_LEGACY_EFFECT_MESSAGE)
    for request in requests:
        if request.status != StockRequestStatusEnum.COMPLETED:
            raise LegacyCancellationAdoptionError(INCOMPLETE_LEGACY_EFFECT_MESSAGE)
        operation_svc._record_effect(
            db,
            operation=operation,
            effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
            subject_type="StockRequest",
            subject_id=request.request_id,
            role="REQUEST_STATUS",
            before_state={"status": None},
            after_state={"status": request.status.value},
        )


def _record_shipping_workflows(
    db: Session,
    *,
    operation: InventoryOperation,
    request: ShippingRequest,
    logs: list[TransactionLog],
) -> None:
    if request.status != ShippingRequestStatusEnum.PICKED_UP:
        raise LegacyCancellationAdoptionError(INCOMPLETE_LEGACY_EFFECT_MESSAGE)
    operation_svc._record_effect(
        db,
        operation=operation,
        effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
        subject_type="ShippingRequest",
        subject_id=request.request_id,
        role="PICKUP_STATUS",
        before_state={"status": ShippingRequestStatusEnum.PREPARED.value},
        after_state={"status": request.status.value},
    )
    allocations = _locked(
        db.query(ShippingAllocation).filter(
            ShippingAllocation.request_id == request.request_id,
            ShippingAllocation.status == "CONSUMED",
        )
    ).all()
    if allocations:
        logged_by_item: dict[uuid.UUID, int] = {}
        for log in logs:
            logged_by_item[log.item_id] = logged_by_item.get(log.item_id, 0) + abs(
                int(log.quantity_change or 0)
            )
        allocated_by_item: dict[uuid.UUID, int] = {}
        for allocation in allocations:
            allocated_by_item[allocation.item_id] = allocated_by_item.get(
                allocation.item_id, 0
            ) + int(allocation.quantity or 0)
        if logged_by_item != allocated_by_item:
            raise LegacyCancellationAdoptionError(INCOMPLETE_LEGACY_EFFECT_MESSAGE)
    for allocation in allocations:
        operation_svc._record_effect(
            db,
            operation=operation,
            effect_kind=InventoryOperationEffectKindEnum.ALLOCATION,
            subject_type="ShippingAllocation",
            subject_id=allocation.allocation_id,
            role="CONSUME",
            before_state={"status": "RESERVED"},
            after_state={"status": allocation.status},
        )


def adopt_and_cancel(
    db: Session,
    *,
    selected_log_id: uuid.UUID,
    canceller: Employee,
    reason: str,
    now: datetime,
) -> LegacyCancellationAdoption:
    """검증·편입·공통 역전을 호출자의 한 트랜잭션 안에서 수행한다."""
    selected, logs, scope, batch, shipping_request = _scope_logs(db, selected_log_id)
    if any(
        not cancellation_svc.is_same_kst_week(source_log.created_at, now)
        for source_log in logs
    ):
        raise cancellation_svc.CancellationNotAllowed(
            cancellation_svc.PREVIOUS_WEEK_MESSAGE
        )
    defect_movements = _validate_scope(db, logs, batch=batch)
    metadata = _operation_metadata(
        logs,
        batch=batch,
        shipping_request=shipping_request,
    )
    operation = operation_svc._adopt_legacy_business_operation(
        db,
        domain=metadata[0],
        action=metadata[1],
        display_label=metadata[2],
        actor_name=metadata[3],
        actor_employee_id=metadata[4],
        department=metadata[5],
        reason=metadata[6],
        idempotency_key=f"legacy-cancel-source:{scope}",
        effective_at=max(log.created_at for log in logs),
        adopted_at=now,
    )
    for source_log in logs:
        operation_svc._attach_transaction(source_log, operation, _role_for(source_log))
        for movement in defect_movements[source_log.log_id]:
            operation_svc._record_defect_movement(
                db,
                operation=operation,
                record_id=movement.record_id,
                item_id=movement.item_id,
                department=movement.department,
                movement_type=movement.movement_type,
                quantity_delta=movement.quantity_delta,
                role=movement.role,
                actor_name=metadata[3],
                actor_employee_id=metadata[4],
            )
    if batch is not None:
        _record_batch_workflows(db, operation=operation, batch=batch)
    if shipping_request is not None:
        _record_shipping_workflows(
            db,
            operation=operation,
            request=shipping_request,
            logs=logs,
        )
    db.flush()

    preview = cancellation_svc.preview_cancellation(
        db,
        operation.operation_id,
        now=now,
    )
    if not preview.can_cancel:
        if preview.reason_code is not None:
            raise cancellation_svc.WorkflowCancellationConflict(
                preview.reason_code,
                preview.blockers[0],
            )
        raise cancellation_svc.CancellationNotAllowed(preview.blockers[0])
    cancellation = cancellation_svc.cancel_operation(
        db,
        operation_id=operation.operation_id,
        canceller=canceller,
        reason=reason,
        plan_hash=preview.plan_hash,
        now=now,
    )
    return LegacyCancellationAdoption(
        original=operation,
        cancellation=cancellation,
    )
