# -*- coding: utf-8 -*-
"""
1. inventory_locations.department 영문 → 한글 마이그레이션
2. 부서 미배정 품목 보완 (category 기반 자동 배정)
"""
import sqlite3, uuid
from datetime import datetime

DB_PATH = r"c:\ERP\backend\erp.db"

DEPT_MIGRATION = {
    "ASSEMBLY":      "조립",
    "HIGH_VOLTAGE":  "고압",
    "VACUUM":        "진공",
    "TUNING":        "튜닝",
    "TUBE":          "튜브",
    "SHIPPING":      "출하",
    "RESEARCH":      "연구",
    "SALES":         "영업",
    "ETC":           "기타",
    # AS는 그대로
}

# 카테고리 코드 → 부서
CATEGORY_TO_DEPT = {
    "TA": "튜브",  "TF": "튜브",  "TR": "튜브",
    "HA": "고압",  "HF": "고압",  "HR": "고압",
    "VA": "진공",  "VF": "진공",  "VR": "진공",
    "BA": "조립",  "BF": "조립",  "AR": "조립",
    "AA": "조립",  "PA": "출하",  "FG": "출하",
    "RM": "조립",  "UK": "조립",
}

def main():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    cur = conn.cursor()

    # ── 1. 영문 → 한글 마이그레이션 ─────────────────────────
    print("=== 부서코드 마이그레이션 ===")
    total_updated = 0
    for eng, kor in DEPT_MIGRATION.items():
        cur.execute(
            "UPDATE inventory_locations SET department=? WHERE department=?",
            (kor, eng)
        )
        cnt = cur.rowcount
        if cnt > 0:
            print(f"  {eng} → {kor}: {cnt}건")
            total_updated += cnt
    print(f"마이그레이션 완료: {total_updated}건\n")

    # ── 2. 현황 확인 ─────────────────────────────────────────
    cur.execute("SELECT DISTINCT department FROM inventory_locations ORDER BY 1")
    print("현재 부서 값:", [r[0] for r in cur.fetchall()])

    # ── 3. 부서 미배정 품목 보완 ────────────────────────────
    print("\n=== 부서 미배정 품목 보완 ===")
    cur.execute("""
        SELECT i.item_id, i.item_name, i.category,
               COALESCE(inv.warehouse_qty, 0) as wqty
        FROM items i
        LEFT JOIN inventory inv ON i.item_id = inv.item_id
        LEFT JOIN inventory_locations il ON i.item_id = il.item_id
        WHERE il.item_id IS NULL
          AND (inv.warehouse_qty IS NULL OR inv.warehouse_qty = 0)
    """)
    unassigned = cur.fetchall()
    print(f"미배정 품목: {len(unassigned)}개")

    now = datetime.now().isoformat()
    assigned = 0
    for item_id, item_name, category, wqty in unassigned:
        dept = CATEGORY_TO_DEPT.get(category, "조립")
        loc_id = uuid.uuid4().hex
        cur.execute("""
            INSERT OR IGNORE INTO inventory_locations
              (location_id, item_id, department, status, quantity, updated_at)
            VALUES (?, ?, ?, 'PRODUCTION', 0, ?)
        """, (loc_id, item_id, dept, now))
        print(f"  배정: {item_name[:30]} | {category} → {dept}")
        assigned += 1

    if assigned == 0:
        print("  (미배정 품목 없음)")

    conn.commit()
    conn.close()
    print(f"\n완료: 마이그레이션 {total_updated}건, 부서 배정 {assigned}건")

if __name__ == "__main__":
    main()
