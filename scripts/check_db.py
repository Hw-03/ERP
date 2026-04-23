# -*- coding: utf-8 -*-
import sqlite3, sys
sys.stdout.reconfigure(encoding='utf-8')

conn = sqlite3.connect(r"c:\ERP\backend\erp.db")
cur = conn.cursor()

# 첫 10개 품목명 실제 코드포인트 출력
cur.execute("SELECT item_name FROM items LIMIT 10")
for (name,) in cur.fetchall():
    print("NAME:", name)

# 레거시/폐기 검색
targets = ["레거시", "폐기", "레거시", "폐기"]
for t in targets:
    cur.execute("SELECT count(*) FROM items WHERE item_name LIKE ?", (f"%{t}%",))
    cnt = cur.fetchone()[0]
    print(f"LIKE '{t}' (U+{ord(t[0]):04X}...): {cnt}개")

# 부서 없는 품목
cur.execute("""
    SELECT i.item_id, i.item_name FROM items i
    LEFT JOIN inventory_locations il ON i.item_id = il.item_id
    LEFT JOIN inventory inv ON i.item_id = inv.item_id
    WHERE il.item_id IS NULL
      AND (inv.warehouse_qty IS NULL OR inv.warehouse_qty = 0)
    LIMIT 5
""")
rows = cur.fetchall()
print(f"\n부서없음 샘플 {len(rows)}개:")
for r in rows:
    print("  ", r[1])

conn.close()
