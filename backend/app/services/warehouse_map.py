"""창고 지도 서비스 — 지도 데이터 조립 + 재고 대조.

- build_map_payload(db)        : 구조(앵글) + 배치(박스+품목) + 부서색을 한 번에 조립 (N+1 방지).
- reconcile_inventory(db, ...) : 품목별 Σ(박스 수량) vs Inventory.warehouse_qty 대조.

부서색: 품목의 process_type_code prefix(T/H/V/N/A/P) → 부서 → Department.color_hex.
"""
from __future__ import annotations

from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Literal, Optional

from sqlalchemy import func, select
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
    WarehouseUnplacedItem,
)
from app.services import stock_availability

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


# ───────────────────── 하위 호환 박스 배치 UI 표시 선호도 ─────────────────────

BOX_TRACKING_KEY = "warehouse_box_tracking_enabled"


def is_box_tracking_enabled(db: Session) -> bool:
    """박스 배치 UI 표시 선호도. 물리 원장 차감에는 영향을 주지 않는다."""
    setting = (
        db.query(SystemSetting)
        .filter(SystemSetting.setting_key == BOX_TRACKING_KEY)
        .first()
    )
    return setting is None or setting.setting_value == "true"


def _set_box_tracking_enabled(db: Session, enabled: bool) -> None:
    """박스 배치 UI 표시 선호도 설정. 호출 측에서 commit 책임."""
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


def boxes_total_for_item(db: Session, item_id: object) -> int:
    """해당 품목이 배치된 박스 수량 합. R5 검증·미배치 판정 공용."""
    total = (
        db.query(func.coalesce(func.sum(WarehouseBoxItem.quantity), 0))
        .filter(WarehouseBoxItem.item_id == item_id)
        .scalar()
    )
    return int(total or 0)


def _sorted_unique_ids(values: Iterable[object]) -> list[object]:
    by_key = {str(value): value for value in values if value is not None}
    return [by_key[key] for key in sorted(by_key)]


