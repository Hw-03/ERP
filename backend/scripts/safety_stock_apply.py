"""안전재고 "200대분" — 개발 DB 적용 (min_stock write).

`safety_stock_preview.compute_rows` 의 계산을 **그대로** 재사용해(미리보기와 값 100% 일치):
- 원자재 발주 대상(`?R`) 품목: min_stock = 계산값(K × 200)
- 나머지 A/F(조립체·완성품): min_stock = NULL (안전재고 미지정)

min_stock 은 "부족/정상" 표시·집계용 임계값일 뿐, 재고 수량·BOM backflush 엔 영향 없음.

실행:
  cd backend && python scripts/safety_stock_apply.py            # DRY-RUN (변경 안 함)
  cd backend && python scripts/safety_stock_apply.py --apply    # 실제 적용
"""
from __future__ import annotations

import argparse
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(__file__))
from safety_stock_preview import DB_PATH, compute_rows  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="실제 적용 (미지정 시 dry-run)")
    args = ap.parse_args()

    con = sqlite3.connect(DB_PATH)
    rows = compute_rows(con)
    c = con.cursor()

    set_cnt = sum(1 for r in rows if r["computed"] is not None)
    null_cnt = sum(1 for r in rows if r["computed"] is None)

    changed = 0
    for r in rows:
        cur = c.execute("SELECT min_stock FROM items WHERE item_id=?", (r["id"],)).fetchone()[0]
        cur = int(cur) if cur is not None else None
        newv = r["computed"]
        if cur != newv:
            changed += 1
        if args.apply:
            c.execute("UPDATE items SET min_stock=? WHERE item_id=?", (newv, r["id"]))

    if args.apply:
        con.commit()
        print(f"[적용 완료] R 설정 {set_cnt} · NULL(미지정) {null_cnt} · 실제 변경 {changed}건")
    else:
        print(f"[DRY-RUN] R 설정 예정 {set_cnt} · NULL 예정 {null_cnt} · 변경될 행 {changed}건")
        print("  → 실제 적용: python scripts/safety_stock_apply.py --apply")
    con.close()


if __name__ == "__main__":
    main()
