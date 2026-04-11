"""
ERP System — Pydantic Schemas
Request / Response models for FastAPI endpoints
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional, List

from pydantic import BaseModel, Field, ConfigDict

from app.models import CategoryEnum, TransactionTypeEnum


# ---------------------------------------------------------------------------
# Item Schemas
# ---------------------------------------------------------------------------

class ItemCreate(BaseModel):
    item_code: str = Field(..., max_length=50, description="품목 코드")
    item_name: str = Field(..., max_length=200, description="품명")
    spec: Optional[str] = Field(None, description="규격/사양")
    category: CategoryEnum = Field(CategoryEnum.UK, description="11단계 카테고리")
    unit: str = Field("EA", max_length=20, description="단위")


class ItemUpdate(BaseModel):
    item_name: Optional[str] = Field(None, max_length=200)
    spec: Optional[str] = None
    category: Optional[CategoryEnum] = None
    unit: Optional[str] = Field(None, max_length=20)


class ItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    item_id: uuid.UUID
    item_code: str
    item_name: str
    spec: Optional[str]
    category: CategoryEnum
    unit: str
    created_at: datetime
    updated_at: datetime


class ItemWithInventory(ItemResponse):
    quantity: Optional[Decimal] = Decimal("0")
    location: Optional[str] = None


# ---------------------------------------------------------------------------
# Inventory Schemas
# ---------------------------------------------------------------------------

class InventoryReceive(BaseModel):
    item_id: uuid.UUID = Field(..., description="입고 품목 ID")
    quantity: Decimal = Field(..., gt=0, description="입고 수량 (양수)")
    location: Optional[str] = Field(None, max_length=100, description="보관 위치")
    reference_no: Optional[str] = Field(None, max_length=100, description="입고 참조번호")
    produced_by: Optional[str] = Field(None, max_length=100, description="처리자")
    notes: Optional[str] = Field(None, description="비고")


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


# ---------------------------------------------------------------------------
# BOM Schemas
# ---------------------------------------------------------------------------

class BOMCreate(BaseModel):
    parent_item_id: uuid.UUID = Field(..., description="상위 품목 ID (완성품)")
    child_item_id: uuid.UUID = Field(..., description="하위 품목 ID (소요 부품)")
    quantity: Decimal = Field(..., gt=0, description="소요 수량")
    unit: str = Field("EA", max_length=20)
    notes: Optional[str] = None


class BOMResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    bom_id: uuid.UUID
    parent_item_id: uuid.UUID
    child_item_id: uuid.UUID
    quantity: Decimal
    unit: str
    notes: Optional[str]


class BOMTreeNode(BaseModel):
    """BOM 트리 뷰 — 재귀 구조"""
    item_id: uuid.UUID
    item_code: str
    item_name: str
    category: CategoryEnum
    unit: str
    required_quantity: Decimal
    current_stock: Decimal = Decimal("0")
    children: List["BOMTreeNode"] = []

BOMTreeNode.model_rebuild()


# ---------------------------------------------------------------------------
# Production / Backflush Schemas
# ---------------------------------------------------------------------------

class ProductionReceiptRequest(BaseModel):
    item_id: uuid.UUID = Field(..., description="생산 입고 품목 ID (완성품/반제품)")
    quantity: Decimal = Field(..., gt=0, description="생산 수량")
    reference_no: Optional[str] = Field(None, max_length=100, description="생산지시번호")
    produced_by: Optional[str] = Field(None, max_length=100, description="작업자")
    notes: Optional[str] = None


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


# ---------------------------------------------------------------------------
# TransactionLog Schemas
# ---------------------------------------------------------------------------

class TransactionLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    log_id: uuid.UUID
    item_id: uuid.UUID
    transaction_type: TransactionTypeEnum
    quantity_change: Decimal
    quantity_before: Optional[Decimal]
    quantity_after: Optional[Decimal]
    reference_no: Optional[str]
    produced_by: Optional[str]
    notes: Optional[str]
    created_at: datetime


# ---------------------------------------------------------------------------
# Common
# ---------------------------------------------------------------------------

class MessageResponse(BaseModel):
    message: str

class ErrorResponse(BaseModel):
    detail: str
