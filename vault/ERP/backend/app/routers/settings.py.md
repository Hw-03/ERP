---
type: file-explanation
source_path: "backend/app/routers/settings.py"
importance: critical
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# settings.py — settings.py 설명

## 이 파일은 무엇을 책임지나

`settings.py`는 `settings` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때
- 운영 데이터가 달라질 수 있는 변경을 준비할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `ResetRequest`
- `IntegrityRepairRequest`
- `ensure_admin_pin`
- `_is_hashed`
- `_matches_admin_pin`
- `verify_admin_pin`
- `update_admin_pin`
- `require_admin`
- `_inventory_integrity_payload`
- `check_inventory_integrity`
- 그 외 3개 항목

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/schemas/📁_schemas]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.

## 조심할 점

이 파일은 운영 데이터, 재고 수량, 승인 상태, DB 구조, 백업/복구 중 하나와 직접 연결됩니다. 수정 전에는 관련 테스트, 백업 여부, 연결 화면/API를 반드시 확인해야 합니다.

## 핵심 발췌

```python
"""System settings router.

관리자 PIN 인증 엔드포인트와 DB 재시드(안전 초기화), 재고 불변식 점검/복구 엔드포인트.
무결성 점검 · 복구는 운영자가 명시적으로 호출하는 관리자 도구이며 프론트엔드는 사용하지 않는다.
"""

import logging
from datetime import UTC, datetime

from typing import Optional

from fastapi import APIRouter, Body, Depends, Query, Request
from sqlalchemy.orm import Session

from pydantic import BaseModel, Field

from app.database import get_db
from app.models import Inventory, SystemSetting
from app.routers._errors import ErrorCode, http_error
from app.schemas import (
    AdminPinUpdateRequest,
    AdminPinVerifyRequest,
    IntegrityCheckBody,
    IntegrityCheckRequest,
    IntegrityCheckResponse,
    IntegrityRepairResponse,
    MessageResponse,
)
from app.services import audit
from app.services import integrity as integrity_svc
from app.services._tx import commit_and_refresh, commit_only
from app.services.pin_auth import hash_pin

logger = logging.getLogger("mes")


class ResetRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=32, description="현재 관리자 PIN")


class IntegrityRepairRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=32)
    dry_run: bool = True

router = APIRouter()

ADMIN_PIN_KEY = "admin_pin"
DEFAULT_ADMIN_PIN = "0000"


def ensure_admin_pin(db: Session) -> SystemSetting:
    setting = db.query(SystemSetting).filter(SystemSetting.setting_key == ADMIN_PIN_KEY).first()
    if setting:
        return setting
```
