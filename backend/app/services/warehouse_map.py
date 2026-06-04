"""창고 지도 서비스 — 지도 데이터 조립 + 재고 대조.

- build_map_payload(db)        : 구조(앵글) + 배치(박스+품목) + 부서색을 한 번에 조립 (N+1 방지).
- reconcile_inventory(db, ...) : 품목별 Σ(박스 수량) vs Inventory.warehouse_qty 대조.

부서색: 품목의 process_type_code prefix(T/H/V/N/A/P) → 부서 → Department.color_hex.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    Department,
    Inventory,
    Item,
    WarehouseAngle,
    WarehouseBox,
    WarehouseBoxItem,
)

# process_type_code prefix → 부서명 (bootstrap/seed.py _PROCESS_TYPES 와 일치)
_PREFIX_TO_DEPT: dict[str, str] = {
    "T": "튜브",
    "H": "고압",
    "V": "진공",
    "N": "튜닝",
    "A": "조립",
    "P": "출하",
}

# 박스 크기 → 높이 유닛 (대=3 / 중=2 / 소=1). 자리 용량 3.
SIZE_UNIT: dict[str, int] = {"LARGE": 3, "MEDIUM": 2, "SMALL": 1}
JARI_CAPACITY = 3


def department_for_item(item: Item) -> Optional[str]:
    """품목 → 담당 부서명. process_type_code 첫 글자(prefix)로 유도."""
    code = item.process_type_code or ""
    if not code:
        return None
    return _PREFIX_TO_DEPT.get(code[0])


def _dept_color_map(db: Session) -> dict[str, Optional[str]]:
    """부서명 → color_hex 맵."""
    return {d.name: d.color_hex for d in db.query(Department).all()}


def build_map_payload(db: Session) -> dict:
    """지도 통합 데이터: angles + boxes(품목/부서색 평탄화)."""
    angles = (
        db.query(WarehouseAngle)
        .filter(WarehouseAngle.is_active.is_(True))
        .order_by(WarehouseAngle.display_order.asc(), WarehouseAngle.id.asc())
        .all()
    )

    color_map = _dept_color_map(db)

    # 박스 + 내용물(품목)을 한 번에. 소프트삭제 품목은 제외.
    boxes = (
        db.query(WarehouseBox)
        .order_by(
            WarehouseBox.angle_id.asc(),
            WarehouseBox.row_no.asc(),
            WarehouseBox.layer_no.asc(),
            WarehouseBox.jari_index.asc(),
            WarehouseBox.stack_order.asc(),
        )
        .all()
    )

    box_payloads = []
    for box in boxes:
        items_out = []
        for content in box.contents:
            item = content.item
            if item is None or item.deleted_at is not None:
                continue  # 유령(삭제된) 품목 숨김
            dept = department_for_item(item)
            items_out.append(
                {
                    "item_id": item.item_id,
                    "mes_code": item.mes_code,
                    "item_name": item.item_name,
                    "quantity": content.quantity,
                    "department": dept,
                    "color_hex": color_map.get(dept) if dept else None,
                }
            )
        box_payloads.append(
            {
                "box_id": box.box_id,
                "angle_id": box.angle_id,
                "row_no": box.row_no,
                "layer_no": box.layer_no,
                "jari_index": box.jari_index,
                "size": box.size.value if hasattr(box.size, "value") else box.size,
                "stack_order": box.stack_order,
                "items": items_out,
            }
        )

    return {"angles": angles, "boxes": box_payloads}


def reconcile_inventory(db: Session, item_id=None) -> dict:
    """품목별 배치 수량 합 vs 창고 재고(warehouse_qty) 대조.

    item_id 지정 시 해당 품목 1건만. 아니면 배치가 있는 모든 품목.
    """
    placed_q = (
        db.query(
            WarehouseBoxItem.item_id.label("item_id"),
            func.coalesce(func.sum(WarehouseBoxItem.quantity), 0).label("placed_total"),
        )
        .group_by(WarehouseBoxItem.item_id)
    )
    if item_id is not None:
        placed_q = placed_q.filter(WarehouseBoxItem.item_id == item_id)
    placed_rows = {r.item_id: int(r.placed_total) for r in placed_q.all()}

    target_ids = set(placed_rows.keys())
    if item_id is not None:
        target_ids.add(item_id)
    if not target_ids:
        return {"rows": [], "mismatch_count": 0}

    items = (
        db.query(Item)
        .filter(Item.item_id.in_(target_ids), Item.deleted_at.is_(None))
        .all()
    )
    inv_map = {
        inv.item_id: int(inv.warehouse_qty or 0)
        for inv in db.query(Inventory).filter(Inventory.item_id.in_(target_ids)).all()
    }

    rows = []
    mismatch = 0
    for item in items:
        placed = placed_rows.get(item.item_id, 0)
        wh = inv_map.get(item.item_id, 0)
        diff = placed - wh
        status = "ok" if diff == 0 else ("over" if diff > 0 else "under")
        if diff != 0:
            mismatch += 1
        rows.append(
            {
                "item_id": item.item_id,
                "mes_code": item.mes_code,
                "item_name": item.item_name,
                "placed_total": placed,
                "warehouse_qty": wh,
                "diff": diff,
                "status": status,
            }
        )
    rows.sort(key=lambda r: (r["status"] == "ok", r["mes_code"] or ""))
    return {"rows": rows, "mismatch_count": mismatch}