def lock_warehouse_map_rows(
    db: Session,
    *,
    item_ids: Iterable[object] = (),
    angle_ids: Iterable[object] = (),
    box_ids: Iterable[object] = (),
    zone_ids: Iterable[object] = (),
    include_boxes_for_item_ids: bool = False,
    include_zones_for_item_ids: bool = False,
) -> None:
    """Lock PostgreSQL warehouse rows in one deadlock-safe shared order.

    Items are locked first, then Inventory and its unplaced row, followed by affected
    source/target angles, boxes, box contents, zones, and zone contents. Sharing
    container locks keeps capacity, stack-order, and placement reads stable even
    when concurrent admins edit different items. SQLite keeps its existing
    ``BEGIN IMMEDIATE`` serialization and needs no row locks.
    """
    if db.get_bind().dialect.name != "postgresql":
        return

    ordered_item_ids = _sorted_unique_ids(item_ids)
    if ordered_item_ids:
        db.execute(
            select(Item.item_id)
            .where(Item.item_id.in_(ordered_item_ids))
            .order_by(Item.item_id.asc())
            .with_for_update(of=Item.__table__)
            .execution_options(populate_existing=True)
        ).scalars().all()
        db.execute(
            select(Inventory)
            .where(Inventory.item_id.in_(ordered_item_ids))
            .order_by(Inventory.item_id.asc())
            .with_for_update(of=Inventory.__table__)
            .execution_options(populate_existing=True)
        ).scalars().all()
        db.execute(
            select(WarehouseUnplacedItem)
            .where(WarehouseUnplacedItem.item_id.in_(ordered_item_ids))
            .order_by(WarehouseUnplacedItem.item_id.asc())
            .with_for_update(of=WarehouseUnplacedItem.__table__)
            .execution_options(populate_existing=True)
        ).scalars().all()

    affected_box_ids = list(box_ids)
    if include_boxes_for_item_ids and ordered_item_ids:
        affected_box_ids.extend(
            db.execute(
                select(WarehouseBoxItem.box_id)
                .where(WarehouseBoxItem.item_id.in_(ordered_item_ids))
                .distinct()
                .order_by(WarehouseBoxItem.box_id.asc())
            ).scalars().all()
        )

    ordered_box_ids = _sorted_unique_ids(affected_box_ids)
    affected_angle_ids = list(angle_ids)
    if ordered_box_ids:
        affected_angle_ids.extend(
            db.execute(
                select(WarehouseBox.angle_id)
                .where(WarehouseBox.box_id.in_(ordered_box_ids))
                .distinct()
                .order_by(WarehouseBox.angle_id.asc())
            ).scalars().all()
        )

    ordered_angle_ids = _sorted_unique_ids(affected_angle_ids)
    if ordered_angle_ids:
        db.execute(
            select(WarehouseAngle)
            .where(WarehouseAngle.id.in_(ordered_angle_ids))
            .order_by(WarehouseAngle.id.asc())
            .with_for_update(of=WarehouseAngle.__table__)
            .execution_options(populate_existing=True)
        ).scalars().all()

    if ordered_box_ids:
        db.execute(
            select(WarehouseBox)
            .where(WarehouseBox.box_id.in_(ordered_box_ids))
            .order_by(WarehouseBox.box_id.asc())
            .with_for_update(of=WarehouseBox.__table__)
            .execution_options(populate_existing=True)
        ).scalars().all()
        db.execute(
            select(WarehouseBoxItem)
            .where(WarehouseBoxItem.box_id.in_(ordered_box_ids))
            .order_by(
                WarehouseBoxItem.box_id.asc(),
                WarehouseBoxItem.item_id.asc(),
                WarehouseBoxItem.id.asc(),
            )
            .with_for_update(of=WarehouseBoxItem.__table__)
            .execution_options(populate_existing=True)
        ).scalars().all()

    affected_zone_ids = list(zone_ids)
    if include_zones_for_item_ids and ordered_item_ids:
        affected_zone_ids.extend(
            db.execute(
                select(WarehouseSpecialZoneItem.zone_id)
                .where(WarehouseSpecialZoneItem.item_id.in_(ordered_item_ids))
                .distinct()
                .order_by(WarehouseSpecialZoneItem.zone_id.asc())
            ).scalars().all()
        )
    ordered_zone_ids = _sorted_unique_ids(affected_zone_ids)
    if not ordered_zone_ids:
        return
    db.execute(
        select(WarehouseSpecialZone)
        .where(WarehouseSpecialZone.id.in_(ordered_zone_ids))
        .order_by(WarehouseSpecialZone.id.asc())
        .with_for_update(of=WarehouseSpecialZone.__table__)
        .execution_options(populate_existing=True)
    ).scalars().all()
    db.execute(
        select(WarehouseSpecialZoneItem)
        .where(WarehouseSpecialZoneItem.zone_id.in_(ordered_zone_ids))
        .order_by(
            WarehouseSpecialZoneItem.zone_id.asc(),
            WarehouseSpecialZoneItem.item_id.asc(),
            WarehouseSpecialZoneItem.id.asc(),
        )
        .with_for_update(of=WarehouseSpecialZoneItem.__table__)
        .execution_options(populate_existing=True)
    ).scalars().all()


def lock_box_with_stable_contents(
    db: Session,
    box: WarehouseBox,
    *,
    additional_item_ids: Iterable[object] = (),
    additional_angle_ids: Iterable[object] = (),
) -> Optional[WarehouseBox]:
    """Lock Item→W→angle→box and reject a relation changed mid-lock."""
    initial_item_ids = db.execute(
        select(WarehouseBoxItem.item_id)
        .where(WarehouseBoxItem.box_id == box.box_id)
        .order_by(WarehouseBoxItem.item_id.asc())
    ).scalars().all()
    locked_item_ids = _sorted_unique_ids(
        [*initial_item_ids, *additional_item_ids]
    )
    locked_angle_ids = _sorted_unique_ids(
        [box.angle_id, *additional_angle_ids]
    )
    lock_warehouse_map_rows(
        db,
        item_ids=locked_item_ids,
        angle_ids=locked_angle_ids,
        box_ids=[box.box_id],
    )

    current_box = (
        db.query(WarehouseBox)
        .execution_options(populate_existing=True)
        .filter(WarehouseBox.box_id == box.box_id)
        .one_or_none()
    )
    if current_box is None:
        return None
    current_item_ids = db.execute(
        select(WarehouseBoxItem.item_id)
        .where(WarehouseBoxItem.box_id == box.box_id)
        .order_by(WarehouseBoxItem.item_id.asc())
    ).scalars().all()
    locked_item_keys = {str(item_id) for item_id in locked_item_ids}
    if any(str(item_id) not in locked_item_keys for item_id in current_item_ids):
        return None
    if str(current_box.angle_id) not in {
        str(angle_id) for angle_id in locked_angle_ids
    }:
        return None
    return current_box


