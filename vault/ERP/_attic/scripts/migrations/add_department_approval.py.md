---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/migrations/add_department_approval.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# add_department_approval.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/migrations/add_department_approval.py]]

## 원본 첫 줄 (또는 메타)

```
"""StockRequest 부서 결재 컬럼 추가 마이그레이션.

변경 내용:
  1. stock_requests.requires_department_approval BOOLEAN NOT NULL DEFAULT 0
  2. stock_requests.department_approved_by_employee_id (UUID FK, NULL 허용)
  3. stock_requests.department_approved_by_name TEXT NULL
  4. stock_requests.department_approved_at DATETIME NULL

실행: python scripts/migrations/add_department_approval.py
멱등: 두 번 실행해도 안전.
"""

import sqlite3
import sys
from pathlib import Path

DB_PATH = Path(__file__).parent.parent.parent / "backend" / "erp.db"

COLUMNS = [
    (
        "requires_department_approval",
        "ALTER TABLE stock_requests ADD COLUMN requires_department_approval BOOLEAN NOT NULL DEFAULT 0",
    ),
    (
        "department_approved_by_employee_id",
```
