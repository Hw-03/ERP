"""FastAPI application entry point for the X-Ray ERP backend."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.database import Base, SessionLocal, engine
from app.models import DepartmentEnum, Employee, EmployeeLevelEnum
from app.routers import bom, employees, inventory, items, production, settings, ship_packages

Base.metadata.create_all(bind=engine)


def run_migrations() -> None:
    """Add new columns to existing SQLite database without losing data."""
    new_columns = [
        "ALTER TABLE items ADD COLUMN barcode VARCHAR(100)",
        "ALTER TABLE items ADD COLUMN legacy_file_type VARCHAR(50)",
        "ALTER TABLE items ADD COLUMN legacy_part VARCHAR(50)",
        "ALTER TABLE items ADD COLUMN legacy_item_type VARCHAR(50)",
        "ALTER TABLE items ADD COLUMN legacy_model VARCHAR(50)",
        "ALTER TABLE items ADD COLUMN supplier VARCHAR(200)",
        "ALTER TABLE items ADD COLUMN min_stock NUMERIC(15,4)",
    ]
    with engine.connect() as conn:
        for sql in new_columns:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass  # column already exists


run_migrations()

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
app.include_router(employees.router, prefix="/api/employees", tags=["Employees"])
app.include_router(settings.router, prefix="/api/settings", tags=["Settings"])
app.include_router(ship_packages.router, prefix="/api/ship-packages", tags=["Ship Packages"])
app.include_router(inventory.router, prefix="/api/inventory", tags=["Inventory"])
app.include_router(bom.router, prefix="/api/bom", tags=["BOM"])
app.include_router(production.router, prefix="/api/production", tags=["Production"])


def ensure_reference_data() -> None:
    db = SessionLocal()
    try:
        if db.query(Employee).count() == 0:
            seed_rows = [
                ("E001", "김준우", "조립/출하 리더", DepartmentEnum.ASSEMBLY, EmployeeLevelEnum.MANAGER),
                ("E002", "박서연", "고압 파트", DepartmentEnum.HIGH_VOLTAGE, EmployeeLevelEnum.STAFF),
                ("E003", "이도현", "진공 파트", DepartmentEnum.VACUUM, EmployeeLevelEnum.STAFF),
                ("E004", "최민지", "튜닝 파트", DepartmentEnum.TUNING, EmployeeLevelEnum.STAFF),
                ("E005", "정하늘", "튜브 파트", DepartmentEnum.TUBE, EmployeeLevelEnum.STAFF),
                ("E006", "한유진", "출하 담당", DepartmentEnum.SHIPPING, EmployeeLevelEnum.STAFF),
                ("E007", "오지훈", "연구 지원", DepartmentEnum.RESEARCH, EmployeeLevelEnum.STAFF),
                ("E008", "윤가은", "AS 지원", DepartmentEnum.AS, EmployeeLevelEnum.STAFF),
                ("E009", "문현우", "관리자", DepartmentEnum.ETC, EmployeeLevelEnum.ADMIN),
            ]

            for index, (code, name, role, department, level) in enumerate(seed_rows, start=1):
                db.add(
                    Employee(
                        employee_code=code,
                        name=name,
                        role=role,
                        department=department,
                        level=level,
                        display_order=index,
                        is_active="true",
                    )
                )
            db.commit()
    finally:
        db.close()


ensure_reference_data()


@app.get("/health", tags=["System"])
def health_check():
    return {"status": "ok", "service": "X-Ray ERP API"}


@app.get("/", tags=["System"])
def root():
    return {
        "message": "X-Ray ERP System API",
        "docs": "/docs",
        "version": "1.2.0",
    }
