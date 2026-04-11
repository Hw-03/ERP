"""
ERP System — FastAPI Application Entry Point
정밀 X-ray 장비 제조사 ERP — 재고 / BOM / 생산 관리
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
from app.routers import items, inventory, bom, production

# ---------------------------------------------------------------------------
# DB 초기화 — 앱 시작 시 테이블 자동 생성
# ---------------------------------------------------------------------------

Base.metadata.create_all(bind=engine)

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
    """,
    version="1.0.0",
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


# ---------------------------------------------------------------------------
# Health Check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["System"])
def health_check():
    return {"status": "ok", "service": "X-Ray ERP API"}


@app.get("/", tags=["System"])
def root():
    return {
        "message": "X-Ray ERP System API",
        "docs": "/docs",
        "version": "1.0.0",
    }
