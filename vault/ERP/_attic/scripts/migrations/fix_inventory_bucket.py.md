---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/migrations/fix_inventory_bucket.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# fix_inventory_bucket.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/migrations/fix_inventory_bucket.py]]

## 원본 첫 줄 (또는 메타)

```
"""
fix_inventory_bucket.py

Phase 1: A/F 시리즈 품목의 warehouse_qty 버킷 버그 수정
  - seed.py / import_real_inventory.py 가 warehouse_qty=quantity 로 설정해서
    InventoryLocation 과 이중 계상된 경우 해소.

Phase 2: 전체 Inventory.quantity 재동기화
  - quantity = warehouse_qty + sum(InventoryLocation)
  - R-series 포함 모든 품목 대상.

Usage:
    cd backend
    python ../scripts/migrations/fix_inventory_bucket.py          # dry-run
    python ../scripts/migrations/fix_inventory_bucket.py --apply  # 실제 반영
"""

from __future__ import annotations

import argparse
import os
import sys
from decimal import Decimal
from pathlib import Path

```
