---
type: file-explanation
source_path: "backend/app/routers/inventory/defective.py"
importance: critical
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# defective.py — defective.py 설명

## 이 파일은 무엇을 책임지나

`defective.py`는 재고 업무 API 중 한 영역을 맡는 Python 코드입니다. 화면에서 들어온 요청을 검증하고 실제 재고 서비스로 넘기는 관문입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때
- 운영 데이터가 달라질 수 있는 변경을 준비할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `mark_defective`
- `API POST "/mark-defective"`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/services/inventory.py]] — 입고, 출고, 부서 이동, 불량 처리처럼 실제 재고 숫자를 바꾸는 업무 규칙을 담은 핵심 파일입니다.
- [[ERP/backend/app/services/stock_math.py]] — 여러 재고 숫자를 일관된 방식으로 계산하고 검증하기 위한 보조 함수입니다.
- [[ERP/backend/app/models.py]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 파일입니다.
- [[ERP/frontend/lib/api/inventory.ts]] — `inventory.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 조심할 점

이 파일은 운영 데이터, 재고 수량, 승인 상태, DB 구조, 백업/복구 중 하나와 직접 연결됩니다. 수정 전에는 관련 테스트, 백업 여부, 연결 화면/API를 반드시 확인해야 합니다.

## 핵심 발췌

```python
"""불량 등록: /mark-defective."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Item, TransactionLog, TransactionTypeEnum
from app.routers._errors import ErrorCode, http_error
from app.schemas import InventoryResponse, MarkDefectiveRequest
from app.services import inventory as inventory_svc
from app.services._tx import commit_and_refresh

from ._shared import to_response


router = APIRouter()


@router.post("/mark-defective", response_model=InventoryResponse)
def mark_defective(payload: MarkDefectiveRequest, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.item_id == payload.item_id).first()
    if not item:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")
    inventory = inventory_svc.get_or_create_inventory(db, payload.item_id)
    qty_before = inventory.quantity or Decimal("0")
    try:
        inventory_svc.mark_defective(
            db, payload.item_id, payload.quantity,
            source=payload.source,
            target_dept=payload.target_department,
            source_dept=payload.source_department,
        )
    except ValueError as exc:
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))

    note = (
        f"불량 등록 [{payload.source}"
        + (f"/{payload.source_department.value}" if payload.source_department else "")
        + f"] → {payload.target_department.value} 격리 ({payload.quantity})"
        + (f" — {payload.reason}" if payload.reason else "")
    )
    db.add(
        TransactionLog(
            item_id=payload.item_id,
            transaction_type=TransactionTypeEnum.MARK_DEFECTIVE,
            quantity_change=Decimal("0"),
            quantity_before=qty_before,
            quantity_after=inventory.quantity,
            reference_no=None,
            produced_by=payload.operator,
            notes=note,
```
