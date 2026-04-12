"""Pydantic schemas for the X-Ray ERP API."""

from datetime import datetime
from decimal import Decimal
from typing import List, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.models import CategoryEnum, DepartmentEnum, EmployeeLevelEnum, TransactionTypeEnum


class ItemCreate(BaseModel):
    item_code: str = Field(..., max_length=50, description="품목 코드")
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
    item_code: str
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
    created_at: datetime
    updated_at: datetime


class ItemWithInventory(ItemResponse):
    quantity: Optional[Decimal] = Decimal("0")
    location: Optional[str] = None


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
    item_code: str
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
    produced_by: Optional[str] = Field(None, max_length=100, description="처리자")


class PackageShipRequest(BaseModel):
    package_id: uuid.UUID
    quantity: Decimal = Field(..., gt=0)
    reference_no: Optional[str] = Field(None, max_length=100)
    produced_by: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None


class InventoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    inventory_id: uuid.UUID
    item_id: uuid.UUID
    quantity: Decimal
    location: Optional[str]
    updated_at: datetime


class CategorySummary(BaseModel):
    category: CategoryEnum
    category_label: str
    item_count: int
    total_quantity: Decimal


class InventorySummaryResponse(BaseModel):
    categories: List[CategorySummary]
    total_items: int
    total_quantity: Decimal
    uk_item_count: int


class BOMCreate(BaseModel):
    parent_item_id: uuid.UUID = Field(..., description="상위 품목 ID")
    child_item_id: uuid.UUID = Field(..., description="하위 품목 ID")
    quantity: Decimal = Field(..., gt=0, description="필요 수량")
    unit: str = Field("EA", max_length=20, description="수량 단위")
    notes: Optional[str] = Field(None, description="비고")


class BOMResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    bom_id: uuid.UUID
    parent_item_id: uuid.UUID
    child_item_id: uuid.UUID
    quantity: Decimal
    unit: str
    notes: Optional[str]


class BOMTreeNode(BaseModel):
    item_id: uuid.UUID
    item_code: str
    item_name: str
    category: CategoryEnum
    unit: str
    required_quantity: Decimal
    current_stock: Decimal = Decimal("0")
    children: List["BOMTreeNode"] = []


BOMTreeNode.model_rebuild()


class ProductionReceiptRequest(BaseModel):
    item_id: uuid.UUID = Field(..., description="생산 입고 대상 품목 ID")
    quantity: Decimal = Field(..., gt=0, description="생산 수량")
    reference_no: Optional[str] = Field(None, max_length=100, description="참조 번호")
    produced_by: Optional[str] = Field(None, max_length=100, description="작업자")
    notes: Optional[str] = Field(None, description="비고")


class BackflushDetail(BaseModel):
    item_id: uuid.UUID
    item_code: str
    item_name: str
    category: CategoryEnum
    required_quantity: Decimal
    stock_before: Decimal
    stock_after: Decimal


class ProductionReceiptResponse(BaseModel):
    success: bool
    message: str
    produced_item_id: uuid.UUID
    produced_item_name: str
    produced_quantity: Decimal
    reference_no: Optional[str]
    backflushed_components: List[BackflushDetail]
    transaction_ids: List[uuid.UUID]


class TransactionLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    log_id: uuid.UUID
    item_id: uuid.UUID
    item_code: str
    item_name: str
    item_category: CategoryEnum
    item_unit: str
    transaction_type: TransactionTypeEnum
    quantity_change: Decimal
    quantity_before: Optional[Decimal]
    quantity_after: Optional[Decimal]
    reference_no: Optional[str]
    produced_by: Optional[str]
    notes: Optional[str]
    created_at: datetime


class MessageResponse(BaseModel):
    message: str


class ErrorResponse(BaseModel):
    detail: str
