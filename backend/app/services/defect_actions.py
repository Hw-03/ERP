"""불량 격리·복귀 업무 명령의 트랜잭션 경계."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional
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
from app.services import inv_effect
from app.services import inventory as inventory_svc
from app.services import defect_records as defect_records_svc
from app.services import inventory_operations as operation_svc
from app.services._tx import transactional


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
