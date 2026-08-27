"""공통 재고 작업을 별도 역전 작업으로 취소하는 계획기와 실행기."""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.database import _is_sqlite
from app.models import (
    Employee,
    DefectInventoryMovement,
    DefectQuarantineRecord,
    Inventory,
    InventoryLocation,
    InventoryOperation,
    InventoryOperationEffect,
    InventoryOperationEffectKindEnum,
    InventoryOperationKindEnum,
    LocationStatusEnum,
    HandoverDoc,
    HandoverStatusEnum,
    IoBatch,
    ShippingAllocation,
    ShippingRequest,
    ShippingRequestStatusEnum,
    StockRequest,
    StockRequestStatusEnum,
    StockRequestLine,
    TransactionEditLog,
    TransactionLog,
    TransactionTypeEnum,
    WarehouseBoxItem,
)
from app.services import inv_effect
from app.services import inventory as inventory_svc
from app.services import inventory_operations as operation_svc
from app.services import defect_records as defect_records_svc
from app.services._tx import transactional
from app.services.inv_calc import _sync_total


KST = ZoneInfo("Asia/Seoul")
PREVIOUS_WEEK_MESSAGE = (
    "지난 주 내역은 취소할 수 없습니다. "
    "현재 재고를 맞추려면 입출고 탭에서 낱개 입고·출고를 진행해 주세요."
)
INSUFFICIENT_STOCK_MESSAGE = (
    "현재 재고가 부족하여 취소할 수 없습니다. "
    "현재 재고를 확인한 뒤 다시 시도해 주세요."
)
CORRECTED_OPERATION_MESSAGE = "수량 보정된 거래를 포함한 원작업은 취소할 수 없습니다."


class CancellationError(ValueError):
    """작업 취소 도메인 오류의 공통 기반."""


class CancellationOperationNotFound(CancellationError):
    """취소 대상 작업이 존재하지 않음."""


class CancellationPlanChanged(CancellationError):
    """미리보기 이후 현재 재고·예약·업무 상태가 달라짐."""


class CancellationNotAllowed(CancellationError):
    """현재 불변식으로는 전체 작업을 안전하게 역전할 수 없음."""


@dataclass(frozen=True)
class CancellationCell:
    """취소가 한 재고 셀에 적용할 합산 역전 수량."""

    item_id: str
    scope: str
    department: Optional[str]
    status: Optional[str]
    box_id: Optional[str]
    quantity_change: int
    current_quantity: int
    reserved_quantity: int
    quantity_after: int


@dataclass(frozen=True)
class CancellationDefectRecord:
    """취소가 건별 불량 잔량에 적용할 합산 역전 수량."""

    record_id: str
    item_id: str
    department: str
    quantity_change: int
    current_quantity: int
    reserved_quantity: int
    quantity_after: int


@dataclass(frozen=True)
class CancellationEffectSubject:
    """취소가 닫거나 해제할 연결 업무·배정 상태."""

    effect_id: str
    effect_kind: str
    subject_type: str
    subject_id: str
    role: str
    current_state: dict
    target_state: dict


@dataclass(frozen=True)
class CancellationPlan:
    """미리보기와 실행이 공유하는 불변 취소 계획."""

    operation_id: str
    plan_hash: str
    can_cancel: bool
    blockers: tuple[str, ...]
    cells: tuple[CancellationCell, ...]
    defect_records: tuple[CancellationDefectRecord, ...]
    effects: tuple[CancellationEffectSubject, ...]


def _as_kst(value: datetime) -> datetime:
    """DB의 UTC-naive 시각과 aware 시각을 KST로 통일한다."""
    aware = value.replace(tzinfo=UTC) if value.tzinfo is None else value
    return aware.astimezone(KST)


def _week_start(value: datetime) -> date:
    local_date = _as_kst(value).date()
    return local_date - timedelta(days=local_date.weekday())


def is_same_kst_week(left: datetime, right: datetime) -> bool:
    """두 시각이 KST 월요일 기준 같은 주인지 판정한다."""
    return _week_start(left) == _week_start(right)


