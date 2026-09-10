"""B→active Z→U 창고 차감과 정확 역재생을 실DB에서 비파괴 검증한다.

검증용 물리 배치는 현재 트랜잭션 안에서만 만들고 마지막에 항상 rollback한다.

실행:
  cd backend
  python ../_attic/backend-scripts/verify_box_depletion.py
"""

from __future__ import annotations

from decimal import Decimal
import sys
from types import SimpleNamespace
import uuid

sys.path.insert(0, ".")

from sqlalchemy import func  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    Employee,
    Inventory,
    Item,
    RequestBucketEnum,
    StockRequestTypeEnum,
    WarehouseBox,
    WarehouseBoxItem,
    WarehouseSpecialZone,
    WarehouseSpecialZoneItem,
    WarehouseUnplacedItem,
)
from app.services import inv_effect  # noqa: E402
from app.services import stock_requests  # noqa: E402
from app.services import warehouse_map as wm  # noqa: E402
from app.services.sr_validation import LineInput  # noqa: E402


TARGET_CODE = "9-HR-0057"
RELEASE_FROM_BOX = 3
TEMP_ZONE_QUANTITY = 1


def _box_total(db: Session, item_id: object) -> int:
    return int(
        db.query(func.coalesce(func.sum(WarehouseBoxItem.quantity), 0))
        .filter(WarehouseBoxItem.item_id == item_id)
        .scalar()
        or 0
    )


def _warehouse_quantity(db: Session, item_id: object) -> int:
    return int(
        db.query(Inventory.warehouse_qty)
        .filter(Inventory.item_id == item_id)
        .scalar()
        or 0
    )


def _replace_without_target(
    db: Session,
    *,
    zone: WarehouseSpecialZone,
    item_id: object,
) -> None:
    contents = (
        db.query(WarehouseSpecialZoneItem)
        .filter(WarehouseSpecialZoneItem.zone_id == zone.id)
        .order_by(WarehouseSpecialZoneItem.item_id, WarehouseSpecialZoneItem.id)
        .all()
    )
    wm._replace_zone_items(
        db,
        zone.id,
        [
            SimpleNamespace(item_id=row.item_id, quantity=int(row.quantity))
            for row in contents
            if row.item_id != item_id
        ],
    )


def _release_box_quantity_to_unplaced(
    db: Session,
    *,
    item_id: object,
    quantity: int,
) -> None:
    remaining = quantity
    target_rows = (
        db.query(WarehouseBoxItem)
        .join(WarehouseBox, WarehouseBoxItem.box_id == WarehouseBox.box_id)
        .filter(WarehouseBoxItem.item_id == item_id)
        .order_by(
            WarehouseBox.layer_no.desc(),
            WarehouseBox.row_no.asc(),
            WarehouseBox.jari_index.asc(),
            WarehouseBox.stack_order.desc(),
            WarehouseBox.box_id.asc(),
            WarehouseBoxItem.id.asc(),
        )
        .all()
    )
    for target in target_rows:
        if remaining == 0:
            break
        released = min(int(target.quantity), remaining)
        contents = (
            db.query(WarehouseBoxItem)
            .filter(WarehouseBoxItem.box_id == target.box_id)
            .order_by(WarehouseBoxItem.item_id, WarehouseBoxItem.id)
            .all()
        )
        payload = []
        for row in contents:
            new_quantity = int(row.quantity)
            if row.id == target.id:
                new_quantity -= released
            if new_quantity > 0:
                payload.append(
                    SimpleNamespace(item_id=row.item_id, quantity=new_quantity)
                )
        wm._replace_box_items(db, target.box_id, payload)
        remaining -= released
    if remaining:
        raise RuntimeError(
            f"검증에 필요한 B 수량이 부족합니다: 필요 {quantity}, 부족 {remaining}"
        )


def _shape_bzu_fixture(
    db: Session,
    *,
    item_id: object,
) -> WarehouseSpecialZone:
    if _box_total(db, item_id) < RELEASE_FROM_BOX + 1:
        raise RuntimeError(
            f"{TARGET_CODE}의 B 수량이 {RELEASE_FROM_BOX + 1} 미만입니다. "
            "분산 배치 스크립트를 먼저 실행하세요."
        )

    existing_zones = (
        db.query(WarehouseSpecialZone)
        .join(
            WarehouseSpecialZoneItem,
            WarehouseSpecialZoneItem.zone_id == WarehouseSpecialZone.id,
        )
        .filter(
            WarehouseSpecialZone.is_active.is_(True),
            WarehouseSpecialZoneItem.item_id == item_id,
        )
        .order_by(WarehouseSpecialZone.display_order, WarehouseSpecialZone.id)
        .all()
    )
    for zone in existing_zones:
        _replace_without_target(db, zone=zone, item_id=item_id)

    _release_box_quantity_to_unplaced(
        db,
        item_id=item_id,
        quantity=RELEASE_FROM_BOX,
    )
    zone = WarehouseSpecialZone(
        label=f"B/Z/U verify {uuid.uuid4().hex[:8]}",
        zone_type="pallet",
        pos_x=0,
        pos_y=0,
        width=80,
        height=40,
        display_order=0,
        is_active=True,
    )
    db.add(zone)
    db.flush()
    wm._replace_zone_items(
        db,
        zone.id,
        [SimpleNamespace(item_id=item_id, quantity=TEMP_ZONE_QUANTITY)],
    )
    report = wm.reconcile_inventory(db, item_id)
    if report["ledger_mismatch_count"]:
        raise RuntimeError("검증용 B/Z/U 배치가 원장 대조를 통과하지 못했습니다.")
    return zone


