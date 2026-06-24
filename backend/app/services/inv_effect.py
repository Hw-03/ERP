"""inv_effect.py — 거래의 재고 효과(inventory effect) 캡처·역재생.

거래가 건드린 재고 셀(창고 / 부서·상태 location)의 증감을 스냅샷 차이로 계산해
TransactionLog.inventory_effect(JSON)에 기록하고, 취소 시 부호를 반전해 되돌린다.
거래 유형을 전혀 몰라도 정확히 역산되며, 새 거래 유형이 생겨도 자동 대응한다.

효과 한 항목 형식:
  {"scope": "warehouse", "delta": -100}
  {"scope": "location", "department": "조립", "status": "DEFECTIVE", "delta": 100}
delta 는 "정방향에서 그 셀이 얼마나 변했는가"(부호 포함). 취소는 -delta 를 적용한다.
"""

from __future__ import annotations

from decimal import Decimal
import uuid

from sqlalchemy.orm import Session

from app.models import (
    Inventory,
    InventoryLocation,
    LocationStatusEnum,
    WarehouseBoxItem,
)

# 스냅샷 키:
#   ("warehouse", None, None)            — 창고 총재고
#   ("location", dept_str, status_str)   — 부서×상태 재고
#   ("warehouse_box", box_id_str, None)  — 박스별 수량 (박스 추적용)
_WAREHOUSE_KEY = ("warehouse", None, None)


def snapshot_cells(db: Session, item_id: uuid.UUID) -> dict[tuple, int]:
    """품목의 모든 재고 셀(창고 + 부서×상태)을 신선하게 읽어 dict 로 반환.

    SessionLocal 이 autoflush=False 이고 일부 mutation 이 db.execute(update) 로
    ORM 식별맵을 우회하므로, flush 후 컬럼 쿼리로 DB 실값을 읽는다.
    """
    db.flush()
    cells: dict[tuple, int] = {}
    wh = (
        db.query(Inventory.warehouse_qty)
        .filter(Inventory.item_id == item_id)
        .scalar()
    )
    cells[_WAREHOUSE_KEY] = int(wh or 0)
    rows = (
        db.query(
            InventoryLocation.department,
            InventoryLocation.status,
            InventoryLocation.quantity,
        )
        .filter(InventoryLocation.item_id == item_id)
        .all()
    )
    for dept, status, qty in rows:
        status_val = status.value if hasattr(status, "value") else str(status)
        cells[("location", dept, status_val)] = int(qty or 0)
    # 박스별 수량 — 박스 추적 차감/원복의 역재생 대상. 추적 OFF면 거래 중 안 바뀌어 diff 0.
    box_rows = (
        db.query(WarehouseBoxItem.box_id, WarehouseBoxItem.quantity)
        .filter(WarehouseBoxItem.item_id == item_id)
        .all()
    )
    for box_id, qty in box_rows:
        cells[("warehouse_box", str(box_id), None)] = int(qty or 0)
    return cells


def effect_diff(before: dict[tuple, int], after: dict[tuple, int]) -> list[dict]:
    """두 스냅샷 차이 → 0이 아닌 셀만 효과 항목 리스트로."""
    out: list[dict] = []
    for key in set(before) | set(after):
        delta = after.get(key, 0) - before.get(key, 0)
        if delta == 0:
            continue
        scope, dept, status = key
        entry: dict = {"scope": scope, "delta": int(delta)}
        if scope == "location":
            entry["department"] = dept
            entry["status"] = status
        elif scope == "warehouse_box":
            entry["box_id"] = dept  # 키 튜플의 2번째 슬롯에 box_id 보관
        out.append(entry)
    # 안정적 순서(테스트·가독성) — 창고 먼저, 그다음 부서/상태/박스 식별자.
    out.sort(
        key=lambda e: (
            e["scope"] != "warehouse",
            e.get("department") or "",
            e.get("status") or "",
            e.get("box_id") or "",
        )
    )
    return out


def capture_effect(db: Session, item_id: uuid.UUID, before: dict[tuple, int]) -> list[dict]:
    """mutation 직후 호출 — before 스냅샷과 현재 상태 차이를 효과로 반환."""
    return effect_diff(before, snapshot_cells(db, item_id))


def apply_effect_reverse(db: Session, item_id: uuid.UUID, effect: list[dict] | None) -> None:
    """효과를 부호 반전해 재고에 적용(취소 역재생). 적용 후 음수면 ValueError.

    창고는 Inventory.warehouse_qty, location 은 (dept,status) 행을 ORM 속성으로 갱신한다.
    호출 측에서 이후 _sync_total 로 Inventory.quantity 를 재동기화해야 한다.
    """
    for cell in effect or []:
        reverse_delta = -int(cell["delta"])
        if cell.get("scope") == "warehouse":
            inv = db.query(Inventory).filter(Inventory.item_id == item_id).first()
            if inv is None:
                raise ValueError("재고 레코드를 찾을 수 없습니다.")
            new_val = int(inv.warehouse_qty or 0) + reverse_delta
            if new_val < 0:
                raise ValueError(f"취소 후 창고 재고가 음수({new_val})가 됩니다.")
            inv.warehouse_qty = new_val
        elif cell.get("scope") == "warehouse_box":  # 박스별 수량 원복(R6)
            box_id = cell["box_id"]
            box_item = (
                db.query(WarehouseBoxItem)
                .filter(
                    WarehouseBoxItem.box_id == box_id,
                    WarehouseBoxItem.item_id == item_id,
                )
                .first()
            )
            if box_item is None:
                raise ValueError(f"취소 원복할 박스 항목을 찾을 수 없습니다 (box={box_id}).")
            new_val = int(box_item.quantity or 0) + reverse_delta
            if new_val < 0:
                raise ValueError(f"취소 후 박스 재고가 음수({new_val})가 됩니다.")
            box_item.quantity = new_val
        else:  # location
            dept = cell["department"]
            status = LocationStatusEnum(cell["status"])
            loc = (
                db.query(InventoryLocation)
                .filter(
                    InventoryLocation.item_id == item_id,
                    InventoryLocation.department == dept,
                    InventoryLocation.status == status,
                )
                .first()
            )
            if loc is None:
                loc = InventoryLocation(
                    item_id=item_id,
                    department=dept,
                    status=status,
                    quantity=Decimal("0"),
                )
                db.add(loc)
                db.flush()
            new_val = int(loc.quantity or 0) + reverse_delta
            if new_val < 0:
                raise ValueError(
                    f"취소 후 {dept} {status.value} 재고가 음수({new_val})가 됩니다."
                )
            loc.quantity = new_val
