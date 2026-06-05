---
type: file-explanation
source_path: "backend/app/routers/departments.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# departments.py — departments.py 설명

## 이 파일은 무엇을 책임지나

`departments.py`는 `departments` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `list_departments`
- `create_department`
- `reorder_departments`
- `update_department`
- `delete_department`
- `API GET ""`
- `API POST ""`
- `API PATCH "/reorder"`
- `API PUT "/{dept_id}"`
- `API DELETE "/{dept_id}"`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/schemas.py]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.
- [[ERP/frontend/lib/api/departments.ts]] — `departments.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 조심할 점

API 응답 형식이나 상태 코드를 바꾸면 프론트 화면과 자동 테스트가 같이 영향을 받습니다.

## 핵심 발췌

```python
"""Department master router."""

from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Department
from app.routers._errors import ErrorCode, http_error
from app.routers.settings import require_admin
from app.schemas import (
    DepartmentCreate,
    DepartmentDeleteRequest,
    DepartmentReorderPayload,
    DepartmentResponse,
    DepartmentUpdate,
)

router = APIRouter()


@router.get("", response_model=List[DepartmentResponse])
def list_departments(
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Department)
    if is_active is not None:
        query = query.filter(Department.is_active == is_active)
    return query.order_by(Department.display_order.asc(), Department.name.asc()).all()


@router.post("", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
def create_department(
    payload: DepartmentCreate,
    db: Session = Depends(get_db),
):
    require_admin(db, payload.pin)
    if db.query(Department).filter(Department.name == payload.name).first():
        raise HTTPException(status_code=409, detail="이미 존재하는 부서명입니다.")
    dept = Department(name=payload.name, display_order=payload.display_order, is_active=True, color_hex=payload.color_hex)
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return dept


@router.patch("/reorder")
def reorder_departments(payload: DepartmentReorderPayload, db: Session = Depends(get_db)):
    require_admin(db, payload.pin)
    for item in payload.items:
        dept = db.query(Department).filter(Department.id == item.id).first()
        if dept:
            dept.display_order = item.display_order
```
