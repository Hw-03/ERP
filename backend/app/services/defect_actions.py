"""불량 격리·복귀 업무 명령의 트랜잭션 경계."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Optional, Sequence
import uuid

from sqlalchemy import update as sa_update
from sqlalchemy.orm import Session

from app.models import (
    DepartmentEnum,
    Employee,
    Inventory,
    InventoryLocation,
    InventoryOperationRoleEnum,
    LocationStatusEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.repositories import item_repository
from app.services import inv_effect
from app.services import inventory as inventory_svc
from app.services import defect_records as defect_records_svc
from app.services import inventory_operations as operation_svc
from app.services import warehouse_map as warehouse_map_svc
from app.services._tx import transactional


@dataclass(frozen=True)
class BulkUnquarantineLine:
    """정상 복귀 다건 요청의 제출 시점 기록 스냅샷."""

    record_id: uuid.UUID
    item_id: uuid.UUID
    department: DepartmentEnum
    quantity: Decimal


def quarantine_inventory(
    db: Session,
    *,
    item_id: uuid.UUID,
    qty: Decimal,
    source: str,
    target_dept: DepartmentEnum,
    source_dept: Optional[DepartmentEnum],
    actor: Employee,
    reason_category: Optional[str],
    reason_memo: Optional[str],
    client_request_id: Optional[str],
) -> Inventory:
    """재고 격리와 원장 기록을 하나의 업무 트랜잭션으로 확정한다."""
    with transactional(db):
        if item_id not in item_repository.lock_active_many(db, [item_id]):
            raise ValueError(f"품목을 찾을 수 없습니다: {item_id}")
        operation = operation_svc._create_business_operation(
            db,
            domain="defect",
            action="quarantine",
            display_label="불량 격리",
            actor_name=actor.name,
            actor_employee_id=actor.employee_id,
            department=target_dept.value,
            reason=reason_memo,
            idempotency_key=(
                f"defect:quarantine:{client_request_id}"
                if client_request_id
                else None
            ),
        )
        inv = inventory_svc._get_or_create_inventory(db, item_id)
        qty_before = inv.quantity or Decimal("0")
        cells_before = inv_effect._snapshot_cells(db, item_id)

        inventory_svc._mark_defective(
            db,
            item_id,
            qty,
            inventory_svc.DefectSource(
                kind=source,
                target_dept=target_dept,
                source_dept=source_dept,
            ),
        )
        db.execute(
            sa_update(InventoryLocation)
            .where(InventoryLocation.item_id == item_id)
            .where(InventoryLocation.department == target_dept)
            .where(InventoryLocation.status == LocationStatusEnum.DEFECTIVE)
            .values(defective_at=datetime.utcnow())
            .execution_options(synchronize_session=False)
        )
        db.flush()
        inv = inventory_svc._get_or_create_inventory(db, item_id)
        record = defect_records_svc._create_record(
            db,
            item_id=item_id,
            department=target_dept,
            quantity=qty,
            actor_employee_id=actor.employee_id,
            actor_name=actor.name,
            reason_category=reason_category,
            memo=reason_memo,
        )
        log = operation_svc._attach_transaction(
            TransactionLog(
                item_id=item_id,
                transaction_type=TransactionTypeEnum.MARK_DEFECTIVE,
                quantity_change=Decimal("0"),
                quantity_before=qty_before,
                quantity_after=inv.quantity,
                produced_by=actor.name,
                producer_employee_id=actor.employee_id,
                notes=f"격리: {source} → {target_dept.value}",
                reason_category=reason_category,
                reason_memo=reason_memo or None,
                client_request_id=client_request_id,
                department=target_dept.value,
                defect_quarantine_record_id=record.record_id,
                **inv_effect._capture_log_stock_snapshot(db, item_id, cells_before),
            ),
            operation,
            InventoryOperationRoleEnum.PRIMARY,
        )
        db.add(log)
        operation_svc._record_defect_movement(
            db,
            operation=operation,
            record_id=record.record_id,
            item_id=item_id,
            department=target_dept.value,
            movement_type="QUARANTINE",
            quantity_delta=qty,
            role="QUARANTINE",
            actor_name=actor.name,
            actor_employee_id=actor.employee_id,
        )
    return inv


def unquarantine_inventory(
    db: Session,
    *,
    record_id: Optional[uuid.UUID] = None,
    item_id: uuid.UUID,
    qty: Decimal,
    dept: DepartmentEnum,
    actor: Employee,
    reason_category: Optional[str],
    reason_memo: Optional[str],
) -> Inventory:
    """정상 복귀와 원장 기록을 하나의 업무 트랜잭션으로 확정한다."""
    with transactional(db):
        warehouse_map_svc.lock_warehouse_map_rows(
            db,
            item_ids=[item_id],
            include_boxes_for_item_ids=True,
            include_zones_for_item_ids=True,
        )
        record = defect_records_svc._get_record_for_action(
            db,
            record_id=record_id,
            item_id=item_id,
            department=dept,
        )
        if record is not None:
            defect_records_svc._ensure_available(db, record, qty)
        operation = operation_svc._create_business_operation(
            db,
            domain="defect",
            action="restore",
            display_label="정상 복귀",
            actor_name=actor.name,
            actor_employee_id=actor.employee_id,
            department=dept.value,
            reason=reason_memo,
        )
        inv = inventory_svc._get_or_create_inventory(db, item_id)
        qty_before = inv.quantity or Decimal("0")
        cells_before = inv_effect._snapshot_cells(db, item_id)

        inventory_svc._unmark_defective(
            db,
            item_id,
            qty,
            dept,
            inventory_svc.ReasonContext(
                category=reason_category or "",
                memo=reason_memo or "",
                actor=actor.name,
            ),
        )
        db.flush()
        if record is not None:
            defect_records_svc._decrement_record(db, record, qty)
        inv = inventory_svc._get_or_create_inventory(db, item_id)
        log = operation_svc._attach_transaction(
            TransactionLog(
                item_id=item_id,
                transaction_type=TransactionTypeEnum.UNMARK_DEFECTIVE,
                quantity_change=Decimal("0"),
                quantity_before=qty_before,
                quantity_after=inv.quantity,
                produced_by=actor.name,
                producer_employee_id=actor.employee_id,
                notes=f"정상 복귀: {dept.value}",
                reason_category=reason_category,
                reason_memo=reason_memo or None,
                department=dept.value,
                defect_quarantine_record_id=(record.record_id if record else None),
                **inv_effect._capture_log_stock_snapshot(db, item_id, cells_before),
            ),
            operation,
            InventoryOperationRoleEnum.PRIMARY,
        )
        db.add(log)
        if record is not None:
            operation_svc._record_defect_movement(
                db,
                operation=operation,
                record_id=record.record_id,
                item_id=item_id,
                department=dept.value,
                movement_type="RESTORE",
                quantity_delta=-qty,
                role="RESTORE",
                actor_name=actor.name,
                actor_employee_id=actor.employee_id,
            )
    return inv


def unquarantine_inventory_bulk(
    db: Session,
    *,
    lines: Sequence[BulkUnquarantineLine],
    actor: Employee,
    reason_category: Optional[str],
    reason_memo: Optional[str],
) -> None:
    """선택 기록을 모두 검증한 뒤 기존 단건 복귀 계약을 원자적으로 반복한다."""
    if not lines:
        raise ValueError("정상 복귀할 격리 기록이 비어 있습니다.")

    record_ids = [line.record_id for line in lines]
    if len(record_ids) != len(set(record_ids)):
        raise ValueError("중복된 격리 기록은 함께 처리할 수 없습니다.")
    if len({line.item_id for line in lines}) != 1:
        raise ValueError("정상 복귀는 같은 품목의 격리 기록만 함께 처리할 수 있습니다.")
    if len({line.department for line in lines}) != 1:
        raise ValueError("정상 복귀는 같은 부서의 격리 기록만 함께 처리할 수 있습니다.")

    with transactional(db):
        warehouse_map_svc.lock_warehouse_map_rows(
            db,
            item_ids={line.item_id for line in lines},
            include_boxes_for_item_ids=True,
            include_zones_for_item_ids=True,
        )
        by_record_id = {line.record_id: line for line in lines}
        for record_id in sorted(record_ids, key=str):
            line = by_record_id[record_id]
            record = defect_records_svc._get_record_for_action(
                db,
                record_id=record_id,
                item_id=line.item_id,
                department=line.department,
            )
            if record is None:
                raise ValueError("선택한 격리 기록을 찾을 수 없습니다.")
            pending = defect_records_svc._pending_quantity(db, record.record_id)
            if pending > 0:
                raise ValueError("처리 대기 또는 예약 중인 격리 기록은 정상 복귀할 수 없습니다.")
            remaining = Decimal(str(record.remaining_quantity or 0))
            quantity = Decimal(str(line.quantity))
            if quantity <= 0 or remaining != quantity:
                raise ValueError(
                    "선택 후 격리 기록 수량이 변경되었습니다. 목록을 새로고침해 주세요."
                )

        for line in lines:
            unquarantine_inventory(
                db,
                record_id=line.record_id,
                item_id=line.item_id,
                qty=line.quantity,
                dept=line.department,
                actor=actor,
                reason_category=reason_category,
                reason_memo=reason_memo,
            )
