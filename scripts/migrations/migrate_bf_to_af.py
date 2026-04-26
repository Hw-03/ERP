"""AF → AF 마이그레이션 스크립트.

기존 DB의 process_type_code='AF', category='AF' 데이터를 'AF'로 변경하고
누락 공정 코드(NR, NF, PF)를 process_types 테이블에 추가한다.

사용법:
  dry-run (기본):  python scripts/migrations/migrate_bf_to_af.py
  실제 적용:       python scripts/migrations/migrate_bf_to_af.py --apply
"""

import argparse
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent.parent.parent / "backend" / "erp.db"

NEW_PROCESS_TYPES = [
    ("NR", "N", "R", 48, "튜닝 원자재"),
    ("NF", "N", "F", 52, "튜닝 F타입"),
    ("AF", "A", "F", 62, "조립 F타입"),
    ("PF", "P", "F", 72, "출하 F타입"),
]


def main(apply: bool) -> None:
    if not DB_PATH.exists():
        print(f"[ERROR] DB 파일 없음: {DB_PATH}")
        sys.exit(1)

    if apply:
        backup = DB_PATH.with_name(f"erp_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db")
        shutil.copy2(DB_PATH, backup)
        print(f"[BACKUP] {backup}")

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # ── 현황 파악 ──────────────────────────────────────────────
    cur.execute("SELECT COUNT(*) FROM items WHERE process_type_code = 'AF'")
    bf_pt = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM items WHERE category = 'AF'")
    bf_cat = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM items WHERE erp_code LIKE '%-AF-%'")
    bf_erp = cur.fetchone()[0]
    cur.execute("SELECT code FROM process_types ORDER BY stage_order")
    existing_codes = {row[0] for row in cur.fetchall()}

    print(f"\n[현황]")
    print(f"  items.process_type_code = 'AF'  : {bf_pt}건")
    print(f"  items.category = 'AF'           : {bf_cat}건")
    print(f"  items.erp_code LIKE '%-AF-%'    : {bf_erp}건")
    print(f"  process_types 현재 코드         : {sorted(existing_codes)}")

    missing = [r for r in NEW_PROCESS_TYPES if r[0] not in existing_codes]
    print(f"  추가 예정 코드                  : {[r[0] for r in missing]}")
    needs_bf_remove = "AF" in existing_codes
    print(f"  AF 코드 제거 필요               : {needs_bf_remove}")

    if not apply:
        print("\n[DRY-RUN] 실제 변경 없음. --apply 플래그로 실행하세요.")
        conn.close()
        return

    # ── 1. process_types: AF/NR/NF/PF 추가 ────────────────────
    for code, prefix, suffix, order, desc in missing:
        cur.execute(
            "INSERT INTO process_types (code, prefix, suffix, stage_order, description) VALUES (?, ?, ?, ?, ?)",
            (code, prefix, suffix, order, desc),
        )
        print(f"  [ADD] process_types: {code}")

    # ── 2. items: process_type_code AF → AF ───────────────────
    cur.execute("UPDATE items SET process_type_code = 'AF' WHERE process_type_code = 'AF'")
    print(f"  [UPDATE] items.process_type_code AF→AF : {cur.rowcount}건")

    # ── 3. items: category AF → AF ────────────────────────────
    cur.execute("UPDATE items SET category = 'AF' WHERE category = 'AF'")
    print(f"  [UPDATE] items.category AF→AF          : {cur.rowcount}건")

    # ── 4. items: erp_code '-AF-' → '-AF-' ───────────────────
    cur.execute(
        "UPDATE items SET erp_code = REPLACE(erp_code, '-AF-', '-AF-') WHERE erp_code LIKE '%-AF-%'"
    )
    print(f"  [UPDATE] items.erp_code -AF-→-AF-      : {cur.rowcount}건")

    # ── 5. process_types: AF 제거 (FK 없으면 삭제) ────────────
    if needs_bf_remove:
        cur.execute("SELECT COUNT(*) FROM items WHERE process_type_code = 'AF'")
        remaining = cur.fetchone()[0]
        if remaining == 0:
            cur.execute("DELETE FROM process_types WHERE code = 'AF'")
            print(f"  [DELETE] process_types: AF 제거")
        else:
            print(f"  [SKIP] AF 코드 제거 불가: items 참조 {remaining}건 남음")

    conn.commit()
    conn.close()

    print("\n[완료] 마이그레이션 성공")

    # ── 검증 ──────────────────────────────────────────────────
    conn2 = sqlite3.connect(DB_PATH)
    cur2 = conn2.cursor()
    cur2.execute("SELECT COUNT(*) FROM items WHERE process_type_code = 'AF'")
    print(f"[검증] 남은 AF process_type_code: {cur2.fetchone()[0]}건 (0이어야 정상)")
    cur2.execute("SELECT COUNT(*) FROM items WHERE category = 'AF'")
    print(f"[검증] 남은 AF category         : {cur2.fetchone()[0]}건 (0이어야 정상)")
    cur2.execute("SELECT code FROM process_types ORDER BY stage_order")
    print(f"[검증] process_types 코드       : {[r[0] for r in cur2.fetchall()]}")
    conn2.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AF → AF 마이그레이션")
    parser.add_argument("--apply", action="store_true", help="실제 DB 변경 실행 (기본: dry-run)")
    args = parser.parse_args()
    main(apply=args.apply)