def normalized_effect_for_cancellation(log: TransactionLog) -> list[dict]:
    """신규 원장의 셀 효과를 검증 가능한 목록으로 정규화한다."""
    effect = log.inventory_effect
    if (
        (log.reference_no or "").startswith("defect-disassemble:")
        and log.transaction_type == TransactionTypeEnum.DEFECT_SCRAP
        and log.notes == "[rework:scrap_child]"
        and effect == []
    ):
        return []
    if effect is None:
        raise CancellationNotAllowed("재고 효과 기록이 없어 취소할 수 없습니다.")
    if not isinstance(effect, list):
        raise CancellationNotAllowed("재고 효과 기록 형식이 올바르지 않습니다.")
    normalized: list[dict] = []
    for cell in effect:
        if not isinstance(cell, dict):
            raise CancellationNotAllowed("재고 효과 기록 형식이 올바르지 않습니다.")
        try:
            delta = int(cell["delta"])
        except (KeyError, TypeError, ValueError) as exc:
            raise CancellationNotAllowed("재고 효과 기록 형식이 올바르지 않습니다.") from exc
        scope = cell.get("scope")
        if scope == "warehouse":
            normalized.append({"scope": scope, "delta": delta})
        elif scope == "warehouse_box" and cell.get("box_id"):
            normalized.append(
                {"scope": scope, "box_id": str(cell["box_id"]), "delta": delta}
            )
        elif scope == "location" and cell.get("department") and cell.get("status"):
            try:
                status = LocationStatusEnum(cell["status"]).value
            except ValueError as exc:
                raise CancellationNotAllowed("재고 효과 기록 형식이 올바르지 않습니다.") from exc
            normalized.append(
                {
                    "scope": scope,
                    "department": str(cell["department"]),
                    "status": status,
                    "delta": delta,
                }
            )
        else:
            raise CancellationNotAllowed("재고 효과 기록 형식이 올바르지 않습니다.")
    return normalized


def _cell_key(item_id: uuid.UUID, cell: dict) -> tuple[str, str, str, str, str]:
    return (
        str(item_id),
        str(cell["scope"]),
        str(cell.get("department") or ""),
        str(cell.get("status") or ""),
        str(cell.get("box_id") or ""),
    )


def _current_cell(
    db: Session,
    key: tuple[str, str, str, str, str],
) -> tuple[int, int]:
    item_id, scope, department, status, box_id = key
    if scope == "warehouse":
        inventory = db.query(Inventory).filter(Inventory.item_id == item_id).one_or_none()
        if inventory is None:
            raise CancellationNotAllowed("재고 레코드를 찾을 수 없습니다.")
        return int(inventory.warehouse_qty or 0), int(inventory.pending_quantity or 0)
    if scope == "warehouse_box":
        box_item = (
            db.query(WarehouseBoxItem)
            .filter(
                WarehouseBoxItem.item_id == item_id,
                WarehouseBoxItem.box_id == box_id,
            )
            .one_or_none()
        )
        if box_item is None:
            raise CancellationNotAllowed("취소 원복할 박스 항목을 찾을 수 없습니다.")
        return int(box_item.quantity or 0), 0
    location = (
        db.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == department,
            InventoryLocation.status == LocationStatusEnum(status),
        )
        .one_or_none()
    )
    if location is None:
        return 0, 0
    return int(location.quantity or 0), int(location.pending_quantity or 0)


def _plan_payload(
    operation: InventoryOperation,
    logs: list[TransactionLog],
    cells: tuple[CancellationCell, ...],
    defect_records: tuple[CancellationDefectRecord, ...],
    effects: tuple[CancellationEffectSubject, ...],
    blockers: tuple[str, ...],
) -> dict:
    return {
        "operation_id": str(operation.operation_id),
        "effective_at": operation.effective_at.isoformat(),
        "log_ids": [str(log.log_id) for log in logs],
        "cells": [asdict(cell) for cell in cells],
        "defect_records": [asdict(record) for record in defect_records],
        "effects": [asdict(effect) for effect in effects],
        "blockers": list(blockers),
    }


