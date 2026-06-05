---
type: file-explanation
source_path: "backend/app/routers/io.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# io.py — io.py 설명

## 이 파일은 무엇을 책임지나

`io.py`는 `io` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `preview_io`
- `save_io_draft`
- `get_io_draft`
- `list_io_drafts`
- `delete_io_draft`
- `submit_io`
- `submit_io_draft`
- `get_io_batch`
- `API POST "/preview"`
- `API PUT "/draft"`
- 그 외 6개 항목

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/services/io.py]] — `io.py`는 `io` 업무 규칙을 실제로 실행하는 Python 코드입니다. 라우터보다 안쪽에서 DB 조회와 변경을 담당합니다.
- [[ERP/backend/app/schemas.py]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.
- [[ERP/frontend/lib/api/io.ts]] — `io.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 조심할 점

API 응답 형식이나 상태 코드를 바꾸면 프론트 화면과 자동 테스트가 같이 영향을 받습니다.

## 핵심 발췌

```python
"""입출고 탭 2.0 API router."""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers._errors import ErrorCode, http_error
from app.schemas import (
    IoBatchResponse,
    IoDraftUpsert,
    IoPreviewRequest,
    IoPreviewResponse,
    IoSubmitRequest,
    IoSubmitResponse,
)
from app.services import io as io_svc
from app.services._tx import commit_only


router = APIRouter()


@router.post("/preview", response_model=IoPreviewResponse)
def preview_io(payload: IoPreviewRequest, db: Session = Depends(get_db)):
    try:
        return io_svc.preview(
            db,
            work_type=payload.work_type,
            sub_type=payload.sub_type,
            from_department=payload.from_department,
            to_department=payload.to_department,
            targets=payload.targets,
        )
    except ValueError as exc:
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))


@router.put("/draft", response_model=IoBatchResponse)
def save_io_draft(payload: IoDraftUpsert, db: Session = Depends(get_db)):
    try:
        draft = io_svc.save_draft(db, payload)
    except PermissionError as exc:
        db.rollback()
        raise http_error(403, ErrorCode.FORBIDDEN, str(exc))
    except ValueError as exc:
        db.rollback()
        raise http_error(422, ErrorCode.UNPROCESSABLE, str(exc))
    commit_only(db)
    return draft
```
