"""bootstrap.migrate — 멱등 ALTER TABLE / 마이그레이션 헬퍼.

`run_migrations()` 가 단일 진입점.

분류 규약 (WS5):
- applied: 실제 적용됨
- skipped: 멱등 스킵 (이미 존재 — 재실행 시 정상)
- errors : 진짜 실패 (락/타입불일치/선행 오브젝트 누락 등) — WARNING 로깅 + 수집

테스트는 모듈 글로벌 `engine` 과 `_MIGRATION_DDL` 을 monkeypatch 하므로
두 심볼은 반드시 모듈 글로벌로 유지된다. (`bootstrap_db` 모듈은 이 두 심볼을
re-export 만 하며, 동기 patch 가 필요한 경우 패키지 측 글로벌을 직접 patch 한다.)
"""
from __future__ import annotations

import logging

from sqlalchemy import text

from app.database import engine
from app.services.pin_auth import DEFAULT_PIN_HASH

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
# Raw ALTER TABLE 마이그레이션 (SQLite 호환 단순 ADD COLUMN)
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
    # 2026-05-24 (W11-A): 부서별 입출고 권한 토글 — io_enabled 컬럼.
    # 기본값 1(TRUE). 기존 부서는 모두 TRUE 로 추가됨.
    "ALTER TABLE departments ADD COLUMN io_enabled BOOLEAN NOT NULL DEFAULT 1",
    # backfill: PROD_DEPTS 외 부서는 FALSE (프론트 hardcode 동작 보존).
    # WHERE io_enabled = 1 조건으로 이미 0 으로 설정된 행은 건드리지 않음.
    "UPDATE departments SET io_enabled = 0 "
    "WHERE name NOT IN ('튜브', '고압', '진공', '튜닝', '조립', '출하') AND io_enabled = 1",
    # 2026-05-24 (W12-#7): 직원별 입출고 권한 토글 — employees.io_enabled.
    # 부서 io_enabled 와 AND 결합 (둘 다 TRUE 일 때만 입출고 화면 진입 허용).
    # 기본값 1(TRUE). 기존 직원은 모두 TRUE 로 추가된 뒤, 본인 부서의 io_enabled 값으로 백필.
    # → 부서가 차단(FALSE) 상태였던 직원은 마이그레이션 후에도 동일하게 차단 유지.
    "ALTER TABLE employees ADD COLUMN io_enabled BOOLEAN NOT NULL DEFAULT 1",
    # 백필: 직원.io_enabled = (부서.io_enabled). 부서 이름이 일치하는 부서가 없으면 그대로 1 유지.
    "UPDATE employees SET io_enabled = ("
    "SELECT departments.io_enabled FROM departments WHERE departments.name = employees.department"
    ") WHERE EXISTS ("
    "SELECT 1 FROM departments WHERE departments.name = employees.department"
    ")",
]


# ---------------------------------------------------------------------------
# 보조 마이그레이션 헬퍼 (SQLite ALTER TABLE 멱등 한계 보완)
# ---------------------------------------------------------------------------
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
