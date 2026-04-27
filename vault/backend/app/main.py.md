---
type: code-note
project: ERP
layer: backend
source_path: backend/app/main.py
status: active
updated: 2026-04-27
source_sha: 22eaf0fb64d9
tags:
  - erp
  - backend
  - app-entry
  - py
---

# main.py

> [!summary] 역할
> FastAPI 앱 생성, 라우터 등록, 미들웨어, 전역 예외 처리를 묶는 서버 진입점이다.

## 원본 위치

- Source: `backend/app/main.py`
- Layer: `backend`
- Kind: `app-entry`
- Size: `11333` bytes

## 연결

- Parent hub: [[backend/app/app|backend/app]]
- Related: [[backend/backend]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

> 전체 306줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````python
"""FastAPI application entry point for the X-Ray ERP backend.

Startup 부작용 (create_all / run_migrations / seed / ERP 백필) 은 모두
`backend/bootstrap_db.py` 로 옮겼다. 서버 기동만으로는 DB 가 변하지 않는다.

초기 설치 / 스키마 변경 / 시드 재적용은 명시적으로:
    cd backend
    python bootstrap_db.py --all
"""

import os
import uuid

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, text
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from app._logging import get_logger, setup_logging
from app.database import get_db
from app.models import (
    Employee,
    Inventory,
    Item,
    QueueBatch,
    QueueBatchStatusEnum,
    TransactionLog,
)
from app.routers._errors import ErrorCode
from app.services import integrity as integrity_svc

from app.routers import (
    admin_audit,
    alerts,
    bom,
    codes,
    counts,
    employees,
    inventory,
    items,
    loss,
    models as models_router,
    production,
    queue,
    scrap,
    settings,
    ship_packages,
    variance,
)


app = FastAPI(
    title="X-Ray ERP System",
    description="""
    ## 정밀 X-Ray 장비 제조 ERP

    ### 11단계 공정 카테고리
    | Code | 명칭 | 설명 |
    |------|------|------|
    | RM | Raw Material | 원자재 |
    | TA | Tube Ass'y | 튜브 반제품 |
    | TF | Tube Final | 튜브 완제품 |
    | HA | High-voltage Ass'y | 고압 반제품 |
    | HF | High-voltage Final | 고압 완제품 |
    | VA | Vacuum Ass'y | 진공 반제품 |
    | VF | Vacuum Final | 진공 완제품 |
    | AA | Body Ass'y | 조립 반제품 |
    | AF | Body Final | 조립 완제품 |
    | FG | Finished Good | 완제품 |
    | UK | Unknown | 미분류 또는 확인 필요 |

    ### 주요 기능
    - 품목 마스터 조회 및 수정
    - 재고 요약, 입고, 출고, 조정, 거래 이력
    - 직원 마스터 및 출하 패키지 관리
    - BOM 관리와 트리 조회
    - 생산 입고와 BOM 기반 Backflush
    """,
    version="1.3.0",
    docs_url="/docs",
    redoc_url="/redoc",
    redirect_slashes=False,
    openapi_tags=[
        {"name": "System", "description": "헬스체크, 메타 — 운영 점검용."},
        {"name": "Items", "description": "품목 마스터 CRUD + 검색."},
        {"name": "Employees", "description": "직원 마스터."},
        {"name": "Inventory", "description": "재고 조회·입출고·이동·불량·반품·거래이력."},
        {"name": "BOM", "description": "BOM CRUD + 트리 + Where-Used."},
        {"name": "Production", "description": "생산 입고 + BOM Backflush."},
        {"name": "Queue", "description": "Queue 배치 워크플로 (생산/분해/반품 2단계)."},
        {"name": "Settings", "description": "관리자 PIN, 시스템 정합성 점검·복구."},
        {"name": "Ship Packages", "description": "출하 묶음 CRUD."},
        {"name": "Models", "description": "제품 모델 슬롯."},
        {"name": "Codes", "description": "코드 마스터 (제품기호/옵션/공정)."},
        {"name": "Scrap", "description": "폐기 이력."},
        {"name": "Loss", "description": "분실/누락 이력."},
        {"name": "Variance", "description": "차이 분석."},
        {"name": "Alerts", "description": "안전재고/실사 알림."},
        {"name": "Counts", "description": "실사 등록·강제 조정."},
        {"name": "Admin Audit", "description": "관리자 액션 감사로그 조회 (마스터/설정 변경)."},
    ],
)

_DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
# Phase 5: CORS_EXTRA_ORIGINS 환경 변수가 있으면 콤마로 split 해서 추가.
# 변수 미설정/빈 값이면 기본 origin 만 사용 (기존 동작 동일).
_extra_origins_raw = os.environ.get("CORS_EXTRA_ORIGINS", "").strip()
_extra_origins = [o.strip() for o in _extra_origins_raw.split(",") if o.strip()] if _extra_origins_raw else []

app.add_middleware(
    CORSMiddleware,
    allow_origins=_DEFAULT_CORS_ORIGINS + _extra_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def _request_id_middleware(request: Request, call_next):
    """X-Request-Id 헤더가 있으면 통과, 없으면 발급. 응답 헤더에 부착."""
    rid = request.headers.get("X-Request-Id") or uuid.uuid4().hex[:12]
    # request.state 에 저장 (필요 시 라우터에서 접근 가능)
    request.state.request_id = rid
    response = await call_next(request)
    response.headers["X-Request-Id"] = rid
    return response


setup_logging()
_log = get_logger()


def _error_payload(code: str, message: str, extra: dict | None = None) -> dict:
    body: dict = {"code": code, "message": message}
    if extra:
        body["extra"] = extra
    return {"detail": body}


def _rid(request: Request) -> str:
    """미들웨어가 request.state에 박은 request_id를 우선 사용. 없으면 헤더, 그래도 없으면 새로 발급."""
    return (
        getattr(request.state, "request_id", None)
        or request.headers.get("X-Request-Id")
        or uuid.uuid4().hex[:12]
    )


@app.exception_handler(ValueError)
def _value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
    # Pydantic ValidationError 도 ValueError 하위 — 응답 모델 검증 실패는 서버 결함이므로
    # 500 으로 떨어뜨려 INTERNAL 핸들러가 처리하게 한다.
    from pydantic import ValidationError
    if isinstance(exc, ValidationError):
        rid = _rid(request)
        _log.error("ResponseValidation rid=%s path=%s msg=%s", rid, request.url.path, exc)
        return JSONResponse(
            status_code=500,
            content=_error_payload(
                ErrorCode.INTERNAL,
                "응답 데이터 검증 실패(서버 측 오류).",
                extra={"request_id": rid},
            ),
        )
    rid = _rid(request)
    _log.warning("ValueError rid=%s path=%s msg=%s", rid, request.url.path, exc)
    return JSONResponse(
        status_code=422,
        content=_error_payload(
            ErrorCode.VALIDATION_ERROR,
            str(exc) or "유효성 검사 실패",
            extra={"request_id": rid},
        ),
    )


@app.exception_handler(IntegrityError)
def _integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    rid = _rid(request)
    _log.error("IntegrityError rid=%s path=%s msg=%s", rid, request.url.path, exc)
    return JSONResponse(
        status_code=409,
        content=_error_payload(
            ErrorCode.DB_INTEGRITY,
            "DB 제약 조건 위반",
            extra={"request_id": rid},
        ),
    )


@app.exception_handler(OperationalError)
def _operational_error_handler(request: Request, exc: OperationalError) -> JSONResponse:
    rid = _rid(request)
    _log.error("OperationalError rid=%s path=%s msg=%s", rid, request.url.path, exc)
    return JSONResponse(
        status_code=503,
        content=_error_payload(
            ErrorCode.DB_UNAVAILABLE,
            "DB 연결 일시 오류",
            extra={"request_id": rid},
        ),
    )


@app.exception_handler(Exception)
def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # FastAPI 가 HTTPException 은 자체 처리하므로 여기에는 진짜 unhandled 만 옴.
    rid = _rid(request)
    _log.exception("Unhandled rid=%s path=%s", rid, request.url.path)
    return JSONResponse(
        status_code=500,
        content=_error_payload(
            ErrorCode.INTERNAL,
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
