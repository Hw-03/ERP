---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/dev/migrate_add_bom_completed_at.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# migrate_add_bom_completed_at.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/dev/migrate_add_bom_completed_at.py]]

## 원본 첫 줄 (또는 메타)

```
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
```