def lock_zone_for_deactivation(
    db: Session,
    zone_id: int,
) -> tuple[Optional[WarehouseSpecialZone], int]:
    """Lock a zone and re-read its committed quantity before deactivation."""
    item_ids = db.execute(
        select(WarehouseSpecialZoneItem.item_id)
        .where(WarehouseSpecialZoneItem.zone_id == zone_id)
        .order_by(WarehouseSpecialZoneItem.item_id.asc())
    ).scalars().all()
    lock_warehouse_map_rows(db, item_ids=item_ids, zone_ids=[zone_id])
    zone = (
        db.query(WarehouseSpecialZone)
        .execution_options(populate_existing=True)
        .filter(WarehouseSpecialZone.id == zone_id)
        .one_or_none()
    )
    remaining = (
        db.query(func.coalesce(func.sum(WarehouseSpecialZoneItem.quantity), 0))
        .filter(WarehouseSpecialZoneItem.zone_id == zone_id)
        .scalar()
    )
    return zone, int(remaining or 0)


@dataclass(frozen=True)
class _WarehouseLedgerRows:
    inventory: Inventory
    box_rows: list[WarehouseBoxItem]
    zone_rows: list[WarehouseSpecialZoneItem]
    unplaced: WarehouseUnplacedItem


def _quantity_as_int(value: object, *, label: str) -> int:
    quantity = Decimal(str(value or 0))
    integral = int(quantity)
    if quantity != Decimal(integral):
        raise ValueError(f"{label} 수량은 정수여야 합니다.")
    return integral


def _load_warehouse_ledger_rows(db: Session, item_id: object) -> _WarehouseLedgerRows:
    """Lock and load one item's complete physical warehouse ledger."""
    db.flush()
    lock_warehouse_map_rows(
        db,
        item_ids=[item_id],
        include_boxes_for_item_ids=True,
        include_zones_for_item_ids=True,
    )
    inventory = (
        db.query(Inventory).filter(Inventory.item_id == item_id).one_or_none()
    )
    unplaced = (
        db.query(WarehouseUnplacedItem)
        .filter(WarehouseUnplacedItem.item_id == item_id)
        .one_or_none()
    )
    if inventory is None or unplaced is None:
        raise ValueError(
            "물리 위치 원장 불일치 — Inventory 또는 미배치(U) 행이 없습니다."
        )

    box_rows = (
        db.query(WarehouseBoxItem)
        .join(WarehouseBox, WarehouseBoxItem.box_id == WarehouseBox.box_id)
        .filter(WarehouseBoxItem.item_id == item_id)
        .order_by(
            WarehouseBox.layer_no.desc(),
            WarehouseBox.row_no.asc(),
            WarehouseBox.jari_index.asc(),
            WarehouseBox.stack_order.desc(),
            WarehouseBox.angle_id.asc(),
            WarehouseBox.box_id.asc(),
            WarehouseBoxItem.id.asc(),
        )
        .all()
    )
    zone_rows = (
        db.query(WarehouseSpecialZoneItem)
        .join(
            WarehouseSpecialZone,
            WarehouseSpecialZoneItem.zone_id == WarehouseSpecialZone.id,
        )
        .filter(
            WarehouseSpecialZoneItem.item_id == item_id,
            WarehouseSpecialZone.is_active.is_(True),
        )
        .order_by(
            WarehouseSpecialZone.display_order.asc(),
            WarehouseSpecialZone.id.asc(),
            WarehouseSpecialZoneItem.id.asc(),
        )
        .all()
    )
    inactive_total = int(
        db.query(func.coalesce(func.sum(WarehouseSpecialZoneItem.quantity), 0))
        .join(
            WarehouseSpecialZone,
            WarehouseSpecialZoneItem.zone_id == WarehouseSpecialZone.id,
        )
        .filter(
            WarehouseSpecialZoneItem.item_id == item_id,
            WarehouseSpecialZone.is_active.is_(False),
        )
        .scalar()
        or 0
    )
    if inactive_total != 0:
        raise ValueError(
            "물리 위치 원장 불일치 — 비활성 특수구역에 수량이 남아 있습니다."
        )

    ledger = _WarehouseLedgerRows(
        inventory=inventory,
        box_rows=box_rows,
        zone_rows=zone_rows,
        unplaced=unplaced,
    )
    _assert_warehouse_ledger_rows(item_id, ledger)
    return ledger


