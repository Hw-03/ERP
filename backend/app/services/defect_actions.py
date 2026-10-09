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
    InventoryOperation,
    InventoryOperationRoleEnum,
    LocationStatusEnum,
    TransactionLog,
    TransactionTypeEnum,
    Item,
)
from app.services import inv_effect
from app.services import inventory as inventory_svc
from app.services import defect_records as defect_records_svc
from app.services import inventory_operations as operation_svc
from app.services import stock_availability
from app.services.department_work_policy import validate_active_department_cells
from app.services._tx import transactional
from app.services.inv_transfer import department_for_item, lock_items_for_department_routing

SUBMISSION_NAMESPACE = uuid.UUID("2242e165-5e07-5fd4-a138-47a031a7e46b")


def new_submission_id(client_request_id: Optional[str] = None) -> uuid.UUID:
    """구형 격리 재시도는 같은 제출 ID를 만들고 새 작업은 독립 ID를 만든다."""
    return uuid.uuid5(SUBMISSION_NAMESPACE, client_request_id) if client_request_id else uuid.uuid4()


@dataclass(frozen=True)
class BulkUnquarantineLine:
    """정상 복귀 다건 요청의 제출 시점 기록 스냅샷."""

    record_id: uuid.UUID
    item_id: uuid.UUID
    department: DepartmentEnum
    quantity: Decimal


@dataclass(frozen=True)
class BulkQuarantineLine:
    """한 번에 확정할 정상 재고 격리 라인."""

    item_id: uuid.UUID
    quantity: Decimal
    source: str
    target_department: DepartmentEnum
    source_department: Optional[DepartmentEnum]
    reason_category: Optional[str]
    reason_memo: Optional[str]
    client_request_id: Optional[str]
    management_category: str
    reason_category_id: Optional[uuid.UUID] = None
    submission_id: Optional[uuid.UUID] = None


