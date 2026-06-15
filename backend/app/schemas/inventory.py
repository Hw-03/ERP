"""재고·이동·불량등록·공급업체반품·재고대조 schema."""

from typing import List, Literal, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.models import LocationStatusEnum

from app.schemas.common import UtcDatetime


class InventoryReceive(BaseModel):
    item_id: uuid.UUID = Field(..., description="입고 대상 품목 ID")
    quantity: int = Field(..., gt=0, description="입고 수량")
    location: Optional[str] = Field(None, max_length=100, description="보관 위치")
    reference_no: Optional[str] = Field(None, max_length=100, description="참조 번호")
    produced_by: Optional[str] = Field(None, max_length=100, description="처리자")
    producer_employee_code: Optional[str] = Field(None, max_length=30, description="처리자 사번 — 제공 시 직원 DB 조회·검증 후 produced_by 자동 설정")
    notes: Optional[str] = Field(None, description="비고")


class InventoryAdjust(BaseModel):
    item_id: uuid.UUID = Field(..., description="재고 조정 대상 품목 ID")
    quantity: int = Field(..., ge=0, description="조정 후 최종 수량")
    reason: str = Field(..., min_length=1, description="조정 사유")
    location: Optional[str] = Field(None, max_length=100, description="보관 위치")
    reference_no: Optional[str] = Field(None, max_length=100, description="참조 번호")
    produced_by: Optional[str] = Field(None, max_length=100, description="처리자")
    producer_employee_code: Optional[str] = Field(None, max_length=30, description="처리자 사번 — 제공 시 직원 DB 조회·검증 후 produced_by 자동 설정")


class InventoryLocationResponse(BaseModel):
    """부서×상태(생산/불량) 단위 재고 분포."""
    department: str
    status: LocationStatusEnum
    quantity: int


class InventoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    inventory_id: uuid.UUID
    item_id: uuid.UUID
    quantity: int                              # 총합 (= warehouse + production_total + defective_total)
    warehouse_qty: int = 0
    production_total: int = 0
    defective_total: int = 0
    pending_quantity: int = 0
    available_quantity: int = 0     # warehouse + production - pending (defective 제외)
    last_reserver_name: Optional[str] = None
    location: Optional[str]
    updated_at: UtcDatetime
    locations: List[InventoryLocationResponse] = []


class TransferRequest(BaseModel):
    """창고↔부서 이동 (transfer-to-production / transfer-to-warehouse 공용)."""
    item_id: uuid.UUID
    quantity: int = Field(..., gt=0)
    department: str
    notes: Optional[str] = Field(None, description="비고")
    reference_no: Optional[str] = Field(None, max_length=100)
    produced_by: Optional[str] = Field(None, max_length=100)
    producer_employee_code: Optional[str] = Field(None, max_length=30, description="처리자 사번 — 제공 시 직원 DB 조회·검증 후 produced_by 자동 설정")


class DeptTransferRequest(BaseModel):
    """부서간 이동."""
    item_id: uuid.UUID
    quantity: int = Field(..., gt=0)
    from_department: str
    to_department: str
    notes: Optional[str] = None
    reference_no: Optional[str] = Field(None, max_length=100)
    produced_by: Optional[str] = Field(None, max_length=100)
    producer_employee_code: Optional[str] = Field(None, max_length=30, description="처리자 사번 — 제공 시 직원 DB 조회·검증 후 produced_by 자동 설정")


class MarkDefectiveRequest(BaseModel):
    """불량 등록.

    source: 'warehouse' 또는 'production'
    source=production 일 때 source_department 필수 (어느 부서에서 발견됐는지)
    target_department: 격리될 부서
    """
    item_id: uuid.UUID
    quantity: int = Field(..., gt=0)
    source: str = Field(..., description="warehouse | production")
    source_department: Optional[str] = None
    target_department: str
    reason: Optional[str] = Field(None, description="불량 사유")
    operator: Optional[str] = Field(None, max_length=100)
    producer_employee_code: Optional[str] = Field(None, max_length=50, description="작업자 사번 (audit)")


class SupplierReturnRequest(BaseModel):
    """공급업체 반품: 부서별 DEFECTIVE 차감."""
    item_id: uuid.UUID
    quantity: int = Field(..., gt=0)
    from_department: str
    reference_no: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None
    operator: Optional[str] = Field(None, max_length=100)
    producer_employee_code: Optional[str] = Field(None, max_length=30, description="처리자 사번 — 제공 시 직원 DB 조회·검증 후 operator(produced_by) 자동 설정")


class ProcessTypeSummary(BaseModel):
    process_type_code: str
    label: str
    item_count: int
    total_quantity: int
    warehouse_qty_sum: int = 0
    production_qty_sum: int = 0
    defective_qty_sum: int = 0


class InventorySummaryResponse(BaseModel):
    process_types: List[ProcessTypeSummary]
    total_items: int
    total_quantity: int


class ReconcileRow(BaseModel):
    item_id: uuid.UUID
    mes_code: Optional[str] = None
    item_name: str
    placed_total: int
    warehouse_qty: int
    diff: int  # placed_total − warehouse_qty
    status: Literal["ok", "over", "under"]


class ReconcileResponse(BaseModel):
    rows: List[ReconcileRow]
    mismatch_count: int
