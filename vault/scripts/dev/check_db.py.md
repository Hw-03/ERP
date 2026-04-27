---
type: code-note
project: ERP
layer: scripts
source_path: scripts/dev/check_db.py
status: active
updated: 2026-04-27
source_sha: 5fd5595227a9
tags:
  - erp
  - scripts
  - dev-script
  - py
---

# check_db.py

> [!summary] 역할
> 개발 중 데이터 생성, 점검, 로컬 진단을 돕는 보조 스크립트다.

## 원본 위치

- Source: `scripts/dev/check_db.py`
- Layer: `scripts`
- Kind: `dev-script`
- Size: `1055` bytes

## 연결

- Parent hub: [[scripts/dev/dev|scripts/dev]]
- Related: [[scripts/scripts]]

## 읽는 포인트

- 실행 전 대상 DB/파일 경로를 확인한다.
- 운영 스크립트는 백업 여부와 되돌림 절차를 먼저 본다.

## 원본 발췌

````python
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
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
