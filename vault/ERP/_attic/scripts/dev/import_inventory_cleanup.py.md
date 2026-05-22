---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/dev/import_inventory_cleanup.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# import_inventory_cleanup.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/dev/import_inventory_cleanup.py]]

## 원본 첫 줄 (또는 메타)

```
"""
import_inventory_cleanup.py — CLI 래퍼.

핵심 로직은 backend/app/services/seed_cleanup.py 에 있음.

Usage:
    cd backend
    python ../scripts/dev/import_inventory_cleanup.py [--dry-run]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal
from app.services.seed_cleanup import run_cleanup_import, DEFAULT_EXCEL_PATH


def main(dry_run: bool = False) -> None:
```
