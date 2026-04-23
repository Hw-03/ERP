"""FastAPI application entry point for the X-Ray ERP backend.

Startup 부작용 (create_all / run_migrations / seed / ERP 백필) 은 모두
`backend/bootstrap_db.py` 로 옮겼다. 서버 기동만으로는 DB 가 변하지 않는다.

초기 설치 / 스키마 변경 / 시드 재적용은 명시적으로:
    cd backend
    python bootstrap_db.py --all
"""

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Employee,
    Inventory,
    Item,
    QueueBatch,
    QueueBatchStatusEnum,
    TransactionLog,
)
from app.services import integrity as integrity_svc

from app.routers import (
    alerts,
    bom,
    codes,
    counts,
    employees,
    inventory,
    items,
    loss,
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
    | BA | Body Ass'y | 조립 반제품 |
    | BF | Body Final | 조립 완제품 |
    | FG | Finished Good | 완제품 |
    | UK | Unknown | 미분류 또는 확인 필요 |

    ### 주요 기능
    - 품목 마스터 조회 및 수정
    - 재고 요약, 입고, 출고, 조정, 거래 이력
    - 직원 마스터 및 출하 패키지 관리
    - BOM 관리와 트리 조회
    - 생산 입고와 BOM 기반 Backflush
    """,
    version="1.2.0",
    docs_url="/docs",
    redoc_url="/redoc",
    redirect_slashes=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(items.router, prefix="/api/items", tags=["Items"])
app.include_router(employees.router, prefix="/api/employees", tags=["Employees"])
app.include_router(settings.router, prefix="/api/settings", tags=["Settings"])
app.include_router(ship_packages.router, prefix="/api/ship-packages", tags=["Ship Packages"])
app.include_router(inventory.router, prefix="/api/inventory", tags=["Inventory"])
app.include_router(bom.router, prefix="/api/bom", tags=["BOM"])
app.include_router(production.router, prefix="/api/production", tags=["Production"])
app.include_router(codes.router, prefix="/api/codes", tags=["Codes"])
app.include_router(queue.router, prefix="/api/queue", tags=["Queue"])
app.include_router(scrap.router, prefix="/api/scrap", tags=["Scrap"])
app.include_router(loss.router, prefix="/api/loss", tags=["Loss"])
app.include_router(variance.router, prefix="/api/variance", tags=["Variance"])
app.include_router(alerts.router, prefix="/api/alerts", tags=["Alerts"])
app.include_router(counts.router, prefix="/api/counts", tags=["Counts"])


@app.get("/health", tags=["System"])
def health_check():
    return {"status": "ok", "service": "X-Ray ERP API"}


@app.get("/health/detailed", tags=["System"])
def health_detailed(db: Session = Depends(get_db)):
    """운영 점검용 상세 헬스. 프론트엔드는 /health 만 사용.

    - DB ping
    - 주요 테이블 row count
    - inventory mismatch count (불변식 위반)
    - open queue batch count
    - 최근 transaction_log created_at
    """
    # 1) DB ping
    db_ok = True
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_ok = False

    # 2) Row counts
    rows = {
        "items": db.query(Item).count(),
        "employees": db.query(Employee).count(),
        "inventory": db.query(Inventory).count(),
        "transaction_logs": db.query(TransactionLog).count(),
        "queue_batches": db.query(QueueBatch).count(),
    }

    # 3) inventory mismatch — 가벼운 검사
    mismatches = integrity_svc.check_inventory_consistency(db)
    mismatch_count = len(mismatches)

    # 4) open queue batches
    open_batches = (
        db.query(QueueBatch).filter(QueueBatch.status == QueueBatchStatusEnum.OPEN).count()
    )

    # 5) 최근 transaction log 시간
    last_tx = (
        db.query(func.max(TransactionLog.created_at)).scalar()
    )

    return {
        "status": "ok" if db_ok and mismatch_count == 0 else "degraded",
        "db": {"ok": db_ok},
        "rows": rows,
        "inventory_mismatch_count": mismatch_count,
        "open_queue_batches": open_batches,
        "last_transaction_at": last_tx.isoformat() if last_tx else None,
    }


@app.get("/", tags=["System"])
def root():
    return {
        "message": "X-Ray ERP System API",
        "docs": "/docs",
        "version": "1.2.0",
    }
