"""품목·BOM·제품심볼·생산입고 schema."""

from typing import List, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import UtcDatetime
from app.schemas.inventory import InventoryLocationResponse
from app.schemas.weekly import BackflushDetail


class InitialLocationInput(BaseModel):
    department: str = Field(..., max_length=50, description="부서명 (창고 제외)")
    quantity: int = Field(..., gt=0, description="해당 부서 초기 배분 수량")


class ItemCreate(BaseModel):
    item_name: str = Field(..., max_length=200, description="품목명")
    process_type_code: Optional[str] = Field(None, max_length=2, description="공정 코드 (TR/HR/.../PF 18개)")
    unit: str = Field("EA", max_length=20, description="단위")
    legacy_part: Optional[str] = Field(None, max_length=50)
    legacy_item_type: Optional[str] = Field(None, max_length=50)
    supplier: Optional[str] = Field(None, max_length=200)
    min_stock: Optional[int] = None
    initial_quantity: Optional[int] = Field(None, description="초기 재고 수량 (기본 0)")
    model_slots: List[int] = Field(default=[], description="사용 제품 슬롯 목록 (1=DX3000, 2=COCOON, 3=SOLO, 4=ADX4000W, 5=ADX6000)")
    initial_locations: Optional[List[InitialLocationInput]] = Field(
        None, description="부서별 초기 배분. 합계 ≤ initial_quantity, 나머지는 창고."
    )


class ItemUpdate(BaseModel):
    item_name: Optional[str] = Field(None, max_length=200)
    process_type_code: Optional[str] = Field(None, max_length=2, description="공정 코드 (TR/HR/.../PF 18개)")
    unit: Optional[str] = Field(None, max_length=20)
    legacy_part: Optional[str] = Field(None, max_length=50)
    legacy_item_type: Optional[str] = Field(None, max_length=50)
    supplier: Optional[str] = Field(None, max_length=200)
    min_stock: Optional[int] = None
    mes_code: Optional[str] = Field(None, max_length=40)
    model_slots: Optional[List[int]] = None


class ItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    item_id: uuid.UUID
    item_name: str
    unit: str
    legacy_part: Optional[str] = None
    legacy_item_type: Optional[str] = None
    supplier: Optional[str] = None
    min_stock: Optional[int] = None
    # item code fields
    mes_code: Optional[str] = None
    model_symbol: Optional[str] = None
    model_slots: List[int] = []
    process_type_code: Optional[str] = None
    serial_no: Optional[int] = None
    bom_completed_at: Optional[UtcDatetime] = None
    has_bom: bool = False
    deleted_at: Optional[UtcDatetime] = None
    created_at: UtcDatetime
    updated_at: UtcDatetime


class ItemWithInventory(ItemResponse):
    quantity: Optional[int] = 0
    warehouse_qty: int = 0
    production_total: int = 0
    defective_total: int = 0
    pending_quantity: int = 0
    available_quantity: int = 0
    last_reserver_name: Optional[str] = None
    location: Optional[str] = None
    locations: List[InventoryLocationResponse] = []
    department: Optional[str] = None


class BOMCreate(BaseModel):
    parent_item_id: uuid.UUID = Field(..., description="상위 품목 ID")
    child_item_id: uuid.UUID = Field(..., description="하위 품목 ID")
    quantity: int = Field(..., gt=0, description="필요 수량")
    unit: str = Field("EA", max_length=20, description="수량 단위")
    notes: Optional[str] = Field(None, description="비고")


class BOMUpdate(BaseModel):
    quantity: Optional[int] = Field(None, gt=0)
    unit: Optional[str] = Field(None, max_length=20)


class BomCompletionUpdate(BaseModel):
    completed: bool = Field(..., description="True=완료로 표시, False=완료 해제")


class ItemReorderItem(BaseModel):
    item_id: uuid.UUID
    display_order: int


class ItemReorderPayload(BaseModel):
    items: List[ItemReorderItem]
    pin: str


class MyItemOrderEntry(BaseModel):
    item_id: uuid.UUID
    display_order: int


class MyItemOrderPut(BaseModel):
    employee_id: uuid.UUID
    items: List[MyItemOrderEntry]


class BOMResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    bom_id: uuid.UUID
    parent_item_id: uuid.UUID
    child_item_id: uuid.UUID
    quantity: int
    unit: str
    notes: Optional[str]


class BOMDetailResponse(BaseModel):
    bom_id: uuid.UUID
    parent_item_id: uuid.UUID
    parent_item_name: str
    parent_mes_code: Optional[str]
    child_item_id: uuid.UUID
    child_item_name: str
    child_mes_code: Optional[str]
    quantity: int
    unit: str


class BOMTreeNode(BaseModel):
    item_id: uuid.UUID
    mes_code: Optional[str] = None
    item_name: str
    process_type_code: Optional[str] = None
    unit: str
    required_quantity: int
    current_stock: int = 0
    children: List["BOMTreeNode"] = []


BOMTreeNode.model_rebuild()


class ProductionReceiptRequest(BaseModel):
    item_id: uuid.UUID = Field(..., description="생산 입고 대상 품목 ID")
    quantity: int = Field(..., gt=0, description="생산 수량")
    reference_no: Optional[str] = Field(None, max_length=100, description="참조 번호")
    produced_by: Optional[str] = Field(None, max_length=100, description="작업자")
    producer_employee_code: Optional[str] = Field(None, max_length=30, description="작업자 사번 — 제공 시 직원 DB 조회·검증 후 produced_by 자동 설정")
    notes: Optional[str] = Field(None, description="비고")


class ProductionReceiptResponse(BaseModel):
    success: bool
    message: str
    produced_item_id: uuid.UUID
    produced_item_name: str
    produced_quantity: int
    reference_no: Optional[str]
    backflushed_components: List[BackflushDetail]
    transaction_ids: List[uuid.UUID]


class ProductSymbolResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    slot: int
    symbol: Optional[str]
    model_name: Optional[str]
    is_finished_good: bool
    is_reserved: bool
    notes: Optional[str] = None


class ProductSymbolUpdate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    symbol: Optional[str] = Field(None, max_length=5)
    model_name: Optional[str] = Field(None, max_length=50)
    is_finished_good: Optional[bool] = None
    is_reserved: Optional[bool] = None
    notes: Optional[str] = None