def _workflow_subject_state(
    db: Session,
    subject_type: str,
    subject_id: str,
) -> tuple[dict, dict]:
    """연결 업무의 현재 상태와 취소 후 최종 상태를 반환한다."""
    if subject_type == "HandoverDoc":
        subject = db.get(HandoverDoc, subject_id)
        if subject is None:
            raise CancellationNotAllowed("연결된 인수인계 업무를 찾을 수 없습니다.")
        return (
            {"status": subject.status.value},
            {"status": HandoverStatusEnum.CANCELLED.value},
        )
    if subject_type == "ShippingRequest":
        subject = db.get(ShippingRequest, subject_id)
        if subject is None:
            raise CancellationNotAllowed("연결된 출하 업무를 찾을 수 없습니다.")
        return (
            {"status": subject.status.value},
            {"status": ShippingRequestStatusEnum.CANCELLED.value},
        )
    if subject_type == "StockRequest":
        subject = db.get(StockRequest, subject_id)
        if subject is None:
            raise CancellationNotAllowed("연결된 입출고 요청을 찾을 수 없습니다.")
        return (
            {"status": subject.status.value},
            {"status": StockRequestStatusEnum.CANCELLED.value},
        )
    if subject_type == "IoBatch":
        subject = db.get(IoBatch, subject_id)
        if subject is None:
            raise CancellationNotAllowed("연결된 입출고 작업을 찾을 수 없습니다.")
        return {"status": subject.status}, {"status": "cancelled"}
    raise CancellationNotAllowed("지원하지 않는 연결 업무 효과가 포함되어 있습니다.")


def _effect_subject_plan(
    db: Session,
    effect: InventoryOperationEffect,
) -> CancellationEffectSubject:
    if effect.effect_kind == InventoryOperationEffectKindEnum.WORKFLOW:
        current, target = _workflow_subject_state(
            db,
            effect.subject_type,
            effect.subject_id,
        )
    elif effect.effect_kind == InventoryOperationEffectKindEnum.ALLOCATION:
        allocation = db.get(ShippingAllocation, effect.subject_id)
        if allocation is None:
            raise CancellationNotAllowed("연결된 출하 배정을 찾을 수 없습니다.")
        current = {"status": allocation.status}
        target = {"status": "RELEASED"}
    else:
        raise CancellationNotAllowed("아직 취소를 지원하지 않는 작업 효과가 포함되어 있습니다.")
    return CancellationEffectSubject(
        effect_id=str(effect.effect_id),
        effect_kind=effect.effect_kind.value,
        subject_type=effect.subject_type,
        subject_id=effect.subject_id,
        role=effect.role,
        current_state=current,
        target_state=target,
    )


