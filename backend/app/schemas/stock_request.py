"""재고 요청(작업자 결재 흐름) schema."""

from typing import List, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import (
    RequestBucketEnum,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
)

from app.schemas.common import UtcDatetime


class StockRequestLineCreate(BaseModel):
    record_id: Optional[uuid.UUID] = None
    item_id: uuid.UUID
    quantity: int = Field(..., gt=0)
    from_bucket: RequestBucketEnum
    from_department: Optional[str] = None
    to_bucket: RequestBucketEnum
    to_department: Optional[str] = None


class StockRequestCreate(BaseModel):
    requester_employee_id: uuid.UUID
    request_type: StockRequestTypeEnum
    reference_no: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None
    lines: List[StockRequestLineCreate] = Field(..., min_length=1)
    client_request_id: Optional[str] = Field(None, max_length=64)
    reason_category: Optional[str] = Field(None, max_length=32)
    reason_memo: Optional[str] = None
    supplier_id: Optional[uuid.UUID] = None

    @model_validator(mode="after")
    def require_direct_defect_reason(self) -> "StockRequestCreate":
        """즉시 불량 처리는 감사 가능한 사유 하나 이상을 요구한다."""
        reason_required = {
            StockRequestTypeEnum.SCRAP_NORMAL,
            StockRequestTypeEnum.RETURN_NORMAL,
            StockRequestTypeEnum.REWORK_NORMAL,
        }
        has_reason = bool((self.reason_category or "").strip() or (self.reason_memo or "").strip())
        if self.request_type in reason_required and not has_reason:
            raise ValueError("사유 카테고리 또는 메모 중 하나를 입력하세요.")
        return self


class StockRequestDraftUpsert(BaseModel):
    """장바구니(DRAFT) upsert 페이로드. lines 는 빈 리스트 허용 — 저장 도중 단계."""
    requester_employee_id: uuid.UUID
    request_type: StockRequestTypeEnum
    reference_no: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None
    lines: List[StockRequestLineCreate] = Field(default_factory=list)
    reason_category: Optional[str] = Field(None, max_length=32)
    reason_memo: Optional[str] = None
    supplier_id: Optional[uuid.UUID] = None


class StockRequestSubmitPayload(BaseModel):
    """장바구니(DRAFT) → 제출 전환 페이로드."""
    requester_employee_id: uuid.UUID


class StockRequestActionRequest(BaseModel):
    """승인/반려/취소 공통 페이로드 — pin 필수."""
    actor_employee_id: uuid.UUID
    pin: str = Field(..., min_length=1, max_length=32)
    reason: Optional[str] = None  # reject 시에만 사용


class StockRequestLineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    line_id: uuid.UUID
    record_id: Optional[uuid.UUID] = None
    request_id: uuid.UUID
    item_id: uuid.UUID
    item_name_snapshot: str
    mes_code_snapshot: Optional[str] = None
    quantity: int
    from_bucket: RequestBucketEnum
    from_department: Optional[str] = None
    to_bucket: RequestBucketEnum
    to_department: Optional[str] = None
    status: StockRequestStatusEnum
    operation_line_id: Optional[uuid.UUID] = None
    created_at: UtcDatetime


class StockRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    request_id: uuid.UUID
    request_code: Optional[str] = None
    requester_employee_id: uuid.UUID
    requester_name: str
    requester_department: str
    approval_department: Optional[str] = None
    request_type: StockRequestTypeEnum
    status: StockRequestStatusEnum
    requires_warehouse_approval: bool
    reserved_at: Optional[UtcDatetime] = None
    submitted_at: Optional[UtcDatetime] = None
    approved_by_employee_id: Optional[uuid.UUID] = None
    approved_by_name: Optional[str] = None
    approved_at: Optional[UtcDatetime] = None
    rejected_by_employee_id: Optional[uuid.UUID] = None
    rejected_by_name: Optional[str] = None
    rejected_at: Optional[UtcDatetime] = None
    rejected_reason: Optional[str] = None
    requires_department_approval: bool = False
    department_approved_by_employee_id: Optional[uuid.UUID] = None
    department_approved_by_name: Optional[str] = None
    department_approved_at: Optional[UtcDatetime] = None
    requires_as_research_approval: bool = False
    as_research_approved_by_employee_id: Optional[uuid.UUID] = None
    as_research_approved_by_name: Optional[str] = None
    as_research_approved_at: Optional[UtcDatetime] = None
    cancelled_at: Optional[UtcDatetime] = None
    completed_at: Optional[UtcDatetime] = None
    reference_no: Optional[str] = None
    notes: Optional[str] = None
    operation_batch_id: Optional[uuid.UUID] = None
    supplier_id: Optional[uuid.UUID] = None
    supplier_name_snapshot: Optional[str] = None
    created_at: UtcDatetime
    updated_at: UtcDatetime
    lines: List[StockRequestLineResponse] = []
