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
    SystemSetting,
    WarehouseAngle,
    WarehouseBox,
    WarehouseBoxItem,
    WarehouseSpecialZone,
    WarehouseSpecialZoneItem,
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


# ──────────────────────────── 박스 추적 활성화 플래그 ────────────────────────────

BOX_TRACKING_KEY = "warehouse_box_tracking_enabled"


def is_box_tracking_enabled(db: Session) -> bool:
    """창고 박스 자동 차감 기능 활성 여부. 기본 False(미설정 시 현행 동작 유지)."""
    setting = (
        db.query(SystemSetting)
        .filter(SystemSetting.setting_key == BOX_TRACKING_KEY)
        .first()
    )
    return bool(setting and setting.setting_value == "true")


def set_box_tracking_enabled(db: Session, enabled: bool) -> None:
    """박스 추적 플래그 설정. 호출 측에서 commit 책임."""
    value = "true" if enabled else "false"
    setting = (
        db.query(SystemSetting)
        .filter(SystemSetting.setting_key == BOX_TRACKING_KEY)
        .first()
    )
    if setting:
        setting.setting_value = value
    else:
        db.add(SystemSetting(setting_key=BOX_TRACKING_KEY, setting_value=value))
    db.flush()


# ──────────────────────────── 박스 수량 차감 (R1~R5) ────────────────────────────


def boxes_total_for_item(db: Session, item_id) -> int:
    """해당 품목이 배치된 박스 수량 합. R5 검증·미배치 판정 공용."""
    total = (
        db.query(func.coalesce(func.sum(WarehouseBoxItem.quantity), 0))
        .filter(WarehouseBoxItem.item_id == item_id)
        .scalar()
    )
    return int(total or 0)


def deplete_boxes_by_order(db: Session, item_id, qty) -> None:
    """창고 출고(warehouse_qty 감소)에 맞춰 박스 수량을 R1 순서로 차감.

    정렬(R1): 층↓(layer_no DESC) → 줄↑(row_no ASC) → 자리↑(jari_index ASC)
              → 스택↓(stack_order DESC, 위 박스 먼저).
    첫 비어있지 않은 박스부터 깎고 0이 되면 다음으로(R2). 빈 박스는 건너뜀(R3).
    박스 합 < qty 면 ValueError(R5 — 항상 차단). 호출 측 트랜잭션에서 롤백된다.
    """
    need = int(qty)
    if need <= 0:
        return

    rows = (
        db.query(WarehouseBoxItem)
        .join(WarehouseBox, WarehouseBoxItem.box_id == WarehouseBox.box_id)
        .filter(WarehouseBoxItem.item_id == item_id, WarehouseBoxItem.quantity > 0)
        .order_by(
            WarehouseBox.layer_no.desc(),
            WarehouseBox.row_no.asc(),
            WarehouseBox.jari_index.asc(),
            WarehouseBox.stack_order.desc(),
        )
        .all()
    )

    available = sum(int(r.quantity) for r in rows)
    if available < need:
        raise ValueError(
            f"박스 배치 수량 부족 — 창고 지도에서 먼저 배치하세요. (배치 {available}, 필요 {need})"
        )

    remaining = need
    for r in rows:
        if remaining <= 0:
            break
        take = min(remaining, int(r.quantity))
        r.quantity = int(r.quantity) - take
        remaining -= take
    db.flush()


def _dept_color_map(db: Session) -> dict[str, Optional[str]]:
    """부서명 → color_hex 맵."""
    return {d.name: d.color_hex for d in db.query(Department).all()}




def _content_item_payload(content, color_map: dict[str, Optional[str]]) -> Optional[dict]:
    item = content.item
    if item is None or item.deleted_at is not None:
        return None
    dept = department_for_item(item)
    return {
        "item_id": item.item_id,
        "mes_code": item.mes_code,
        "item_name": item.item_name,
        "quantity": content.quantity,
        "department": dept,
        "color_hex": color_map.get(dept) if dept else None,
    }


def _special_zone_payloads(
    db: Session,
    color_map: dict[str, Optional[str]],
    *,
    include_inactive: bool = False,
) -> list[dict]:
    q = db.query(WarehouseSpecialZone)
    if not include_inactive:
        q = q.filter(WarehouseSpecialZone.is_active.is_(True))
    zones = q.order_by(
        WarehouseSpecialZone.display_order.asc(),
        WarehouseSpecialZone.id.asc(),
    ).all()

    payloads = []
    for zone in zones:
        items_out = []
        for content in zone.contents:
            item_out = _content_item_payload(content, color_map)
            if item_out is not None:
                items_out.append(item_out)
        payloads.append(
            {
                "id": zone.id,
                "label": zone.label,
                "zone_type": zone.zone_type,
                "pos_x": zone.pos_x,
                "pos_y": zone.pos_y,
                "width": zone.width,
                "height": zone.height,
                "display_order": zone.display_order,
                "is_active": zone.is_active,
                "items": items_out,
            }
        )
    return payloads


def build_special_zone_payloads(db: Session, *, include_inactive: bool = False) -> list[dict]:
    return _special_zone_payloads(
        db,
        _dept_color_map(db),
        include_inactive=include_inactive,
    )


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

    special_zone_payloads = _special_zone_payloads(db, color_map)

    return {"angles": angles, "boxes": box_payloads, "special_zones": special_zone_payloads}


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

    zone_placed_q = (
        db.query(
            WarehouseSpecialZoneItem.item_id.label("item_id"),
            func.coalesce(func.sum(WarehouseSpecialZoneItem.quantity), 0).label("placed_total"),
        )
        .join(WarehouseSpecialZone, WarehouseSpecialZoneItem.zone_id == WarehouseSpecialZone.id)
        .filter(WarehouseSpecialZone.is_active.is_(True))
        .group_by(WarehouseSpecialZoneItem.item_id)
    )
    if item_id is not None:
        zone_placed_q = zone_placed_q.filter(WarehouseSpecialZoneItem.item_id == item_id)
    for row in zone_placed_q.all():
        placed_rows[row.item_id] = placed_rows.get(row.item_id, 0) + int(row.placed_total)

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
