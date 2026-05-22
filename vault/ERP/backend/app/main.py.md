---
type: file-explanation
source_path: "backend/app/main.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# main.py — 백엔드 서버 입구와 API 연결표

## 이 파일은 무엇을 책임지나

FastAPI 서버를 만들고, CORS와 에러 처리, 라우터 연결, 헬스체크를 등록하는 백엔드의 현관문입니다.

## 업무 흐름에서의 의미

프론트 화면에서 들어오는 모든 API 요청은 결국 여기서 연결한 라우터 중 하나로 들어갑니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_error_payload`
- `_rid`
- `_value_error_handler`
- `_integrity_error_handler`
- `_operational_error_handler`
- `_unhandled_exception_handler`
- `health_check`
- `health_live`
- `app_session`
- `health_detailed`
- 그 외 4개 항목

## 연결되는 파일

- [[ERP/backend/app/📁_app]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""FastAPI application entry point for the DEXCOWIN MES backend.

Startup 부작용 (create_all / run_migrations / seed / MES 백필) 은 모두
`backend/bootstrap_db.py` 로 옮겼다. 서버 기동만으로는 DB 가 변하지 않는다.

초기 설치 / 스키마 변경 / 시드 재적용은 명시적으로:
    cd backend
    python bootstrap_db.py --all
"""

import datetime as _dt
import os
import uuid

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, text
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from app._logging import get_logger, setup_logging
from app.database import _is_sqlite, get_db
from app.models import (
    Employee,
    Inventory,
    Item,
    TransactionLog,
)
from app.routers._errors import ErrorCode
from app.services import integrity as integrity_svc

from app.routers import (
    admin_audit,
    admin_audit_csv,
    bom,
    codes,
    defects,
    departments,
    dept_adjustment,
    employees,
    inventory,
    io,
    items,
    models as models_router,
    production,
    settings,
    stock_requests,
    variance,
)
from app.services import audit_csv as audit_csv_svc

audit_csv_svc.register_session_listeners()
```
