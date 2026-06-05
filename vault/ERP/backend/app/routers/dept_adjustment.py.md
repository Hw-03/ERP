---
type: file-explanation
source_path: "backend/app/routers/dept_adjustment.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# dept_adjustment.py — dept_adjustment.py 설명

## 이 파일은 무엇을 책임지나

`dept_adjustment.py`는 `dept_adjustment` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `AdjLineResponse`
- `BomTemplateResponse`
- `ExpandComponentRequest`
- `AdjLineInput`
- `DeptAdjSubmitRequest`
- `DeptAdjResult`
- `_to_dept_enum`
- `_line_to_response`
- `get_bom_template`
- `expand_component`
- 그 외 4개 항목

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/services/dept_adjustment.py]] — `dept_adjustment.py`는 `dept_adjustment` 업무 규칙을 실제로 실행하는 Python 코드입니다. 라우터보다 안쪽에서 DB 조회와 변경을 담당합니다.
- [[ERP/backend/app/schemas.py]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.

## 조심할 점

API 응답 형식이나 상태 코드를 바꾸면 프론트 화면과 자동 테스트가 같이 영향을 받습니다.

## 핵심 발췌

```python
"""부서 재고 조정 API — 생산/조립·분해/회수·수량 보정.

엔드포인트:
  GET  /api/dept-adjustment/bom-template     BOM 기반 초기 라인 생성
  POST /api/dept-adjustment/expand-component 중간공정품 선택 전개
  POST /api/dept-adjustment/submit           배치 제출 (즉시 처리)
"""

from __future__ import annotations

import logging
import uuid
from decimal import Decimal
from typing import Literal, List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DepartmentEnum, DeptAdjSubTypeEnum, Item
from app.routers._errors import ErrorCode, http_error
from app.services import dept_adjustment as svc

router = APIRouter()

logger = logging.getLogger("mes")


# ──────────────────────────── Schemas ────────────────────────────

class AdjLineResponse(BaseModel):
    item_id: uuid.UUID
    item_name: str
    item_code: Optional[str]
    process_type_code: Optional[str]
    unit: str
    direction: str
    quantity: Decimal
    bom_expected: Optional[Decimal]
    has_children: bool
    department: str
    reason: Optional[str]

    model_config = {"from_attributes": True}


class BomTemplateResponse(BaseModel):
    sub_type: str
    lines: List[AdjLineResponse]


class ExpandComponentRequest(BaseModel):
    item_id: uuid.UUID
    quantity: Decimal = Field(..., gt=0)
```