def _ship_from_warehouse(
    db: Session,
    *,
    actor: Employee,
    item_id: object,
    quantity: int,
) -> None:
    stock_requests.create_request(
        db,
        requester=actor,
        request_type=StockRequestTypeEnum.RAW_SHIP,
        lines_input=[
            LineInput(
                item_id=item_id,
                quantity=Decimal(quantity),
                from_bucket=RequestBucketEnum.WAREHOUSE,
                to_bucket=RequestBucketEnum.NONE,
            )
        ],
        reference_no="B-Z-U-DEPLETION-VERIFY",
        notes="비파괴 B→active Z→U 차감 검증",
        client_request_id=f"bzu-depletion-verify-{uuid.uuid4()}",
    )


def main() -> int:
    passed: list[str] = []
    failed: list[str] = []

    def check(name: str, condition: bool) -> None:
        (passed if condition else failed).append(name)
        print(("  [PASS] " if condition else "  [FAIL] ") + name)

    db = SessionLocal()
    try:
        item = db.query(Item).filter(Item.mes_code == TARGET_CODE).first()
        if item is None:
            print(f"대상 품목 {TARGET_CODE} 없음")
            return 1
        actor = (
            db.query(Employee)
            .filter(Employee.is_active == "true")
            .order_by(Employee.employee_code)
            .first()
        )
        if actor is None:
            print("활성 작업자 없음 — bootstrap_db.py --all 먼저 실행 필요")
            return 1
        actor.warehouse_role = "primary"

        zone = _shape_bzu_fixture(db, item_id=item.item_id)
        before = inv_effect._snapshot_cells(db, item.item_id)
        box_quantity = _box_total(db, item.item_id)
        unplaced = (
            db.query(WarehouseUnplacedItem)
            .filter(WarehouseUnplacedItem.item_id == item.item_id)
            .one()
        )
        unplaced_before = int(unplaced.quantity)
        check("검증 전 B가 양수", box_quantity > 0)
        check("검증 전 active Z가 1", int(zone.contents[0].quantity) == 1)
        check("검증 전 U가 2 이상", unplaced_before >= 2)

        outbound_quantity = box_quantity + TEMP_ZONE_QUANTITY + 1
        _ship_from_warehouse(
            db,
            actor=actor,
            item_id=item.item_id,
            quantity=outbound_quantity,
        )
        after = inv_effect._snapshot_cells(db, item.item_id)
        effect = inv_effect.effect_diff(before, after)
        scopes = {entry["scope"] for entry in effect}
        check("B를 먼저 모두 차감", _box_total(db, item.item_id) == 0)
        check("active Z를 U보다 먼저 차감", int(zone.contents[0].quantity) == 0)
        check("Z 다음 U에서 1 차감", int(unplaced.quantity) == unplaced_before - 1)
        check(
            "효과에 B/Z/U 실제 행이 모두 기록",
            {
                "warehouse_box",
                "warehouse_zone",
                "warehouse_unplaced",
            }.issubset(scopes),
        )

        inv_effect._apply_effect_reverse(db, item.item_id, effect)
        db.flush()
        restored = inv_effect._snapshot_cells(db, item.item_id)
        check("B/Z/U UUID와 수량 정확 역재생", restored == before)

        warehouse_quantity = _warehouse_quantity(db, item.item_id)
        try:
            _ship_from_warehouse(
                db,
                actor=actor,
                item_id=item.item_id,
                quantity=warehouse_quantity + 1,
            )
            check("W 초과 출고 차단", False)
        except ValueError as exc:
            print("  차단 메시지:", str(exc)[:100])
            check("W 초과 출고 차단", True)

        print(
            f"\n결과: PASS {len(passed)} / FAIL {len(failed)} "
            "(항상 rollback으로 비파괴 종료)"
        )
        return 1 if failed else 0
    finally:
        db.rollback()
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
