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
import logging
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import text

from app.database import Base, SessionLocal, engine
from app.models import (
    Department,
    DepartmentEnum,
    Employee,
    EmployeeAssignedModel,  # noqa: F401 — metadata registration
    EmployeeLevelEnum,
    Item,
    OptionCode,
    ProcessFlowRule,
    ProcessType,
    ProductSymbol,
)
from app.services.pin_auth import DEFAULT_PIN_HASH
from app.utils.erp_code import make_erp_code

# bootstrap_db 는 uvicorn 밖에서 단독 실행되므로 setup_logging() 호출 없이도
# 동작해야 한다. 백엔드 표준 로거("erp") 네임스페이스를 그대로 쓰되,
# 핸들러 미설정 환경(=단독 CLI)에서도 메시지가 죽지 않도록 NullHandler 보강.
logger = logging.getLogger("erp")
if not logger.handlers:
    logger.addHandler(logging.NullHandler())

# 재실행 시 정상적으로 발생하는 "이미 존재" 류 — 에러가 아니라 멱등 스킵.
# SQLAlchemy 래핑 예외의 .orig (DBAPI 원본) 문자열을 소문자로 보고 판정.
# SQLite: "duplicate column name: x"
# PostgreSQL: 'column "x" of relation "t" already exists',
#             'relation "ix_..." already exists'
_BENIGN_MIGRATION_PATTERNS: tuple[str, ...] = (
    "duplicate column name",
    "duplicate column",
    "already exists",
)


