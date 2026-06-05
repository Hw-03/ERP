"""알림·인수인계 schema."""

from typing import List, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import UtcDatetime


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    notification_id: uuid.UUID
    recipient_employee_id: uuid.UUID
    type: str
    title: str
    body: Optional[str] = None
    target_tab: Optional[str] = None
    target_section: Optional[str] = None
    related_request_id: Optional[uuid.UUID] = None
    is_read: bool
    created_at: UtcDatetime


class NotificationListResponse(BaseModel):
    items: List[NotificationResponse]
    unread_count: int


class NotificationMarkReadRequest(BaseModel):
    recipient_employee_id: uuid.UUID
    # None 이면 해당 직원의 안 읽은 알림 전체를 읽음 처리.
    notification_ids: Optional[List[uuid.UUID]] = None


class HandoverLineCreate(BaseModel):
    item_id: uuid.UUID
    quantity: int = Field(..., gt=0)


class HandoverCreate(BaseModel):
    author_employee_id: uuid.UUID
    to_department: str = Field(..., min_length=1, max_length=50)
    title: str = Field(..., min_length=1, max_length=200)
    process_content: Optional[str] = None
    product_name: Optional[str] = Field(None, max_length=200)
    doc_date: Optional[UtcDatetime] = None
    analysis_text: Optional[str] = None
    notes: Optional[str] = None
    lines: List[HandoverLineCreate] = Field(default_factory=list)


class HandoverReceiveRequest(BaseModel):
    actor_employee_id: uuid.UUID
    pin: str = Field(..., min_length=1, max_length=32)


class HandoverLineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    line_id: uuid.UUID
    item_id: uuid.UUID
    item_name_snapshot: str
    mes_code_snapshot: Optional[str] = None
    quantity: int


class HandoverResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    handover_id: uuid.UUID
    handover_code: Optional[str] = None
    status: str
    author_employee_id: uuid.UUID
    author_name: str
    from_department: str
    to_department: str
    title: str
    process_content: Optional[str] = None
    product_name: Optional[str] = None
    doc_date: Optional[UtcDatetime] = None
    analysis_text: Optional[str] = None
    notes: Optional[str] = None
    received_by_employee_id: Optional[uuid.UUID] = None
    received_by_name: Optional[str] = None
    received_at: Optional[UtcDatetime] = None
    created_at: UtcDatetime
    updated_at: UtcDatetime
    lines: List[HandoverLineResponse] = []
