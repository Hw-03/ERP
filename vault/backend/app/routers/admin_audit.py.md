---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/admin_audit.py
status: active
updated: 2026-04-27
source_sha: 2873b7ec1d7a
tags:
  - erp
  - backend
  - router
  - py
---

# admin_audit.py

> [!summary] 역할
> FastAPI 라우터 계층의 `admin_audit` 영역 API 엔드포인트를 담당한다.

## 원본 위치

- Source: `backend/app/routers/admin_audit.py`
- Layer: `backend`
- Kind: `router`
- Size: `1871` bytes

## 연결

- Parent hub: [[backend/app/routers/routers|backend/app/routers]]
- Related: [[backend/backend]]

## 읽는 포인트

- 라우터는 API 표면이다. 요청/응답 계약은 `schemas.py`와 함께 확인한다.
- DB 변경은 서비스/모델/테스트까지 같이 본다.

## 원본 발췌

````python
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
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
