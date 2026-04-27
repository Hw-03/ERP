---
type: code-note
project: ERP
layer: backend
source_path: backend/bootstrap_db.py
status: active
updated: 2026-04-27
source_sha: dd68b32ed017
tags:
  - erp
  - backend
  - source-file
  - py
---

# bootstrap_db.py

> [!summary] 역할
> 원본 프로젝트의 `bootstrap_db.py` 파일을 Obsidian에서 추적하기 위한 미러 노트다.

## 원본 위치

- Source: `backend/bootstrap_db.py`
- Layer: `backend`
- Kind: `source-file`
- Size: `16510` bytes

## 연결

- Parent hub: [[backend/backend|backend]]
- Related: [[backend/backend]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

> 전체 394줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````python
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
from app.utils.erp_code import infer_process_type, infer_symbol_slot, make_erp_code


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
                    )
                )
                counts["employees"] += 1
            db.commit()

        if db.query(ProductSymbol).count() == 0:
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
