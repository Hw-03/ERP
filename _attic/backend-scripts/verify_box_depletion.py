"""창고 박스 자동 차감 실DB 검증 (비파괴).

플래그 ON 상태에서 분산 배치된 품목으로 실제 출고 경로(consume_warehouse)를 타,
  1) R1 차감 순서(층↓→줄↑→자리↑→스택↓)
  2) R6 취소 원복(inventory_effect warehouse_box scope 역재생)
  3) R5 박스 합 초과 출고 차단(ValueError)
을 확인한다. 마지막에 db.rollback() 으로 끝내 실DB/거래로그를 전혀 건드리지 않는다.

실행:
  cd backend
  python ../_attic/backend-scripts/verify_box_depletion.py
"""
import sys
sys.path.insert(0, ".")

from decimal import Decimal
from app.database import SessionLocal
from app.models import WarehouseBox, WarehouseBoxItem, Item, Inventory
from app.services import warehouse_map as wm
from app.services import inv_transfer as invsvc
from app.services import inv_effect

TARGET_CODE = "9-HR-0057"  # distribute 로 4박스 분산된 품목

db = SessionLocal()
PASS, FAIL = [], []


def check(name, cond):
    (PASS if cond else FAIL).append(name)
    print(("  [PASS] " if cond else "  [FAIL] ") + name)


item = db.query(Item).filter(Item.mes_code == TARGET_CODE).first()
if item is None:
    print(f"대상 품목 {TARGET_CODE} 없음 — distribute 스크립트 먼저 실행 필요")
    sys.exit(1)
iid = item.item_id

print(f"플래그 ON?: {wm.is_box_tracking_enabled(db)}")
print(f"대상: {TARGET_CODE}\n")


def box_state():
    rows = (
        db.query(
            WarehouseBox.layer_no, WarehouseBox.row_no, WarehouseBox.jari_index,
            WarehouseBox.stack_order, WarehouseBoxItem.quantity,
        )
        .join(WarehouseBoxItem, WarehouseBoxItem.box_id == WarehouseBox.box_id)
        .filter(WarehouseBoxItem.item_id == iid)
        .all()
    )
    # R1 정렬: 층↓, 줄↑, 자리↑, 스택↓
    return sorted(rows, key=lambda r: (-r[0], r[1], r[2], -r[3]))


def wq():
    return int(db.query(Inventory.warehouse_qty).filter(Inventory.item_id == iid).scalar())


def fmt(rows):
    return [(f"L{r[0]}r{r[1]}j{r[2]}", int(r[4])) for r in rows]


# ── 1) R1 차감 순서 ──────────────────────────────────────────────────────
print("=== 1) R1 차감 순서 ===")
before = box_state()
wq0 = wq()
print("  차감 전:", fmt(before))
OUT = 600  # R1 1순위 박스(500) 다 비우고 다음 박스에서 100
snap_before = inv_effect.snapshot_cells(db, iid)
invsvc.consume_warehouse(db, iid, Decimal(OUT))
after = box_state()
print(f"  {OUT} 출고 후:", fmt(after))
check("R1 1순위 박스부터 0으로 비워짐", int(after[0][4]) == 0)
check("R1 2순위 박스에서 잔량 차감(500→400)", int(after[1][4]) == 400)
check("나머지 박스 무변경", [int(r[4]) for r in after[2:]] == [int(r[4]) for r in before[2:]])
check(f"warehouse_qty {OUT} 감소", wq() == wq0 - OUT)
check(f"박스 차감 총합 == {OUT}", sum(int(b[4]) for b in before) - sum(int(a[4]) for a in after) == OUT)

# ── 2) R6 취소 원복 ──────────────────────────────────────────────────────
print("=== 2) R6 취소 원복 ===")
snap_after = inv_effect.snapshot_cells(db, iid)
effect = inv_effect.effect_diff(snap_before, snap_after)
scopes = {e["scope"] for e in effect}
print("  기록된 효과 scope:", scopes)
check("inventory_effect 에 warehouse_box scope 기록됨", "warehouse_box" in scopes)
inv_effect.apply_effect_reverse(db, iid, effect)
db.flush()  # SessionLocal autoflush=False — pending 원복을 DB에 반영해야 컬럼 쿼리가 실값을 읽음
restored = box_state()
print("  원복 후:", fmt(restored))
check("박스 상태가 차감 전과 동일하게 원복", [int(r[4]) for r in restored] == [int(r[4]) for r in before])
check("warehouse_qty 원복", wq() == wq0)

# ── 3) R5 박스 합 초과 출고 차단 ─────────────────────────────────────────
print("=== 3) R5 초과 출고 차단 ===")
total = sum(int(b[4]) for b in box_state())
try:
    invsvc.consume_warehouse(db, iid, Decimal(total + 1))
    check("박스 합 초과 출고 시 ValueError", False)
except ValueError as e:
    print("  차단 메시지:", str(e)[:60])
    check("박스 합 초과 출고 시 ValueError 차단", True)

# ── 비파괴 종료 ──────────────────────────────────────────────────────────
db.rollback()
print(f"\n결과: PASS {len(PASS)} / FAIL {len(FAIL)}  (db.rollback 으로 비파괴 종료)")
db.close()
sys.exit(1 if FAIL else 0)
