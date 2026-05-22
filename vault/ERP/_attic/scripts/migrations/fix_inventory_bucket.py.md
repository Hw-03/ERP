---
type: file-explanation
source_path: "_attic/scripts/migrations/fix_inventory_bucket.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# fix_inventory_bucket.py — fix_inventory_bucket.py 설명

## 이 파일은 무엇을 책임지나

`fix_inventory_bucket.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `run`

## 연결되는 파일

- [[ERP/_attic/scripts/migrations/📁_migrations]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
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

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("DATABASE_URL", f"sqlite:///{(BACKEND_DIR / 'erp.db').as_posix()}")

from app.database import SessionLocal  # noqa: E402
from app.models import Inventory, InventoryLocation, Item, LocationStatusEnum  # noqa: E402
from app.services.inventory import PROCESS_TYPE_TO_DEPT  # noqa: E402
from sqlalchemy import func  # noqa: E402

_R_SERIES = {"TR", "HR", "VR", "NR", "AR", "PR"}


def run(apply: bool) -> None:
    db = SessionLocal()
    try:
        # ── Phase 1: A/F 시리즈 warehouse_qty > 0 수정 ──────────────────────────
        rows = (
            db.query(Inventory, Item)
            .join(Item, Inventory.item_id == Item.item_id)
            .filter(
                Item.process_type_code.isnot(None),
                Item.process_type_code.notin_(list(_R_SERIES)),
                Inventory.warehouse_qty > 0,
            )
            .all()
        )

        moved = 0
        zeroed = 0
```
