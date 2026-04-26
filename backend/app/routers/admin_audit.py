"""관리자 감사로그 조회 API.

쓰기 경로(record) 는 `app.services.audit.record()` 가 라우터 내부에서 직접 호출하고,
이 라우터는 조회만 담당한다.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AdminAuditLog


router = APIRouter()


class AdminAuditLogResponse(BaseModel):
    audit_id: uuid.UUID
    actor_pin_role: str
    action: str
    target_type: str
    target_id: Optional[str] = None
    payload_summary: Optional[str] = None
    request_id: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


@router.get("/audit-logs", response_model=List[AdminAuditLogResponse])
def list_audit_logs(
    db: Session = Depends(get_db),
    limit: int = Query(100, ge=1, le=2000),
    action: Optional[str] = Query(None, description="필터: 정확히 일치 또는 prefix (예: bom.)"),
    target_type: Optional[str] = Query(None),
    since: Optional[datetime] = Query(None, description="이 시각 이후만 (UTC)"),
):
    """최근 감사로그 조회. 관리자 PIN 잠금 화면에서만 호출 (현재 별도 인증 미적용)."""
    q = db.query(AdminAuditLog).order_by(AdminAuditLog.created_at.desc())
    if action:
        if action.endswith("."):
            q = q.filter(AdminAuditLog.action.like(f"{action}%"))
        else:
            q = q.filter(AdminAuditLog.action == action)
    if target_type:
        q = q.filter(AdminAuditLog.target_type == target_type)
    if since:
        q = q.filter(AdminAuditLog.created_at >= since)
    return q.limit(limit).all()
