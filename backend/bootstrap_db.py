"""
bootstrap_db.py — DB 스키마 / 마이그레이션 / 참조 데이터 / ERP 코드 백필 통합 CLI.

FastAPI 앱 시작 시 자동 실행되던 부작용들을 여기로 옮겼다.
`uvicorn app.main:app` 만으로는 DB 가 변하지 않는다. 초기 설치 / 스키마 변경 /
시드 재적용이 필요한 시점에만 명시적으로 실행한다.

Usage:
    cd backend
    python bootstrap_db.py --all                # 스키마 + 마이그레이션 + 시드 + ERP 백필
    python bootstrap_db.py --schema --migrate   # DDL 관련만
    python bootstrap_db.py --seed               # 참조 데이터 (Employee/ProductSymbol/…)
    python bootstrap_db.py --erp-backfill       # erp_code NULL 품목에 코드 부여
    python bootstrap_db.py --check              # 실행하지 않고 DB 상태만 점검

모듈로도 import 가능:
    from bootstrap_db import bootstrap_all, run_schema_create_all, run_migrations
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

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
from app.services.pin_auth import DEFAULT_PIN_HASH
from app.utils.erp_code import infer_symbol_slot, make_erp_code


# ---------------------------------------------------------------------------
# 1. 스키마 create_all
# ---------------------------------------------------------------------------
def run_schema_create_all() -> None:
    """SQLAlchemy 메타데이터 기준으로 테이블 생성 (이미 있으면 no-op)."""
    Base.metadata.create_all(bind=engine)


# ---------------------------------------------------------------------------
# 2. Raw ALTER TABLE 마이그레이션 (SQLite 호환 단순 ADD COLUMN)
# ---------------------------------------------------------------------------
_MIGRATION_DDL: list[str] = [
    "ALTER TABLE items ADD COLUMN barcode VARCHAR(100)",
    "ALTER TABLE items ADD COLUMN legacy_file_type VARCHAR(50)",
    "ALTER TABLE items ADD COLUMN legacy_part VARCHAR(50)",
    "ALTER TABLE items ADD COLUMN legacy_item_type VARCHAR(50)",
    "ALTER TABLE items ADD COLUMN legacy_model VARCHAR(50)",
    "ALTER TABLE items ADD COLUMN supplier VARCHAR(200)",
    "ALTER TABLE items ADD COLUMN min_stock NUMERIC(15,4)",
    # M1: 4-part ERP code
    "ALTER TABLE items ADD COLUMN erp_code VARCHAR(40)",
    "ALTER TABLE items ADD COLUMN symbol_slot SMALLINT",
    "ALTER TABLE items ADD COLUMN process_type_code VARCHAR(2)",
    "ALTER TABLE items ADD COLUMN option_code VARCHAR(2)",
    "ALTER TABLE items ADD COLUMN serial_no INTEGER",
    # 다중 모델 지원: Item 에 직접 붙은 요약 컬럼 + ItemModel 테이블 (테이블은 create_all 이 생성)
    "ALTER TABLE items ADD COLUMN model_symbol VARCHAR(20)",
    # M1: Pending/reservation
    "ALTER TABLE inventory ADD COLUMN pending_quantity NUMERIC(15,4) NOT NULL DEFAULT 0",
    "ALTER TABLE inventory ADD COLUMN last_reserver_employee_id CHAR(36)",
    "ALTER TABLE inventory ADD COLUMN last_reserver_name VARCHAR(100)",
    # M1: Batch link
    "ALTER TABLE transaction_logs ADD COLUMN batch_id CHAR(36)",
    # M8: 재고 이원화 — warehouse_qty
    "ALTER TABLE inventory ADD COLUMN warehouse_qty NUMERIC(15,4) NOT NULL DEFAULT 0",
    # Queue 조회 성능 개선 인덱스 (created_at desc 정렬, 담당자별 필터)
    "CREATE INDEX IF NOT EXISTS ix_queue_batches_created_at ON queue_batches(created_at)",
    "CREATE INDEX IF NOT EXISTS ix_queue_batches_owner_employee_id ON queue_batches(owner_employee_id)",
    # PIN 로그인 — 작업자 식별용 (실제 보안 인증 아님)
    "ALTER TABLE employees ADD COLUMN pin_hash TEXT",
    # 거래 수정 감사 이력 (3차 메타 수정 + 4차 수량 보정 공유)
    """CREATE TABLE IF NOT EXISTS transaction_edit_logs (
        edit_id CHAR(36) PRIMARY KEY,
        original_log_id CHAR(36) NOT NULL REFERENCES transaction_logs(log_id) ON DELETE CASCADE,
        edited_by_employee_id CHAR(36) NOT NULL REFERENCES employees(employee_id),
        edited_by_name VARCHAR(100) NOT NULL,
        reason TEXT NOT NULL,
        before_payload TEXT NOT NULL,
        after_payload TEXT NOT NULL,
        correction_log_id CHAR(36) REFERENCES transaction_logs(log_id) ON DELETE SET NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""",
    "CREATE INDEX IF NOT EXISTS ix_tel_original ON transaction_edit_logs(original_log_id)",
    # 창고 결재 역할 — 직원 업무 역할(시스템 권한 level과 별개)
    "ALTER TABLE employees ADD COLUMN warehouse_role VARCHAR(20) NOT NULL DEFAULT 'none'",
    # PIN 마지막 변경 일시 (NULL = 변경 이력 없음)
    "ALTER TABLE employees ADD COLUMN pin_last_changed DATETIME",
]


def run_migrations() -> dict[str, int]:
    """누락된 컬럼을 ADD. 이미 있으면 조용히 스킵.

    Returns:
        {'applied': N, 'skipped': M}
    """
    applied = 0
    skipped = 0
    with engine.connect() as conn:
        for sql in _MIGRATION_DDL:
            try:
                conn.execute(text(sql))
                conn.commit()
                applied += 1
            except Exception:
                skipped += 1

        # 기존 quantity → warehouse_qty 1회 이관 (warehouse_qty 가 0 인 행만)
        try:
            conn.execute(
                text(
                    "UPDATE inventory SET warehouse_qty = quantity "
                    "WHERE warehouse_qty = 0 AND quantity > 0"
                )
            )
            conn.commit()
        except Exception:
            pass

        # pending_quantity NULL 기본값 채우기
        try:
            conn.execute(
                text("UPDATE inventory SET pending_quantity = 0 WHERE pending_quantity IS NULL")
            )
            conn.commit()
        except Exception:
            pass

        # 기존 직원에 PIN 기본값 0000 적용 (pin_hash NULL인 경우만)
        try:
            conn.execute(
                text("UPDATE employees SET pin_hash = :h WHERE pin_hash IS NULL"),
                {"h": DEFAULT_PIN_HASH},
            )
            conn.commit()
        except Exception:
            pass

        # warehouse_role NULL/empty → 'none' 보정 (ALTER 가 idempotent 하지 않은 환경 대비)
        try:
            conn.execute(
                text(
                    "UPDATE employees SET warehouse_role = 'none' "
                    "WHERE warehouse_role IS NULL OR warehouse_role = ''"
                )
            )
            conn.commit()
        except Exception:
            pass

    return {"applied": applied, "skipped": skipped}


# ---------------------------------------------------------------------------
# 3. 참조 데이터 시드 (Employee / ProductSymbol / OptionCode / ProcessType / ProcessFlowRule)
# ---------------------------------------------------------------------------
_EMPLOYEE_SEED: list[tuple] = [
    ("E04", "김건호", "조립/과장", DepartmentEnum.ASSEMBLY, EmployeeLevelEnum.MANAGER),
    ("E01", "김민재", "조립/대리", DepartmentEnum.ASSEMBLY, EmployeeLevelEnum.STAFF),
    ("E02", "김종숙", "조립/주임", DepartmentEnum.ASSEMBLY, EmployeeLevelEnum.STAFF),
    ("E06", "김현우", "조립/사원", DepartmentEnum.ASSEMBLY, EmployeeLevelEnum.STAFF),
    ("E05", "남재원", "조립/사원", DepartmentEnum.ASSEMBLY, EmployeeLevelEnum.STAFF),
    ("E03", "이계숙", "조립/주임", DepartmentEnum.ASSEMBLY, EmployeeLevelEnum.STAFF),
    ("E22", "이필욱", "조립/부장", DepartmentEnum.ASSEMBLY, EmployeeLevelEnum.MANAGER),
    ("E07", "이형진", "조립/사원", DepartmentEnum.ASSEMBLY, EmployeeLevelEnum.STAFF),
    ("E09", "김재현", "진공/사원", DepartmentEnum.VACUUM, EmployeeLevelEnum.STAFF),
    ("E10", "이지훈", "진공/대리", DepartmentEnum.VACUUM, EmployeeLevelEnum.STAFF),
    ("E08", "허동현", "진공/사원", DepartmentEnum.VACUUM, EmployeeLevelEnum.STAFF),
    ("E11", "김지현", "고압/주임", DepartmentEnum.HIGH_VOLTAGE, EmployeeLevelEnum.STAFF),
    ("E12", "민애경", "고압/주임", DepartmentEnum.HIGH_VOLTAGE, EmployeeLevelEnum.STAFF),
    ("E13", "오세현", "튜닝/사원", DepartmentEnum.TUNING, EmployeeLevelEnum.STAFF),
    ("E14", "이지현", "튜닝/사원", DepartmentEnum.TUNING, EmployeeLevelEnum.STAFF),
    ("E15", "김도영", "튜브/주임", DepartmentEnum.TUBE, EmployeeLevelEnum.STAFF),
    ("E21", "문종현", "AS/대리", DepartmentEnum.AS, EmployeeLevelEnum.STAFF),
    ("E16", "이성민", "연구소/책임", DepartmentEnum.RESEARCH, EmployeeLevelEnum.MANAGER),
    ("E17", "오성식", "연구소/주임", DepartmentEnum.RESEARCH, EmployeeLevelEnum.STAFF),
    ("E18", "류승범", "기타/대표", DepartmentEnum.ETC, EmployeeLevelEnum.ADMIN),
    ("E19", "최윤영", "기타/과장", DepartmentEnum.ETC, EmployeeLevelEnum.MANAGER),
    ("E20", "박성현", "기타/부장", DepartmentEnum.ETC, EmployeeLevelEnum.MANAGER),
    ("E23", "양승규", "영업/부장", DepartmentEnum.SALES, EmployeeLevelEnum.MANAGER),
    ("E24", "김예진", "영업/대리", DepartmentEnum.SALES, EmployeeLevelEnum.STAFF),
    ("E25", "심이리나", "영업/과장", DepartmentEnum.SALES, EmployeeLevelEnum.MANAGER),
    ("E26", "드미트리", "영업/사원", DepartmentEnum.SALES, EmployeeLevelEnum.STAFF),
]

_PRODUCT_SYMBOL_ASSIGNED: list[tuple] = [
    (1, "3", "DX3000"),
    (2, "7", "COCOON"),
    (3, "8", "SOLO"),
    (4, "4", "ADX4000W"),
    (5, "6", "ADX6000FB"),
]

_OPTION_CODES: list[tuple] = [
    ("BG", "블랙 유광", "Black Glossy", "#111111"),
    ("WM", "화이트 무광", "White Matte", "#F7F7F7"),
    ("SV", "실버", "Silver", "#C0C0C0"),
]

_PROCESS_TYPES: list[tuple] = [
    ("TR", "T", "R", 10, "튜브 원자재"),
    ("TA", "T", "A", 20, "튜브 조립체"),
    ("TF", "T", "F", 25, "튜브 F타입"),
    ("HR", "H", "R", 15, "고압 원자재"),
    ("HA", "H", "A", 30, "고압 조립체"),
    ("HF", "H", "F", 35, "고압 F타입"),
    ("VR", "V", "R", 25, "진공 원자재"),
    ("VA", "V", "A", 40, "진공 조립체"),
    ("VF", "V", "F", 45, "진공 F타입"),
    ("NR", "N", "R", 50, "튜닝 원자재"),
    ("NA", "N", "A", 55, "튜닝 조립체"),
    ("NF", "N", "F", 60, "튜닝 F타입"),
    ("AR", "A", "R", 45, "조립 원자재"),
    ("AA", "A", "A", 65, "조립 조립체"),
    ("AF", "A", "F", 70, "조립 F타입"),
    ("PR", "P", "R", 55, "출하 원자재"),
    ("PA", "P", "A", 75, "출하 조립체"),
    ("PF", "P", "F", 80, "출하 F타입"),
]

_PROCESS_FLOW_RULES: list[tuple] = [
    ("TR", "TA", None),
    ("TA", "HA", "HR"),
    ("HA", "VA", "VR"),
    ("VA", "NA", None),
    ("NA", "AA", "AR"),
    ("AA", "PA", "PR"),
]


def seed_reference_data() -> dict[str, int]:
    """참조 테이블이 비어 있을 때만 시드. idempotent."""
    counts = {"employees": 0, "symbols": 0, "options": 0, "process_types": 0, "flow_rules": 0}
    db = SessionLocal()
    try:
        if db.query(Employee).count() == 0:
            for idx, (code, name, role, dept, level) in enumerate(_EMPLOYEE_SEED, start=1):
                db.add(
                    Employee(
                        employee_code=code,
                        name=name,
                        role=role,
                        department=dept,
                        level=level,
                        display_order=idx,
                        is_active="true",
                        pin_hash=DEFAULT_PIN_HASH,  # 기본 PIN: 0000
                    )
                )
                counts["employees"] += 1
            db.commit()

        if db.query(ProductSymbol).count() == 0:
            for slot, symbol, model in _PRODUCT_SYMBOL_ASSIGNED:
                db.add(
                    ProductSymbol(
                        slot=slot,
                        symbol=symbol,
                        model_name=model,
                        is_finished_good=True,
                        is_reserved=False,
                    )
                )
                counts["symbols"] += 1
            for slot in range(6, 101):
                db.add(ProductSymbol(slot=slot, symbol=None, model_name=None, is_reserved=True))
                counts["symbols"] += 1
            db.commit()

        if db.query(OptionCode).count() == 0:
            for code, ko, en, color in _OPTION_CODES:
                db.add(OptionCode(code=code, label_ko=ko, label_en=en, color_hex=color))
                counts["options"] += 1
            db.commit()

        if db.query(ProcessType).count() == 0:
            for code, prefix, suffix, order, desc in _PROCESS_TYPES:
                db.add(
                    ProcessType(
                        code=code,
                        prefix=prefix,
                        suffix=suffix,
                        stage_order=order,
                        description=desc,
                    )
                )
                counts["process_types"] += 1
            db.commit()

        if db.query(ProcessFlowRule).count() == 0:
            for src, dst, consumes in _PROCESS_FLOW_RULES:
                db.add(ProcessFlowRule(from_type=src, to_type=dst, consumes_codes=consumes))
                counts["flow_rules"] += 1
            db.commit()
    finally:
        db.close()
    return counts


# ---------------------------------------------------------------------------
# 4. ERP 코드 백필 (erp_code NULL 인 품목에 4-part 코드 자동 부여)
# ---------------------------------------------------------------------------
def backfill_erp_codes() -> int:
    """erp_code 미할당 품목에 자동 부여. 기존 serial_no 와 충돌하지 않도록 그룹별 최대값+1."""
    db = SessionLocal()
    try:
        targets = db.query(Item).filter(Item.erp_code.is_(None)).all()
        if not targets:
            return 0

        symbol_map: dict[int, str] = {
            ps.slot: ps.symbol for ps in db.query(ProductSymbol).all() if ps.symbol
        }

        serial_counter: dict[tuple, int] = {}
        for item in db.query(Item).filter(Item.serial_no.isnot(None)).all():
            key = (item.symbol_slot, item.process_type_code)
            serial_counter[key] = max(serial_counter.get(key, 0), item.serial_no or 0)

        count = 0
        for item in targets:
            pt = item.process_type_code  # 공정코드는 18개 단일 기준 — 추론 없이 그대로 사용
            if pt is None:
                continue

            slot = infer_symbol_slot(item.legacy_model)
            symbol = symbol_map.get(slot, "공") if slot else "공"
            opt = "BG" if pt == "PA" else None

            key = (slot, pt)
            serial_counter[key] = serial_counter.get(key, 0) + 1
            serial = serial_counter[key]

            item.symbol_slot = slot
            item.serial_no = serial
            item.option_code = opt
            item.erp_code = make_erp_code(symbol, pt, serial, opt)
            count += 1

        db.commit()
        return count
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 5. 통합
# ---------------------------------------------------------------------------
def bootstrap_all() -> dict:
    """전체 부트스트랩: create_all → migrate → seed → ERP 백필."""
    run_schema_create_all()
    migrations = run_migrations()
    seeded = seed_reference_data()
    backfilled = backfill_erp_codes()
    return {
        "migrations": migrations,
        "seeded": seeded,
        "erp_backfilled": backfilled,
    }


def check_db() -> dict:
    """실행하지 않고 현재 상태만 리포트."""
    db = SessionLocal()
    try:
        report = {
            "employees": db.query(Employee).count(),
            "process_types": db.query(ProcessType).count(),
            "product_symbols": db.query(ProductSymbol).count(),
            "option_codes": db.query(OptionCode).count(),
            "items": db.query(Item).count(),
            "items_missing_erp_code": db.query(Item).filter(Item.erp_code.is_(None)).count(),
        }
    finally:
        db.close()
    return report


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="ERP backend DB bootstrap tool")
    parser.add_argument("--all", action="store_true", help="schema + migrate + seed + erp-backfill")
    parser.add_argument("--schema", action="store_true", help="run create_all")
    parser.add_argument("--migrate", action="store_true", help="run ALTER TABLE migrations")
    parser.add_argument("--seed", action="store_true", help="seed reference data")
    parser.add_argument("--erp-backfill", action="store_true", help="backfill ERP codes")
    parser.add_argument("--check", action="store_true", help="report DB state without writing")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(argv if argv is not None else sys.argv[1:])

    if args.check:
        report = check_db()
        print("[check] DB state:")
        for key, val in report.items():
            print(f"  {key}: {val}")
        return

    did_something = False
    if args.all or args.schema:
        run_schema_create_all()
        print("[schema] create_all completed")
        did_something = True
    if args.all or args.migrate:
        result = run_migrations()
        print(f"[migrate] applied={result['applied']} skipped={result['skipped']}")
        did_something = True
    if args.all or args.seed:
        seeded = seed_reference_data()
        print(f"[seed] {seeded}")
        did_something = True
    if args.all or args.erp_backfill:
        count = backfill_erp_codes()
        print(f"[erp-backfill] {count} items updated")
        did_something = True

    if not did_something:
        print("Nothing to do. Try: python bootstrap_db.py --all  (or --help)")


if __name__ == "__main__":
    main()
