"""Inventory service helpers: reserve (Available->Pending), release,
consume_pending (Pending->Total 차감) — used by Queue confirm flow."""

from __future__ import annotations

from decimal import Decimal
from typing import Optional
import uuid

from sqlalchemy.orm import Session

from app.models import Employee, Inventory


def get_or_create_inventory(db: Session, item_id: uuid.UUID) -> Inventory:
    inv = db.query(Inventory).filter(Inventory.item_id == item_id).first()
    if inv is None:
        inv = Inventory(
            item_id=item_id,
            quantity=Decimal("0"),
            pending_quantity=Decimal("0"),
        )
        db.add(inv)
        db.flush()
    return inv


def available(inv: Inventory) -> Decimal:
    """Available = Total - Pending."""
    pending = inv.pending_quantity or Decimal("0")
    return (inv.quantity or Decimal("0")) - pending


def reserve(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    *,
    employee: Optional[Employee] = None,
    employee_name: Optional[str] = None,
) -> Inventory:
    """Move `qty` from Available into Pending. Raises ValueError if
    insufficient Available."""
    if qty <= 0:
        raise ValueError("예약 수량은 0보다 커야 합니다.")

    inv = get_or_create_inventory(db, item_id)
    if available(inv) < qty:
        raise ValueError(
            f"가용 재고 부족 (Available {available(inv)}, 요청 {qty})."
        )
    inv.pending_quantity = (inv.pending_quantity or Decimal("0")) + qty
    if employee is not None:
        inv.last_reserver_employee_id = employee.employee_id
        inv.last_reserver_name = employee.name
    elif employee_name:
        inv.last_reserver_employee_id = None
        inv.last_reserver_name = employee_name
    return inv


def release(db: Session, item_id: uuid.UUID, qty: Decimal) -> Inventory:
    """Return `qty` from Pending back to Available (e.g., batch cancel)."""
    if qty <= 0:
        raise ValueError("해제 수량은 0보다 커야 합니다.")

    inv = get_or_create_inventory(db, item_id)
    current = inv.pending_quantity or Decimal("0")
    if current < qty:
        raise ValueError(
            f"예약된 수량이 부족합니다 (Pending {current}, 요청 {qty})."
        )
    inv.pending_quantity = current - qty
    return inv


def consume_pending(db: Session, item_id: uuid.UUID, qty: Decimal) -> Inventory:
    """Batch confirm: remove `qty` from both Pending and Total. Raises
    ValueError if invariants are violated."""
    if qty <= 0:
        raise ValueError("차감 수량은 0보다 커야 합니다.")

    inv = get_or_create_inventory(db, item_id)
    pending = inv.pending_quantity or Decimal("0")
    total = inv.quantity or Decimal("0")
    if pending < qty:
        raise ValueError(
            f"예약 수량이 부족합니다 (Pending {pending}, 차감 요청 {qty})."
        )
    if total < qty:
        raise ValueError(
            f"실재고가 부족합니다 (Total {total}, 차감 요청 {qty})."
        )
    inv.pending_quantity = pending - qty
    inv.quantity = total - qty
    return inv


def receive_confirmed(db: Session, item_id: uuid.UUID, qty: Decimal) -> Inventory:
    """Batch confirm (incoming side): increment Total (no Pending effect)."""
    if qty <= 0:
        raise ValueError("입고 수량은 0보다 커야 합니다.")
    inv = get_or_create_inventory(db, item_id)
    inv.quantity = (inv.quantity or Decimal("0")) + qty
    return inv
