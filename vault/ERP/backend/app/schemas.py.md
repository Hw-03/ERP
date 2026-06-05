---
type: file-explanation
source_path: "backend/app/schemas.py"
importance: critical
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# schemas.py — API 데이터 약속

## 이 파일은 무엇을 책임지나

백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.

## 업무 흐름에서의 의미

화면이 기대하는 필드명과 백엔드가 보내는 응답이 맞는지 확인하는 계약서 역할을 합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때
- 운영 데이터가 달라질 수 있는 변경을 준비할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `ItemCreate`
- `ItemUpdate`
- `ItemResponse`
- `InventoryLocationResponse`
- `ItemWithInventory`
- `PinVerifyRequest`
- `EmployeePinResetRequest`
- `EmployeePinChangeRequest`
- `EmployeeCreate`
- `EmployeeUpdate`
- 그 외 8개 항목

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.
- [[ERP/backend/app/main.py]] — FastAPI 서버를 만들고, CORS와 에러 처리, 라우터 연결, 헬스체크를 등록하는 백엔드의 현관문입니다.
- [[ERP/backend/app/routers/stock_requests.py]] — 프론트의 입출고 요청 작성, 내 요청, 창고 승인함이 호출하는 API 입구입니다.
- [[ERP/frontend/lib/api/types/inventory.ts]] — `inventory.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 조심할 점

필드명이나 필수 여부를 바꾸면 화면, 테스트, OpenAPI 문서가 함께 바뀌어야 합니다.

## 핵심 발췌

```python
"""Pydantic schemas for the DEXCOWIN MES API."""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated, List, Literal, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, WithJsonSchema

from app.models import (
    EmployeeLevelEnum,
    LocationStatusEnum,
    RequestBucketEnum,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    TransactionTypeEnum,
)


def _serialize_datetime_with_utc(dt: datetime) -> str:
    """Serialize naive datetime with +00:00 UTC offset."""
    if dt.tzinfo is None:
        return dt.isoformat() + "+00:00"
    return dt.isoformat()


UtcDatetime = Annotated[
    datetime,
    PlainSerializer(_serialize_datetime_with_utc, return_type=str),
    WithJsonSchema({"type": "string", "format": "date-time"}),
]


class ItemCreate(BaseModel):
    item_name: str = Field(..., max_length=200, description="품목명")
    process_type_code: Optional[str] = Field(None, max_length=2, description="공정 코드 (TR/HR/.../PF 18개)")
    unit: str = Field("EA", max_length=20, description="단위")
    legacy_part: Optional[str] = Field(None, max_length=50)
    legacy_item_type: Optional[str] = Field(None, max_length=50)
    supplier: Optional[str] = Field(None, max_length=200)
    min_stock: Optional[Decimal] = None
    initial_quantity: Optional[Decimal] = Field(None, description="초기 재고 수량 (기본 0)")
    model_slots: List[int] = Field(default=[], description="사용 제품 슬롯 목록 (1=DX3000, 2=COCOON, 3=SOLO, 4=ADX4000W, 5=ADX6000)")
    option_code: Optional[str] = Field(None, max_length=10, description="옵션/스펙 코드 (예: BG)")


class ItemUpdate(BaseModel):
    item_name: Optional[str] = Field(None, max_length=200)
    process_type_code: Optional[str] = Field(None, max_length=2, description="공정 코드 (TR/HR/.../PF 18개)")
    unit: Optional[str] = Field(None, max_length=20)
    legacy_part: Optional[str] = Field(None, max_length=50)
    legacy_item_type: Optional[str] = Field(None, max_length=50)
    supplier: Optional[str] = Field(None, max_length=200)
    min_stock: Optional[Decimal] = None
    item_code: Optional[str] = Field(None, max_length=40)
```