def _is_benign_migration_skip(exc: Exception) -> bool:
    """예외가 '이미 적용됨'(멱등 재실행) 인지 판정. 아니면 실제 실패."""
    orig = getattr(exc, "orig", exc)
    msg = str(orig).lower()
    return any(pat in msg for pat in _BENIGN_MIGRATION_PATTERNS)


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
    # M8: 재고 이원화 — warehouse_qty
    "ALTER TABLE inventory ADD COLUMN warehouse_qty NUMERIC(15,4) NOT NULL DEFAULT 0",
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
    # 부서 결재 역할 — 낱개 IO 작업 승인 권한 (warehouse_role 와 별개)
    "ALTER TABLE employees ADD COLUMN department_role VARCHAR(20) NOT NULL DEFAULT 'none'",
    # PIN 마지막 변경 일시 (NULL = 변경 이력 없음)
    "ALTER TABLE employees ADD COLUMN pin_last_changed DATETIME",
    # 직원별 테마 설정 (light | dark | NULL=기본값)
    "ALTER TABLE employees ADD COLUMN theme VARCHAR(10)",
    # 부서 대표 색깔 (HEX, NULL = 기본 purple)
    "ALTER TABLE departments ADD COLUMN color_hex VARCHAR(7)",
    # 입출고 2.0 작업 묶음
    """CREATE TABLE IF NOT EXISTS io_batches (
        batch_id CHAR(36) PRIMARY KEY,
        work_type VARCHAR(32) NOT NULL,
        sub_type VARCHAR(40) NOT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'draft',
        requester_employee_id CHAR(36) NOT NULL REFERENCES employees(employee_id),
        requester_name VARCHAR(100) NOT NULL,
        requester_department VARCHAR(50) NOT NULL,
        from_department VARCHAR(50),
        to_department VARCHAR(50),
        requires_approval BOOLEAN NOT NULL DEFAULT 0,
        stock_request_id CHAR(36),
        reference_no VARCHAR(100),
        notes TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        submitted_at DATETIME,
        completed_at DATETIME
    )""",
    """CREATE TABLE IF NOT EXISTS io_bundles (
        bundle_id CHAR(36) PRIMARY KEY,
        batch_id CHAR(36) NOT NULL REFERENCES io_batches(batch_id) ON DELETE CASCADE,
        source_kind VARCHAR(24) NOT NULL,
        source_item_id CHAR(36) REFERENCES items(item_id) ON DELETE SET NULL,
        title_snapshot VARCHAR(220) NOT NULL,
        quantity NUMERIC(15,4) NOT NULL,
        expanded_level INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS io_lines (
        line_id CHAR(36) PRIMARY KEY,
        bundle_id CHAR(36) NOT NULL REFERENCES io_bundles(bundle_id) ON DELETE CASCADE,
        item_id CHAR(36) NOT NULL REFERENCES items(item_id),
        item_name_snapshot VARCHAR(200) NOT NULL,
        erp_code_snapshot VARCHAR(50),
        unit VARCHAR(20) NOT NULL DEFAULT 'EA',
        direction VARCHAR(20) NOT NULL,
        from_bucket VARCHAR(20) NOT NULL,
        from_department VARCHAR(50),
        to_bucket VARCHAR(20) NOT NULL,
        to_department VARCHAR(50),
        quantity NUMERIC(15,4) NOT NULL,
        bom_expected NUMERIC(15,4),
        included BOOLEAN NOT NULL DEFAULT 1,
        origin VARCHAR(24) NOT NULL,
        edited BOOLEAN NOT NULL DEFAULT 0,
        has_children_snapshot BOOLEAN NOT NULL DEFAULT 0,
        shortage NUMERIC(15,4) NOT NULL DEFAULT 0,
        exclusion_note TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""",
    "ALTER TABLE stock_requests ADD COLUMN operation_batch_id CHAR(36)",
    "ALTER TABLE stock_request_lines ADD COLUMN operation_line_id CHAR(36)",
    "ALTER TABLE transaction_logs ADD COLUMN operation_batch_id CHAR(36)",
    "CREATE INDEX IF NOT EXISTS ix_io_batches_requester_status ON io_batches(requester_employee_id, status)",
    "CREATE INDEX IF NOT EXISTS ix_io_batches_status ON io_batches(status)",
    "CREATE INDEX IF NOT EXISTS ix_io_bundles_batch_id ON io_bundles(batch_id)",
    "CREATE INDEX IF NOT EXISTS ix_io_lines_bundle_id ON io_lines(bundle_id)",
    "CREATE INDEX IF NOT EXISTS ix_io_line_item_included ON io_lines(item_id, included)",
    # R10B: 중복 제출 방지용 클라이언트 멱등성 키
    "ALTER TABLE stock_requests ADD COLUMN client_request_id VARCHAR(64)",
    "CREATE UNIQUE INDEX IF NOT EXISTS ix_stock_requests_client_request_id ON stock_requests(client_request_id)",
    # 입출고 v2 멱등 키 — 제출 더블클릭 시 재고 이중 차감 방지
    "ALTER TABLE io_batches ADD COLUMN client_request_id VARCHAR(64)",
    "CREATE UNIQUE INDEX IF NOT EXISTS ix_io_batches_client_request_id ON io_batches(client_request_id)",
    # 05-18 라인 추가 컬럼 (모델에는 있으나 마이그레이션 누락분 — 구 DB 호환용)
    # BOM 완료 워크플로우 — 명시적 "완료로 표시" 시각
    "ALTER TABLE items ADD COLUMN bom_completed_at DATETIME",
    # 거래 로그 아카이브 시각 (NULL = 미아카이브)
    "ALTER TABLE transaction_logs ADD COLUMN archived_at DATETIME",
    "CREATE INDEX IF NOT EXISTS ix_transaction_logs_archived_at ON transaction_logs(archived_at)",
    # 부서 결재 — 낱개 manual/adjust 라인 포함 시 추가 승인 (warehouse_approval 와 독립)
    "ALTER TABLE stock_requests ADD COLUMN requires_department_approval BOOLEAN NOT NULL DEFAULT 0",
    "ALTER TABLE stock_requests ADD COLUMN department_approved_by_employee_id CHAR(36)",
    "ALTER TABLE stock_requests ADD COLUMN department_approved_by_name VARCHAR(100)",
    "ALTER TABLE stock_requests ADD COLUMN department_approved_at DATETIME",
    # 2026-05-20: queue/alerts/counts dead feature 제거 — 테이블 삭제 (CASCADE 로 자식 FK 정리)
    "DROP TABLE IF EXISTS queue_lines",
    "DROP TABLE IF EXISTS queue_batches",
    "DROP TABLE IF EXISTS stock_alerts",
    "DROP TABLE IF EXISTS physical_counts",
]


