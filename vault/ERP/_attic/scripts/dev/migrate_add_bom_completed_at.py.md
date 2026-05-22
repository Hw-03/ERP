---
type: file-explanation
source_path: "_attic/scripts/dev/migrate_add_bom_completed_at.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# migrate_add_bom_completed_at.py — migrate_add_bom_completed_at.py 설명

## 이 파일은 무엇을 책임지나

`migrate_add_bom_completed_at.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

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
"""Add items.bom_completed_at column + backfill all current BOM parents.

멱등(idempotent): 재실행해도 컬럼 중복 추가/중복 backfill 없이 통과한다.
실행 전 반드시 backend/erp.db 백업할 것.
"""
import sqlite3
import sys

sys.stdout.reconfigure(encoding="utf-8")

con = sqlite3.connect(r"backend/erp.db")
cur = con.cursor()

cols = [r[1] for r in cur.execute("PRAGMA table_info(items)")]
if "bom_completed_at" not in cols:
    cur.execute("ALTER TABLE items ADD COLUMN bom_completed_at DATETIME NULL")
    print("column added")
else:
    print("column already exists")

res = cur.execute(
    """
    UPDATE items SET bom_completed_at = CURRENT_TIMESTAMP
    WHERE bom_completed_at IS NULL
      AND item_id IN (SELECT DISTINCT parent_item_id FROM bom)
    """
)
print(f"backfilled {res.rowcount} parents as completed")

con.commit()

completed = cur.execute(
    "SELECT COUNT(*) FROM items WHERE bom_completed_at IS NOT NULL"
).fetchone()[0]
distinct_parents = cur.execute(
    "SELECT COUNT(DISTINCT parent_item_id) FROM bom"
).fetchone()[0]
print(f"final: {completed} items completed (distinct bom parents = {distinct_parents})")
if completed != distinct_parents:
    print("WARNING: completed count != distinct bom parents — 확인 필요")

con.close()
```
