---
type: file-explanation
source_path: "backend/app/routers/codes.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# codes.py — codes.py 설명

## 이 파일은 무엇을 책임지나

`codes.py`는 `codes` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `list_symbols`
- `update_symbol`
- `list_options`
- `list_process_types`
- `list_process_flows`
- `parse_code`
- `generate_code`
- `API GET "/symbols"`
- `API PUT "/symbols/{slot}"`
- `API GET "/options"`
- 그 외 4개 항목

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/services/codes.py]] — `codes.py`는 `codes` 업무 규칙을 실제로 실행하는 Python 코드입니다. 라우터보다 안쪽에서 DB 조회와 변경을 담당합니다.
- [[ERP/backend/app/schemas.py]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/models.py]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 파일입니다.

## 조심할 점

API 응답 형식이나 상태 코드를 바꾸면 프론트 화면과 자동 테스트가 같이 영향을 받습니다.

## 핵심 발췌

```python
"""Code master router: 제품기호 / 옵션 / 공정 / 흐름 + 4-파트 코드 파싱·생성."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import OptionCode, ProcessFlowRule, ProcessType, ProductSymbol
from app.routers._errors import ErrorCode, http_error
from app.schemas import (
    ItemCodeGenerateRequest,
    ItemCodeParseRequest,
    ItemCodeResponse,
    OptionCodeResponse,
    ProcessFlowRuleResponse,
    ProcessTypeResponse,
    ProductSymbolResponse,
    ProductSymbolUpdate,
)
from app.services import audit
from app.services import codes as code_svc
from app.services._tx import commit_and_refresh

router = APIRouter()


# ---- Product Symbols (100 slots) -------------------------------------------


@router.get("/symbols", response_model=List[ProductSymbolResponse], summary="제품기호 100슬롯 조회")
def list_symbols(db: Session = Depends(get_db)):
    return db.query(ProductSymbol).order_by(ProductSymbol.slot).all()


@router.put("/symbols/{slot}", response_model=ProductSymbolResponse, summary="제품기호 슬롯 수정")
def update_symbol(slot: int, payload: ProductSymbolUpdate, request: Request, db: Session = Depends(get_db)):
    row = db.query(ProductSymbol).filter(ProductSymbol.slot == slot).one_or_none()
    if row is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "해당 슬롯이 없습니다.")

    if payload.symbol is not None:
        # Enforce uniqueness when assigning a symbol
        dup = (
            db.query(ProductSymbol)
            .filter(ProductSymbol.symbol == payload.symbol, ProductSymbol.slot != slot)
            .one_or_none()
        )
        if dup is not None:
            raise http_error(
                status.HTTP_409_CONFLICT,
                ErrorCode.CONFLICT,
                f"기호 '{payload.symbol}' 는 이미 슬롯 {dup.slot}에 사용 중입니다.",
            )
        row.symbol = payload.symbol
```