def run_migrations() -> dict[str, object]:
    """누락된 컬럼/인덱스/테이블을 반영. 각 문장을 3분류한다.

    - applied: 실제로 적용됨
    - skipped: 멱등 스킵 (이미 존재 — 재실행 시 정상, 에러 아님)
    - errors:  진짜 실패 (락/타입불일치/선행 오브젝트 누락 등). SQL+예외를
               WARNING 으로 로깅하고 errors 리스트에 수집한다.

    실서버에서 진짜 실패가 무성(silent) 스킵으로 묻히던 문제(WS5) 수정.

    Returns:
        {'applied': int, 'skipped': int, 'failed': int, 'errors': list[str]}
        (기존 'applied'/'skipped' 키는 그대로 유지 — 하위호환 SUPERSET)
    """
    applied = 0
    skipped = 0
    errors: list[str] = []

    def _run(sql: str, *, params: dict | None = None, label: str) -> None:
        nonlocal applied, skipped
        try:
            with engine.connect() as conn:
                conn.execute(text(sql), params or {})
                conn.commit()
            applied += 1
        except Exception as exc:  # noqa: BLE001 — 분류 목적 광범위 캐치
            if _is_benign_migration_skip(exc):
                skipped += 1
                return
            orig = getattr(exc, "orig", exc)
            msg = f"[migrate] REAL FAILURE ({label}): {sql!r} -> {orig}"
            errors.append(msg)
            logger.warning(msg, exc_info=False)

    for sql in _MIGRATION_DDL:
        _run(sql, label="ddl")

    # pending_quantity NULL 기본값 채우기
    _run(
        "UPDATE inventory SET pending_quantity = 0 WHERE pending_quantity IS NULL",
        label="post-update:pending_quantity",
    )

    # 기존 직원에 PIN 기본값 0000 적용 (pin_hash NULL인 경우만)
    _run(
        "UPDATE employees SET pin_hash = :h WHERE pin_hash IS NULL",
        params={"h": DEFAULT_PIN_HASH},
        label="post-update:pin_hash",
    )

    # warehouse_role NULL/empty → 'none' 보정 (ALTER 가 idempotent 하지 않은 환경 대비)
    _run(
        "UPDATE employees SET warehouse_role = 'none' "
        "WHERE warehouse_role IS NULL OR warehouse_role = ''",
        label="post-update:warehouse_role",
    )

    if errors:
        logger.error(
            "[migrate] %d real migration failure(s) — see WARNING lines above.",
            len(errors),
        )

    return {
        "applied": applied,
        "skipped": skipped,
        "failed": len(errors),
        "errors": errors,
    }


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
    ("TA", "T", "A", 20, "튜브 중간공정"),
    ("TF", "T", "F", 25, "튜브 공정완료"),
    ("HR", "H", "R", 15, "고압 원자재"),
    ("HA", "H", "A", 30, "고압 중간공정"),
    ("HF", "H", "F", 35, "고압 공정완료"),
    ("VR", "V", "R", 25, "진공 원자재"),
    ("VA", "V", "A", 40, "진공 중간공정"),
    ("VF", "V", "F", 45, "진공 공정완료"),
    ("NR", "N", "R", 50, "튜닝 원자재"),
    ("NA", "N", "A", 55, "튜닝 중간공정"),
    ("NF", "N", "F", 60, "튜닝 공정완료"),
    ("AR", "A", "R", 45, "조립 원자재"),
    ("AA", "A", "A", 65, "조립 중간공정"),
    ("AF", "A", "F", 70, "조립 공정완료"),
    ("PR", "P", "R", 55, "출하 원자재"),
    ("PA", "P", "A", 75, "출하 중간공정"),
    ("PF", "P", "F", 80, "출하 공정완료"),
]

