"""inv_effect.py — 거래의 재고 효과(inventory effect) 캡처·역재생.

거래가 건드린 재고 셀(창고 / B·Z·U / 부서·상태 location)의 증감을 스냅샷 차이로 계산해
TransactionLog.inventory_effect(JSON)에 기록하고, 취소 시 부호를 반전해 되돌린다.
거래 유형을 전혀 몰라도 정확히 역산되며, 새 거래 유형이 생겨도 자동 대응한다.

효과 한 항목 형식:
  {"scope": "warehouse", "row_id": "...", "before_quantity": 100,
   "after_quantity": 0, "delta": -100}
  {"scope": "warehouse_unplaced", "row_id": "...", "before_quantity": 100,
   "after_quantity": 0, "delta": -100}
delta 는 "정방향에서 그 셀이 얼마나 변했는가"(부호 포함). 취소는 -delta 를 적용한다.
"""

from __future__ import annotations

from decimal import Decimal
from typing import NamedTuple, TypedDict
import uuid

from sqlalchemy.orm import Session

from app.models import (
    Inventory,
    InventoryLocation,
    LocationStatusEnum,
    WarehouseBoxItem,
    WarehouseSpecialZone,
    WarehouseSpecialZoneItem,
    WarehouseUnplacedItem,
)

# 스냅샷 키:
#   ("warehouse", inventory_id_str, None) — 창고 총재고 행
#   ("location", dept_str, status_str)   — 부서×상태 재고
#   ("warehouse_box", row_id_str, box_id_str) — 박스 배치 행
#   ("warehouse_zone", row_id_str, zone_id)  — 활성 특수구역 배치 행
#   ("warehouse_unplaced", row_id_str, None) — 미배치 행
class StockTotals(NamedTuple):
    """한 품목의 창고와 정상 부서 재고 합계."""

    warehouse: int
    department: int


class TransactionStockSnapshot(TypedDict):
    """TransactionLog에 저장할 위치 재고 전·후 스냅샷 계약."""

    warehouse_qty_before: int
    warehouse_qty_after: int
    department_qty_before: int
    department_qty_after: int
    inventory_effect: list[dict]


def _uses_row_locks(db: Session) -> bool:
    """현재 세션이 PostgreSQL 행 잠금을 지원하는지 판정한다."""
    return db.get_bind().dialect.name != "sqlite"


def _snapshot_cells(db: Session, item_id: uuid.UUID) -> dict[tuple, int]:
    """품목의 모든 재고 셀(창고 + B/Z/U + 부서×상태)을 잠근 뒤 읽는다.

    SessionLocal 이 autoflush=False 이고 일부 mutation 이 db.execute(update) 로
    ORM 식별맵을 우회하므로, flush 후 컬럼 쿼리로 DB 실값을 읽는다.
    before snapshot부터 W/B/Z/U를 공통 순서로 잠가야 동시 placement가 이
    작업의 effect 차분에 섞이지 않는다.
    """
    db.flush()
    from app.services import warehouse_map

    warehouse_map.lock_warehouse_map_rows(
        db,
        item_ids=[item_id],
        include_boxes_for_item_ids=True,
        include_zones_for_item_ids=True,
    )
    cells: dict[tuple, int] = {}
    warehouse_row = (
        db.query(Inventory.inventory_id, Inventory.warehouse_qty)
        .filter(Inventory.item_id == item_id)
        .one_or_none()
    )
    if warehouse_row is not None:
        inventory_id, warehouse_qty = warehouse_row
        cells[("warehouse", str(inventory_id), None)] = int(warehouse_qty or 0)
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
    # B/Z/U는 실제 안정 row ID를 key로 사용한다. container ID는 세 번째 슬롯이다.
    box_rows = (
        db.query(
            WarehouseBoxItem.id,
            WarehouseBoxItem.box_id,
            WarehouseBoxItem.quantity,
        )
        .filter(WarehouseBoxItem.item_id == item_id)
        .all()
    )
    for row_id, box_id, qty in box_rows:
        cells[("warehouse_box", str(row_id), str(box_id))] = int(qty or 0)
    zone_rows = (
        db.query(
            WarehouseSpecialZoneItem.id,
            WarehouseSpecialZoneItem.zone_id,
            WarehouseSpecialZoneItem.quantity,
        )
        .join(
            WarehouseSpecialZone,
            WarehouseSpecialZoneItem.zone_id == WarehouseSpecialZone.id,
        )
        .filter(
            WarehouseSpecialZoneItem.item_id == item_id,
            WarehouseSpecialZone.is_active.is_(True),
        )
        .all()
    )
    for row_id, zone_id, qty in zone_rows:
        cells[("warehouse_zone", str(row_id), int(zone_id))] = int(qty or 0)
    unplaced_rows = (
        db.query(WarehouseUnplacedItem.id, WarehouseUnplacedItem.quantity)
        .filter(WarehouseUnplacedItem.item_id == item_id)
        .all()
    )
    for row_id, qty in unplaced_rows:
        cells[("warehouse_unplaced", str(row_id), None)] = int(qty or 0)
    return cells


