"""FastAPI application entry point for the X-Ray ERP backend."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.database import Base, SessionLocal, engine
from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Item,
    OptionCode,
    ProcessFlowRule,
    ProcessType,
    ProductSymbol,
)
from app.utils.erp_code import infer_process_type, infer_symbol_slot, make_erp_code
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
        # M1: 4-part ERP code fields on items
        "ALTER TABLE items ADD COLUMN erp_code VARCHAR(40)",
        "ALTER TABLE items ADD COLUMN symbol_slot SMALLINT",
        "ALTER TABLE items ADD COLUMN process_type_code VARCHAR(2)",
        "ALTER TABLE items ADD COLUMN option_code VARCHAR(2)",
        "ALTER TABLE items ADD COLUMN serial_no INTEGER",
        # M1: Pending/reservation on inventory
        "ALTER TABLE inventory ADD COLUMN pending_quantity NUMERIC(15,4) NOT NULL DEFAULT 0",
        "ALTER TABLE inventory ADD COLUMN last_reserver_employee_id CHAR(36)",
        "ALTER TABLE inventory ADD COLUMN last_reserver_name VARCHAR(100)",
        # M1: Batch link on transaction log
        "ALTER TABLE transaction_logs ADD COLUMN batch_id CHAR(36)",
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

        # ------ Product symbols (100 slots, first 5 assigned) ------
        if db.query(ProductSymbol).count() == 0:
            assigned = [
                (1, "3", "DX3000"),
                (2, "7", "COCOON"),
                (3, "8", "SOLO"),
                (4, "4", "ADX4000W"),
                (5, "6", "ADX6000FB"),
            ]
            for slot, symbol, model in assigned:
                db.add(
                    ProductSymbol(
                        slot=slot,
                        symbol=symbol,
                        model_name=model,
                        is_finished_good=True,
                        is_reserved=False,
                    )
                )
            for slot in range(6, 101):
                db.add(ProductSymbol(slot=slot, symbol=None, model_name=None, is_reserved=True))
            db.commit()

        # ------ Option codes ------
        if db.query(OptionCode).count() == 0:
            options = [
                ("BG", "블랙 유광", "Black Glossy", "#111111"),
                ("WM", "화이트 무광", "White Matte", "#F7F7F7"),
                ("SV", "실버", "Silver", "#C0C0C0"),
            ]
            for code, ko, en, color in options:
                db.add(OptionCode(code=code, label_ko=ko, label_en=en, color_hex=color))
            db.commit()

        # ------ Process types (2-char) ------
        if db.query(ProcessType).count() == 0:
            types = [
                ("TR", "T", "R", 10, "튜브 원자재"),
                ("TA", "T", "A", 20, "튜브 조립체"),
                ("HR", "H", "R", 15, "고압 원자재"),
                ("HA", "H", "A", 30, "고압 조립체"),
                ("VR", "V", "R", 25, "진공 원자재"),
                ("VA", "V", "A", 40, "진공 조립체"),
                ("NA", "N", "A", 50, "튜닝 조립체 (출력값 최적화)"),
                ("AR", "A", "R", 45, "조립 원자재"),
                ("AA", "A", "A", 60, "최종 조립체"),
                ("PR", "P", "R", 55, "포장 원자재"),
                ("PA", "P", "A", 70, "완제품 (최종 패키징)"),
            ]
            for code, prefix, suffix, order, desc in types:
                db.add(
                    ProcessType(code=code, prefix=prefix, suffix=suffix, stage_order=order, description=desc)
                )
            db.commit()

        # ------ Process flow rules ------
        if db.query(ProcessFlowRule).count() == 0:
            flows = [
                ("TR", "TA", None),           # TR -> TA
                ("TA", "HA", "HR"),           # TA + HR -> HA
                ("HA", "VA", "VR"),           # HA + VR -> VA
                ("VA", "NA", None),           # VA -> NA
                ("NA", "AA", "AR"),           # NA + AR -> AA
                ("AA", "PA", "PR"),           # AA + PR -> PA
            ]
            for src, dst, consumes in flows:
                db.add(ProcessFlowRule(from_type=src, to_type=dst, consumes_codes=consumes))
            db.commit()

        # ------ Backfill pending_quantity default for existing rows ------
        db.execute(text("UPDATE inventory SET pending_quantity = 0 WHERE pending_quantity IS NULL"))
        db.commit()
    finally:
        db.close()


def populate_erp_codes() -> None:
    """erp_code가 없는 품목에 ERP 4-part 코드를 자동 부여한다."""
    db = SessionLocal()
    try:
        items_without_code = db.query(Item).filter(Item.erp_code.is_(None)).all()
        if not items_without_code:
            return

        symbol_map: dict[int, str] = {
            ps.slot: ps.symbol
            for ps in db.query(ProductSymbol).all()
            if ps.symbol
        }

        # 그룹별 현재 최대 serial_no 파악 (기존 데이터와 충돌 방지)
        serial_counter: dict[tuple, int] = {}
        for item in db.query(Item).filter(Item.serial_no.isnot(None)).all():
            key = (item.symbol_slot, item.process_type_code)
            serial_counter[key] = max(serial_counter.get(key, 0), item.serial_no or 0)

        count = 0
        for item in items_without_code:
            pt = infer_process_type(item.category.value, item.legacy_part)
            if pt is None:
                continue

            slot = infer_symbol_slot(item.legacy_model)
            symbol = symbol_map.get(slot, "공") if slot else "공"
            opt = "BG" if pt == "PA" else None

            key = (slot, pt)
            serial_counter[key] = serial_counter.get(key, 0) + 1
            serial = serial_counter[key]

            item.process_type_code = pt
            item.symbol_slot = slot
            item.serial_no = serial
            item.option_code = opt
            item.erp_code = make_erp_code(symbol, pt, serial, opt)
            count += 1

        db.commit()
        if count:
            print(f"[ERP] 코드 부여 완료: {count}개")
    finally:
        db.close()


ensure_reference_data()
populate_erp_codes()


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
