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

from app._access_log import access_log_middleware
from app._actor import get_actor_emp
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
    admin_audit_ledger,
    admin_activity_audit,
    admin_inventory_integrity,
    admin_production_log,
    assembly_checklists,
    bom,
    client_events,
    codes,
    defects,
    departments,
    daily_work_reports,
    dept_adjustment,
    employee_item_order,
    employees,
    handover,
    inventory,
    io,
    items,
    models as models_router,
    notifications,
    production,
    realtime,
    settings,
    shipping,
    stock_requests,
    warehouse_map,
)
from app.services import audit_csv as audit_csv_svc
from app.services import realtime as realtime_svc

audit_csv_svc.register_session_listeners()
realtime_svc.register_session_listeners()


_BOOT_ID: str = uuid.uuid4().hex
_BOOT_STARTED_AT: str = _dt.datetime.utcnow().isoformat()


app = FastAPI(
    title="DEXCOWIN MES API",
    description="""
    ## DEXCOWIN MES API

    DEXCOWIN MES의 품목, 재고, 생산, 출하 및 관리 기능을 제공하는 공식 API입니다.

    ### 주요 기능
    - 품목 마스터 조회 및 수정
    - 재고 요약, 입고, 출고, 조정, 거래 이력
    - 직원 마스터 및 출하 관리
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
        {"name": "Settings", "description": "관리자 PIN, 시스템 정합성 점검·복구."},
        {"name": "Models", "description": "제품 모델 슬롯."},
        {"name": "Codes", "description": "코드 마스터 (제품기호/옵션/공정)."},
        {"name": "Admin Audit", "description": "관리자 액션 감사로그 조회 (마스터/설정 변경)."},
        {"name": "Admin Integrity", "description": "관리자용 재고·취소 원장 정합성 읽기 전용 진단."},
        {"name": "Admin Export", "description": "관리자용 생산 이력 내보내기."},
        {"name": "Assembly Checklists", "description": "조립 체크리스트 관리."},
        {"name": "Client Events", "description": "클라이언트 이벤트 수집."},
        {"name": "Daily Work Reports", "description": "일일 작업 보고서 관리."},
        {"name": "Defects", "description": "불량 등록과 처리."},
        {"name": "Departments", "description": "부서 마스터 관리."},
        {"name": "Dept Adjustment", "description": "부서 재고 조정."},
        {"name": "Inventory IO", "description": "입출고 업무 처리."},
        {"name": "Shipping", "description": "출하 요청과 준비·완료 처리."},
        {"name": "Stock Requests", "description": "재고 요청과 결재 처리."},
        {"name": "Warehouse Map", "description": "창고 배치도 관리."},
        {"name": "Notifications", "description": "결재 알림 — 요청 도착/승인/반려."},
        {"name": "Handover", "description": "튜브→고압/진공 인수인계서."},
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


# 등록 순서 주의: 이 함수가 _request_id_middleware **뒤에** 등록되어야
# OUTERMOST 가 되고, dur_ms 가 request_id 처리 시간까지 포함하면서
# call_next 이후에 request.state.request_id 를 안전하게 읽을 수 있다.
@app.middleware("http")
async def _access_log_middleware(request: Request, call_next):
    return await access_log_middleware(request, call_next)


setup_logging()
_log = get_logger()
_log.info(
    "evt=system_startup boot_id=%s started_at=%s version=%s",
    _BOOT_ID, _BOOT_STARTED_AT, app.version,
)


@app.on_event("startup")
def _warm_symbol_cache() -> None:
    """제품 모델 symbol↔slot 캐시를 기동 시 1회 적재(읽기 전용, DB 변경 없음).

    요청 도중에는 캐시를 재적재하지 않는다(엔진의 BEGIN IMMEDIATE 와 2번째 세션이
    충돌해 데드락). 기동 시점엔 동시 요청이 없어 안전. 실패해도 기동은 계속하며,
    캐시는 빈 맵으로 두고 모델 CRUD 시 재적재된다.
    """
    try:
        from app.database import SessionLocal
        from app.utils.mes_code import refresh_symbol_cache

        db = SessionLocal()
        try:
            refresh_symbol_cache(db)
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001
        _log.warning("evt=symbol_cache_warm_failed err=%s", exc)


@app.on_event("shutdown")
def _log_shutdown() -> None:
    _log.info("evt=system_shutdown boot_id=%s", _BOOT_ID)


@app.on_event("shutdown")
async def _stop_realtime_broker() -> None:
    await realtime_svc.revision_broker.stop()


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
        emp = get_actor_emp(request)
        _log.error("ResponseValidation rid=%s emp=%s path=%s msg=%s", rid, emp, request.url.path, exc)
        return JSONResponse(
            status_code=500,
            content=_error_payload(
                ErrorCode.INTERNAL,
                "응답 데이터 검증 실패(서버 측 오류).",
                extra={"request_id": rid},
            ),
        )
    rid = _rid(request)
    emp = get_actor_emp(request)
    _log.warning("ValueError rid=%s emp=%s path=%s msg=%s", rid, emp, request.url.path, exc)
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
    emp = get_actor_emp(request)
    _log.error("IntegrityError rid=%s emp=%s path=%s msg=%s", rid, emp, request.url.path, exc)
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
    emp = get_actor_emp(request)
    # 정상 운영 로그는 short msg 만(SQL/parameters 통째 박지 않음 — 노이즈 방지).
    # 전체 SQL 은 DEBUG 레벨에서만 노출.
    short = str(getattr(exc, "orig", None) or exc).splitlines()[0][:200]
    _log.error("OperationalError rid=%s emp=%s path=%s msg=%s", rid, emp, request.url.path, short)
    _log.debug("OperationalError detail rid=%s sql=%s params=%s", rid, getattr(exc, "statement", "-"), getattr(exc, "params", "-"))
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
    emp = get_actor_emp(request)
    _log.error("Unhandled rid=%s emp=%s path=%s", rid, emp, request.url.path, exc_info=exc)
    return JSONResponse(
        status_code=500,
        content=_error_payload(
            ErrorCode.INTERNAL,
            "처리 중 오류가 발생했습니다.",
            extra={"request_id": rid},
        ),
    )


app.include_router(employee_item_order.router, prefix="/api/items", tags=["Items"])
app.include_router(items.router, prefix="/api/items", tags=["Items"])
app.include_router(employees.router, prefix="/api/employees", tags=["Employees"])
app.include_router(daily_work_reports.router, prefix="/api/daily-work-reports", tags=["Daily Work Reports"])
app.include_router(departments.router, prefix="/api/departments", tags=["Departments"])
app.include_router(client_events.router, prefix="/api", tags=["Client Events"])
app.include_router(settings.router, prefix="/api/settings", tags=["Settings"])
app.include_router(shipping.router, prefix="/api/shipping", tags=["Shipping"])
app.include_router(inventory.router, prefix="/api/inventory", tags=["Inventory"])
app.include_router(io.router, prefix="/api/io", tags=["Inventory IO"])
app.include_router(bom.router, prefix="/api/bom", tags=["BOM"])
app.include_router(production.router, prefix="/api/production", tags=["Production"])
app.include_router(codes.router, prefix="/api/codes", tags=["Codes"])
app.include_router(models_router.router, prefix="/api/models", tags=["Models"])
app.include_router(assembly_checklists.router, prefix="/api/assembly-checklists", tags=["Assembly Checklists"])
app.include_router(admin_audit.router, prefix="/api/admin", tags=["Admin Audit"])
app.include_router(admin_audit_csv.router, prefix="/api/admin", tags=["Admin Audit"])
app.include_router(admin_audit_ledger.router, prefix="/api/admin", tags=["Admin Audit"])
app.include_router(admin_activity_audit.router, prefix="/api/admin", tags=["Admin Audit"])
app.include_router(admin_inventory_integrity.router, prefix="/api/admin", tags=["Admin Integrity"])
app.include_router(admin_production_log.router, prefix="/api/admin", tags=["Admin Export"])
app.include_router(stock_requests.router, prefix="/api/stock-requests", tags=["Stock Requests"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(handover.router, prefix="/api/handovers", tags=["Handover"])
app.include_router(dept_adjustment.router, prefix="/api/dept-adjustment", tags=["Dept Adjustment"])
app.include_router(defects.router, prefix="/api/defects", tags=["Defects"])
app.include_router(warehouse_map.router, prefix="/api/warehouse-map", tags=["Warehouse Map"])
app.include_router(realtime.router, prefix="/api/realtime", tags=["System"])


@app.get("/health", tags=["System"])
def health_check():
    return {"status": "ok", "service": "DEXCOWIN MES API"}


@app.get("/health/live", tags=["System"])
def health_live(request: Request, db: Session = Depends(get_db)):
    """경량 liveness — 컨테이너/오케스트레이터 프로브 전용 (WS3).

    정적 `/health` 와 달리 DB-down 을 구분: DB 미연결이면 503.
    `/health/detailed` 와 달리 row count·무결성 스캔을 하지 않아 30s 주기
    프로브에 적합(가벼움).
    """
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 — 프로브는 사유 무관 비가용이면 503
        _log.warning(
            "evt=health_live_db_unavailable rid=%s err_type=%s",
            _rid(request),
            type(exc).__name__,
        )
        raise HTTPException(status_code=503, detail="DB 연결 확인 실패")
    return {"status": "live"}


@app.get("/api/app-session", tags=["System"])
def app_session():
    return {"boot_id": _BOOT_ID, "started_at": _BOOT_STARTED_AT}


def _detailed_health_degraded_response(
    request: Request,
    db: Session,
    exc: Exception,
    *,
    event: str,
) -> JSONResponse:
    """진단 쿼리 실패 세션을 정리하고 민감정보 없는 503을 반환한다."""
    try:
        db.rollback()
    except Exception as rollback_exc:  # noqa: BLE001 — rollback 실패 원문도 기록하지 않음
        _log.warning(
            "evt=health_detailed_rollback_failed rid=%s err_type=%s",
            _rid(request),
            type(rollback_exc).__name__,
        )
    _log.warning(
        "evt=%s rid=%s err_type=%s",
        event,
        _rid(request),
        type(exc).__name__,
    )
    return JSONResponse(
        status_code=503,
        content={
            "status": "degraded",
            "db": {"ok": False},
            "rows": {},
            "inventory_mismatch_count": None,
            "last_transaction_at": None,
        },
    )


@app.get("/health/detailed", tags=["System"])
def health_detailed(request: Request, db: Session = Depends(get_db)):
    """운영 점검용 상세 헬스. 프론트엔드는 /health 만 사용.

    - DB ping
    - 주요 테이블 row count
    - inventory mismatch count (불변식 위반)
    - open queue batch count
    - 최근 transaction_log created_at
    """
    # 1) DB ping
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 — 상세 점검도 DB 장애면 즉시 중단
        return _detailed_health_degraded_response(
            request,
            db,
            exc,
            event="health_detailed_db_unavailable",
        )

    try:
        # 2) Row counts
        rows = {
            "items": db.query(Item).count(),
            "employees": db.query(Employee).count(),
            "inventory": db.query(Inventory).count(),
            "transaction_logs": db.query(TransactionLog).count(),
        }

        # 3) inventory mismatch — 가벼운 검사
        mismatches = integrity_svc.check_inventory_consistency(db)
        mismatch_count = len(mismatches)

        # 4) 최근 transaction log 시간
        last_tx = db.query(func.max(TransactionLog.created_at)).scalar()
    except Exception as exc:  # noqa: BLE001 — 모든 후속 진단 실패를 동일한 503으로 처리
        return _detailed_health_degraded_response(
            request,
            db,
            exc,
            event="health_detailed_diagnostics_unavailable",
        )

    return {
        "status": "ok" if mismatch_count == 0 else "degraded",
        "db": {"ok": True},
        "rows": rows,
        "inventory_mismatch_count": mismatch_count,
        "last_transaction_at": last_tx.isoformat() if last_tx else None,
    }


@app.get("/api/health/db-info", tags=["System"])
def health_db_info(request: Request, db: Session = Depends(get_db)):
    """서버가 실제 연결 중인 DB 정보 반환 — preflight 전용.
    DATABASE_URL 전체 노출 금지. 엔진 종류와 실제 연결 확인 결과만 반환.
    """
    db_engine = "sqlite" if _is_sqlite else "postgresql"
    info = {
        "db_engine": db_engine,
        "is_sqlite": _is_sqlite,
        "pool_enabled": not _is_sqlite,
        "safe_for_30_users": False if _is_sqlite else None,
        "note": (
            "SQLite는 개발/테스트 전용. 30명 운영은 PostgreSQL 필수."
            if _is_sqlite else
            "동시 사용자 운영 준비 상태는 부하 테스트와 운영 구성 검증이 필요합니다."
        ),
        "connection_ok": True,
    }
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 — 연결 실패 원문은 응답에 포함하지 않음
        _log.warning(
            "evt=health_db_info_unavailable rid=%s err_type=%s",
            _rid(request),
            type(exc).__name__,
        )
        info["connection_ok"] = False
        info["note"] = "DB 연결 확인에 실패했습니다."
        return JSONResponse(status_code=503, content=info)
    return info


@app.post("/api/health/write-check", tags=["System"])
def health_write_check(request: Request, db: Session = Depends(get_db)):
    """DB 쓰기 가능 여부 점검 — preflight 전용.
    SAVEPOINT 안에서 실제 INSERT 실행 후 rollback. 데이터 변경 없음.
    """
    import time as _time
    start = _time.perf_counter()
    try:
        sp = db.begin_nested()
        # Actual write test: INSERT a temporary item row inside SAVEPOINT
        db.add(
            Item(
                item_name="__health_write_test__",
                unit="EA",
                model_symbol="9",
                process_type_code="TR",
                serial_no=2_147_483_647,
            )
        )
        db.flush()
        sp.rollback()
        latency_ms = round((_time.perf_counter() - start) * 1000, 1)
        return {
            "status": "ok",
            "db_engine": "sqlite" if _is_sqlite else "postgresql",
            "writable": True,
            "latency_ms": latency_ms,
        }
    except Exception as exc:  # noqa: BLE001 — 쓰기 점검 실패는 사유 무관 503
        try:
            db.rollback()
        except Exception:
            pass
        _log.warning(
            "evt=health_write_check_failed rid=%s err_type=%s",
            _rid(request),
            type(exc).__name__,
        )
        raise HTTPException(status_code=503, detail="DB 쓰기 테스트 실패")


@app.get("/", tags=["System"])
def root():
    return {
        "message": "DEXCOWIN MES API",
        "docs": "/docs",
        "version": app.version,
    }
