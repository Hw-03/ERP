---
type: code-note
project: DEXCOWIN MES
layer: backend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/app/services/seed_cleanup.py
tags: [vault, code-note, auto-generated, stub]
---

# seed_cleanup.py

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/backend/app/services/seed_cleanup.py]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"""seed_cleanup.py — 722 정리본 엑셀을 DB에 적재하는 호출 가능 서비스.

scripts/dev/import_inventory_cleanup.py 의 핵심 로직 추출.
settings./reset 엔드포인트가 이 함수를 호출한다.
"""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import Inventory, InventoryLocation, Item, LocationStatusEnum

try:
    import openpyxl
except ImportError:
    openpyxl = None  # type: ignore[assignment]

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXCEL_PATH = REPO_ROOT / "outputs" / "inventory_cleanup" / "생산부_재고_매칭작업_정리본.xlsx"

EXPECTED_ROWS = 722
EXPECTED_TOTAL_QTY = Decimal("108924")
DEFAULT_MIN_STOCK = Decimal("200")

DEPT_MAP: dict[str, str] = {
    "T": "튜브",
    "H": "고압",
```