def _assert_warehouse_ledger_rows(
    item_id: object,
    ledger: _WarehouseLedgerRows,
) -> None:
    warehouse = _quantity_as_int(
        ledger.inventory.warehouse_qty,
        label="창고",
    )
    box_total = sum(int(row.quantity) for row in ledger.box_rows)
    zone_total = sum(int(row.quantity) for row in ledger.zone_rows)
    unplaced = int(ledger.unplaced.quantity)
    if min(warehouse, box_total, zone_total, unplaced) < 0:
        raise ValueError("물리 위치 원장 불일치 — 음수 수량이 있습니다.")
    if box_total + zone_total + unplaced != warehouse:
        raise ValueError(
            "물리 위치 원장 불일치 — "
            f"item={item_id}, W={warehouse}, B={box_total}, "
            f"Z={zone_total}, U={unplaced}."
        )


def _apply_warehouse_ledger_delta(
    db: Session,
    item_id: object,
    delta: object,
    *,
    consume_mode: Literal["available", "reserved", "absolute"] = "available",
) -> Inventory:
    """Apply one W delta and its exact B/Z/U delta in a single locked unit.

    Positive stock always enters U. Negative stock consumes B, then active Z,
    then U. ``reserved`` consumes an existing StockRequest reservation;
    ``absolute`` is used by an explicit stock adjustment but still protects all
    active reservations.
    """
    change = _quantity_as_int(delta, label="변경")
    if change == 0:
        return _load_warehouse_ledger_rows(db, item_id).inventory

    ledger = _load_warehouse_ledger_rows(db, item_id)
    inventory = ledger.inventory
    warehouse = _quantity_as_int(inventory.warehouse_qty, label="창고")
    pending = _quantity_as_int(inventory.pending_quantity, label="예약")

    if change > 0:
        inventory.warehouse_qty = warehouse + change
        ledger.unplaced.quantity = int(ledger.unplaced.quantity) + change
    else:
        need = -change
        figure = stock_availability.figure_for_cell(
            db,
            stock_availability.AvailabilityCell.warehouse(inventory.item_id),
            lock_allocations=True,
        )
        if consume_mode in {"available", "absolute"} and figure.available < need:
            raise ValueError(
                "창고 가용 재고 부족 "
                f"(물리 {figure.physical}, 요청예약 {figure.stock_request_pending}, "
                f"출하예약 {figure.active_shipping_reserved}, "
                f"가용 {figure.available}, 차감 요청 {need})."
            )
        if consume_mode == "reserved":
            if pending < need:
                raise ValueError(
                    f"예약 수량이 부족합니다 (Pending {pending}, 차감 요청 {need})."
                )
            if figure.physical - figure.active_shipping_reserved < need:
                raise ValueError(
                    "창고 가용 재고 부족 "
                    f"(물리 {figure.physical}, 출하예약 "
                    f"{figure.active_shipping_reserved}, 차감 요청 {need})."
                )
            inventory.pending_quantity = pending - need
        if warehouse < need:
            raise ValueError(
                f"창고 재고가 부족합니다 (Warehouse {warehouse}, 차감 요청 {need})."
            )

        remaining = need
        depletion_rows: list[
            WarehouseBoxItem | WarehouseSpecialZoneItem | WarehouseUnplacedItem
        ] = [*ledger.box_rows, *ledger.zone_rows, ledger.unplaced]
        for row in depletion_rows:
            if remaining <= 0:
                break
            current = int(row.quantity)
            take = min(current, remaining)
            row.quantity = current - take
            remaining -= take
        if remaining:
            raise ValueError(
                "물리 위치 원장 불일치 — 출고할 물리 수량이 부족합니다."
            )
        inventory.warehouse_qty = warehouse - need

    db.flush()
    _assert_warehouse_ledger_rows(item_id, ledger)
    return inventory


