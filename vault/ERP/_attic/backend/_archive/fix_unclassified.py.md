---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/backend/_archive/fix_unclassified.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# fix_unclassified.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/backend/_archive/fix_unclassified.py]]

## 원본 첫 줄 (또는 메타)

```
"""category 제거 전 레거시 보정 스크립트이며, 현재 process_type_code 단일 구조에서는 사용하지 않는다.

원본: backend/fix_unclassified.py
아카이브 이유: Item.category / CategoryEnum 제거 이후 더 이상 실행 불가.
"""
# ── 이하 원본 코드 (참조용, 실행 금지) ──────────────────────────────────────

import random
import sys
import os
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.database import SessionLocal
from app.models import (
    Item, Inventory, InventoryLocation, LocationStatusEnum, DepartmentEnum
)

random.seed(42)

ALL_SYMBOLS = ["3", "4", "6", "7", "8"]

LEGACY_TO_SYMBOL: dict[str, str] = {
    "DX3000":    "3",
```
