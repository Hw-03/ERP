---
type: file-explanation
source_path: "backend/app/services/integrity.py"
importance: critical
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# integrity.py — integrity.py 설명

## 이 파일은 무엇을 책임지나

`integrity.py`는 `integrity` 업무 규칙을 실제로 실행하는 Python 코드입니다. 라우터보다 안쪽에서 DB 조회와 변경을 담당합니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때
- 운영 데이터가 달라질 수 있는 변경을 준비할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `InventoryMismatch`
- `RepairReport`
- `_location_sum_map`
- `check_inventory_consistency`
- `repair_inventory_totals`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/models.py]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 파일입니다.
- [[ERP/backend/app/schemas.py]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/database.py]] — `database.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/app/database.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 조심할 점

이 파일은 운영 데이터, 재고 수량, 승인 상태, DB 구조, 백업/복구 중 하나와 직접 연결됩니다. 수정 전에는 관련 테스트, 백업 여부, 연결 화면/API를 반드시 확인해야 합니다.

## 핵심 발췌

```python
"""재고 불변식 점검 / 복구.

불변식: Inventory.quantity == Inventory.warehouse_qty + Σ InventoryLocation.quantity

이 불변식은 services/inventory 의 `_sync_total` 이 모든 재고 변경 경로에서
유지한다. 외부 스크립트나 과거 버그로 어긋난 데이터를 점검·복구하기 위한 도구.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Optional
import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Inventory, InventoryLocation, Item


_D0 = Decimal("0")


@dataclass
class InventoryMismatch:
    item_id: uuid.UUID
    item_code: Optional[str]
    item_name: Optional[str]
    recorded_total: Decimal      # Inventory.quantity
    computed_total: Decimal      # warehouse + loc_sum (실제 합)
    warehouse_qty: Decimal
    location_sum: Decimal
    pending_quantity: Decimal

    @property
    def delta(self) -> Decimal:
        """recorded - computed. 양수면 quantity 가 과다, 음수면 과소."""
        return self.recorded_total - self.computed_total

    def to_dict(self) -> dict:
        return {
            "item_id": str(self.item_id),
            "item_code": self.item_code,
            "item_name": self.item_name,
            "item_code": self.item_code,
            "recorded_total": float(self.recorded_total),
            "computed_total": float(self.computed_total),
            "warehouse_qty": float(self.warehouse_qty),
            "location_sum": float(self.location_sum),
            "pending_quantity": float(self.pending_quantity),
            "delta": float(self.delta),
        }
```