def _lock_warehouse_ledger(db: Session, item_id: object) -> Inventory:
    """Lock and validate one complete W/B/Z/U ledger without changing it."""
    return _load_warehouse_ledger_rows(db, item_id).inventory


def _requested_item_quantities(items: Iterable[object]) -> dict[object, int]:
    requested: dict[object, int] = {}
    for item in items:
        item_id = getattr(item, "item_id")
        if item_id in requested:
            raise ValueError("같은 컨테이너에 중복 품목을 입력할 수 없습니다.")
        quantity = _quantity_as_int(getattr(item, "quantity"), label="배치")
        if quantity < 0:
            raise ValueError("배치 수량은 음수일 수 없습니다.")
        requested[item_id] = quantity
    return requested


def _replace_container_rows(
    db: Session,
    *,
    existing_rows: Sequence[WarehouseBoxItem | WarehouseSpecialZoneItem],
    requested: dict[object, int],
    create_row: Callable[
        [object, int],
        WarehouseBoxItem | WarehouseSpecialZoneItem,
    ],
) -> None:
    existing_by_item = {row.item_id: row for row in existing_rows}
    affected_item_ids = _sorted_unique_ids(
        [*existing_by_item.keys(), *requested.keys()]
    )
    ledgers = {
        item_id: _load_warehouse_ledger_rows(db, item_id)
        for item_id in affected_item_ids
    }
    active_item_ids = {
        row[0]
        for row in db.query(Item.item_id)
        .filter(
            Item.item_id.in_(affected_item_ids),
            Item.deleted_at.is_(None),
        )
        .all()
    }
    if any(
        quantity > 0 and item_id not in active_item_ids
        for item_id, quantity in requested.items()
    ):
        raise ValueError("삭제된 품목에는 창고 위치를 배정할 수 없습니다.")

    for item_id in affected_item_ids:
        row = existing_by_item.get(item_id)
        old_quantity = int(row.quantity) if row is not None else 0
        new_quantity = requested.get(item_id, 0)
        delta = new_quantity - old_quantity
        unplaced = ledgers[item_id].unplaced
        if delta > 0 and int(unplaced.quantity) < delta:
            raise ValueError(
                "미배치 수량 부족 — "
                f"현재 {int(unplaced.quantity)}, 추가 배치 {delta}."
            )
        unplaced.quantity = int(unplaced.quantity) - delta

        if row is None:
            db.add(create_row(item_id, new_quantity))
        elif item_id not in requested:
            db.delete(row)
        else:
            row.quantity = new_quantity

    db.flush()
    for item_id in affected_item_ids:
        _load_warehouse_ledger_rows(db, item_id)


def _replace_box_items(
    db: Session,
    box_id: object,
    items: Iterable[object],
) -> None:
    """Replace a box payload while preserving every surviving B row ID."""
    requested = _requested_item_quantities(items)
    initial_rows = (
        db.query(WarehouseBoxItem)
        .filter(WarehouseBoxItem.box_id == box_id)
        .all()
    )
    item_ids = [*(row.item_id for row in initial_rows), *requested.keys()]
    lock_warehouse_map_rows(db, item_ids=item_ids, box_ids=[box_id])
    rows = (
        db.query(WarehouseBoxItem)
        .filter(WarehouseBoxItem.box_id == box_id)
        .order_by(WarehouseBoxItem.item_id.asc(), WarehouseBoxItem.id.asc())
        .all()
    )
    initial_ids = {row.item_id for row in initial_rows}
    if any(row.item_id not in initial_ids for row in rows):
        raise ValueError("박스 내용이 동시에 변경되었습니다. 다시 시도하세요.")
    _replace_container_rows(
        db,
        existing_rows=rows,
        requested=requested,
        create_row=lambda item_id, quantity: WarehouseBoxItem(
            box_id=box_id,
            item_id=item_id,
            quantity=quantity,
        ),
    )


