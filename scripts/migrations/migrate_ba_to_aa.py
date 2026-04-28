"""BA → AA 마이그레이션 스크립트.

기존 DB의 category='BA', process_type_code='BA' 데이터를 'AA'로 변경한다.
erp_code에 '-BA-' 패턴이 있으면 '-AA-'로 교체한다.

사용법:
  dry-run (기본):  python scripts/migrate_ba_to_aa.py
  실제 적용:       python scripts/migrate_ba_to_aa.py --apply
"""

import argparse
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[2] / "backend" / "erp.db"


def main(apply: bool) -> None:
    if not DB_PATH.exists():
        print(f"[ERROR] DB 파일 없음: {DB_PATH}")
        sys.exit(1)

    if apply:
        backup = DB_PATH.with_name(f"erp_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db")
        with sqlite3.connect(DB_PATH) as _src, sqlite3.connect(backup) as _dst:
            _src.backup(_dst)
        print(f"[BACKUP] {backup}")

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # ── 현황 파악 ──────────────────────────────────────────────
    cur.execute("SELECT COUNT(*) FROM items WHERE process_type_code = 'BA'")
    ba_pt = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM items WHERE category = 'BA'")
    ba_cat = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM items WHERE erp_code LIKE '%-BA-%'")
    ba_erp = cur.fetchone()[0]

    print("\n[현황]")
    print(f"  items.process_type_code = 'BA'  : {ba_pt}건")
    print(f"  items.category = 'BA'           : {ba_cat}건")
    print(f"  items.erp_code LIKE '%-BA-%'    : {ba_erp}건")

    if ba_pt == 0 and ba_cat == 0 and ba_erp == 0:
        print("\n[OK] BA 잔재 없음. 마이그레이션 불필요.")
        conn.close()
        return

    if not apply:
        print("\n[DRY-RUN] 실제 변경 없음. --apply 플래그로 실행하세요.")
        conn.close()
        return

    # ── 1. items: process_type_code BA → AA ───────────────────
    cur.execute("UPDATE items SET process_type_code = 'AA' WHERE process_type_code = 'BA'")
    print(f"  [UPDATE] items.process_type_code BA→AA : {cur.rowcount}건")

    # ── 2. items: category BA → AA ────────────────────────────
    cur.execute("UPDATE items SET category = 'AA' WHERE category = 'BA'")
    print(f"  [UPDATE] items.category BA→AA          : {cur.rowcount}건")

    # ── 3. items: erp_code '-BA-' → '-AA-' ───────────────────
    cur.execute(
        "UPDATE items SET erp_code = REPLACE(erp_code, '-BA-', '-AA-') WHERE erp_code LIKE '%-BA-%'"
    )
    print(f"  [UPDATE] items.erp_code -BA-→-AA-      : {cur.rowcount}건")

    conn.commit()
    conn.close()

    print("\n[완료] 마이그레이션 성공")

    # ── 검증 ──────────────────────────────────────────────────
    conn2 = sqlite3.connect(DB_PATH)
    cur2 = conn2.cursor()
    cur2.execute("SELECT COUNT(*) FROM items WHERE process_type_code = 'BA'")
    print(f"[검증] 남은 BA process_type_code: {cur2.fetchone()[0]}건 (0이어야 정상)")
    cur2.execute("SELECT COUNT(*) FROM items WHERE category = 'BA'")
    print(f"[검증] 남은 BA category         : {cur2.fetchone()[0]}건 (0이어야 정상)")
    conn2.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="BA → AA 마이그레이션")
    parser.add_argument("--apply", action="store_true", help="실제 DB 변경 실행 (기본: dry-run)")
    args = parser.parse_args()
    main(apply=args.apply)
