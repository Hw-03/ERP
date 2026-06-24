"""창고 박스 품목 정합성 정리.

규칙:
  - warehouse_qty = 0인 품목은 박스에서 제거
  - placed_total > warehouse_qty인 품목은 박스별 비율로 축소
  - 품목이 없어진 빈 박스 제거

실행:
  cd backend
  python ../_attic/backend-scripts/fix_warehouse_box_items.py          # dry-run
  python ../_attic/backend-scripts/fix_warehouse_box_items.py --apply  # 실제 적용
"""
import sys
import math
sys.path.insert(0, ".")

from collections import defaultdict
from app.database import SessionLocal
from app.models import WarehouseBox, WarehouseBoxItem, Item, Inventory
from sqlalchemy import func

apply_mode = "--apply" in sys.argv
print(f"{'[APPLY]' if apply_mode else '[DRY-RUN]'} 창고 박스 품목 정합성 정리\n")

db = SessionLocal()

# ── 1. 현재 상태 수집 ──────────────────────────────────────────────────
all_items_rows = (
    db.query(
        WarehouseBoxItem.id,
        WarehouseBoxItem.box_id,
        WarehouseBoxItem.item_id,
        WarehouseBoxItem.quantity,
        Inventory.warehouse_qty,
    )
    .join(Inventory, Inventory.item_id == WarehouseBoxItem.item_id, isouter=True)
    .all()
)

# item_id → [(wbi_id, box_id, qty), ...]
by_item: dict = defaultdict(list)
wq_map: dict = {}
for row in all_items_rows:
    by_item[row.item_id].append((row.id, row.box_id, int(row.quantity)))
    wq_map[row.item_id] = int(row.warehouse_qty or 0)

# ── 2. 분류 ───────────────────────────────────────────────────────────
to_delete_ids = []   # WarehouseBoxItem.id 목록
to_update = []       # (wbi_id, new_qty)

deleted_item_count = 0
adjusted_item_count = 0

for item_id, entries in by_item.items():
    wq = wq_map[item_id]
    placed_total = sum(q for _, _, q in entries)

    if wq == 0:
        # 창고 재고 없음 → 전부 삭제
        to_delete_ids.extend(wbi_id for wbi_id, _, _ in entries)
        deleted_item_count += 1
        item_name = (db.query(Item.item_name).filter(Item.item_id == item_id).scalar() or "")[:40]
        print(f"  삭제: {item_name} | 배치={placed_total} warehouse_qty=0")

    elif placed_total > wq:
        # 초과 → 비율 축소
        adjusted_item_count += 1
        item_name = (db.query(Item.item_name).filter(Item.item_id == item_id).scalar() or "")[:40]
        print(f"  조정: {item_name} | 배치={placed_total} → {wq} (초과 -{placed_total - wq})")

        # 비율 계산: floor 후 나머지를 가장 큰 항목에 배분
        scaled = [(wbi_id, box_id, math.floor(q * wq / placed_total)) for wbi_id, box_id, q in entries]
        remainder = wq - sum(s for _, _, s in scaled)
        # remainder를 원래 수량이 가장 큰 순으로 +1 배분
        sorted_idx = sorted(range(len(entries)), key=lambda i: entries[i][2], reverse=True)
        scaled_list = list(scaled)
        for i in range(remainder):
            idx = sorted_idx[i % len(sorted_idx)]
            wbi_id, box_id, s = scaled_list[idx]
            scaled_list[idx] = (wbi_id, box_id, s + 1)

        for wbi_id, _, new_qty in scaled_list:
            if new_qty == 0:
                to_delete_ids.append(wbi_id)
            else:
                to_update.append((wbi_id, new_qty))

# ── 3. 적용 ───────────────────────────────────────────────────────────
if apply_mode:
    if to_delete_ids:
        db.query(WarehouseBoxItem).filter(WarehouseBoxItem.id.in_(to_delete_ids)).delete(synchronize_session=False)

    for wbi_id, new_qty in to_update:
        db.query(WarehouseBoxItem).filter(WarehouseBoxItem.id == wbi_id).update(
            {"quantity": new_qty}, synchronize_session=False
        )

    # 빈 박스 제거
    remaining_box_ids = {r[0] for r in db.query(WarehouseBoxItem.box_id).distinct().all()}
    all_box_ids = {r[0] for r in db.query(WarehouseBox.box_id).all()}
    empty_box_ids = all_box_ids - remaining_box_ids
    if empty_box_ids:
        db.query(WarehouseBox).filter(WarehouseBox.box_id.in_(empty_box_ids)).delete(synchronize_session=False)

    db.commit()

    print(f"\n완료:")
    print(f"  삭제된 WarehouseBoxItem 행: {len(to_delete_ids)}개 ({deleted_item_count}품목)")
    print(f"  수량 조정된 행: {len(to_update)}개 ({adjusted_item_count}품목)")
    print(f"  삭제된 빈 박스: {len(empty_box_ids)}개")
else:
    print(f"\n[DRY-RUN 요약] --apply 플래그 없이는 변경되지 않습니다.")
    print(f"  삭제 예정 WarehouseBoxItem 행: {len(to_delete_ids)}개 ({deleted_item_count}품목)")
    print(f"  수량 조정 예정 행: {len(to_update)}개 ({adjusted_item_count}품목)")

db.close()