def effect_diff(before: dict[tuple, int], after: dict[tuple, int]) -> list[dict]:
    """두 스냅샷 차이 → 0이 아닌 셀만 효과 항목 리스트로."""
    out: list[dict] = []
    for key in set(before) | set(after):
        delta = after.get(key, 0) - before.get(key, 0)
        if delta == 0:
            continue
        scope, identity, container = key
        entry: dict = {
            "scope": scope,
            "before_quantity": int(before.get(key, 0)),
            "after_quantity": int(after.get(key, 0)),
            "delta": int(delta),
        }
        if scope == "location":
            entry["department"] = identity
            entry["status"] = container
        elif scope == "warehouse":
            entry["row_id"] = identity
        elif scope == "warehouse_box":
            entry["row_id"] = identity
            entry["box_id"] = container
        elif scope == "warehouse_zone":
            entry["row_id"] = identity
            entry["zone_id"] = container
        elif scope == "warehouse_unplaced":
            entry["row_id"] = identity
        out.append(entry)
    # 안정적 순서(테스트·가독성) — 창고 먼저, 그다음 위치와 실제 행 식별자.
    out.sort(
        key=lambda e: (
            e["scope"] != "warehouse",
            e.get("department") or "",
            e.get("status") or "",
            e.get("box_id") or "",
            str(e.get("zone_id") or ""),
            e.get("row_id") or "",
        )
    )
    return out


def summarize_stock_cells(cells: dict[tuple, int]) -> StockTotals:
    """셀 스냅샷을 창고와 모든 정상(PRODUCTION) 부서 합계로 요약한다."""
    department = sum(
        int(quantity)
        for (scope, _department, status), quantity in cells.items()
        if scope == "location"
        and getattr(status, "value", status) == LocationStatusEnum.PRODUCTION.value
    )
    return StockTotals(
        warehouse=sum(
            int(quantity)
            for (scope, _identity, _container), quantity in cells.items()
            if scope == "warehouse"
        ),
        department=department,
    )


def _capture_log_stock_snapshot(
    db: Session,
    item_id: uuid.UUID,
    before: dict[tuple, int],
) -> TransactionStockSnapshot:
    """거래 직후 셀을 한 번 읽어 효과와 위치별 전·후 수량을 함께 만든다."""
    after = _snapshot_cells(db, item_id)
    before_totals = summarize_stock_cells(before)
    after_totals = summarize_stock_cells(after)
    return {
        "warehouse_qty_before": before_totals.warehouse,
        "warehouse_qty_after": after_totals.warehouse,
        "department_qty_before": before_totals.department,
        "department_qty_after": after_totals.department,
        "inventory_effect": _capture_effect(db, item_id, before, after),
    }


def _capture_effect(
    db: Session,
    item_id: uuid.UUID,
    before: dict[tuple, int],
    after: dict[tuple, int] | None = None,
) -> list[dict]:
    """mutation 직후 효과를 계산하되 이미 읽은 after 셀이 있으면 재사용한다."""
    return effect_diff(before, after if after is not None else _snapshot_cells(db, item_id))


