---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/migrations/drop_legacy_model_column.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# drop_legacy_model_column.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/migrations/drop_legacy_model_column.py]]

## 원본 첫 줄 (또는 메타)

```
"""Migration: DROP COLUMN legacy_model FROM items.

Usage:
    cd backend
    python ../scripts/migrations/drop_legacy_model_column.py
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import sqlalchemy as sa  # noqa: E402
from app.database import engine  # noqa: E402


def main() -> None:
    with engine.connect() as conn:
        result = conn.execute(
            sa.text("SELECT COUNT(*) FROM pragma_table_info('items') WHERE name='legacy_model'")
        )
```