def _replace_zone_items(
    db: Session,
    zone_id: int,
    items: Iterable[object],
) -> None:
    """Replace a special-zone payload while preserving surviving Z row IDs."""
    requested = _requested_item_quantities(items)
    initial_rows = (
        db.query(WarehouseSpecialZoneItem)
        .filter(WarehouseSpecialZoneItem.zone_id == zone_id)
        .all()
    )
    item_ids = [*(row.item_id for row in initial_rows), *requested.keys()]
    lock_warehouse_map_rows(db, item_ids=item_ids, zone_ids=[zone_id])
    zone = db.get(WarehouseSpecialZone, zone_id)
    if zone is None:
        raise ValueError("특수구역을 찾을 수 없습니다.")
    if not zone.is_active and any(quantity > 0 for quantity in requested.values()):
        raise ValueError("비활성 특수구역에는 수량을 배치할 수 없습니다.")
    rows = (
        db.query(WarehouseSpecialZoneItem)
        .filter(WarehouseSpecialZoneItem.zone_id == zone_id)
        .order_by(
            WarehouseSpecialZoneItem.item_id.asc(),
            WarehouseSpecialZoneItem.id.asc(),
        )
        .all()
    )
    initial_ids = {row.item_id for row in initial_rows}
    if any(row.item_id not in initial_ids for row in rows):
        raise ValueError("특수구역 내용이 동시에 변경되었습니다. 다시 시도하세요.")
    _replace_container_rows(
        db,
        existing_rows=rows,
        requested=requested,
        create_row=lambda item_id, quantity: WarehouseSpecialZoneItem(
            zone_id=zone_id,
            item_id=item_id,
            quantity=quantity,
        ),
    )


def _deplete_boxes_by_order(db: Session, item_id: object, qty: object) -> None:
    """창고 출고(warehouse_qty 감소)에 맞춰 박스 수량을 R1 순서로 차감.

    정렬(R1): 층↓(layer_no DESC) → 줄↑(row_no ASC) → 자리↑(jari_index ASC)
              → 스택↓(stack_order DESC, 위 박스 먼저).
    첫 비어있지 않은 박스부터 깎고 0이 되면 다음으로(R2). 빈 박스는 건너뜀(R3).
    박스 합 < qty 면 ValueError(R5 — 항상 차단). 호출 측 트랜잭션에서 롤백된다.
    """
    need = _quantity_as_int(qty, label="차감")
    if need <= 0:
        return

    lock_warehouse_map_rows(
        db,
        item_ids=[item_id],
        include_boxes_for_item_ids=True,
    )

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




def _content_item_payload(
    content: WarehouseBoxItem | WarehouseSpecialZoneItem,
    color_map: dict[str, Optional[str]],
) -> Optional[dict[str, object]]:
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

    unplaced_payloads = [
        {
            "row_id": row.id,
            "item_id": item.item_id,
            "mes_code": item.mes_code,
            "item_name": item.item_name,
            "quantity": int(row.quantity),
        }
        for row, item in (
            db.query(WarehouseUnplacedItem, Item)
            .join(Item, WarehouseUnplacedItem.item_id == Item.item_id)
            .filter(Item.deleted_at.is_(None))
            .order_by(Item.mes_code.asc(), Item.item_id.asc())
            .all()
        )
    ]

    return {
        "angles": angles,
        "boxes": box_payloads,
        "special_zones": special_zone_payloads,
        "unplaced_items": unplaced_payloads,
    }