def _apply_effect_reverse(db: Session, item_id: uuid.UUID, effect: list[dict] | None) -> None:
    """효과를 부호 반전해 재고에 적용(취소 역재생). 적용 후 음수면 ValueError.

    창고는 Inventory.warehouse_qty, location 은 (dept,status) 행을 ORM 속성으로 갱신한다.
    호출 측에서 이후 _sync_total 로 Inventory.quantity 를 재동기화해야 한다.
    """
    warehouse_row_ids = {
        str(cell["row_id"])
        for cell in effect or []
        if cell.get("scope") == "warehouse" and cell.get("row_id")
    }
    if len(warehouse_row_ids) > 1:
        raise ValueError("취소 대상 창고 재고 행 기록이 올바르지 않습니다.")
    warehouse_row_id = next(iter(warehouse_row_ids), None)

    from app.services import warehouse_map

    warehouse_map.lock_warehouse_map_rows(
        db,
        item_ids=[item_id],
        include_boxes_for_item_ids=True,
        include_zones_for_item_ids=True,
    )
    inv = db.query(Inventory).filter(Inventory.item_id == item_id).first()
    if inv is None:
        if warehouse_row_id is not None:
            raise ValueError("취소 대상 재고 행이 이후 변경되었습니다.")
        raise ValueError("재고 레코드를 찾을 수 없습니다.")
    if warehouse_row_id is not None and str(inv.inventory_id) != warehouse_row_id:
        raise ValueError("취소 대상 재고 행이 이후 변경되었습니다.")
    warehouse_map._lock_warehouse_ledger(db, item_id)
    resolved: list[tuple[dict, object, int]] = []
    warehouse_delta = 0
    physical_delta = 0
    for cell in effect or []:
        has_before = "before_quantity" in cell
        has_after = "after_quantity" in cell
        if has_before != has_after or (
            has_before
            and int(cell["after_quantity"]) - int(cell["before_quantity"])
            != int(cell["delta"])
        ):
            raise ValueError("재고 효과의 전후 수량과 증감이 일치하지 않습니다.")
        reverse_delta = -int(cell["delta"])
        scope = cell.get("scope")
        if scope == "warehouse":
            warehouse_delta += int(cell["delta"])
            if cell.get("row_id") and str(inv.inventory_id) != str(cell["row_id"]):
                raise ValueError("취소 대상 재고 행이 이후 변경되었습니다.")
            if has_after and int(inv.warehouse_qty or 0) != int(cell["after_quantity"]):
                raise ValueError("취소 대상 재고 행이 이후 변경되었습니다.")
            new_val = int(inv.warehouse_qty or 0) + reverse_delta
            if new_val < 0:
                raise ValueError(f"취소 후 창고 재고가 음수({new_val})가 됩니다.")
            pending = int(inv.pending_quantity or 0)
            if new_val < pending:
                raise ValueError(
                    f"취소 후 창고 재고({new_val})가 예약 수량({pending})보다 작아집니다."
                )
            target = inv
        elif scope == "warehouse_box":
            physical_delta += int(cell["delta"])
            row_id = cell.get("row_id")
            if not row_id:
                raise ValueError(
                    "레거시 재고 효과에는 정확한 B/Z/U 위치 정보가 없어 "
                    "취소할 수 없습니다."
                )
            query = db.query(WarehouseBoxItem).filter(WarehouseBoxItem.id == row_id)
            if _uses_row_locks(db):
                query = query.with_for_update()
            box_item = query.one_or_none()
            if box_item is None:
                raise ValueError("취소 원복할 박스 항목을 찾을 수 없습니다.")
            if box_item.item_id != item_id or str(box_item.box_id) != str(
                cell.get("box_id")
            ):
                raise ValueError("취소 대상 박스 행이 이후 변경되었습니다.")
            if has_after and int(box_item.quantity or 0) != int(cell["after_quantity"]):
                raise ValueError("취소 대상 재고 행이 이후 변경되었습니다.")
            new_val = int(box_item.quantity or 0) + reverse_delta
            if new_val < 0:
                raise ValueError(f"취소 후 박스 재고가 음수({new_val})가 됩니다.")
            target = box_item
        elif scope == "warehouse_zone":
            physical_delta += int(cell["delta"])
            query = db.query(WarehouseSpecialZoneItem).filter(
                WarehouseSpecialZoneItem.id == cell.get("row_id")
            )
            if _uses_row_locks(db):
                query = query.with_for_update()
            zone_item = query.one_or_none()
            if (
                zone_item is None
                or zone_item.item_id != item_id
                or str(zone_item.zone_id) != str(cell.get("zone_id"))
            ):
                raise ValueError("취소 대상 특수구역 행이 이후 변경되었습니다.")
            zone = db.get(WarehouseSpecialZone, zone_item.zone_id)
            if zone is None or not zone.is_active:
                raise ValueError("취소 대상 특수구역 행이 이후 변경되었습니다.")
            if has_after and int(zone_item.quantity or 0) != int(cell["after_quantity"]):
                raise ValueError("취소 대상 재고 행이 이후 변경되었습니다.")
            new_val = int(zone_item.quantity or 0) + reverse_delta
            if new_val < 0:
                raise ValueError(f"취소 후 특수구역 재고가 음수({new_val})가 됩니다.")
            target = zone_item
        elif scope == "warehouse_unplaced":
            physical_delta += int(cell["delta"])
            query = db.query(WarehouseUnplacedItem).filter(
                WarehouseUnplacedItem.id == cell.get("row_id")
            )
            if _uses_row_locks(db):
                query = query.with_for_update()
            unplaced = query.one_or_none()
            if unplaced is None or unplaced.item_id != item_id:
                raise ValueError("취소 대상 미배치 행이 이후 변경되었습니다.")
            if has_after and int(unplaced.quantity or 0) != int(cell["after_quantity"]):
                raise ValueError("취소 대상 재고 행이 이후 변경되었습니다.")
            new_val = int(unplaced.quantity or 0) + reverse_delta
            if new_val < 0:
                raise ValueError(f"취소 후 미배치 재고가 음수({new_val})가 됩니다.")
            target = unplaced
        else:  # location
            dept = cell["department"]
            status = LocationStatusEnum(cell["status"])
            location_query = (
                db.query(InventoryLocation)
                .filter(
                    InventoryLocation.item_id == item_id,
                    InventoryLocation.department == dept,
                    InventoryLocation.status == status,
                )
            )
            if _uses_row_locks(db):
                location_query = location_query.with_for_update()
            loc = location_query.first()
            if loc is None:
                if "after_quantity" in cell:
                    raise ValueError("취소 대상 위치 행이 이후 변경되었습니다.")
                loc = InventoryLocation(
                    item_id=item_id,
                    department=dept,
                    status=status,
                    quantity=Decimal("0"),
                )
                db.add(loc)
                db.flush()
            if has_after and int(loc.quantity or 0) != int(cell["after_quantity"]):
                raise ValueError("취소 대상 재고 행이 이후 변경되었습니다.")
            new_val = int(loc.quantity or 0) + reverse_delta
            if new_val < 0:
                raise ValueError(
                    f"취소 후 {dept} {status.value} 재고가 음수({new_val})가 됩니다."
                )
            pending = int(loc.pending_quantity or 0)
            if new_val < pending:
                raise ValueError(
                    f"취소 후 {dept} {status.value} 재고({new_val})가 "
                    f"예약 수량({pending})보다 작아집니다."
                )
            target = loc

        resolved.append((cell, target, new_val))

    if warehouse_delta != physical_delta:
        raise ValueError(
            "레거시 재고 효과에는 정확한 B/Z/U 위치 정보가 없어 취소할 수 없습니다."
        )

    for cell, target, new_val in resolved:
        if cell.get("scope") == "warehouse":
            target.warehouse_qty = new_val
        else:
            target.quantity = new_val
    db.flush()
    warehouse_map._lock_warehouse_ledger(db, item_id)
