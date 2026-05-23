"""
bootstrap_db.py — DB 스키마 / 마이그레이션 / 참조 데이터 / 품목코드 백필 통합 CLI.

FastAPI 앱 시작 시 자동 실행되던 부작용들을 여기로 옮겼다.
`uvicorn app.main:app` 만으로는 DB 가 변하지 않는다. 초기 설치 / 스키마 변경 /
시드 재적용이 필요한 시점에만 명시적으로 실행한다.

Usage:
    cd backend
    python bootstrap_db.py --all                # 스키마 + 마이그레이션 + 시드 + 품목코드 백필
    python bootstrap_db.py --schema --migrate   # DDL 관련만
    python bootstrap_db.py --seed               # 참조 데이터 (Employee/ProductSymbol/…)
    python bootstrap_db.py --item-code-backfill # item_code NULL 품목에 코드 부여
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
from app.utils.item_code import make_item_code

# bootstrap_db 는 uvicorn 밖에서 단독 실행되므로 setup_logging() 호출 없이도
# 동작해야 한다. 백엔드 표준 로거("mes") 네임스페이스를 그대로 쓰되,
# 핸들러 미설정 환경(=단독 CLI)에서도 메시지가 죽지 않도록 NullHandler 보강.
logger = logging.getLogger("mes")
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
    "no such column",  # DROP COLUMN 멱등: 컬럼이 이미 제거된 경우
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
    "ALTER TABLE items ADD COLUMN legacy_part VARCHAR(50)",
    "ALTER TABLE items ADD COLUMN legacy_item_type VARCHAR(50)",
    "ALTER TABLE items ADD COLUMN supplier VARCHAR(200)",
    "ALTER TABLE items ADD COLUMN min_stock NUMERIC(15,4)",
    # M1: 4-part item code
    "ALTER TABLE items ADD COLUMN erp_code VARCHAR(40)",
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
    # 2026-05-21: 죽은 거래 타입 5종(SCRAP/LOSS/RETURN/RESERVE/RESERVE_RELEASE) 제거
    # — 사용자 입출고 경로에서 발생하지 않음. 0행 보장 후 테이블 DROP.
    "DROP TABLE IF EXISTS scrap_logs",
    "DROP TABLE IF EXISTS loss_logs",
    # 2026-05-22: 출하패키지 미사용 확정 — 관련 테이블 완전 제거 (데이터 0행, API 이미 삭제됨)
    "DROP TABLE IF EXISTS ship_package_items",
    "DROP TABLE IF EXISTS ship_packages",
    # items.item_code (레거시 CSV) DROP + erp_code → item_code rename 은
    # _consolidate_item_code_columns() 헬퍼에서 처리. 멱등 (PRAGMA 로 현재 상태 검사 후
    # 필요한 단계만 수행) — fresh DB / 운영 DB 모두 안전.

    # 2026-05-22: 불량 처리 흐름 재설계 — Phase 1 모델 변경 (docs/defect-handling-redesign.md)
    # 격리 일자 — 1년 묵은 거 추적용 (허브 정렬·경고 배지)
    "ALTER TABLE inventory_locations ADD COLUMN defective_at DATETIME",
    "CREATE INDEX IF NOT EXISTS ix_invloc_defective_at ON inventory_locations(defective_at)",
    # 사유 필드 — 카테고리(외관/치수/기능/검사통과/기타) + 자유 메모
    "ALTER TABLE transaction_logs ADD COLUMN reason_category VARCHAR(32)",
    "CREATE INDEX IF NOT EXISTS ix_tx_reason_category ON transaction_logs(reason_category)",
    "ALTER TABLE transaction_logs ADD COLUMN reason_memo TEXT",
    # 기존 DEFECTIVE 행 백필 — updated_at 으로. NULL 이면 1년 경고 오작동.
    "UPDATE inventory_locations SET defective_at = updated_at "
    "WHERE status = 'DEFECTIVE' AND defective_at IS NULL",

    # 2026-05-22 (오후): 부서 계층(생산부 그릇) 청소는 `_cleanup_production_hierarchy()`
    # 헬퍼에서 처리. _MIGRATION_DDL 의 raw 문장으로 두면 fresh DB(parent_id 컬럼 없음)
    # 에서 "REAL FAILURE" 로 분류되므로 PRAGMA 검사로 안전하게 분기.

    # 2026-05-22: 불량 처리 사유 — stock_requests 에 reason_category / reason_memo 컬럼 추가
    # 결재 요청 생성 시 프론트가 전달하는 사유 정보를 DB에 유지하여 승인 시점에도 참조 가능.
    "ALTER TABLE stock_requests ADD COLUMN reason_category VARCHAR(50)",
    "ALTER TABLE stock_requests ADD COLUMN reason_memo TEXT",
    # 2026-05-23 (PR-2.2-5b): 모델 관리 드래그 reorder 지원 — display_order 컬럼.
    # 기본값 0 으로 ADD 한 뒤, NULL/0 인 행만 slot 값으로 백필 (slot 자체가 자연 정렬 키).
    # 이미 reorder 가 적용된 행(>0)은 덮어쓰지 않는다.
    "ALTER TABLE product_symbols ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0",
    "UPDATE product_symbols SET display_order = slot WHERE display_order = 0 OR display_order IS NULL",
]


def _consolidate_item_code_columns() -> None:
    """items 의 erp_code → item_code rename + 레거시 item_code DROP.
    snapshot 컬럼(stock_request_lines, io_lines)의 erp_code_snapshot → item_code_snapshot 도 함께.

    멱등 — 현재 컬럼 상태를 PRAGMA 로 보고 필요한 단계만 실행한다.
    SQLite ALTER TABLE 의 멱등 패턴이 약해서 별도 함수로 분리.
    """
    def _cols(conn, table: str) -> set[str]:
        return {r[1] for r in conn.execute(text(f"PRAGMA table_info({table})"))}

    with engine.connect() as conn:
        items_cols = _cols(conn, "items")
        # items: 두 컬럼이 공존하는 경우(운영 DB) 만 정리.
        # fresh DB 는 ORM create_all 로 이미 item_code 만 있음 → skip.
        # 단 _MIGRATION_DDL 의 historical ADD COLUMN erp_code 가 fresh DB 에 erp_code 를
        # 다시 추가할 수 있어 그 경우도 정리한다 (데이터는 NULL, fresh DB 라 무해).
        if "erp_code" in items_cols:
            # 인덱스 의존성 먼저 정리 (SQLite 가 DROP COLUMN 시 자동 정리 못함)
            conn.execute(text("DROP INDEX IF EXISTS ix_items_item_code"))
            conn.execute(text("DROP INDEX IF EXISTS ix_items_erp_code"))
            if "item_code" in items_cols:
                # 두 컬럼 공존: _MIGRATION_DDL 의 historical "ADD COLUMN erp_code" 가 rename 후
                # 재실행될 때 빈 유령 erp_code 를 다시 만드는 케이스.
                # erp_code 가 모두 NULL 이면 유령 컬럼 → erp_code 만 DROP, item_code 데이터 보존.
                erp_non_null = conn.execute(
                    text("SELECT COUNT(*) FROM items WHERE erp_code IS NOT NULL")
                ).scalar()
                if erp_non_null == 0:
                    conn.execute(text("ALTER TABLE items DROP COLUMN erp_code"))
                else:
                    conn.execute(text("ALTER TABLE items DROP COLUMN item_code"))
                    conn.execute(text("ALTER TABLE items RENAME COLUMN erp_code TO item_code"))
            else:
                conn.execute(text("ALTER TABLE items RENAME COLUMN erp_code TO item_code"))
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_items_item_code ON items(item_code)"
            ))
        # snapshot 컬럼 — 동일 패턴
        for table in ("stock_request_lines", "io_lines"):
            cols = _cols(conn, table)
            if "erp_code_snapshot" in cols and "item_code_snapshot" not in cols:
                conn.execute(text(
                    f"ALTER TABLE {table} RENAME COLUMN erp_code_snapshot TO item_code_snapshot"
                ))
        conn.commit()


def _drop_unused_item_columns() -> None:
    """spec / barcode / legacy_file_type — 미사용 컬럼 제거. 멱등.

    symbol_slot 은 FK(→ product_symbols.slot)가 있어 SQLite DROP COLUMN 불가.
    ORM 모델에서 제거됐으므로 API 노출은 없음 — DB에 그대로 남겨둔다.
    """
    to_drop = {"spec", "barcode", "legacy_file_type"}
    with engine.connect() as conn:
        cols = {r[1] for r in conn.execute(text("PRAGMA table_info(items)"))}
        for col in to_drop:
            if col in cols:
                conn.execute(text(f"DROP INDEX IF EXISTS ix_items_{col}"))
                conn.execute(text(f"ALTER TABLE items DROP COLUMN {col}"))
        conn.commit()


def _drop_dead_transaction_type_enum_values() -> None:
    """PG only: transaction_type_enum 에서 죽은 5종 값(SCRAP/LOSS/RETURN/
    RESERVE/RESERVE_RELEASE)을 제거.

    PG 는 enum 값 DROP 을 직접 지원 안 함 → 새 enum 생성 → 컬럼 cast →
    구 enum DROP → rename. SQLite 에서는 no-op (네이티브 enum 타입 없음).
    멱등 — 이미 정리된 상태면 즉시 return.
    """
    if engine.dialect.name != "postgresql":
        return
    dead = ("SCRAP", "LOSS", "RETURN", "RESERVE", "RESERVE_RELEASE")
    with engine.begin() as conn:
        rows = conn.execute(text(
            "SELECT enumlabel FROM pg_enum "
            "WHERE enumtypid = 'transaction_type_enum'::regtype"
        )).scalars().all()
        if not any(v in rows for v in dead):
            return
        conn.execute(text("""
            CREATE TYPE transaction_type_enum_new AS ENUM (
                'RECEIVE','PRODUCE','SHIP','ADJUST','BACKFLUSH','DISASSEMBLE',
                'TRANSFER_TO_PROD','TRANSFER_TO_WH','TRANSFER_DEPT',
                'MARK_DEFECTIVE','UNMARK_DEFECTIVE','DEFECT_SCRAP','SUPPLIER_RETURN'
            );
            ALTER TABLE transaction_logs
                ALTER COLUMN transaction_type
                TYPE transaction_type_enum_new
                USING transaction_type::text::transaction_type_enum_new;
            DROP TYPE transaction_type_enum;
            ALTER TYPE transaction_type_enum_new RENAME TO transaction_type_enum;
        """))


def _cleanup_production_hierarchy() -> None:
    """어제(2026-05-22 오전) 잠시 만든 "생산부" 그릇 / `parent_id` 컬럼 청소.

    사용자 정의 "부서 결재 역할 = 생산 라인 결재" 단순화에 따라 부서 계층 폐기.
    멱등 — 이미 정리된 환경이면 모두 NO-OP. fresh DB(컬럼·row 없음) 안전.
    PRAGMA / SELECT 로 현재 상태 검사 후 필요한 단계만 수행.
    """
    def _cols(conn, table: str) -> set[str]:
        return {r[1] for r in conn.execute(text(f"PRAGMA table_info({table})"))}

    with engine.begin() as conn:
        dept_cols = _cols(conn, "departments")
        has_parent_id = "parent_id" in dept_cols

        # 1) "생산부" row + 산하 라인 parent_id 정리 (parent_id 컬럼 있을 때만)
        if has_parent_id:
            # 직원 부서 복귀 (룰 기반)
            conn.execute(text(
                "UPDATE employees SET department='조립' "
                "WHERE department='생산부' AND department_role IN ('primary','deputy')"
            ))
            conn.execute(text(
                "UPDATE departments SET parent_id=NULL "
                "WHERE parent_id=(SELECT id FROM departments WHERE name='생산부')"
            ))
            conn.execute(text("DELETE FROM departments WHERE name='생산부'"))
            conn.execute(text("DROP INDEX IF EXISTS ix_departments_parent_id"))
            conn.execute(text("ALTER TABLE departments DROP COLUMN parent_id"))


def _add_new_transaction_type_values() -> None:
    """PG only: transaction_type_enum 에 UNMARK_DEFECTIVE, DEFECT_SCRAP 추가.

    2026-05-22 불량 처리 흐름 재설계용 (docs/defect-handling-redesign.md).
    ALTER TYPE ADD VALUE IF NOT EXISTS — 트랜잭션 외부 실행 필수.
    SQLite 에서는 no-op.
    """
    if engine.dialect.name != "postgresql":
        return
    # autocommit 모드 (ALTER TYPE ADD VALUE 는 트랜잭션 내 불가)
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        for value in ("UNMARK_DEFECTIVE", "DEFECT_SCRAP"):
            conn.execute(text(
                f"ALTER TYPE transaction_type_enum ADD VALUE IF NOT EXISTS '{value}'"
            ))


def _fix_io_bundles_package_id() -> None:
    """io_bundles.package_id (→ ship_packages FK) 제거.

    ship_packages 가 DROP 된 뒤에도 io_bundles 의 FK 정의가 남아 있으면
    PRAGMA foreign_keys=ON 환경에서 모든 INSERT 가 "no such table: ship_packages" 로 실패.
    SQLite DROP COLUMN 은 FK 포함 컬럼을 허용하지 않으므로 테이블 재생성으로 처리. 멱등.
    """
    with engine.connect() as conn:
        cols = {r[1] for r in conn.execute(text("PRAGMA table_info(io_bundles)"))}
        if "package_id" not in cols:
            return
        conn.execute(text("PRAGMA foreign_keys=OFF"))
        conn.execute(text("""
            CREATE TABLE io_bundles_new (
                bundle_id UUID NOT NULL,
                batch_id UUID NOT NULL,
                source_kind VARCHAR(24) NOT NULL,
                source_item_id UUID,
                title_snapshot VARCHAR(220) NOT NULL,
                quantity NUMERIC(15, 4) NOT NULL,
                expanded_level INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
                PRIMARY KEY (bundle_id),
                FOREIGN KEY(batch_id) REFERENCES io_batches (batch_id) ON DELETE CASCADE,
                FOREIGN KEY(source_item_id) REFERENCES items (item_id) ON DELETE SET NULL
            )
        """))
        conn.execute(text("""
            INSERT INTO io_bundles_new
                (bundle_id, batch_id, source_kind, source_item_id, title_snapshot,
                 quantity, expanded_level, created_at)
            SELECT bundle_id, batch_id, source_kind, source_item_id, title_snapshot,
                   quantity, expanded_level, created_at
            FROM io_bundles
        """))
        conn.execute(text("DROP TABLE io_bundles"))
        conn.execute(text("ALTER TABLE io_bundles_new RENAME TO io_bundles"))
        conn.execute(text("PRAGMA foreign_keys=ON"))
        conn.commit()


def _fix_queue_batches_fk() -> None:
    """transaction_logs / variance_logs 에서 queue_batches FK 및 관련 컬럼 제거.

    queue_batches 가 DROP 된 뒤 FK 가 남아 PRAGMA foreign_keys=ON 환경에서
    INSERT 마다 "no such table: queue_batches" 실패. 테이블 재생성으로 처리. 멱등.
    """
    with engine.connect() as conn:
        cols = {r[1] for r in conn.execute(text("PRAGMA table_info(transaction_logs)"))}
        if "batch_id" in cols:
            conn.execute(text("PRAGMA foreign_keys=OFF"))
            conn.execute(text("""
                CREATE TABLE transaction_logs_new (
                    log_id UUID NOT NULL,
                    item_id UUID NOT NULL,
                    transaction_type VARCHAR(16) NOT NULL,
                    quantity_change NUMERIC(15, 4) NOT NULL,
                    quantity_before NUMERIC(15, 4),
                    quantity_after NUMERIC(15, 4),
                    reference_no VARCHAR(100),
                    produced_by VARCHAR(100),
                    notes TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    transfer_qty REAL,
                    operation_batch_id CHAR(36),
                    archived_at DATETIME,
                    reason_category VARCHAR(32),
                    reason_memo TEXT,
                    PRIMARY KEY (log_id),
                    FOREIGN KEY(item_id) REFERENCES items (item_id) ON DELETE CASCADE,
                    FOREIGN KEY(operation_batch_id) REFERENCES io_batches (batch_id) ON DELETE SET NULL
                )
            """))
            conn.execute(text("""
                INSERT INTO transaction_logs_new
                    (log_id, item_id, transaction_type, quantity_change, quantity_before,
                     quantity_after, reference_no, produced_by, notes, created_at,
                     transfer_qty, operation_batch_id, archived_at, reason_category, reason_memo)
                SELECT log_id, item_id, transaction_type, quantity_change, quantity_before,
                       quantity_after, reference_no, produced_by, notes, created_at,
                       transfer_qty, operation_batch_id, archived_at, reason_category, reason_memo
                FROM transaction_logs
            """))
            conn.execute(text("DROP TABLE transaction_logs"))
            conn.execute(text("ALTER TABLE transaction_logs_new RENAME TO transaction_logs"))
            conn.execute(text("PRAGMA foreign_keys=ON"))

        vcols = {r[1] for r in conn.execute(text("PRAGMA table_info(variance_logs)"))}
        if "batch_id" in vcols:
            conn.execute(text("PRAGMA foreign_keys=OFF"))
            conn.execute(text("""
                CREATE TABLE variance_logs_new (
                    var_id UUID NOT NULL,
                    item_id UUID NOT NULL,
                    bom_expected NUMERIC(15, 4) NOT NULL,
                    actual_used NUMERIC(15, 4) NOT NULL,
                    diff NUMERIC(15, 4) NOT NULL,
                    note TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    PRIMARY KEY (var_id),
                    FOREIGN KEY(item_id) REFERENCES items (item_id) ON DELETE CASCADE
                )
            """))
            conn.execute(text("""
                INSERT INTO variance_logs_new
                    (var_id, item_id, bom_expected, actual_used, diff, note, created_at)
                SELECT var_id, item_id, bom_expected, actual_used, diff, note, created_at
                FROM variance_logs
            """))
            conn.execute(text("DROP TABLE variance_logs"))
            conn.execute(text("ALTER TABLE variance_logs_new RENAME TO variance_logs"))
            conn.execute(text("PRAGMA foreign_keys=ON"))

        conn.commit()


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

    # io_bundles.package_id → ship_packages FK 제거 (ship_packages DROP 후 FK 깨짐)
    try:
        _fix_io_bundles_package_id()
    except Exception as exc:  # noqa: BLE001
        msg = f"[migrate] io_bundles package_id fix failed: {exc}"
        errors.append(msg)
        logger.warning(msg, exc_info=False)

    # transaction_logs / variance_logs 의 batch_id → queue_batches FK 제거
    try:
        _fix_queue_batches_fk()
    except Exception as exc:  # noqa: BLE001
        msg = f"[migrate] queue_batches FK fix failed: {exc}"
        errors.append(msg)
        logger.warning(msg, exc_info=False)

    # items.item_code 통합 (erp_code → item_code rename + 레거시 item_code DROP)
    try:
        _consolidate_item_code_columns()
    except Exception as exc:  # noqa: BLE001
        msg = f"[migrate] item_code consolidation failed: {exc}"
        errors.append(msg)
        logger.warning(msg, exc_info=False)

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

    # 죽은 거래 타입 5종 — PG enum 정리 (SQLite 는 no-op). 멱등.
    try:
        _drop_dead_transaction_type_enum_values()
    except Exception as exc:  # noqa: BLE001
        msg = f"[migrate] PG enum cleanup failed: {exc}"
        errors.append(msg)
        logger.warning(msg, exc_info=False)

    # 불량 처리 흐름 — UNMARK_DEFECTIVE, DEFECT_SCRAP 신규 enum 값 추가 (PG only).
    try:
        _add_new_transaction_type_values()
    except Exception as exc:  # noqa: BLE001
        msg = f"[migrate] PG enum add (defect handling) failed: {exc}"
        errors.append(msg)
        logger.warning(msg, exc_info=False)

    # spec/barcode/legacy_file_type/symbol_slot — 미사용 컬럼 제거. 멱등.
    try:
        _drop_unused_item_columns()
    except Exception as exc:  # noqa: BLE001
        msg = f"[migrate] unused item columns drop failed: {exc}"
        errors.append(msg)
        logger.warning(msg, exc_info=False)

    # 부서 계층(생산부 그릇) 폐기 청소 — 어제 잠시 만든 데이터/컬럼 정리.
    # 멱등 — fresh DB / 정리 완료 환경 모두 안전 (PRAGMA 검사).
    try:
        _cleanup_production_hierarchy()
    except Exception as exc:  # noqa: BLE001
        msg = f"[migrate] production hierarchy cleanup failed: {exc}"
        errors.append(msg)
        logger.warning(msg, exc_info=False)

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
# 4. 품목 코드 백필 (item_code NULL 인 품목에 4-part 코드 자동 부여)
# ---------------------------------------------------------------------------
def backfill_item_codes() -> int:
    """item_code 미할당 품목에 자동 부여. 기존 serial_no 와 충돌하지 않도록 그룹별 최대값+1."""
    db = SessionLocal()
    try:
        targets = db.query(Item).filter(Item.item_code.is_(None)).all()
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
            item.item_code = make_item_code(symbol, pt, serial, opt)
            count += 1

        db.commit()
        return count
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 5. 통합
# ---------------------------------------------------------------------------
def bootstrap_all() -> dict:
    """전체 부트스트랩: create_all → migrate → seed → 품목코드 백필."""
    run_schema_create_all()
    migrations = run_migrations()
    seeded = seed_reference_data()
    backfilled = backfill_item_codes()
    return {
        "migrations": migrations,
        "seeded": seeded,
        "item_code_backfilled": backfilled,
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
            "items_missing_item_code": db.query(Item).filter(Item.item_code.is_(None)).count(),
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
    parser = argparse.ArgumentParser(description="MES backend DB bootstrap tool")
    parser.add_argument("--all", action="store_true", help="schema + migrate + seed + 품목코드 백필")
    parser.add_argument("--schema", action="store_true", help="run create_all")
    parser.add_argument("--migrate", action="store_true", help="run ALTER TABLE migrations")
    parser.add_argument("--seed", action="store_true", help="seed reference data")
    parser.add_argument("--item-code-backfill", action="store_true", help="backfill item codes")
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
    if args.all or args.item_code_backfill:
        count = backfill_item_codes()
        print(f"[item-code-backfill] {count} items updated")
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
