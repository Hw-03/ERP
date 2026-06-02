"""inv_calc.py — 재고 집계 계산 함수.

inv_base.py 에만 의존. 역방향 import 없음.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    Inventory,
    InventoryLocation,
    LocationStatusEnum,
)


def production_total(db: Session, item_id: uuid.UUID) -> Decimal:
    """모든 부서 PRODUCTION 합계."""
    val = (
        db.query(func.coalesce(func.sum(InventoryLocation.quantity), 0))
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .scalar()
    )
    return Decimal(str(val or 0))


def defective_total(db: Session, item_id: uuid.UUID) -> Decimal:
    """모든 부서 DEFECTIVE 합계."""
    val = (
        db.query(func.coalesce(func.sum(InventoryLocation.quantity), 0))
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
        )
        .scalar()
    )
    return Decimal(str(val or 0))


def available(inv: Inventory, *, db: Optional[Session] = None) -> Decimal:
    """Available = warehouse_qty + production_total − pending. 불량 제외.

    db가 주어지면 production_total을 실시간 계산. 없으면 warehouse만 (예약 검사용 안전 기준).
    """
    pending = inv.pending_quantity or Decimal("0")
    wh = inv.warehouse_qty or Decimal("0")
    prod = production_total(db, inv.item_id) if db is not None else Decimal("0")
    return wh + prod - pending


def _sync_total(db: Session, inv: Inventory) -> None:
    """Inventory.quantity 를 warehouse + 모든 location 합으로 동기화.

    이미 잠긴(또는 로드된) Inventory 객체를 직접 받아 재조회 없이 갱신한다.
    SessionLocal 이 autoflush=False 이므로 SUM 쿼리 전에 명시적으로 flush 한다.
    """
    db.flush()
    loc_sum = (
        db.query(func.coalesce(func.sum(InventoryLocation.quantity), 0))
        .filter(InventoryLocation.item_id == inv.item_id)
        .scalar()
    ) or 0
    inv.quantity = (inv.warehouse_qty or Decimal("0")) + Decimal(str(loc_sum))
