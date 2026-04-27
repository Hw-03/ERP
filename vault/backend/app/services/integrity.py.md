---
type: code-note
project: ERP
layer: backend
source_path: backend/app/services/integrity.py
status: active
updated: 2026-04-27
source_sha: 84115743a65e
tags:
  - erp
  - backend
  - service
  - py
---

# integrity.py

> [!summary] 역할
> 라우터에서 직접 처리하기 무거운 `integrity` 비즈니스 로직과 계산 책임을 분리해 담는다.

## 원본 위치

- Source: `backend/app/services/integrity.py`
- Layer: `backend`
- Kind: `service`
- Size: `5623` bytes

## 연결

- Parent hub: [[backend/app/services/services|backend/app/services]]
- Related: [[backend/backend]]

## 읽는 포인트

- 서비스는 라우터보다 안쪽의 업무 규칙을 담는다.
- 재고 수량이나 BOM 계산은 화면 표시와 실제 거래가 일치해야 한다.

## 원본 발췌

````python
"""재고 불변식 점검 / 복구.

불변식: Inventory.quantity == Inventory.warehouse_qty + Σ InventoryLocation.quantity

이 불변식은 services/inventory 의 `_sync_total` 이 모든 재고 변경 경로에서
유지한다. 외부 스크립트나 과거 버그로 어긋난 데이터를 점검·복구하기 위한 도구.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Optional
import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Inventory, InventoryLocation, Item


_D0 = Decimal("0")


@dataclass
class InventoryMismatch:
    item_id: uuid.UUID
    item_code: Optional[str]
    item_name: Optional[str]
    erp_code: Optional[str]
    recorded_total: Decimal      # Inventory.quantity
    computed_total: Decimal      # warehouse + loc_sum (실제 합)
    warehouse_qty: Decimal
    location_sum: Decimal
    pending_quantity: Decimal

    @property
    def delta(self) -> Decimal:
        """recorded - computed. 양수면 quantity 가 과다, 음수면 과소."""
        return self.recorded_total - self.computed_total

    def to_dict(self) -> dict:
        return {
            "item_id": str(self.item_id),
            "item_code": self.item_code,
            "item_name": self.item_name,
            "erp_code": self.erp_code,
            "recorded_total": float(self.recorded_total),
            "computed_total": float(self.computed_total),
            "warehouse_qty": float(self.warehouse_qty),
            "location_sum": float(self.location_sum),
            "pending_quantity": float(self.pending_quantity),
            "delta": float(self.delta),
        }


@dataclass
class RepairReport:
    checked: int
    mismatched: int
    repaired: int
    dry_run: bool
    samples: list[dict]  # 최대 20개 샘플

    def to_dict(self) -> dict:
        return {
            "checked": self.checked,
            "mismatched": self.mismatched,
            "repaired": self.repaired,
            "dry_run": self.dry_run,
            "samples": self.samples,
        }


def _location_sum_map(db: Session) -> dict[uuid.UUID, Decimal]:
    """{item_id: Σ InventoryLocation.quantity}. 재고 location 미존재 품목은 키 없음."""
    rows = (
        db.query(
            InventoryLocation.item_id,
            func.coalesce(func.sum(InventoryLocation.quantity), 0),
        )
        .group_by(InventoryLocation.item_id)
        .all()
    )
    return {iid: Decimal(str(summed or 0)) for iid, summed in rows}


def check_inventory_consistency(db: Session) -> list[InventoryMismatch]:
    """전 Inventory 행의 quantity 불변식을 검사. 깨진 것만 반환."""
    loc_sums = _location_sum_map(db)

    # Inventory 와 Item 을 한 번에 조인 (설명용 메타 포함)
    rows = (
        db.query(Inventory, Item)
        .outerjoin(Item, Item.item_id == Inventory.item_id)
        .all()
    )

    mismatches: list[InventoryMismatch] = []
    for inv, item in rows:
        wh = inv.warehouse_qty or _D0
        recorded = inv.quantity or _D0
        loc_sum = loc_sums.get(inv.item_id, _D0)
        computed = wh + loc_sum
        if recorded != computed:
            mismatches.append(
                InventoryMismatch(
                    item_id=inv.item_id,
                    item_code=item.item_code if item else None,
                    item_name=item.item_name if item else None,
                    erp_code=item.erp_code if item else None,
                    recorded_total=recorded,
                    computed_total=computed,
                    warehouse_qty=wh,
                    location_sum=loc_sum,
                    pending_quantity=inv.pending_quantity or _D0,
                )
            )
    return mismatches


def repair_inventory_totals(db: Session, *, dry_run: bool = True) -> RepairReport:
    """quantity 를 warehouse + loc_sum 으로 재계산해 덮어쓴다.

    dry_run=True (기본) 이면 DB 에 쓰지 않고 리포트만.
    """
    loc_sums = _location_sum_map(db)
    inventories = db.query(Inventory).all()

    mismatched = 0
    repaired = 0
    samples: list[dict] = []

    for inv in inventories:
        wh = inv.warehouse_qty or _D0
        recorded = inv.quantity or _D0
        loc_sum = loc_sums.get(inv.item_id, _D0)
        computed = wh + loc_sum
        if recorded == computed:
            continue
        mismatched += 1
        if len(samples) < 20:
            item = db.query(Item).filter(Item.item_id == inv.item_id).first()
            samples.append(
                InventoryMismatch(
                    item_id=inv.item_id,
                    item_code=item.item_code if item else None,
                    item_name=item.item_name if item else None,
                    erp_code=item.erp_code if item else None,
                    recorded_total=recorded,
                    computed_total=computed,
                    warehouse_qty=wh,
                    location_sum=loc_sum,
                    pending_quantity=inv.pending_quantity or _D0,
                ).to_dict()
            )
        if not dry_run:
            inv.quantity = computed
            repaired += 1

    if not dry_run and repaired:
        db.commit()

    return RepairReport(
        checked=len(inventories),
        mismatched=mismatched,
        repaired=repaired,
        dry_run=dry_run,
        samples=samples,
    )
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
