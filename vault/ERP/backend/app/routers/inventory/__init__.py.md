---
type: file-explanation
source_path: "backend/app/routers/inventory/__init__.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# __init__.py — __init__.py 설명

## 이 파일은 무엇을 책임지나

`__init__.py`는 재고 업무 API 중 한 영역을 맡는 Python 코드입니다. 화면에서 들어온 요청을 검증하고 실제 재고 서비스로 넘기는 관문입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `list_inventory`
- `API GET ""`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/services/inventory.py]] — 입고, 출고, 부서 이동, 불량 처리처럼 실제 재고 숫자를 바꾸는 업무 규칙을 담은 핵심 파일입니다.
- [[ERP/backend/app/services/stock_math.py]] — 여러 재고 숫자를 일관된 방식으로 계산하고 검증하기 위한 보조 함수입니다.
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.
- [[ERP/frontend/lib/api/inventory.ts]] — `inventory.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 조심할 점

API 응답 형식이나 상태 코드를 바꾸면 프론트 화면과 자동 테스트가 같이 영향을 받습니다.

## 핵심 발췌

```python
"""inventory 라우터 패키지.

Phase 4 에서 단일 파일(routers/inventory.py 807줄)을 책임 단위로 분할.
`from app.routers import inventory` + `app.include_router(inventory.router, ...)` 호환.

서브 모듈:
- query        — /summary, /locations/{item_id}
- receive      — /receive, /adjust
- transfer     — /transfer-to-production, /transfer-to-warehouse, /transfer-between-depts
- defective    — /mark-defective
- supplier     — /return-to-supplier
- transactions — /transactions, /transactions/export.csv|.xlsx, PUT /transactions/{log_id}

GET "" (목록) 은 FastAPI include_router 가 빈 prefix + 빈 path 를 거부하므로
이 파일에 직접 정의한다.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Inventory, Item
from app.schemas import InventoryResponse

from . import (
    defective,
    query,
    receive,
    supplier,
    transactions,
    transfer,
    weekly_report,
)
from ._shared import to_response_bulk


router = APIRouter()

# 정적 경로(/transactions/*, /summary, /locations/...)를 동적 catch-all("") 보다 먼저 등록.
router.include_router(transactions.router)
router.include_router(query.router)
router.include_router(weekly_report.router)
router.include_router(receive.router)
router.include_router(transfer.router)
router.include_router(defective.router)
router.include_router(supplier.router)


@router.get("", response_model=List[InventoryResponse])
def list_inventory(
    process_type_code: Optional[str] = Query(None, max_length=2),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=2000),
```