def preview_cancellation(
    db: Session,
    operation_id: uuid.UUID,
    *,
    now: Optional[datetime] = None,
) -> CancellationPlan:
    """현재 상태를 읽어 실행과 동일한 합산 역전 계획을 만든다."""
    operation = db.get(InventoryOperation, operation_id)
    if operation is None:
        raise CancellationOperationNotFound("취소할 작업을 찾을 수 없습니다.")

    blockers: list[str] = []
    if operation.kind != InventoryOperationKindEnum.BUSINESS:
        blockers.append("취소 작업은 다시 취소할 수 없습니다.")
    existing_reversal = (
        db.query(InventoryOperation.operation_id)
        .filter(InventoryOperation.reverses_operation_id == operation.operation_id)
        .first()
    )
    if existing_reversal is not None:
        blockers.append("이미 취소된 작업입니다.")

    resolved_now = now or datetime.utcnow()
    if not is_same_kst_week(operation.effective_at, resolved_now):
        blockers.append(PREVIOUS_WEEK_MESSAGE)

    logs = (
        db.query(TransactionLog)
        .filter(TransactionLog.operation_id == operation.operation_id)
        .order_by(TransactionLog.created_at.asc(), TransactionLog.log_id.asc())
        .all()
    )
    log_ids = [log.log_id for log in logs]
    if log_ids and (
        db.query(TransactionEditLog.edit_id)
        .filter(
            TransactionEditLog.original_log_id.in_(log_ids),
            TransactionEditLog.correction_log_id.isnot(None),
        )
        .first()
        is not None
    ):
        blockers.append(CORRECTED_OPERATION_MESSAGE)
    movements = (
        db.query(DefectInventoryMovement)
        .filter(DefectInventoryMovement.operation_id == operation.operation_id)
        .order_by(
            DefectInventoryMovement.created_at.asc(),
            DefectInventoryMovement.movement_id.asc(),
        )
        .all()
    )
    operation_effects = (
        db.query(InventoryOperationEffect)
        .filter(InventoryOperationEffect.operation_id == operation.operation_id)
        .order_by(
            InventoryOperationEffect.created_at.asc(),
            InventoryOperationEffect.effect_id.asc(),
        )
        .all()
    )
    changes: dict[tuple[str, str, str, str, str], int] = {}
    try:
        for log in logs:
            for effect in normalized_effect_for_cancellation(log):
                key = _cell_key(log.item_id, effect)
                changes[key] = changes.get(key, 0) - int(effect["delta"])
    except CancellationNotAllowed as exc:
        blockers.append(str(exc))

    cell_plans: list[CancellationCell] = []
    for key, quantity_change in sorted(changes.items()):
        current, reserved = _current_cell(db, key)
        after = current + quantity_change
        if after < reserved:
            blockers.append(INSUFFICIENT_STOCK_MESSAGE)
        item_id, scope, department, status, box_id = key
        cell_plans.append(
            CancellationCell(
                item_id=item_id,
                scope=scope,
                department=department or None,
                status=status or None,
                box_id=box_id or None,
                quantity_change=quantity_change,
                current_quantity=current,
                reserved_quantity=reserved,
                quantity_after=after,
            )
        )

    movement_changes: dict[str, int] = {}
    for movement in movements:
        record_key = str(movement.record_id)
        movement_changes[record_key] = (
            movement_changes.get(record_key, 0) - int(movement.quantity_delta or 0)
        )
    defect_plans: list[CancellationDefectRecord] = []
    for record_id, quantity_change in sorted(movement_changes.items()):
        record = db.get(DefectQuarantineRecord, record_id)
        if record is None:
            blockers.append("취소할 불량 원장 기록을 찾을 수 없습니다.")
            continue
        current = int(record.remaining_quantity or 0)
        reserved = int(defect_records_svc._pending_quantity(db, record.record_id))
        after = current + quantity_change
        if after < reserved or after < 0 or after > int(record.original_quantity or 0):
            blockers.append("불량 원장 잔량이 맞지 않아 취소할 수 없습니다.")
        defect_plans.append(
            CancellationDefectRecord(
                record_id=str(record.record_id),
                item_id=str(record.item_id),
                department=str(record.department),
                quantity_change=quantity_change,
                current_quantity=current,
                reserved_quantity=reserved,
                quantity_after=after,
            )
        )

    affected_defect_locations = {
        (plan.item_id, plan.department) for plan in defect_plans
    }
    for item_id, department in sorted(affected_defect_locations):
        physical = (
            db.query(InventoryLocation.quantity)
            .filter(
                InventoryLocation.item_id == item_id,
                InventoryLocation.department == department,
                InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
            )
            .scalar()
        )
        ledger_total = sum(
            int(quantity or 0)
            for (quantity,) in db.query(DefectQuarantineRecord.remaining_quantity)
            .filter(
                DefectQuarantineRecord.item_id == item_id,
                DefectQuarantineRecord.department == department,
            )
            .all()
        )
        if int(physical or 0) != ledger_total:
            blockers.append("불량 원장과 실제 불량 재고가 일치하지 않아 취소할 수 없습니다.")

    effect_plans: list[CancellationEffectSubject] = []
    for effect in operation_effects:
        try:
            effect_plan = _effect_subject_plan(db, effect)
        except CancellationNotAllowed as exc:
            blockers.append(str(exc))
            continue
        expected_status = (effect.after_state or {}).get("status")
        current_status = effect_plan.current_state.get("status")
        if expected_status is not None and current_status != expected_status:
            blockers.append("연결 업무 상태가 변경되어 이 작업만 취소할 수 없습니다.")
        effect_plans.append(effect_plan)

    unique_blockers = tuple(dict.fromkeys(blockers))
    cells = tuple(cell_plans)
    defect_records = tuple(defect_plans)
    effects = tuple(effect_plans)
    payload = _plan_payload(
        operation,
        logs,
        cells,
        defect_records,
        effects,
        unique_blockers,
    )
    plan_hash = hashlib.sha256(
        json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode(
            "utf-8"
        )
    ).hexdigest()
    return CancellationPlan(
        operation_id=str(operation.operation_id),
        plan_hash=plan_hash,
        can_cancel=not unique_blockers,
        blockers=unique_blockers,
        cells=cells,
        defect_records=defect_records,
        effects=effects,
    )


