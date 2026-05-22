---
type: file-explanation
source_path: "backend/app/services/stock_math.py"
importance: critical
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# stock_math.py — 재고 계산 보조 규칙

## 이 파일은 무엇을 책임지나

여러 재고 숫자를 일관된 방식으로 계산하고 검증하기 위한 보조 함수입니다.

## 업무 흐름에서의 의미

사용 가능 재고, 승인 대기 수량, 부서별 수량을 해석할 때 기준이 됩니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때
- 운영 데이터가 달라질 수 있는 변경을 준비할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `StockFigures`
- `compute_for`
- `bulk_compute`
- `figures_from_inventory`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/models.py]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 파일입니다.
- [[ERP/backend/app/schemas.py]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/database.py]] — `database.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/app/database.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 조심할 점

여기 계산이 바뀌면 여러 화면의 수량 표시가 동시에 달라질 수 있습니다.

## 핵심 발췌

```python
"""재고 수식 단일 소스.

기존에 여러 라우터가 각자 `wh + prod - pending` 같은 식을 직접 계산하던 것을
여기로 모은다. 신규 코드는 이 모듈만 사용한다.

## 용어 정의

- `warehouse_qty`: 창고 재고 (Inventory.warehouse_qty)
- `production_total`: 부서별 PRODUCTION 버킷 합계 (InventoryLocation)
- `defective_total`: 부서별 DEFECTIVE 버킷 합계
- `pending`: 배치 OUT 예약 중 (Inventory.pending_quantity) — warehouse 대비
- `total`: warehouse + production + defective (Inventory.quantity 와 같아야 함)
- `available`: warehouse + production - pending — "재고 가용" (UI 에 노출되는 값)
- `warehouse_available`: warehouse - pending — 생산 backflush / 창고 출고에서
  실제 소비 가능한 분량. BOM feasibility 검사는 이 값을 써야 한다.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
import uuid
from typing import Iterable

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Inventory, InventoryLocation, LocationStatusEnum


_D0 = Decimal("0")


@dataclass(frozen=True)
class StockFigures:
    """한 품목의 재고 수치 모음. 모든 값 Decimal."""

    warehouse_qty: Decimal = _D0
    production_total: Decimal = _D0
    defective_total: Decimal = _D0
    pending: Decimal = _D0

    @property
    def total(self) -> Decimal:
        """wh + prod + defect. Inventory.quantity 불변식과 일치해야 함."""
        return self.warehouse_qty + self.production_total + self.defective_total

    @property
    def available(self) -> Decimal:
        """UI 에 노출되는 가용 재고: warehouse + production - pending. 불량 제외."""
        return self.warehouse_qty + self.production_total - self.pending

    @property
    def warehouse_available(self) -> Decimal:
        """창고 소비 가능분: warehouse - pending. BOM backflush / 창고 출고 검사용."""
```
