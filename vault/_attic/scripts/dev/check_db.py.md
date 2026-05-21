---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/dev/check_db.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# check_db.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/dev/check_db.py]]

## 원본 첫 줄 (또는 메타)

```
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
```