def _lock_original_operation(db: Session, operation_id: uuid.UUID) -> InventoryOperation:
    query = db.query(InventoryOperation).filter(
        InventoryOperation.operation_id == operation_id
    )
    if not _is_sqlite:
        query = query.with_for_update()
    operation = query.one_or_none()
    if operation is None:
        raise CancellationOperationNotFound("취소할 작업을 찾을 수 없습니다.")
    return operation


def _reverse_log(
    db: Session,
    *,
    original: TransactionLog,
    cancellation: InventoryOperation,
    canceller: Employee,
    reason: str,
) -> TransactionLog:
    before_cells = inv_effect._snapshot_cells(db, original.item_id)
    before_inventory = db.query(Inventory).filter(Inventory.item_id == original.item_id).one()
    quantity_before = int(before_inventory.quantity or 0)
    effect = normalized_effect_for_cancellation(original)
    if effect:
        inv_effect._apply_effect_reverse(db, original.item_id, effect)
        _sync_total(db, before_inventory)
        db.flush()
    after_inventory = db.query(Inventory).filter(Inventory.item_id == original.item_id).one()
    reversal_log = TransactionLog(
        item_id=original.item_id,
        transaction_type=original.transaction_type,
        quantity_change=-int(original.quantity_change or 0),
        quantity_before=quantity_before,
        quantity_after=int(after_inventory.quantity or 0),
        transfer_qty=(
            -int(original.transfer_qty) if original.transfer_qty is not None else None
        ),
        reference_no=original.reference_no,
        produced_by=canceller.name,
        producer_employee_id=canceller.employee_id,
        notes=f"{original.notes or original.transaction_type.value} 취소: {reason}",
        reason_category=original.reason_category,
        reason_memo=reason,
        operation_batch_id=original.operation_batch_id,
        operation_line_id=original.operation_line_id,
        operation_id=cancellation.operation_id,
        operation_role=original.operation_role,
        reverses_log_id=original.log_id,
        shipping_request_id=original.shipping_request_id,
        shipping_phase=original.shipping_phase,
        department=original.department,
        defect_quarantine_record_id=original.defect_quarantine_record_id,
        **inv_effect._capture_log_stock_snapshot(db, original.item_id, before_cells),
    )
    db.add(reversal_log)
    db.flush()
    return reversal_log


def _reverse_defect_movement(
    db: Session,
    *,
    original: DefectInventoryMovement,
    cancellation: InventoryOperation,
    canceller: Employee,
) -> DefectInventoryMovement:
    """원 이동을 수정하지 않고 반대 부호 이동과 건별 잔량을 함께 적용한다."""
    query = db.query(DefectQuarantineRecord).filter(
        DefectQuarantineRecord.record_id == original.record_id
    )
    if not _is_sqlite:
        query = query.with_for_update()
    record = query.one_or_none()
    if record is None:
        raise CancellationNotAllowed("취소할 불량 원장 기록을 찾을 수 없습니다.")
    quantity_change = -int(original.quantity_delta or 0)
    quantity_after = int(record.remaining_quantity or 0) + quantity_change
    if quantity_after < 0 or quantity_after > int(record.original_quantity or 0):
        raise CancellationNotAllowed("불량 원장 잔량이 맞지 않아 취소할 수 없습니다.")
    pending = int(defect_records_svc._pending_quantity(db, record.record_id))
    if quantity_after < pending:
        raise CancellationNotAllowed("불량 원장 예약을 침범하여 취소할 수 없습니다.")
    record.remaining_quantity = quantity_after
    movement = DefectInventoryMovement(
        operation_id=cancellation.operation_id,
        record_id=original.record_id,
        item_id=original.item_id,
        department=original.department,
        movement_type=f"CANCEL_{original.movement_type}",
        quantity_delta=quantity_change,
        role=original.role,
        actor_employee_id=canceller.employee_id,
        actor_name=canceller.name,
        effective_at=cancellation.effective_at,
        reverses_movement_id=original.movement_id,
    )
    db.add(movement)
    db.flush()
    return movement


