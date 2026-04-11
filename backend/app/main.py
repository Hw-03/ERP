"""FastAPI application entry point for the X-Ray ERP backend."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import bom, inventory, items, production

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="X-Ray ERP System",
    description="""
    ## 정밀 X-ray 장비 제조 ERP

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
    | BA | Body Ass'y | 조립 반제품 |
    | BF | Body Final | 조립 완제품 |
    | FG | Finished Good | 최종 출하품 |
    | UK | Unknown | 미분류 / 확인 필요 |

    ### 제공 기능
    - 품목 마스터 조회 및 수정
    - 재고 요약, 입고, 조정, 거래 이력
    - BOM 관리와 트리 조회
    - 생산입고 시 BOM 기반 Backflush
    """,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

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

app.include_router(items.router, prefix="/api/items", tags=["Items"])
app.include_router(inventory.router, prefix="/api/inventory", tags=["Inventory"])
app.include_router(bom.router, prefix="/api/bom", tags=["BOM"])
app.include_router(production.router, prefix="/api/production", tags=["Production"])


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
