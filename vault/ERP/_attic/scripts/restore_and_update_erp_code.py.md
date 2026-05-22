---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/restore_and_update_erp_code.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# restore_and_update_erp_code.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/restore_and_update_erp_code.py]]

## 원본 첫 줄 (또는 메타)

```
"""
DB restore + ERP code update (sort_order 1:1 match with Excel row index)
- Never matches by item_name
- Excel data row N (row 2 = N=1) -> DB sort_order N
"""
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

import openpyxl

BASE = Path(__file__).resolve().parent.parent
DB_PATH = BASE / "backend" / "erp.db"
BACKUP_SRC = BASE / "backend" / "erp_backup_20260430_094340.db"
EXCEL_PATH = BASE / "outputs" / "inventory_cleanup" / "생산부_재고_매칭작업_정리본_공정순번.xlsx"

# ── 1. backup current DB ───────────────────────────────────────────────────────
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
pre_restore_backup = BASE / "backend" / f"erp_before_restore_{ts}.db"
shutil.copy2(DB_PATH, pre_restore_backup)
print(f"[1] current DB backed up: {pre_restore_backup.name}")

# ── 2. restore from backup ─────────────────────────────────────────────────────
```