def _close_workflow_subject(
    db: Session,
    *,
    subject_type: str,
    subject_id: str,
    cancellation: InventoryOperation,
    canceller: Employee,
) -> tuple[dict, dict]:
    before, target = _workflow_subject_state(db, subject_type, subject_id)
    if subject_type == "HandoverDoc":
        subject = db.get(HandoverDoc, subject_id)
        subject.status = HandoverStatusEnum.CANCELLED
        subject.cancelled_by_employee_id = canceller.employee_id
        subject.cancelled_by_name = canceller.name
        subject.cancelled_at = cancellation.effective_at
    elif subject_type == "ShippingRequest":
        subject = db.get(ShippingRequest, subject_id)
        subject.status = ShippingRequestStatusEnum.CANCELLED
        subject.cancelled_by_employee_id = canceller.employee_id
        subject.cancelled_by_name = canceller.name
        subject.cancelled_at = cancellation.effective_at
    elif subject_type == "StockRequest":
        subject = db.get(StockRequest, subject_id)
        subject.status = StockRequestStatusEnum.CANCELLED
        subject.cancelled_at = cancellation.effective_at
        db.query(StockRequestLine).filter(
            StockRequestLine.request_id == subject.request_id
        ).update(
            {StockRequestLine.status: StockRequestStatusEnum.CANCELLED},
            synchronize_session=False,
        )
    else:
        subject = db.get(IoBatch, subject_id)
        subject.status = "cancelled"
        subject.updated_at = cancellation.effective_at
    return before, target


def _reverse_operation_effect(
    db: Session,
    *,
    original: InventoryOperationEffect,
    cancellation: InventoryOperation,
    canceller: Employee,
    reason: str,
) -> InventoryOperationEffect:
    """연결 업무는 최종 취소로 닫고 배정은 해제한 뒤 역전 효과를 추가한다."""
    if original.effect_kind == InventoryOperationEffectKindEnum.WORKFLOW:
        before, after = _close_workflow_subject(
            db,
            subject_type=original.subject_type,
            subject_id=original.subject_id,
            cancellation=cancellation,
            canceller=canceller,
        )
    elif original.effect_kind == InventoryOperationEffectKindEnum.ALLOCATION:
        allocation = db.get(ShippingAllocation, original.subject_id)
        if allocation is None:
            raise CancellationNotAllowed("연결된 출하 배정을 찾을 수 없습니다.")
        before = {"status": allocation.status}
        allocation.status = "RELEASED"
        allocation.released_at = cancellation.effective_at
        allocation.released_reason = reason
        after = {"status": allocation.status}
    else:
        raise CancellationNotAllowed("아직 취소를 지원하지 않는 작업 효과가 포함되어 있습니다.")
    reversal = InventoryOperationEffect(
        operation_id=cancellation.operation_id,
        effect_kind=original.effect_kind,
        subject_type=original.subject_type,
        subject_id=original.subject_id,
        role=original.role,
        before_state=before,
        after_state=after,
        reverses_effect_id=original.effect_id,
    )
    db.add(reversal)
    db.flush()
    return reversal


