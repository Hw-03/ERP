"""재고 수식 단일 소스.

기존에 여러 라우터가 각자 `wh + prod - pending` 같은 식을 직접 계산하던 것을
여기로 모은다. 신규 코드는 이 모듈만 사용한다.

## 용어 정의

- `warehouse_qty`: 창고 재고 (Inventory.warehouse_qty)
- `production_total`: 부서별 PRODUCTION 버킷 합계 (InventoryLocation)
- `defective_total`: 부서별 DEFECTIVE 버킷 합계
- `pending`: 창고 OUT 예약 (Inventory.pending_quantity, warehouse 전용 호환 필드)
- `production_pending`: PRODUCTION 위치 OUT 예약 합계 (InventoryLocation.pending_quantity)
- `defective_pending`: DEFECTIVE 위치 OUT 예약 합계 (InventoryLocation.pending_quantity)
- `department_pending`: production_pending + defective_pending
- `total`: warehouse + production + defective (Inventory.quantity 와 같아야 함)
- `shipping_reserved`: 활성 출하 배정 합계
- `available`: (warehouse - pending) + (production_total - production_pending)
  - shipping_reserved
  — 불량 버킷과 defective_pending은 제외한 UI "재고 가용"
- `warehouse_available`: warehouse - pending - warehouse shipping_reserved
  — 창고에서 실제 소비 가능한 분량.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
import uuid
from typing import Iterable

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Inventory, InventoryLocation, LocationStatusEnum
from app.repositories import inventory_repository
from app.services import stock_availability


_D0 = Decimal("0")


def _as_decimal(value: object) -> Decimal:
    """DB 숫자 타입 차이와 무관하게 StockFigures의 Decimal 계약을 지킨다."""
    return Decimal(str(value or 0))


@dataclass(frozen=True)
class StockFigures:
    """한 품목의 재고 수치 모음. 모든 값 Decimal."""

    warehouse_qty: Decimal = _D0
    production_total: Decimal = _D0
    defective_total: Decimal = _D0
    pending: Decimal = _D0
    production_pending: Decimal = _D0
    defective_pending: Decimal = _D0
    shipping_reserved: Decimal = _D0
    warehouse_shipping_reserved: Decimal = _D0

    @property
    def total(self) -> Decimal:
        """wh + prod + defect. Inventory.quantity 불변식과 일치해야 함."""
        return self.warehouse_qty + self.production_total + self.defective_total

    @property
    def available(self) -> Decimal:
        """UI 가용 재고: 창고·생산 실재고에서 각 source 예약을 차감. 불량 제외."""
        return (
            self.warehouse_qty
            - self.pending
            + self.production_total
            - self.production_pending
            - self.shipping_reserved
        )

    @property
    def department_pending(self) -> Decimal:
        return self.production_pending + self.defective_pending

    @property
    def warehouse_available(self) -> Decimal:
        """창고 소비 가능분: 물리 재고에서 요청·출하 예약을 차감."""
        return (
            self.warehouse_qty
            - self.pending
            - self.warehouse_shipping_reserved
        )


# ---------------------------------------------------------------------------
# 단건 계산
# ---------------------------------------------------------------------------
def compute_for(db: Session, item_id: uuid.UUID) -> StockFigures:
    """단일 품목의 재고 수치. 쿼리 2회 (Inventory + InventoryLocation GROUP BY)."""
    inv = inventory_repository.get(db, item_id)
    wh = _as_decimal(inv.warehouse_qty if inv else None)
    pending = _as_decimal(inv.pending_quantity if inv else None)

    rows = (
        db.query(
            InventoryLocation.status,
            func.coalesce(func.sum(InventoryLocation.quantity), 0),
            func.coalesce(func.sum(InventoryLocation.pending_quantity), 0),
        )
        .filter(InventoryLocation.item_id == item_id)
        .group_by(InventoryLocation.status)
        .all()
    )
    prod = _D0
    defect = _D0
    prod_pending = _D0
    defect_pending = _D0
    for status, summed, pending_sum in rows:
        val = Decimal(str(summed or 0))
        pending_val = Decimal(str(pending_sum or 0))
        if status == LocationStatusEnum.PRODUCTION:
            prod = val
            prod_pending = pending_val
        elif status == LocationStatusEnum.DEFECTIVE:
            defect = val
            defect_pending = pending_val

    reserved_by_item, warehouse_reserved_by_item = (
        stock_availability.bulk_reserved_by_item(db, [item_id])
    )
    return StockFigures(
        warehouse_qty=wh,
        production_total=prod,
        defective_total=defect,
        pending=pending,
        production_pending=prod_pending,
        defective_pending=defect_pending,
        shipping_reserved=reserved_by_item.get(item_id, _D0),
        warehouse_shipping_reserved=warehouse_reserved_by_item.get(item_id, _D0),
    )


# ---------------------------------------------------------------------------
# 다건 bulk 계산 (items list / inventory list 용)
# ---------------------------------------------------------------------------
def bulk_compute(db: Session, item_ids: Iterable[uuid.UUID]) -> dict[uuid.UUID, StockFigures]:
    """여러 품목을 3개 bulk 쿼리로 계산한다(출하 예약 + Inventory + Location).

    item_ids 에 없는 건 dict 에 포함하지 않는다. 호출측에서 default 처리.
    """
    ids = list(item_ids)
    if not ids:
        return {}
    shipping_reserved_by_id, warehouse_shipping_reserved_by_id = (
        stock_availability.bulk_reserved_by_item(db, ids)
    )

    # 1) Inventory IN
    invs = {
        inv.item_id: inv
        for inv in db.query(Inventory).filter(Inventory.item_id.in_(ids)).all()
    }

    # 2) InventoryLocation GROUP BY item_id, status
    agg_rows = (
        db.query(
            InventoryLocation.item_id,
            InventoryLocation.status,
            func.coalesce(func.sum(InventoryLocation.quantity), 0),
            func.coalesce(func.sum(InventoryLocation.pending_quantity), 0),
        )
        .filter(InventoryLocation.item_id.in_(ids))
        .group_by(InventoryLocation.item_id, InventoryLocation.status)
        .all()
    )
    prod_by_id: dict[uuid.UUID, Decimal] = {}
    defect_by_id: dict[uuid.UUID, Decimal] = {}
    prod_pending_by_id: dict[uuid.UUID, Decimal] = {}
    defect_pending_by_id: dict[uuid.UUID, Decimal] = {}
    for iid, status, summed, pending_sum in agg_rows:
        val = Decimal(str(summed or 0))
        pending_val = Decimal(str(pending_sum or 0))
        if status == LocationStatusEnum.PRODUCTION:
            prod_by_id[iid] = val
            prod_pending_by_id[iid] = pending_val
        elif status == LocationStatusEnum.DEFECTIVE:
            defect_by_id[iid] = val
            defect_pending_by_id[iid] = pending_val

    result: dict[uuid.UUID, StockFigures] = {}
    for iid in ids:
        inv = invs.get(iid)
        result[iid] = StockFigures(
            warehouse_qty=_as_decimal(inv.warehouse_qty if inv else None),
            production_total=_as_decimal(prod_by_id.get(iid, _D0)),
            defective_total=_as_decimal(defect_by_id.get(iid, _D0)),
            pending=_as_decimal(inv.pending_quantity if inv else None),
            production_pending=_as_decimal(prod_pending_by_id.get(iid, _D0)),
            defective_pending=_as_decimal(defect_pending_by_id.get(iid, _D0)),
            shipping_reserved=shipping_reserved_by_id.get(iid, _D0),
            warehouse_shipping_reserved=warehouse_shipping_reserved_by_id.get(iid, _D0),
        )
    return result
