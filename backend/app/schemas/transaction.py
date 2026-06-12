"""거래 로그·메타수정·수량보정 schema."""

from typing import Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.models import TransactionTypeEnum

from app.schemas.common import UtcDatetime


class TransactionLogUpdate(BaseModel):
    """[Deprecated] notes만 수정. 3차에서 TransactionMetaEditRequest로 교체됨."""
    notes: Optional[str] = Field(None, description="비고 수정")


class TransactionMetaEditRequest(BaseModel):
    """거래 메타데이터(notes/reference_no/produced_by) 수정 요청. reason + PIN 필수."""

    notes: Optional[str] = None
    reference_no: Optional[str] = None
    produced_by: Optional[str] = None
    reason: str = Field(..., min_length=1, description="수정 사유 (필수)")
    edited_by_employee_id: uuid.UUID
    edited_by_pin: str = Field(..., min_length=1, max_length=20)


class TransactionQuantityCorrectionRequest(BaseModel):
    """RECEIVE/SHIP 수량 보정 요청. SHIP은 quantity_change가 음수여야 함."""

    quantity_change: int = Field(..., description="RECEIVE: 양수, SHIP: 음수")
    reason: str = Field(..., min_length=1)
    edited_by_employee_id: uuid.UUID
    edited_by_pin: str = Field(..., min_length=1, max_length=20)


class TransactionEditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    edit_id: uuid.UUID
    original_log_id: uuid.UUID
    edited_by_employee_id: uuid.UUID
    edited_by_name: str
    reason: str
    before_payload: str
    after_payload: str
    correction_log_id: Optional[uuid.UUID] = None
    created_at: UtcDatetime


class TransactionLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    log_id: uuid.UUID
    item_id: uuid.UUID
    mes_code: Optional[str] = None
    item_name: str
    item_process_type_code: Optional[str] = None
    item_unit: str
    transaction_type: TransactionTypeEnum
    quantity_change: int
    quantity_before: Optional[int]
    quantity_after: Optional[int]
    transfer_qty: Optional[int] = None
    reference_no: Optional[str]
    produced_by: Optional[str]
    producer_employee_id: Optional[uuid.UUID] = None
    requester_name: Optional[str] = None
    # 승인자(요청을 수락한 사람). 직접 처리 시 = 요청자.
    approver_name: Optional[str] = None
    requested_at: Optional[UtcDatetime] = None  # 요청 시각 (배치 submitted_at ?? created_at, 없으면 log.created_at)
    approved_at: Optional[UtcDatetime] = None   # 승인 시각 (별도 결재 시 StockRequest.approved_at, 아니면 log.created_at)
    notes: Optional[str]
    operation_batch_id: Optional[uuid.UUID] = None
    created_at: UtcDatetime
    edit_count: int = 0  # 3차: 수정 이력 개수


class TransactionQuantityCorrectionResponse(BaseModel):
    """4차 수량 보정 응답. 원본 + 보정 거래 한 쌍."""

    original: TransactionLogResponse
    correction: TransactionLogResponse