def _validate_quarantine_source(
    item: Item, source: str, target_dept: DepartmentEnum, source_dept: Optional[DepartmentEnum],
) -> None:
    """Use the same physical source contract for single and bulk preflight."""
    if source == "production":
        expected_dept = department_for_item(item)
        if source_dept != expected_dept or target_dept != expected_dept:
            raise ValueError("생산 출처 불량 등록의 출발·격리 부서는 품목코드 기준 부서와 같아야 합니다.")
    elif source == "warehouse":
        if source_dept is not None or target_dept != DepartmentEnum.WAREHOUSE:
            raise ValueError("창고 출처 불량 등록은 source_dept 없이 격리 부서가 창고여야 합니다.")
    else:
        raise ValueError("불량 등록 출처는 창고 또는 생산 부서여야 합니다.")


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
    management_category: str = "DEFECT",
    reason_category_id: Optional[uuid.UUID] = None,
    submission_id: Optional[uuid.UUID] = None,
) -> Inventory:
    """재고 격리와 원장 기록을 하나의 업무 트랜잭션으로 확정한다."""
    with transactional(db):
        submission_id = submission_id or new_submission_id(client_request_id)
        item = lock_items_for_department_routing(db, [item_id]).get(item_id)
        if item is None:
            raise ValueError(f"품목을 찾을 수 없습니다: {item_id}")
        _validate_quarantine_source(item, source, target_dept, source_dept)
        validate_active_department_cells(db, [(source, source_dept), ("defective", target_dept)])
        operation = operation_svc.create_business_operation(
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
        inv = inventory_svc.get_or_create_inventory(db, item_id)
        qty_before = inv.quantity or Decimal("0")
        cells_before = inv_effect.snapshot_cells(db, item_id)

        inventory_svc.mark_defective(
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
        inv = inventory_svc.get_or_create_inventory(db, item_id)
        record = defect_records_svc.create_record(
            db,
            item_id=item_id,
            department=target_dept,
            quantity=qty,
            actor_employee_id=actor.employee_id,
            actor_name=actor.name,
            reason_category=reason_category,
            reason_category_id=reason_category_id,
            memo=reason_memo,
            management_category=management_category,
        )
        log = operation_svc.attach_transaction(
            TransactionLog(
                item_id=item_id,
                transaction_type=TransactionTypeEnum.MARK_DEFECTIVE,
                quantity_change=Decimal("0"),
                transfer_qty=qty,
                quantity_before=qty_before,
                quantity_after=inv.quantity,
                produced_by=actor.name,
                producer_employee_id=actor.employee_id,
                notes=f"격리: {source} → {target_dept.value}",
                reason_category=reason_category,
                reason_category_id=reason_category_id,
                submission_id=submission_id,
                reason_memo=reason_memo or None,
                client_request_id=client_request_id,
                department=target_dept.value,
                defect_quarantine_record_id=record.record_id,
                **inv_effect.capture_log_stock_snapshot(db, item_id, cells_before),
            ),
            operation,
            InventoryOperationRoleEnum.PRIMARY,
        )
        db.add(log)
        operation_svc.record_defect_movement(
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


def quarantine_inventory_bulk(
    db: Session,
    *,
    lines: Sequence[BulkQuarantineLine],
    actor: Employee,
) -> list[Inventory]:
    """복수 격리를 하나의 트랜잭션으로 처리해 일부 라인만 반영되는 일을 막는다."""
    if not lines:
        raise ValueError("격리할 품목을 한 개 이상 선택하세요.")
    item_ids = [line.item_id for line in lines]
    if len(item_ids) != len(set(item_ids)):
        raise ValueError("같은 품목을 한 요청에 중복해 격리할 수 없습니다.")

    inventories: list[Inventory] = []
    submission_id = uuid.uuid4()
    with transactional(db):
        locked_items = lock_items_for_department_routing(db, item_ids)
        errors: list[str] = []
        valid_sources: list[tuple[BulkQuarantineLine, Item, stock_availability.AvailabilityCell]] = []
        for line in lines:
            item = locked_items.get(line.item_id)
            try:
                if item is None:
                    raise ValueError("품목을 찾을 수 없습니다.")
                _validate_quarantine_source(item, line.source, line.target_department, line.source_department)
                validate_active_department_cells(db, [
                    (line.source, line.source_department), ("defective", line.target_department),
                ])
                cell = (stock_availability.AvailabilityCell.warehouse(line.item_id) if line.source == "warehouse"
                        else stock_availability.AvailabilityCell.location(line.item_id, line.source_department))
                valid_sources.append((line, item, cell))
            except ValueError as exc:
                errors.append(f"{item.item_name if item else line.item_id}: {exc}")
        figures = stock_availability.figures_for_cells(db, [cell for _, _, cell in valid_sources])
        for line, item, cell in valid_sources:
            if line.quantity <= 0:
                errors.append(f"{item.item_name}: 격리 수량은 0보다 커야 합니다.")
            elif line.quantity > figures[cell].available:
                errors.append(f"{item.item_name}: 가용 재고 부족 (현재 {figures[cell].available}, 요청 {line.quantity}).")
        if errors:
            raise ValueError("\n".join(errors))
        for line in sorted(lines, key=lambda current: str(current.item_id)):
            inventories.append(
                quarantine_inventory(
                    db,
                    item_id=line.item_id,
                    qty=line.quantity,
                    source=line.source,
                    target_dept=line.target_department,
                    source_dept=line.source_department,
                    actor=actor,
                    reason_category=line.reason_category,
                    reason_category_id=line.reason_category_id,
                    submission_id=line.submission_id or submission_id,
                    reason_memo=line.reason_memo,
                    client_request_id=line.client_request_id,
                    management_category=line.management_category,
                )
            )
    return inventories


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
    reason_category_id: Optional[uuid.UUID] = None,
    submission_id: Optional[uuid.UUID] = None,
    operation: Optional[InventoryOperation] = None,
) -> Inventory:
    """단건은 독립 작업으로, 일괄 호출은 전달된 동일 작업으로 원건을 연결한다."""
    submission_id = submission_id or uuid.uuid4()
    with transactional(db):
        record = defect_records_svc.get_record_for_action(
            db,
            record_id=record_id,
            item_id=item_id,
            department=dept,
        )
        if record is not None:
            defect_records_svc.ensure_available(db, record, qty)
        operation = operation or operation_svc.create_business_operation(
            db,
            domain="defect",
            action="restore",
            display_label="정상 복귀",
            actor_name=actor.name,
            actor_employee_id=actor.employee_id,
            department=dept.value,
            reason=reason_memo,
        )
        inv = inventory_svc.get_or_create_inventory(db, item_id)
        qty_before = inv.quantity or Decimal("0")
        cells_before = inv_effect.snapshot_cells(db, item_id)

        inventory_svc.unmark_defective(
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
            defect_records_svc.decrement_record(db, record, qty)
        inv = inventory_svc.get_or_create_inventory(db, item_id)
        log = operation_svc.attach_transaction(
            TransactionLog(
                item_id=item_id,
                transaction_type=TransactionTypeEnum.UNMARK_DEFECTIVE,
                quantity_change=Decimal("0"),
                transfer_qty=qty,
                quantity_before=qty_before,
                quantity_after=inv.quantity,
                produced_by=actor.name,
                producer_employee_id=actor.employee_id,
                notes=f"정상 복귀: {dept.value}",
                reason_category=reason_category,
                reason_category_id=reason_category_id,
                submission_id=submission_id,
                reason_memo=reason_memo or None,
                department=dept.value,
                defect_quarantine_record_id=(record.record_id if record else None),
                **inv_effect.capture_log_stock_snapshot(db, item_id, cells_before),
            ),
            operation,
            InventoryOperationRoleEnum.PRIMARY,
        )
        db.add(log)
        if record is not None:
            operation_svc.record_defect_movement(
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
    reason_category_id: Optional[uuid.UUID] = None,
    submission_id: Optional[uuid.UUID] = None,
) -> None:
    """선택 기록을 모두 검증한 뒤 기존 단건 복귀 계약을 원자적으로 반복한다."""
    submission_id = submission_id or uuid.uuid4()
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
        by_record_id = {line.record_id: line for line in lines}
        errors: list[str] = []
        for record_id in sorted(record_ids, key=str):
            line = by_record_id[record_id]
            try:
                record = defect_records_svc.get_record_for_action(
                    db, record_id=record_id, item_id=line.item_id, department=line.department,
                )
                if record is None:
                    raise ValueError("선택한 격리 기록을 찾을 수 없습니다.")
                pending = defect_records_svc.pending_quantity(db, record.record_id)
                if pending > 0:
                    raise ValueError("처리 대기 또는 예약 중인 격리 기록은 정상 복귀할 수 없습니다.")
                remaining = Decimal(str(record.remaining_quantity or 0))
                quantity = Decimal(str(line.quantity))
                if quantity <= 0 or remaining != quantity:
                    raise ValueError("선택 후 격리 기록 수량이 변경되었습니다. 목록을 새로고침해 주세요.")
            except ValueError as exc:
                errors.append(f"선택 기록 {record_ids.index(record_id) + 1}: {exc}")
        if errors:
            raise ValueError("\n".join(errors))
        operation = operation_svc.create_business_operation(
            db, domain="defect", action="restore", display_label="정상 복귀",
            actor_name=actor.name, actor_employee_id=actor.employee_id,
            department=lines[0].department.value, reason=reason_memo,
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
                reason_category_id=reason_category_id,
                submission_id=submission_id,
                reason_memo=reason_memo,
                operation=operation,
            )
