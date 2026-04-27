---
type: code-note
project: ERP
layer: backend
source_path: backend/app/schemas.py
status: active
updated: 2026-04-27
source_sha: 2a84913dd52b
tags:
  - erp
  - backend
  - schema
  - py
---

# schemas.py

> [!summary] 역할
> FastAPI 요청/응답에 쓰는 Pydantic 스키마와 타입 계약을 정의한다.

## 원본 위치

- Source: `backend/app/schemas.py`
- Layer: `backend`
- Kind: `schema`
- Size: `24273` bytes

## 연결

- Parent hub: [[backend/app/app|backend/app]]
- Related: [[backend/backend]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

> 전체 753줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````python
"""Pydantic schemas for the X-Ray ERP API."""

from datetime import datetime
from decimal import Decimal
from typing import List, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.models import (
    AlertKindEnum,
    CategoryEnum,
    DepartmentEnum,
    EmployeeLevelEnum,
    LocationStatusEnum,
    QueueBatchStatusEnum,
    QueueBatchTypeEnum,
    QueueLineDirectionEnum,
    TransactionTypeEnum,
)


class ItemCreate(BaseModel):
    item_name: str = Field(..., max_length=200, description="품목명")
    spec: Optional[str] = Field(None, description="사양")
    category: CategoryEnum = Field(CategoryEnum.UK, description="11단계 공정 카테고리")
    unit: str = Field("EA", max_length=20, description="단위")
    barcode: Optional[str] = Field(None, max_length=100)
    legacy_file_type: Optional[str] = Field(None, max_length=50)
    legacy_part: Optional[str] = Field(None, max_length=50)
    legacy_item_type: Optional[str] = Field(None, max_length=50)
    legacy_model: Optional[str] = Field(None, max_length=50)
    supplier: Optional[str] = Field(None, max_length=200)
    min_stock: Optional[Decimal] = None
    initial_quantity: Optional[Decimal] = Field(None, description="초기 재고 수량 (기본 0)")
    model_slots: List[int] = Field(default=[], description="사용 제품 슬롯 목록 (1=DX3000, 2=COCOON, 3=SOLO, 4=ADX4000W, 5=ADX6000)")
    option_code: Optional[str] = Field(None, max_length=10, description="옵션/스펙 코드 (예: BG)")


class ItemUpdate(BaseModel):
    item_name: Optional[str] = Field(None, max_length=200)
    spec: Optional[str] = None
    category: Optional[CategoryEnum] = None
    unit: Optional[str] = Field(None, max_length=20)
    barcode: Optional[str] = Field(None, max_length=100)
    legacy_file_type: Optional[str] = Field(None, max_length=50)
    legacy_part: Optional[str] = Field(None, max_length=50)
    legacy_item_type: Optional[str] = Field(None, max_length=50)
    legacy_model: Optional[str] = Field(None, max_length=50)
    supplier: Optional[str] = Field(None, max_length=200)
    min_stock: Optional[Decimal] = None


class ItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    item_id: uuid.UUID
    item_name: str
    spec: Optional[str]
    category: CategoryEnum
    unit: str
    barcode: Optional[str] = None
    legacy_file_type: Optional[str] = None
    legacy_part: Optional[str] = None
    legacy_item_type: Optional[str] = None
    legacy_model: Optional[str] = None
    supplier: Optional[str] = None
    min_stock: Optional[Decimal] = None
    # ERP code fields
    erp_code: Optional[str] = None
    model_symbol: Optional[str] = None
    model_slots: List[int] = []
    symbol_slot: Optional[int] = None
    process_type_code: Optional[str] = None
    option_code: Optional[str] = None
    serial_no: Optional[int] = None
    created_at: datetime
    updated_at: datetime


class InventoryLocationResponse(BaseModel):
    """부서×상태(생산/불량) 단위 재고 분포."""
    department: DepartmentEnum
    status: LocationStatusEnum
    quantity: Decimal


class ItemWithInventory(ItemResponse):
    quantity: Optional[Decimal] = Decimal("0")
    warehouse_qty: Decimal = Decimal("0")
    production_total: Decimal = Decimal("0")
    defective_total: Decimal = Decimal("0")
    pending_quantity: Decimal = Decimal("0")
    available_quantity: Decimal = Decimal("0")
    last_reserver_name: Optional[str] = None
    location: Optional[str] = None
    locations: List[InventoryLocationResponse] = []
    department: Optional[str] = None


class EmployeeCreate(BaseModel):
    employee_code: str = Field(..., max_length=30)
    name: str = Field(..., max_length=100)
    role: str = Field(..., max_length=100)
    phone: Optional[str] = Field(None, max_length=30)
    department: DepartmentEnum
    level: EmployeeLevelEnum = EmployeeLevelEnum.STAFF
    display_order: int = 0
    is_active: bool = True


class EmployeeUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    role: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=30)
    department: Optional[DepartmentEnum] = None
    level: Optional[EmployeeLevelEnum] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None


class EmployeeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    employee_id: uuid.UUID
    employee_code: str
    name: str
    role: str
    phone: Optional[str]
    department: DepartmentEnum
    level: EmployeeLevelEnum
    display_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ShipPackageItemCreate(BaseModel):
    item_id: uuid.UUID
    quantity: Decimal = Field(..., gt=0)


class ShipPackageCreate(BaseModel):
    package_code: str = Field(..., max_length=40)
    name: str = Field(..., max_length=200)
    notes: Optional[str] = None


class ShipPackageUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = None


class ShipPackageItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    package_item_id: uuid.UUID
    package_id: uuid.UUID
    item_id: uuid.UUID
    quantity: Decimal


class ShipPackageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    package_id: uuid.UUID
    package_code: str
    name: str
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime


class ShipPackageItemDetail(BaseModel):
    package_item_id: uuid.UUID
    item_id: uuid.UUID
    erp_code: Optional[str] = None
    item_name: str
    item_category: CategoryEnum
    item_unit: str
    quantity: Decimal


class ShipPackageDetailResponse(ShipPackageResponse):
    items: List[ShipPackageItemDetail]


class AdminPinVerifyRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=32)


class AdminPinUpdateRequest(BaseModel):
    current_pin: str = Field(..., min_length=4, max_length=32)
    new_pin: str = Field(..., min_length=4, max_length=32)


class InventoryReceive(BaseModel):
    item_id: uuid.UUID = Field(..., description="입고 대상 품목 ID")
    quantity: Decimal = Field(..., gt=0, description="입고 수량")
    location: Optional[str] = Field(None, max_length=100, description="보관 위치")
    reference_no: Optional[str] = Field(None, max_length=100, description="참조 번호")
    produced_by: Optional[str] = Field(None, max_length=100, description="처리자")
    notes: Optional[str] = Field(None, description="비고")


class InventoryShip(BaseModel):
    item_id: uuid.UUID = Field(..., description="출고 대상 품목 ID")
    quantity: Decimal = Field(..., gt=0, description="출고 수량")
    location: Optional[str] = Field(None, max_length=100, description="출고 위치")
    reference_no: Optional[str] = Field(None, max_length=100, description="참조 번호")
    produced_by: Optional[str] = Field(None, max_length=100, description="처리자")
    notes: Optional[str] = Field(None, description="비고")


class InventoryAdjust(BaseModel):
    item_id: uuid.UUID = Field(..., description="재고 조정 대상 품목 ID")
    quantity: Decimal = Field(..., ge=0, description="조정 후 최종 수량")
    reason: str = Field(..., min_length=1, description="조정 사유")
    location: Optional[str] = Field(None, max_length=100, description="보관 위치")
    reference_no: Optional[str] = Field(None, max_length=100, description="참조 번호")
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
