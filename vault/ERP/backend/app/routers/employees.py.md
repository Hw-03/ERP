---
type: file-explanation
source_path: "backend/app/routers/employees.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# employees.py — employees.py 설명

## 이 파일은 무엇을 책임지나

`employees.py`는 `employees` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_assigned_slots_for`
- `_assigned_slots_bulk`
- `_sync_assigned_models`
- `list_employees`
- `_auto_employee_code`
- `create_employee`
- `update_employee`
- `delete_employee`
- `verify_employee_pin`
- `change_employee_pin`
- 그 외 3개 항목

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/schemas/📁_schemas]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.
- [[ERP/frontend/lib/api/employees.ts]] — `employees.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 조심할 점

API 응답 형식이나 상태 코드를 바꾸면 프론트 화면과 자동 테스트가 같이 영향을 받습니다.

## 핵심 발췌

```python
"""Employee master router."""

from datetime import UTC, datetime
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee, EmployeeAssignedModel, ProductSymbol, StockRequest
from app.routers._errors import ErrorCode, http_error
from app.schemas import (
    EmployeeCreate,
    EmployeePinChangeRequest,
    EmployeePinResetRequest,
    EmployeeResponse,
    EmployeeThemeUpdate,
    EmployeeUpdate,
    PinVerifyRequest,
)
from app.routers.settings import require_admin
from app.services import rate_limit
from app.services.pin_auth import DEFAULT_PIN_HASH, hash_pin, verify_pin
from app.services import audit
from app.services._tx import commit_and_refresh, commit_only

router = APIRouter()


def _assigned_slots_for(db: Session, employee_id: uuid.UUID) -> List[int]:
    """단일 직원의 담당 모델 slot 목록 (priority asc)."""
    rows = (
        db.query(EmployeeAssignedModel.slot)
        .filter(EmployeeAssignedModel.employee_id == employee_id)
        .order_by(EmployeeAssignedModel.priority.asc(), EmployeeAssignedModel.slot.asc())
        .all()
    )
    return [row.slot for row in rows]


def _assigned_slots_bulk(db: Session, employee_ids: List[uuid.UUID]) -> dict:
    """다수 직원의 담당 모델 slot을 dict[employee_id] = [slot, ...] 형태로 일괄 조회 (N+1 회피)."""
    if not employee_ids:
        return {}
    rows = (
        db.query(EmployeeAssignedModel)
        .filter(EmployeeAssignedModel.employee_id.in_(employee_ids))
        .order_by(EmployeeAssignedModel.employee_id, EmployeeAssignedModel.priority.asc())
        .all()
    )
    grouped: dict = {}
    for row in rows:
        grouped.setdefault(row.employee_id, []).append(row.slot)
```