_PROCESS_FLOW_RULES: list[tuple] = [
    # 부서 내 흐름 (R→A, A→F) — consumes_codes는 OR 조건 (쉼표 구분)
    ("TR", "TA", "TR"),       # TR + TR → TA
    ("TA", "TF", "TR,TA"),    # TA + (TR 또는 TA) → TF
    ("HR", "HA", "HR"),       # HR + HR → HA
    ("HA", "HF", "HR,HA"),    # HA + (HR 또는 HA) → HF
    ("VR", "VA", "VR"),       # VR + VR → VA
    ("VA", "VF", "VR,VA"),    # VA + (VR 또는 VA) → VF
    ("NR", "NA", "NR"),       # NR + NR → NA
    ("NA", "NF", "NR,NA"),    # NA + (NR 또는 NA) → NF
    ("AR", "AA", "AR"),       # AR + AR → AA
    ("AA", "AF", "AR,AA"),    # AA + (AR 또는 AA) → AF
    ("PR", "PA", "PR"),       # PR + PR → PA
    ("PA", "PF", "PR,PA"),    # PA + (PR 또는 PA) → PF
    # 부서 간 이전 (이전 부서 F → 다음 부서 A)
    ("TF", "HA", "HR"),       # TF + HR → HA
    ("HF", "VA", "VR"),       # HF + VR → VA
    ("VF", "NA", "NR"),       # VF + NR → NA
    ("NF", "AA", "AR"),       # NF + AR → AA
    ("AF", "PA", "PR"),       # AF + PR → PA
]


def seed_reference_data() -> dict[str, int]:
    """참조 테이블이 비어 있을 때만 시드. idempotent."""
    counts = {"departments": 0, "employees": 0, "symbols": 0, "options": 0, "process_types": 0, "flow_rules": 0}
    db = SessionLocal()
    try:
        if db.query(Department).count() == 0:
            _DEPT_SEED = ["조립", "고압", "진공", "튜닝", "튜브", "AS", "연구", "영업", "출하", "기타"]
            for i, name in enumerate(_DEPT_SEED):
                db.add(Department(name=name, display_order=i, is_active=True))
                counts["departments"] += 1
            db.commit()

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

            slot = item.symbol_slot
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
def reset_flow_rules() -> int:
    """process_flow_rules 테이블을 초기화하고 현행 _PROCESS_FLOW_RULES로 재시드."""
    db = SessionLocal()
    try:
        db.query(ProcessFlowRule).delete()
        db.commit()
        for src, dst, consumes in _PROCESS_FLOW_RULES:
            db.add(ProcessFlowRule(from_type=src, to_type=dst, consumes_codes=consumes))
        db.commit()
        return len(_PROCESS_FLOW_RULES)
    finally:
        db.close()


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="ERP backend DB bootstrap tool")
    parser.add_argument("--all", action="store_true", help="schema + migrate + seed + erp-backfill")
    parser.add_argument("--schema", action="store_true", help="run create_all")
    parser.add_argument("--migrate", action="store_true", help="run ALTER TABLE migrations")
    parser.add_argument("--seed", action="store_true", help="seed reference data")
    parser.add_argument("--erp-backfill", action="store_true", help="backfill ERP codes")
    parser.add_argument("--reset-flow-rules", action="store_true", help="process_flow_rules 초기화 및 재시드")
    parser.add_argument("--check", action="store_true", help="report DB state without writing")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """CLI 진입점.

    Returns:
        프로세스 종료 코드. 마이그레이션 진짜 실패가 있으면 1
        (start.bat 의 `if errorlevel 1` 가 부트스트랩을 중단하도록).
    """
    args = _parse_args(argv if argv is not None else sys.argv[1:])

    if args.check:
        report = check_db()
        print("[check] DB state:")
        for key, val in report.items():
            print(f"  {key}: {val}")
        return 0

    exit_code = 0
    did_something = False
    if args.all or args.schema:
        run_schema_create_all()
        print("[schema] create_all completed")
        did_something = True
    if args.all or args.migrate:
        result = run_migrations()
        errs = result.get("errors") or []
        print(
            f"[migrate] applied={result['applied']} skipped={result['skipped']} "
            f"failed={len(errs)}"
        )
        if errs:
            print(f"[migrate] ERROR: {len(errs)} real migration failure(s):")
            for e in errs:
                print(f"  - {e}")
            exit_code = 1
        did_something = True
    if args.all or args.seed:
        seeded = seed_reference_data()
        print(f"[seed] {seeded}")
        did_something = True
    if args.all or args.erp_backfill:
        count = backfill_erp_codes()
        print(f"[erp-backfill] {count} items updated")
        did_something = True
    if getattr(args, "reset_flow_rules", False):
        count = reset_flow_rules()
        print(f"[reset-flow-rules] {count}개 규칙으로 재시드 완료")
        did_something = True

    if not did_something:
        print("Nothing to do. Try: python bootstrap_db.py --all  (or --help)")

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
