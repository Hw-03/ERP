"""대표 품목을 '같은 앵글의 한 셀'에 여러 박스로 바짝 붙여 분산 — R1 차감 시연용.

설계 가정 R8: 한 품목은 한 앵글 안에만 둔다. 현장에서도 같은 부품이 여러 박스면
서로 붙어(같은 줄.층의 자리/스택) 있다. 이 스크립트는 대표 품목을 그 품목이 가장
많이 있던 앵글에서 '빈 공간이 가장 많은 셀' 하나에 자리/스택으로 모아 분산한다.
이전에 여러 앵글로 흩어진 배치가 있으면 먼저 거둬들이고(idempotent) 다시 깐다.
박스 수량 합은 보존하므로 정합성(placed_total == warehouse_qty)은 유지된다.

실행:
  cd backend
  python ../_attic/backend-scripts/distribute_warehouse_boxes.py          # dry-run
  python ../_attic/backend-scripts/distribute_warehouse_boxes.py --apply
"""
import sys
sys.path.insert(0, ".")

from uuid import uuid4
from collections import Counter, defaultdict
from app.database import SessionLocal
from app.models import (
    WarehouseBox, WarehouseBoxItem, Item, Inventory, WarehouseAngle, BoxSizeEnum,
)
from app.services.warehouse_map import SIZE_UNIT, JARI_CAPACITY

apply_mode = "--apply" in sys.argv
# distribute 가 이전에 흩어놓은 대표 6품목 — 같은 셀로 재배치 대상
TARGET_CODES = ["9-HR-0057", "46-AR-0075", "7-AF-0028", "78-PR-0042", "7-AR-0212", "8-AA-0070"]
SPLIT = 4
print(f"{'[APPLY]' if apply_mode else '[DRY-RUN]'} 대표 품목 같은-앵글 한 셀 분산\n")

db = SessionLocal()
angles = {a.id: a for a in db.query(WarehouseAngle).all()}


def cell_state(angle_id):
    """(row,layer,jari) -> 점유 유닛 / 스택(박스) 수."""
    used = defaultdict(int)
    stack = defaultdict(int)
    for b in db.query(WarehouseBox).filter(WarehouseBox.angle_id == angle_id).all():
        k = (b.row_no, b.layer_no, b.jari_index)
        sz = b.size.value if hasattr(b.size, "value") else b.size
        used[k] += SIZE_UNIT.get(sz, 1)
        stack[k] += 1
    return used, stack


for code in TARGET_CODES:
    item = db.query(Item).filter(Item.mes_code == code).first()
    if item is None:
        print(f"  [skip] {code} 없음")
        continue
    iid = item.item_id
    wq = int(db.query(Inventory.warehouse_qty).filter(Inventory.item_id == iid).scalar() or 0)

    boxes = (
        db.query(WarehouseBox)
        .join(WarehouseBoxItem, WarehouseBoxItem.box_id == WarehouseBox.box_id)
        .filter(WarehouseBoxItem.item_id == iid)
        .all()
    )
    if not boxes:
        print(f"  [skip] {code} 박스 없음")
        continue
    angle_use = Counter(b.angle_id for b in boxes).most_common(1)[0][0]

    # 1) 현 배치 거둬들이기 — 이 품목 박스아이템 삭제 + 비게 된 박스 삭제
    box_ids = [b.box_id for b in boxes]
    db.query(WarehouseBoxItem).filter(WarehouseBoxItem.item_id == iid).delete(synchronize_session=False)
    for bid in box_ids:
        if db.query(WarehouseBoxItem).filter(WarehouseBoxItem.box_id == bid).count() == 0:
            db.query(WarehouseBox).filter(WarehouseBox.box_id == bid).delete(synchronize_session=False)
    db.flush()

    # 2) angle_use 에서 빈 공간 가장 많은 셀 한 개 선택
    a = angles[angle_use]
    used, stack = cell_state(angle_use)
    cells = sorted(
        (
            (sum(JARI_CAPACITY - used.get((r, l, j), 0) for j in range(a.jaris_per_cell)), r, l)
            for r in range(1, a.rows + 1)
            for l in range(1, a.layers + 1)
        ),
        reverse=True,
    )
    free_top, row, layer = cells[0]
    if free_top < SPLIT:
        print(f"  [skip] 앵글{angle_use} 한 셀 빈 공간 부족(최대 {free_top}<{SPLIT}) — {code}")
        continue

    # 3) 그 셀 안에서 자리별 용량(3유닛) 지키며 SPLIT 배치 — 바짝 붙임
    base, rem = divmod(wq, SPLIT)
    parts = [base + (1 if i < rem else 0) for i in range(SPLIT)]
    placed = []
    pi = 0
    # 빈 자리 우선 — 같은 품목 박스가 다른 품목과 자리를 덜 섞이게
    for j in sorted(range(a.jaris_per_cell), key=lambda j: used.get((row, layer, j), 0)):
        while used.get((row, layer, j), 0) < JARI_CAPACITY and pi < SPLIT:
            so = stack.get((row, layer, j), 0)
            nb = WarehouseBox(
                box_id=str(uuid4()), angle_id=angle_use, row_no=row, layer_no=layer,
                jari_index=j, size=BoxSizeEnum.SMALL, stack_order=so,
            )
            db.add(nb)
            db.flush()
            db.add(WarehouseBoxItem(box_id=nb.box_id, item_id=iid, quantity=parts[pi]))
            used[(row, layer, j)] = used.get((row, layer, j), 0) + 1
            stack[(row, layer, j)] = so + 1
            placed.append((j, so, parts[pi]))
            pi += 1
        if pi >= SPLIT:
            break
    db.flush()
    loc = "  ".join(f"자리{j}.스택{s}={q}" for j, s, q in placed)
    print(f"{code} (총 {wq}) -> 앵글{angle_use}.{row}줄.{layer}층")
    print(f"    {loc}")

if apply_mode:
    db.commit()
    print("\n완료: 같은 앵글 한 셀로 재배치 (합 보존, 정합성 유지)")
else:
    db.rollback()
    print("\n[DRY-RUN] --apply 없이는 변경되지 않습니다.")
db.close()