def reconcile_inventory(
    db: Session,
    item_id: object | None = None,
) -> dict[str, object]:
    """Report both legacy placed totals and the complete B+Z+U ledger."""
    box_q = (
        db.query(
            WarehouseBoxItem.item_id.label("item_id"),
            func.coalesce(func.sum(WarehouseBoxItem.quantity), 0).label("box_total"),
        )
        .group_by(WarehouseBoxItem.item_id)
    )
    if item_id is not None:
        box_q = box_q.filter(WarehouseBoxItem.item_id == item_id)
    box_rows = {row.item_id: int(row.box_total) for row in box_q.all()}

    zone_q = (
        db.query(
            WarehouseSpecialZoneItem.item_id.label("item_id"),
            func.coalesce(func.sum(WarehouseSpecialZoneItem.quantity), 0).label(
                "zone_total"
            ),
        )
        .join(WarehouseSpecialZone, WarehouseSpecialZoneItem.zone_id == WarehouseSpecialZone.id)
        .filter(WarehouseSpecialZone.is_active.is_(True))
        .group_by(WarehouseSpecialZoneItem.item_id)
    )
    if item_id is not None:
        zone_q = zone_q.filter(WarehouseSpecialZoneItem.item_id == item_id)
    zone_rows = {row.item_id: int(row.zone_total) for row in zone_q.all()}

    inactive_zone_q = (
        db.query(
            WarehouseSpecialZoneItem.item_id.label("item_id"),
            func.coalesce(func.sum(WarehouseSpecialZoneItem.quantity), 0).label(
                "zone_total"
            ),
        )
        .join(
            WarehouseSpecialZone,
            WarehouseSpecialZoneItem.zone_id == WarehouseSpecialZone.id,
        )
        .filter(WarehouseSpecialZone.is_active.is_(False))
        .group_by(WarehouseSpecialZoneItem.item_id)
    )
    if item_id is not None:
        inactive_zone_q = inactive_zone_q.filter(
            WarehouseSpecialZoneItem.item_id == item_id
        )
    inactive_zone_rows = {
        row.item_id: int(row.zone_total) for row in inactive_zone_q.all()
    }

    unplaced_q = db.query(WarehouseUnplacedItem)
    if item_id is not None:
        unplaced_q = unplaced_q.filter(WarehouseUnplacedItem.item_id == item_id)
    unplaced_rows = {row.item_id: int(row.quantity) for row in unplaced_q.all()}

    item_q = db.query(Item).filter(Item.deleted_at.is_(None))
    if item_id is not None:
        item_q = item_q.filter(Item.item_id == item_id)
    items = item_q.all()
    target_ids = [item.item_id for item in items]
    inv_map = {
        inventory.item_id: int(inventory.warehouse_qty or 0)
        for inventory in (
            db.query(Inventory).filter(Inventory.item_id.in_(target_ids)).all()
            if target_ids
            else []
        )
    }

    rows: list[dict] = []
    mismatch = 0
    ledger_mismatch = 0
    for item in items:
        box_total = box_rows.get(item.item_id, 0)
        zone_total = zone_rows.get(item.item_id, 0)
        inactive_zone_total = inactive_zone_rows.get(item.item_id, 0)
        unplaced_total = unplaced_rows.get(item.item_id, 0)
        placed = box_total + zone_total
        warehouse = inv_map.get(item.item_id, 0)
        diff = placed - warehouse
        status = "ok" if diff == 0 else ("over" if diff > 0 else "under")
        if diff != 0:
            mismatch += 1

        ledger_total = placed + unplaced_total
        ledger_diff = ledger_total - warehouse
        inventory_present = item.item_id in inv_map
        unplaced_present = item.item_id in unplaced_rows
        ledger_issues: list[str] = []
        if not inventory_present:
            ledger_issues.append("missing_inventory")
        if not unplaced_present:
            ledger_issues.append("missing_unplaced")
        if inactive_zone_total:
            ledger_issues.append("inactive_zone_stock")
        ledger_status = (
            "invalid"
            if ledger_issues
            else (
                "ok"
                if ledger_diff == 0
                else ("over" if ledger_diff > 0 else "under")
            )
        )
        if ledger_diff != 0 or ledger_issues:
            ledger_mismatch += 1
        rows.append(
            {
                "item_id": item.item_id,
                "mes_code": item.mes_code,
                "item_name": item.item_name,
                "placed_total": placed,
                "warehouse_qty": warehouse,
                "diff": diff,
                "status": status,
                "box_total": box_total,
                "zone_total": zone_total,
                "unplaced_total": unplaced_total,
                "inactive_zone_total": inactive_zone_total,
                "ledger_total": ledger_total,
                "ledger_diff": ledger_diff,
                "ledger_status": ledger_status,
                "inventory_present": inventory_present,
                "unplaced_present": unplaced_present,
                "ledger_issues": ledger_issues,
            }
        )
    rows.sort(
        key=lambda row: (
            row["ledger_status"] == "ok",
            row["status"] == "ok",
            row["mes_code"] or "",
            str(row["item_id"]),
        )
    )
    return {
        "rows": rows,
        "mismatch_count": mismatch,
        "ledger_mismatch_count": ledger_mismatch,
    }
