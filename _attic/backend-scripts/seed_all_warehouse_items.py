"""창고 재고 품목 전체 배치 시드.

warehouse_qty > 0인 모든 품목을 창고 지도의 무작위 자리에 배치.
placed_total = warehouse_qty 정확히 맞춤.

실행:
  cd backend
  python ../_attic/backend-scripts/seed_all_warehouse_items.py          # dry-run
  python ../_attic/backend-scripts/seed_all_warehouse_items.py --apply
"""
import sys
import random
sys.path.insert(0, ".")

from app.database import SessionLocal
from app.models import WarehouseBox, WarehouseBoxItem, Item, Inventory, WarehouseAngle, BoxSizeEnum
from app.services.warehouse_map import SIZE_UNIT, JARI_CAPACITY
from sqlalchemy import func
from uuid import uuid4

apply_mode = "--apply" in sys.argv
print(f"{'[APPLY]' if apply_mode else '[DRY-RUN]'} 창고 재고 품목 전체 배치\n")

db = SessionLocal()

# ── 1. 모든 자리(jari) 슬롯 생성 + 현재 사용도 계산 ──────────────────────
angles = db.query(WarehouseAngle).filter(WarehouseAngle.is_active == True).all()
all_slots = []  # (angle_id, row, layer, jari_index)

for a in angles:
    for row in range(1, a.rows + 1):
        for layer in range(1, a.layers + 1):
            for jari in range(a.jaris_per_cell):
                all_slots.append((a.id, row, layer, jari))

print(f"전체 자리 슬롯: {len(all_slots)}개")

# 자리별 사용도 맵: (angle_id, row, layer, jari) → 점유 유닛
usage = {}
boxes = db.query(WarehouseBox).all()
for b in boxes:
    k = (b.angle_id, b.row_no, b.layer_no, b.jari_index)
    usage[k] = usage.get(k, 0) + SIZE_UNIT.get(b.size.value if hasattr(b.size, "value") else b.size, 1)

# 여유 있는 자리만 필터링
available_slots = [s for s in all_slots if usage.get(s, 0) < JARI_CAPACITY]
random.shuffle(available_slots)
print(f"여유 있는 자리: {len(available_slots)}개\n")

# ── 2. warehouse_qty > 0인 품목 순회 ──────────────────────────────────────
inventory_items = (
    db.query(Inventory)
    .filter(Inventory.warehouse_qty > 0)
    .order_by(Inventory.item_id)
    .all()
)

print(f"배치할 품목: {len(inventory_items)}개\n")

created_boxes = 0
adjusted_items = 0
slot_cursor = 0

for inv in inventory_items:
    # 현재 배치 수량
    placed = (
        db.query(func.sum(WarehouseBoxItem.quantity))
        .filter(WarehouseBoxItem.item_id == inv.item_id)
        .scalar() or 0
    )
    placed = int(placed)
    delta = int(inv.warehouse_qty) - placed

    if delta == 0:
        continue  # 이미 정확히 맞음

    # 해당 품목의 기존 박스
    existing_box = (
        db.query(WarehouseBox)
        .join(WarehouseBoxItem, WarehouseBoxItem.box_id == WarehouseBox.box_id)
        .filter(WarehouseBoxItem.item_id == inv.item_id)
        .first()
    )

    if existing_box:
        # 기존 박스의 첫 행에 수량 추가
        existing_row = (
            db.query(WarehouseBoxItem)
            .filter(
                WarehouseBoxItem.box_id == existing_box.box_id,
                WarehouseBoxItem.item_id == inv.item_id,
            )
            .first()
        )
        if existing_row:
            existing_row.quantity += delta
            adjusted_items += 1
    else:
        # 새 박스 생성 (SMALL = 1 유닛, 가장 공간 효율적)
        if slot_cursor >= len(available_slots):
            print(f"⚠ 자리 부족! {len(available_slots)}개 슬롯 초과됨")
            break

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

        item_row = WarehouseBoxItem(
            box_id=box.box_id,
            item_id=inv.item_id,
            quantity=int(inv.warehouse_qty),
        )
        db.add(item_row)
        created_boxes += 1
        slot_cursor += 1

if apply_mode:
    db.commit()
    print(f"\n완료:")
    print(f"  생성된 박스: {created_boxes}개")
    print(f"  수량 조정된 품목: {adjusted_items}개")

    # 검증
    mismatches = (
        db.query(Inventory.item_id)
        .filter(Inventory.warehouse_qty > 0)
        .outerjoin(
            db.query(WarehouseBoxItem.item_id, func.sum(WarehouseBoxItem.quantity).label("total"))
            .group_by(WarehouseBoxItem.item_id)
            .subquery(),
            Inventory.item_id == db.session.query(WarehouseBoxItem.item_id).subquery().c.item_id,
        )
        .count()
    )
    print(f"  검증: 재고 대조 실행 중...")
else:
    print(f"\n[DRY-RUN 요약]")
    print(f"  예상 생성 박스: {created_boxes}개")
    print(f"  예상 조정 품목: {adjusted_items}개")

db.close()
