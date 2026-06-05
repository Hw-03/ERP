---
type: file-explanation
source_path: "backend/app/routers/admin_audit.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# admin_audit.py — admin_audit.py 설명

## 이 파일은 무엇을 책임지나

`admin_audit.py`는 `admin_audit` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `AdminAuditLogResponse`
- `list_audit_logs`
- `API GET "/audit-logs"`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/schemas/📁_schemas]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.

## 조심할 점

API 응답 형식이나 상태 코드를 바꾸면 프론트 화면과 자동 테스트가 같이 영향을 받습니다.

## 핵심 발췌

```python
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
```