def _assert_plan_applied(
    db: Session,
    *,
    original: InventoryOperation,
    cancellation: InventoryOperation,
    plan: CancellationPlan,
) -> None:
    """역전 직후 원장·물리 상태가 미리보기의 최종값과 같은지 검산한다."""
    db.flush()
    for cell in plan.cells:
        current, reserved = _current_cell(
            db,
            (
                cell.item_id,
                cell.scope,
                cell.department or "",
                cell.status or "",
                cell.box_id or "",
            ),
        )
        if current != cell.quantity_after or reserved != cell.reserved_quantity:
            raise CancellationNotAllowed("취소 적용 후 재고 검산에 실패했습니다.")

    affected_defect_locations: set[tuple[str, str]] = set()
    for planned_record in plan.defect_records:
        record = db.get(DefectQuarantineRecord, planned_record.record_id)
        if record is None or int(record.remaining_quantity or 0) != planned_record.quantity_after:
            raise CancellationNotAllowed("취소 적용 후 불량 원장 검산에 실패했습니다.")
        affected_defect_locations.add(
            (planned_record.item_id, planned_record.department)
        )
    for item_id, department in affected_defect_locations:
        physical = (
            db.query(InventoryLocation.quantity)
            .filter(
                InventoryLocation.item_id == item_id,
                InventoryLocation.department == department,
                InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
            )
            .scalar()
        )
        ledger_total = sum(
            int(quantity or 0)
            for (quantity,) in db.query(DefectQuarantineRecord.remaining_quantity)
            .filter(
                DefectQuarantineRecord.item_id == item_id,
                DefectQuarantineRecord.department == department,
            )
            .all()
        )
        if int(physical or 0) != ledger_total:
            raise CancellationNotAllowed("취소 적용 후 불량 재고 검산에 실패했습니다.")

    original_logs = db.query(TransactionLog).filter(
        TransactionLog.operation_id == original.operation_id
    ).count()
    reversed_logs = db.query(TransactionLog).filter(
        TransactionLog.operation_id == cancellation.operation_id,
        TransactionLog.reverses_log_id.isnot(None),
    ).count()
    original_movements = db.query(DefectInventoryMovement).filter(
        DefectInventoryMovement.operation_id == original.operation_id
    ).count()
    reversed_movements = db.query(DefectInventoryMovement).filter(
        DefectInventoryMovement.operation_id == cancellation.operation_id,
        DefectInventoryMovement.reverses_movement_id.isnot(None),
    ).count()
    original_effects = db.query(InventoryOperationEffect).filter(
        InventoryOperationEffect.operation_id == original.operation_id
    ).count()
    reversed_effects = db.query(InventoryOperationEffect).filter(
        InventoryOperationEffect.operation_id == cancellation.operation_id,
        InventoryOperationEffect.reverses_effect_id.isnot(None),
    ).count()
    if (
        reversed_logs != original_logs
        or reversed_movements != original_movements
        or reversed_effects != original_effects
    ):
        raise CancellationNotAllowed("취소 적용 후 역전 원장 검산에 실패했습니다.")

    for effect in plan.effects:
        original_effect = db.get(InventoryOperationEffect, effect.effect_id)
        if original_effect is None:
            raise CancellationNotAllowed("취소 적용 후 업무 상태 검산에 실패했습니다.")
        current = _effect_subject_plan(db, original_effect).current_state
        if current != effect.target_state:
            raise CancellationNotAllowed("취소 적용 후 업무 상태 검산에 실패했습니다.")


def cancel_operation(
    db: Session,
    *,
    operation_id: uuid.UUID,
    canceller: Employee,
    reason: str,
    plan_hash: str,
    now: Optional[datetime] = None,
) -> InventoryOperation:
    """잠금 후 계획을 재검산하고 전체 역전 작업을 한 트랜잭션으로 확정한다."""
    with transactional(db):
        original = _lock_original_operation(db, operation_id)
        logs = (
            db.query(TransactionLog)
            .filter(TransactionLog.operation_id == original.operation_id)
            .order_by(TransactionLog.created_at.desc(), TransactionLog.log_id.desc())
            .all()
        )
        movements = (
            db.query(DefectInventoryMovement)
            .filter(DefectInventoryMovement.operation_id == original.operation_id)
            .order_by(
                DefectInventoryMovement.created_at.desc(),
                DefectInventoryMovement.movement_id.desc(),
            )
            .all()
        )
        operation_effects = (
            db.query(InventoryOperationEffect)
            .filter(InventoryOperationEffect.operation_id == original.operation_id)
            .order_by(
                InventoryOperationEffect.created_at.desc(),
                InventoryOperationEffect.effect_id.desc(),
            )
            .all()
        )
        inventory_svc.lock_inventories(db, sorted({log.item_id for log in logs}))
        current_plan = preview_cancellation(db, operation_id, now=now)
        if current_plan.plan_hash != plan_hash:
            raise CancellationPlanChanged(
                "취소 미리보기 이후 재고 또는 예약 상태가 변경되었습니다. 다시 확인해 주세요."
            )
        if not current_plan.can_cancel:
            raise CancellationNotAllowed(current_plan.blockers[0])

        cancellation = operation_svc._create_cancellation_operation(
            db,
            original=original,
            actor_name=canceller.name,
            actor_employee_id=canceller.employee_id,
            reason=reason,
            effective_at=now,
        )
        for log in logs:
            _reverse_log(
                db,
                original=log,
                cancellation=cancellation,
                canceller=canceller,
                reason=reason,
            )
        for movement in movements:
            _reverse_defect_movement(
                db,
                original=movement,
                cancellation=cancellation,
                canceller=canceller,
            )
        for effect in operation_effects:
            _reverse_operation_effect(
                db,
                original=effect,
                cancellation=cancellation,
                canceller=canceller,
                reason=reason,
            )
        _assert_plan_applied(
            db,
            original=original,
            cancellation=cancellation,
            plan=current_plan,
        )
        return cancellation
