---
type: file-explanation
source_path: "_attic/scripts/dev/check_db.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# check_db.py — check_db.py 설명

## 이 파일은 무엇을 책임지나

`check_db.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/_attic/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
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
```
