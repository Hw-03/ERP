"""입출고(IO) 미리보기·draft·제출·배치 schema."""

from typing import List, Optional
import uuid

from pydantic import BaseModel, Field

from app.schemas.common import UtcDatetime


class IoPreviewTarget(BaseModel):
    source_kind: str = Field("direct_item", max_length=24)
    item_id: Optional[uuid.UUID] = None
    quantity: int = Field(1, gt=0)


class IoLinePayload(BaseModel):
    line_id: uuid.UUID
    item_id: uuid.UUID
    item_name: str
    mes_code: Optional[str] = None
    unit: str = "EA"
    direction: str
    from_bucket: str
    from_department: Optional[str] = None
    to_bucket: str
    to_department: Optional[str] = None
    quantity: int
    bom_expected: Optional[int] = None
    included: bool = True
    origin: str
    edited: bool = False
    has_children: bool = False
    shortage: int = 0
    exclusion_note: Optional[str] = None


class IoBundlePayload(BaseModel):
    bundle_id: uuid.UUID
    source_kind: str
    title: str
    source_item_id: Optional[uuid.UUID] = None
    source_mes_code: Optional[str] = None
    quantity: int
    expanded_level: int = 1
    lines: List[IoLinePayload] = Field(default_factory=list)


class IoPreviewRequest(BaseModel):
    requester_employee_id: Optional[uuid.UUID] = None
    work_type: str
    sub_type: str
    from_department: Optional[str] = None
    to_department: Optional[str] = None
    targets: List[IoPreviewTarget] = Field(..., min_length=1)


class IoPreviewResponse(BaseModel):
    work_type: str
    sub_type: str
    requires_approval: bool
    bundles: List[IoBundlePayload]


class IoDraftUpsert(BaseModel):
    requester_employee_id: uuid.UUID
    work_type: str
    sub_type: str
    from_department: Optional[str] = None
    to_department: Optional[str] = None
    reference_no: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None
    client_request_id: Optional[str] = Field(None, max_length=64)
    # 이어 작업 중인 draft의 batch_id. 있으면 해당 draft를 갱신, 없으면 새 슬롯 생성.
    # submit 경로(IoSubmitRequest)는 이 값을 무시한다.
    batch_id: Optional[uuid.UUID] = None
    bundles: List[IoBundlePayload] = Field(default_factory=list)


class IoSubmitRequest(IoDraftUpsert):
    pass


class IoBatchResponse(BaseModel):
    batch_id: uuid.UUID
    work_type: str
    sub_type: str
    status: str
    requester_employee_id: uuid.UUID
    requester_name: str
    requester_department: str
    # 승인자(요청을 수락한 사람). stock_request 경로 → 그 request 의 approved_by. 직접 처리(stock_request 없음) → 요청자 자신.
    approver_employee_id: Optional[uuid.UUID] = None
    approver_name: Optional[str] = None
    from_department: Optional[str] = None
    to_department: Optional[str] = None
    requires_approval: bool
    stock_request_id: Optional[uuid.UUID] = None
    reference_no: Optional[str] = None
    notes: Optional[str] = None
    created_at: UtcDatetime
    updated_at: UtcDatetime
    submitted_at: Optional[UtcDatetime] = None
    completed_at: Optional[UtcDatetime] = None
    bundles: List[IoBundlePayload] = Field(default_factory=list)


class IoSubmitResponse(BaseModel):
    batch: IoBatchResponse
    status: str
    requires_approval: bool
    stock_request_id: Optional[uuid.UUID] = None
    message: str
