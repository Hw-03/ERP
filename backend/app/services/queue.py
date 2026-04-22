"""Queue batch service: 예약(Pending)/확정(Commit) 2단계 워크플로.

Batch types
    PRODUCE      — 상위 품목 생산. BOM 자동 확장 → 자식 품목이 OUT 라인(예약),
                   상위 품목은 confirm 시 IN으로 증가.
    DISASSEMBLE  — 상위 품목 분해. 상위가 OUT(차감), 자식이 IN(선별 입고)이
                   되며 included=False인 라인은 폐기/분실로 분기 가능.
    RETURN       — 상위 품목 반품 입고. 상위가 IN이며, BOM 라인을 호출해
                   구성품 중 누락된 것을 LOSS로 전환.

Lifecycle
    1. create_batch(...)  → status=OPEN, BOM 라인 자동 생성, OUT 라인은
       inventory.pending_quantity에 즉시 예약(Available→Pending 이동).
    2. override_line_quantity / toggle_line / add_line / remove_line — OPEN
       상태에서 자유 수정. Pending 증감이 즉시 반영됨.
    3. confirm_batch(...)  → Pending 정리 + Total 실제 차감(OUT), IN 라인
       증가, SCRAP/LOSS 로그 생성, variance_logs 기록. TransactionLog에
       batch_id 심음.
    4. cancel_batch(...)   → Pending 해제 (Available 복구), status=CANCELLED.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Iterable, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models import (
    Employee,
    Inventory,
    Item,
    LossLog,
    QueueBatch,
    QueueBatchStatusEnum,
    QueueBatchTypeEnum,
    QueueLine,
    QueueLineDirectionEnum,
    ScrapLog,
    TransactionLog,
    TransactionTypeEnum,
    VarianceLog,
)
from app.services import inventory as inv_svc
from app.services.bom import direct_children, explode_bom, merge_requirements


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


def create_batch(
    db: Session,
    *,
    batch_type: QueueBatchTypeEnum,
    parent_item_id: Optional[uuid.UUID] = None,
    parent_quantity: Optional[Decimal] = None,
    owner: Optional[Employee] = None,
    owner_name: Optional[str] = None,
    reference_no: Optional[str] = None,
    notes: Optional[str] = None,
    load_bom: bool = True,
) -> QueueBatch:
    """Create an OPEN batch. If load_bom=True, auto-populate lines from BOM
    and apply Pending reservations for OUT lines."""
    batch = QueueBatch(
        batch_type=batch_type,
        status=QueueBatchStatusEnum.OPEN,
        parent_item_id=parent_item_id,
        parent_quantity=parent_quantity,
        owner_employee_id=owner.employee_id if owner else None,
        owner_name=owner.name if owner else owner_name,
        reference_no=reference_no,
        notes=notes,
    )
    db.add(batch)
    db.flush()

    if load_bom and parent_item_id is not None and parent_quantity is not None:
        _seed_lines_from_bom(db, batch, parent_item_id, parent_quantity)

    return batch


def _seed_lines_from_bom(
    db: Session,
    batch: QueueBatch,
    parent_item_id: uuid.UUID,
    parent_quantity: Decimal,
) -> None:
    """Populate initial QueueLines based on batch_type.

    PRODUCE:     depth-expanded leaves as OUT, with Pending reservation.
    DISASSEMBLE: parent as OUT (Pending), immediate children as IN (no reserve).
    RETURN:      parent as IN (no reserve), immediate children listed as IN
                 (user will mark missing ones as LOSS via toggle_line).
    """
    if batch.batch_type == QueueBatchTypeEnum.PRODUCE:
        pairs = merge_requirements(explode_bom(db, parent_item_id, parent_quantity))
        for item_id, qty in pairs.items():
            _add_and_reserve(db, batch, item_id, qty, QueueLineDirectionEnum.OUT, bom_expected=qty)
        # Parent goes IN upon confirm
        _add_line_no_reserve(
            db, batch, parent_item_id, parent_quantity, QueueLineDirectionEnum.IN
        )

    elif batch.batch_type == QueueBatchTypeEnum.DISASSEMBLE:
        # Parent comes out of inventory
        _add_and_reserve(db, batch, parent_item_id, parent_quantity, QueueLineDirectionEnum.OUT, bom_expected=parent_quantity)
        for child_id, each_qty in direct_children(db, parent_item_id):
            qty = each_qty * parent_quantity
            _add_line_no_reserve(db, batch, child_id, qty, QueueLineDirectionEnum.IN, bom_expected=qty)

    elif batch.batch_type == QueueBatchTypeEnum.RETURN:
        _add_line_no_reserve(db, batch, parent_item_id, parent_quantity, QueueLineDirectionEnum.IN, bom_expected=parent_quantity)
        for child_id, each_qty in direct_children(db, parent_item_id):
            qty = each_qty * parent_quantity
            _add_line_no_reserve(db, batch, child_id, qty, QueueLineDirectionEnum.IN, bom_expected=qty)


def _add_and_reserve(
    db: Session,
    batch: QueueBatch,
    item_id: uuid.UUID,
    qty: Decimal,
    direction: QueueLineDirectionEnum,
    *,
    bom_expected: Optional[Decimal] = None,
) -> QueueLine:
    inv_svc.reserve(
        db, item_id, qty,
        employee_name=batch.owner_name,
    )
    line = QueueLine(
        batch_id=batch.batch_id,
        item_id=item_id,
        direction=direction,
        quantity=qty,
        bom_expected=bom_expected,
        included=True,
    )
    db.add(line)
    db.flush()
    return line


def _add_line_no_reserve(
    db: Session,
    batch: QueueBatch,
    item_id: uuid.UUID,
    qty: Decimal,
    direction: QueueLineDirectionEnum,
    *,
    bom_expected: Optional[Decimal] = None,
) -> QueueLine:
    line = QueueLine(
        batch_id=batch.batch_id,
        item_id=item_id,
        direction=direction,
        quantity=qty,
        bom_expected=bom_expected,
        included=True,
    )
    db.add(line)
    db.flush()
    return line


# ---------------------------------------------------------------------------
# Mutate (OPEN only)
# ---------------------------------------------------------------------------


def _ensure_open(batch: QueueBatch) -> None:
    if batch.status != QueueBatchStatusEnum.OPEN:
        raise ValueError(f"배치가 OPEN 상태가 아닙니다 (현재: {batch.status.value}).")


def override_line_quantity(
    db: Session, line: QueueLine, new_qty: Decimal
) -> QueueLine:
    """Change quantity of an OPEN line. For OUT lines this adjusts Pending
    accordingly (delta can be positive or negative)."""
    if new_qty < 0:
        raise ValueError("수량은 0 이상이어야 합니다.")
    batch = line.batch
    _ensure_open(batch)

    if line.direction == QueueLineDirectionEnum.OUT and line.included:
        delta = new_qty - line.quantity
        if delta > 0:
            inv_svc.reserve(db, line.item_id, delta, employee_name=batch.owner_name)
        elif delta < 0:
            inv_svc.release(db, line.item_id, -delta)
    line.quantity = new_qty
    return line


def toggle_line(
    db: Session, line: QueueLine, *, included: bool, new_direction: Optional[QueueLineDirectionEnum] = None
) -> QueueLine:
    """Enable/disable a line, optionally re-classifying its direction (e.g.
    mark as LOSS/SCRAP instead of IN). Pending is adjusted for OUT lines."""
    _ensure_open(line.batch)
    prev_included = line.included
    prev_direction = line.direction
    batch = line.batch

    # Compute effective pending delta: Pending exists only for OUT+included.
    prev_reserves = prev_included and prev_direction == QueueLineDirectionEnum.OUT
    new_direction_final = new_direction if new_direction is not None else line.direction
    new_reserves = included and new_direction_final == QueueLineDirectionEnum.OUT

    if prev_reserves and not new_reserves:
        inv_svc.release(db, line.item_id, line.quantity)
    elif not prev_reserves and new_reserves:
        inv_svc.reserve(db, line.item_id, line.quantity, employee_name=batch.owner_name)

    line.included = included
    if new_direction is not None:
        line.direction = new_direction
    return line


def add_line(
    db: Session,
    batch: QueueBatch,
    *,
    item_id: uuid.UUID,
    direction: QueueLineDirectionEnum,
    quantity: Decimal,
    reason: Optional[str] = None,
    process_stage: Optional[str] = None,
) -> QueueLine:
    _ensure_open(batch)
    if quantity <= 0:
        raise ValueError("수량은 0보다 커야 합니다.")

    if direction == QueueLineDirectionEnum.OUT:
        return _add_and_reserve(db, batch, item_id, quantity, direction, bom_expected=None)
    line = _add_line_no_reserve(db, batch, item_id, quantity, direction, bom_expected=None)
    line.reason = reason
    line.process_stage = process_stage
    return line


def remove_line(db: Session, line: QueueLine) -> None:
    _ensure_open(line.batch)
    if line.included and line.direction == QueueLineDirectionEnum.OUT:
        inv_svc.release(db, line.item_id, line.quantity)
    db.delete(line)


# ---------------------------------------------------------------------------
# Confirm
# ---------------------------------------------------------------------------


def confirm_batch(db: Session, batch: QueueBatch) -> QueueBatch:
    _ensure_open(batch)

    # Apply each line in the right order: OUT (consume pending) first, then
    # SCRAP/LOSS (use already-reserved quantities), then IN.
    included_lines = [ln for ln in batch.lines if ln.included]
    ordered = (
        [ln for ln in included_lines if ln.direction == QueueLineDirectionEnum.OUT]
        + [ln for ln in included_lines if ln.direction == QueueLineDirectionEnum.SCRAP]
        + [ln for ln in included_lines if ln.direction == QueueLineDirectionEnum.LOSS]
        + [ln for ln in included_lines if ln.direction == QueueLineDirectionEnum.IN]
    )

    for line in ordered:
        item = db.query(Item).filter(Item.item_id == line.item_id).first()
        if item is None:
            raise ValueError(f"품목을 찾을 수 없습니다 (line {line.line_id}).")

        if line.direction == QueueLineDirectionEnum.OUT:
            inv = inv_svc.consume_pending(db, line.item_id, line.quantity)
            db.add(
                TransactionLog(
                    item_id=line.item_id,
                    transaction_type=_tx_type_for(batch),
                    quantity_change=-line.quantity,
                    quantity_before=(inv.quantity or Decimal("0")) + line.quantity,
                    quantity_after=inv.quantity,
                    reference_no=batch.reference_no,
                    produced_by=batch.owner_name,
                    notes=_tx_note(batch, line),
                    batch_id=batch.batch_id,
                )
            )
        elif line.direction == QueueLineDirectionEnum.SCRAP:
            # Scrap consumes the item from Total (pending already reserved)
            inv = inv_svc.consume_pending(db, line.item_id, line.quantity)
            db.add(
                ScrapLog(
                    item_id=line.item_id,
                    quantity=line.quantity,
                    process_stage=line.process_stage,
                    reason=line.reason or "(사유 없음)",
                    batch_id=batch.batch_id,
                    operator=batch.owner_name,
                )
            )
            db.add(
                TransactionLog(
                    item_id=line.item_id,
                    transaction_type=TransactionTypeEnum.SCRAP,
                    quantity_change=-line.quantity,
                    quantity_before=(inv.quantity or Decimal("0")) + line.quantity,
                    quantity_after=inv.quantity,
                    reference_no=batch.reference_no,
                    produced_by=batch.owner_name,
                    notes=line.reason or "SCRAP",
                    batch_id=batch.batch_id,
                )
            )
        elif line.direction == QueueLineDirectionEnum.LOSS:
            # Loss: simply record (no inventory movement, nothing was received)
            db.add(
                LossLog(
                    item_id=line.item_id,
                    quantity=line.quantity,
                    batch_id=batch.batch_id,
                    reason=line.reason or "(반품 누락)",
                    operator=batch.owner_name,
                )
            )
            db.add(
                TransactionLog(
                    item_id=line.item_id,
                    transaction_type=TransactionTypeEnum.LOSS,
                    quantity_change=Decimal("0"),
                    quantity_before=None,
                    quantity_after=None,
                    reference_no=batch.reference_no,
                    produced_by=batch.owner_name,
                    notes=line.reason or "LOSS",
                    batch_id=batch.batch_id,
                )
            )
        elif line.direction == QueueLineDirectionEnum.IN:
            # PRODUCE 결과는 카테고리 매핑 부서의 PRODUCTION으로, 그 외(분해/반품)는 창고로
            if batch.batch_type == QueueBatchTypeEnum.PRODUCE:
                target_dept = inv_svc.dept_for_category(item.category)
                if target_dept is not None:
                    inv = inv_svc.receive_confirmed(
                        db, line.item_id, line.quantity,
                        bucket="production", dept=target_dept,
                    )
                else:
                    inv = inv_svc.receive_confirmed(db, line.item_id, line.quantity)
            else:
                inv = inv_svc.receive_confirmed(db, line.item_id, line.quantity)
            db.add(
                TransactionLog(
                    item_id=line.item_id,
                    transaction_type=_tx_type_for(batch, incoming=True),
                    quantity_change=line.quantity,
                    quantity_before=(inv.quantity or Decimal("0")) - line.quantity,
                    quantity_after=inv.quantity,
                    reference_no=batch.reference_no,
                    produced_by=batch.owner_name,
                    notes=_tx_note(batch, line),
                    batch_id=batch.batch_id,
                )
            )

    # Release Pending for excluded-OUT lines (they reserved but won't run)
    for line in batch.lines:
        if not line.included and line.direction == QueueLineDirectionEnum.OUT:
            inv_svc.release(db, line.item_id, line.quantity)

    # Variance log: compare bom_expected vs actual quantity processed (included only)
    for line in included_lines:
        if line.bom_expected is not None and line.bom_expected != line.quantity:
            db.add(
                VarianceLog(
                    batch_id=batch.batch_id,
                    item_id=line.item_id,
                    bom_expected=line.bom_expected,
                    actual_used=line.quantity,
                    diff=line.quantity - line.bom_expected,
                    note=f"direction={line.direction.value}, included=True",
                )
            )
    for line in batch.lines:
        if not line.included and line.bom_expected is not None:
            db.add(
                VarianceLog(
                    batch_id=batch.batch_id,
                    item_id=line.item_id,
                    bom_expected=line.bom_expected,
                    actual_used=Decimal("0"),
                    diff=-line.bom_expected,
                    note="excluded from batch",
                )
            )

    batch.status = QueueBatchStatusEnum.CONFIRMED
    batch.confirmed_at = datetime.utcnow()
    return batch


def cancel_batch(db: Session, batch: QueueBatch) -> QueueBatch:
    _ensure_open(batch)
    for line in batch.lines:
        if line.included and line.direction == QueueLineDirectionEnum.OUT:
            inv_svc.release(db, line.item_id, line.quantity)
    batch.status = QueueBatchStatusEnum.CANCELLED
    batch.cancelled_at = datetime.utcnow()
    return batch


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _tx_type_for(batch: QueueBatch, *, incoming: bool = False) -> TransactionTypeEnum:
    if batch.batch_type == QueueBatchTypeEnum.PRODUCE:
        return TransactionTypeEnum.PRODUCE if incoming else TransactionTypeEnum.BACKFLUSH
    if batch.batch_type == QueueBatchTypeEnum.DISASSEMBLE:
        return TransactionTypeEnum.DISASSEMBLE if incoming else TransactionTypeEnum.DISASSEMBLE
    if batch.batch_type == QueueBatchTypeEnum.RETURN:
        return TransactionTypeEnum.RETURN if incoming else TransactionTypeEnum.RETURN
    return TransactionTypeEnum.ADJUST


def _tx_note(batch: QueueBatch, line: QueueLine) -> str:
    parent = batch.parent_item_id
    return (
        f"[{batch.batch_type.value}] batch={batch.batch_id}"
        + (f" parent={parent}" if parent else "")
        + (f" reason={line.reason}" if line.reason else "")
    )
