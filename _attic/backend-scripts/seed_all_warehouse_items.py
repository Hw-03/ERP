"""창고 미배치 재고를 창고 지도의 박스로 배치한다.

실행:
  cd backend
  python ../_attic/backend-scripts/seed_all_warehouse_items.py          # dry-run
  python ../_attic/backend-scripts/seed_all_warehouse_items.py --apply
"""

import random
import sys
from types import SimpleNamespace
from uuid import uuid4

sys.path.insert(0, ".")

from app.database import SessionLocal
from app.models import (
    BoxSizeEnum,
    Inventory,
    Item,
    WarehouseAngle,
    WarehouseBox,
    WarehouseBoxItem,
    WarehouseUnplacedItem,
)
from app.services.warehouse_map import (
    JARI_CAPACITY,
    SIZE_UNIT,
    _lock_warehouse_ledger,
    reconcile_inventory,
    _replace_box_items,
)


def main() -> None:
    """미배치 재고 전체를 배치하고, 실패하면 변경 전부를 롤백한다."""
    apply_mode = "--apply" in sys.argv
    print(f"{'[APPLY]' if apply_mode else '[DRY-RUN]'} 창고 재고 품목 전체 배치\n")

    db = SessionLocal()
    try:
        angles = (
            db.query(WarehouseAngle)
            .filter(WarehouseAngle.is_active.is_(True))
            .all()
        )
        all_slots = [
            (angle.id, row, layer, jari)
            for angle in angles
            for row in range(1, angle.rows + 1)
            for layer in range(1, angle.layers + 1)
            for jari in range(angle.jaris_per_cell)
        ]
        print(f"전체 자리 슬롯: {len(all_slots)}개")

        usage: dict[tuple[int, int, int, int], int] = {}
        boxes = db.query(WarehouseBox).all()
        for box in boxes:
            key = (box.angle_id, box.row_no, box.layer_no, box.jari_index)
            size = box.size.value if hasattr(box.size, "value") else box.size
            usage[key] = usage.get(key, 0) + SIZE_UNIT.get(size, 1)

        available_slots = [
            slot for slot in all_slots if usage.get(slot, 0) < JARI_CAPACITY
        ]
        random.shuffle(available_slots)
        print(f"여유 있는 자리: {len(available_slots)}개\n")

        inventory_items = (
            db.query(Inventory)
            .join(Item, Item.item_id == Inventory.item_id)
            .filter(Item.deleted_at.is_(None), Inventory.warehouse_qty > 0)
            .order_by(Inventory.item_id)
            .all()
        )
        print(f"배치할 품목: {len(inventory_items)}개\n")

        created_boxes = 0
        adjusted_items = 0
        slot_cursor = 0

        for inventory in inventory_items:
            _lock_warehouse_ledger(db, inventory.item_id)
            unplaced = (
                db.query(WarehouseUnplacedItem)
                .filter(WarehouseUnplacedItem.item_id == inventory.item_id)
                .one()
            )
            delta = int(unplaced.quantity)
            if delta == 0:
                continue

            existing_box = (
                db.query(WarehouseBox)
                .join(WarehouseBoxItem, WarehouseBoxItem.box_id == WarehouseBox.box_id)
                .filter(WarehouseBoxItem.item_id == inventory.item_id)
                .first()
            )
            if existing_box:
                existing_rows = (
                    db.query(WarehouseBoxItem)
                    .filter(WarehouseBoxItem.box_id == existing_box.box_id)
                    .order_by(WarehouseBoxItem.item_id, WarehouseBoxItem.id)
                    .all()
                )
                _replace_box_items(
                    db,
                    existing_box.box_id,
                    [
                        SimpleNamespace(
                            item_id=row.item_id,
                            quantity=int(row.quantity)
                            + (delta if row.item_id == inventory.item_id else 0),
                        )
                        for row in existing_rows
                    ],
                )
                adjusted_items += 1
                continue

            if slot_cursor >= len(available_slots):
                raise RuntimeError("창고 자리가 부족하여 전체 배치를 완료할 수 없습니다.")

            angle_id, row, layer, jari = available_slots[slot_cursor]
            box = WarehouseBox(
                box_id=str(uuid4()),
                angle_id=angle_id,
                row_no=row,
                layer_no=layer,
                jari_index=jari,
                size=BoxSizeEnum.SMALL,
                stack_order=0,
            )
            db.add(box)
            db.flush()
            _replace_box_items(
                db,
                box.box_id,
                [SimpleNamespace(item_id=inventory.item_id, quantity=delta)],
            )
            created_boxes += 1
            slot_cursor += 1

        reconciliation = reconcile_inventory(db)
        if reconciliation["ledger_mismatch_count"]:
            raise RuntimeError(
                "창고 원장 대조 실패: "
                f"{reconciliation['ledger_mismatch_count']}개 품목이 W=B+Z+U를 위반합니다."
            )

        if apply_mode:
            db.commit()
            print("\n완료:")
            print(f"  생성된 박스: {created_boxes}개")
            print(f"  수량 조정된 품목: {adjusted_items}개")
            print("  검증: W=B+Z+U 대조 통과")
        else:
            db.rollback()
            print("\n[DRY-RUN 요약]")
            print(f"  예상 생성 박스: {created_boxes}개")
            print(f"  예상 조정 품목: {adjusted_items}개")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
