"""
ERP System — FastAPI Application Entry Point
정밀 X-ray 장비 제조사 ERP — 재고 / BOM / 생산 관리
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, inspect

from app.database import engine, Base
from app.routers import items, inventory, bom, production, employees, shipping

# ---------------------------------------------------------------------------
# DB 초기화 — 앱 시작 시 테이블 자동 생성
# ---------------------------------------------------------------------------

Base.metadata.create_all(bind=engine)


def _run_migrations():
    """
    경량 마이그레이션 — 기존 DB에 새로 추가된 컬럼을 반영.
    Alembic 없이 SQLite에서 간단하게 처리.
    """
    insp = inspect(engine)

    # items 테이블 신규 컬럼 추가 (v1 → v2)
    if "items" in insp.get_table_names():
        cols = [c["name"] for c in insp.get_columns("items")]
        new_cols = {
            "safety_stock":      "NUMERIC(15,4)",
            "barcode":           "VARCHAR(100)",
            "supplier":          "VARCHAR(100)",
            "legacy_file_type":  "VARCHAR(30)",
            "legacy_part":       "VARCHAR(50)",
            "legacy_item_type":  "VARCHAR(50)",
            "legacy_model":      "VARCHAR(100)",
        }
        with engine.begin() as conn:
            for col, dtype in new_cols.items():
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE items ADD COLUMN {col} {dtype}"))

    # employees 테이블 display_order 컬럼 추가
    if "employees" in insp.get_table_names():
        emp_cols = [c["name"] for c in insp.get_columns("employees")]
        if "display_order" not in emp_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE employees ADD COLUMN display_order NUMERIC(5,0)"))


_run_migrations()

# ---------------------------------------------------------------------------
# FastAPI 앱 설정
# ---------------------------------------------------------------------------

app = FastAPI(
    title="X-Ray ERP System",
    description="""
    ## 정밀 X-ray 장비 제조사 ERP

    ### 11단계 제조 공정 카테고리
    | Code | 명칭 | 설명 |
    |------|------|------|
    | RM | Raw Material | 기본 원자재 |
    | TA | Tube Ass'y | 튜브 조립 반제품 |
    | TF | Tube Final | 완성된 튜브 |
    | HA | High-voltage Ass'y | 고압 반제품 |
    | HF | High-voltage Final | 고압 완제품 |
    | VA | Vacuum Ass'y | 진공 반제품 |
    | VF | Vacuum Final | 진공 완제품 |
    | BA | Body Ass'y | 조립 반제품 |
    | BF | Body Final | 조립 완제품 |
    | FG | Finished Good | 최종 출하 완제품 |
    | UK | Unknown | 미분류/확인 필요 |

    ### 핵심 기능
    - **BOM 역전개(Explosion)**: 다단계 공정의 모든 소요 부품 자동 계산
    - **Backflush 자동 차감**: 생산 입고 시 하위 부품 재고 원자적 차감
    - **안전재고 관리**: 품목별 최소 재고 기준 설정 및 경고
    - **출하묶음**: 자주 사용하는 출하 조합을 묶음으로 정의하여 일괄 출하
    - **직원 관리**: 처리자 기록 및 부서별 입출고 추적
    """,
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# CORS — Next.js 프론트엔드 허용
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# 라우터 등록
# ---------------------------------------------------------------------------

app.include_router(items.router,      prefix="/api/items",      tags=["Items"])
app.include_router(inventory.router,  prefix="/api/inventory",  tags=["Inventory"])
app.include_router(bom.router,        prefix="/api/bom",        tags=["BOM"])
app.include_router(production.router, prefix="/api/production", tags=["Production"])
app.include_router(employees.router,  prefix="/api/employees",  tags=["Employees"])
app.include_router(shipping.router,   prefix="/api/shipping",   tags=["Shipping"])


# ---------------------------------------------------------------------------
# Health Check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["System"])
def health_check():
    return {"status": "ok", "service": "X-Ray ERP API", "version": "2.0.0"}


@app.get("/", tags=["System"])
def root():
    return {
        "message": "X-Ray ERP System API",
        "docs": "/docs",
        "version": "2.0.0",
    }
