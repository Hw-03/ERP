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
    # M1: 3-part item code
    "ALTER TABLE items ADD COLUMN erp_code VARCHAR(40)",
    "ALTER TABLE items ADD COLUMN process_type_code VARCHAR(2)",
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
    # 2026-06-02: 사번 감사 보강 — 직접 입출고 엔드포인트에서 사번 검증 성공 시 채움 (nullable)
    "ALTER TABLE transaction_logs ADD COLUMN producer_employee_id CHAR(36)",
    "CREATE INDEX IF NOT EXISTS ix_tx_producer_employee ON transaction_logs(producer_employee_id)",
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
    # 2026-05-26: 품목 소프트 삭제 — deleted_at NULL=활성, 값있으면 삭제됨
    "ALTER TABLE items ADD COLUMN deleted_at DATETIME",
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
    # 2026-05-27: 불량·수량조정 부서 필터 수정 — 직접 생성된 TransactionLog 에 부서 기록.
    # IoBatch 없이 생성되는 MARK_DEFECTIVE/UNMARK_DEFECTIVE/DEFECT_SCRAP/SUPPLIER_RETURN 트랜잭션의
    # 부서 라벨을 _department_label_expr() 에서 이 컬럼으로 폴백.
    "ALTER TABLE transaction_logs ADD COLUMN department VARCHAR(50)",
    "CREATE INDEX IF NOT EXISTS ix_tx_department ON transaction_logs(department)",
    # 2026-05-29: AdminAuditLog 에 사번(actor_employee_code) 컬럼 추가.
    # 권동환 사원 요청 #3 (사번 기반 audit) 의 마스터/설정 변경 audit 영구 저장.
    "ALTER TABLE admin_audit_logs ADD COLUMN actor_employee_code VARCHAR(16)",
    "CREATE INDEX IF NOT EXISTS ix_aal_actor_emp ON admin_audit_logs(actor_employee_code)",
    # 2026-05-29: item_models 폐기 — 모델 매핑은 item_code prefix 에서 유도.
    # 411개 row 가 비어있던 상태로 김민재 대리 SOLO 필터 실패 원인. ItemModel ORM 클래스
    # 제거와 함께 테이블도 DROP. backup: backend/_backup/mes_pre_item_models_drop_2026-05-29.db
    "DROP TABLE IF EXISTS item_models",
    # 2026-06-15: 창고↔부서 이동 전후 창고 수량 분리 기록
    "ALTER TABLE transaction_logs ADD COLUMN warehouse_qty_before INTEGER",
    "ALTER TABLE transaction_logs ADD COLUMN warehouse_qty_after INTEGER",
    # 2026-06-15: 거래 취소 — 내역 유지 + 재고 롤백
    "ALTER TABLE transaction_logs ADD COLUMN cancelled BOOLEAN NOT NULL DEFAULT 0",
    "ALTER TABLE transaction_logs ADD COLUMN cancel_reason TEXT",
    "ALTER TABLE transaction_logs ADD COLUMN cancelled_by CHAR(36)",
    "ALTER TABLE transaction_logs ADD COLUMN cancelled_at DATETIME",
    # 2026-06-15: 취소 재구현 — 거래가 건드린 재고 셀 증감 기록(JSON). 취소 시 부호 반전해 역재생.
    "ALTER TABLE transaction_logs ADD COLUMN inventory_effect TEXT",
    # 2026-06-04: 결재 알림 — 요청 도착(승인자)/승인·반려(요청자) 알림 영속 테이블.
    """CREATE TABLE IF NOT EXISTS notifications (
        notification_id CHAR(36) PRIMARY KEY,
        recipient_employee_id CHAR(36) NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
        type VARCHAR(32) NOT NULL,
        title VARCHAR(200) NOT NULL,
        body TEXT,
        target_tab VARCHAR(32),
        target_section VARCHAR(32),
        related_request_id CHAR(36) REFERENCES stock_requests(request_id) ON DELETE SET NULL,
        is_read BOOLEAN NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""",
    "CREATE INDEX IF NOT EXISTS ix_notifications_recipient ON notifications(recipient_employee_id)",
    "CREATE INDEX IF NOT EXISTS ix_notification_recipient_unread ON notifications(recipient_employee_id, is_read)",
    "CREATE INDEX IF NOT EXISTS ix_notifications_related_request ON notifications(related_request_id)",
    "CREATE INDEX IF NOT EXISTS ix_notifications_created_at ON notifications(created_at)",
    # 2026-06-04: 튜브→고압/진공 인수인계서.
    """CREATE TABLE IF NOT EXISTS handovers (
        handover_id CHAR(36) PRIMARY KEY,
        handover_code VARCHAR(40),
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        author_employee_id CHAR(36) NOT NULL REFERENCES employees(employee_id) ON DELETE RESTRICT,
        author_name VARCHAR(100) NOT NULL,
        from_department VARCHAR(50) NOT NULL DEFAULT '튜브',
        to_department VARCHAR(50) NOT NULL,
        title VARCHAR(200) NOT NULL,
        process_content TEXT,
        product_name VARCHAR(200),
        doc_date DATETIME,
        analysis_text TEXT,
        notes TEXT,
        received_by_employee_id CHAR(36) REFERENCES employees(employee_id) ON DELETE SET NULL,
        received_by_name VARCHAR(100),
        received_at DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""",
    "CREATE UNIQUE INDEX IF NOT EXISTS ix_handovers_code ON handovers(handover_code)",
    "CREATE INDEX IF NOT EXISTS ix_handovers_status ON handovers(status)",
    "CREATE INDEX IF NOT EXISTS ix_handovers_author ON handovers(author_employee_id)",
    """CREATE TABLE IF NOT EXISTS handover_lines (
        line_id CHAR(36) PRIMARY KEY,
        handover_id CHAR(36) NOT NULL REFERENCES handovers(handover_id) ON DELETE CASCADE,
        item_id CHAR(36) NOT NULL REFERENCES items(item_id) ON DELETE RESTRICT,
        item_name_snapshot VARCHAR(200) NOT NULL,
        mes_code_snapshot VARCHAR(50),
        quantity INTEGER NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""",
    "CREATE INDEX IF NOT EXISTS ix_handover_lines_handover ON handover_lines(handover_id)",
    "CREATE INDEX IF NOT EXISTS ix_handover_lines_item ON handover_lines(item_id)",
    # 2026-06-25: warehouse map aisle/pallet special zones.
    """CREATE TABLE IF NOT EXISTS warehouse_special_zones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label VARCHAR(50) NOT NULL,
        zone_type VARCHAR(20) NOT NULL,
        pos_x INTEGER NOT NULL DEFAULT 0,
        pos_y INTEGER NOT NULL DEFAULT 0,
        width INTEGER NOT NULL DEFAULT 80,
        height INTEGER NOT NULL DEFAULT 40,
        display_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT ck_wh_zone_type CHECK (zone_type IN ('aisle', 'pallet')),
        CONSTRAINT ck_wh_zone_size_pos CHECK (width >= 1 AND height >= 1)
    )""",
    "CREATE INDEX IF NOT EXISTS ix_wh_zone_order ON warehouse_special_zones(display_order, id)",
    """CREATE TABLE IF NOT EXISTS warehouse_special_zone_items (
        id CHAR(36) PRIMARY KEY,
        zone_id INTEGER NOT NULL REFERENCES warehouse_special_zones(id) ON DELETE CASCADE,
        item_id CHAR(36) NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT ck_wh_zoneitem_qty_nonneg CHECK (quantity >= 0)
    )""",
    "CREATE INDEX IF NOT EXISTS ix_warehouse_special_zone_items_zone_id ON warehouse_special_zone_items(zone_id)",
    "CREATE INDEX IF NOT EXISTS ix_warehouse_special_zone_items_item_id ON warehouse_special_zone_items(item_id)",
    "CREATE INDEX IF NOT EXISTS ix_wh_zoneitem_item ON warehouse_special_zone_items(item_id)",
    """CREATE TABLE IF NOT EXISTS warehouse_special_zone_audits (
        id CHAR(36) PRIMARY KEY,
        zone_id INTEGER REFERENCES warehouse_special_zones(id) ON DELETE SET NULL,
        action VARCHAR(32) NOT NULL,
        actor_employee_id CHAR(36) REFERENCES employees(employee_id) ON DELETE SET NULL,
        actor_employee_code VARCHAR(30),
        actor_name VARCHAR(100),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""",
    "CREATE INDEX IF NOT EXISTS ix_warehouse_special_zone_audits_zone_id ON warehouse_special_zone_audits(zone_id)",
    "CREATE INDEX IF NOT EXISTS ix_warehouse_special_zone_audits_actor_employee_id ON warehouse_special_zone_audits(actor_employee_id)",
    # 2026-06-22: 모델별 기준 PF 지정 — 대시보드 칩 기준 수치 고정
    """CREATE TABLE IF NOT EXISTS model_pf_pins (
        model_symbol TEXT PRIMARY KEY,
        pf_item_id   CHAR(36) NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
        updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""",
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


def _rename_item_code_to_mes_code() -> None:
    """items.item_code → mes_code rename + snapshot 컬럼(stock_request_lines, io_lines)
    의 item_code_snapshot → mes_code_snapshot. 멱등.

    `_consolidate_item_code_columns()` 와 동일 패턴. fresh DB 는 create_all 이 이미
    mes_code 로 만들지만, _MIGRATION_DDL 의 historical "ADD COLUMN erp_code" →
    _consolidate 가 (item_code 없음 분기에서) item_code 유령을 다시 만든다. 그 유령을
    여기서 정리한다. 반드시 run_migrations 의 맨 끝(모든 item_code 생성 헬퍼 이후)에서 호출.
    """
    def _cols(conn, table: str) -> set[str]:
        return {r[1] for r in conn.execute(text(f"PRAGMA table_info({table})"))}

    with engine.connect() as conn:
        items_ddl = (conn.execute(text(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='items'"
        )).scalar() or "")
        # 생성열 mes_code 는 PRAGMA table_info 에 안 잡히므로 DDL 로 판별한다.
        # (create_all 이 mes_code 를 GENERATED 로 만든 fresh DB 케이스.)
        mes_generated = "GENERATED" in items_ddl.upper()
        items_cols = _cols(conn, "items")
        if mes_generated:
            # mes_code 가 이미 생성열 — rename 불필요. historical item_code 유령만 제거.
            if "item_code" in items_cols:
                conn.execute(text("DROP INDEX IF EXISTS ix_items_item_code"))
                conn.execute(text("ALTER TABLE items DROP COLUMN item_code"))
        elif "item_code" in items_cols:
            conn.execute(text("DROP INDEX IF EXISTS ix_items_item_code"))
            conn.execute(text("DROP INDEX IF EXISTS ix_items_mes_code"))
            if "mes_code" in items_cols:
                # 두 컬럼 공존: fresh DB(create_all 이 mes_code 생성)에 historical 체인이
                # item_code 유령을 다시 만든 케이스. item_code 가 모두 NULL 이면 유령 → DROP.
                item_non_null = conn.execute(
                    text("SELECT COUNT(*) FROM items WHERE item_code IS NOT NULL")
                ).scalar()
                if item_non_null == 0:
                    conn.execute(text("ALTER TABLE items DROP COLUMN item_code"))
                else:
                    conn.execute(text("ALTER TABLE items DROP COLUMN mes_code"))
                    conn.execute(text("ALTER TABLE items RENAME COLUMN item_code TO mes_code"))
            else:
                conn.execute(text("ALTER TABLE items RENAME COLUMN item_code TO mes_code"))
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_items_mes_code ON items(mes_code)"
            ))
        # snapshot 컬럼 — 동일 패턴 (fresh DB 는 create_all 이 mes_code_snapshot 로 생성)
        for table in ("stock_request_lines", "io_lines"):
            cols = _cols(conn, table)
            if "item_code_snapshot" in cols and "mes_code_snapshot" not in cols:
                conn.execute(text(
                    f"ALTER TABLE {table} RENAME COLUMN item_code_snapshot TO mes_code_snapshot"
                ))
        conn.commit()


def _drop_unused_item_columns() -> None:
    """spec / barcode / legacy_file_type — 미사용 컬럼 제거. 멱등."""
    to_drop = {"spec", "barcode", "legacy_file_type"}
    with engine.connect() as conn:
        cols = {r[1] for r in conn.execute(text("PRAGMA table_info(items)"))}
        for col in to_drop:
            if col in cols:
                conn.execute(text(f"DROP INDEX IF EXISTS ix_items_{col}"))
                conn.execute(text(f"ALTER TABLE items DROP COLUMN {col}"))
        conn.commit()


def _drop_dead_m1_objects() -> None:
    """2026-04-17 M1 커밋 잔재 3종 제거 (variance_logs / process_flow_rules / items.symbol_slot).

    - variance_logs : INSERT 코드 0건. 단순 DROP TABLE.
    - process_flow_rules : 프론트 사용 0건. 17줄은 docs/legacy-process-flow-rules.md 에 보존.
    - items.symbol_slot : FK(→ product_symbols.slot) 때문에 DROP COLUMN 불가 →
      테이블 재생성. items 컬럼 정의는 backend/app/models/item.py 기준.

    items 는 자식 FK 가 많아 PRAGMA foreign_keys=OFF 를 _트랜잭션 밖_에서 적용해야 한다.
    SQLAlchemy connection 으로는 statement 실행 시점이 이미 BEGIN 안이라 효과가 없으므로
    raw DBAPI connection + 명시적 BEGIN/COMMIT 으로 처리. 멱등 — 이미 정리된 환경이면 NO-OP.
    """
    raw = engine.raw_connection()
    try:
        cur = raw.cursor()
        # 멱등 short-circuit — 현재 상태 점검
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name IN ('variance_logs','process_flow_rules')"
        )
        dead_tables = [r[0] for r in cur.fetchall()]
        cur.execute("PRAGMA table_info(items)")
        item_cols = [r[1] for r in cur.fetchall()]
        has_symbol_slot = "symbol_slot" in item_cols
        if not dead_tables and not has_symbol_slot:
            cur.close()
            return

        # FK 비활성 (트랜잭션 밖에서만 적용됨)
        cur.execute("PRAGMA foreign_keys=OFF")
        try:
            cur.execute("BEGIN")
            for tbl in dead_tables:
                cur.execute(f"DROP TABLE {tbl}")
            if has_symbol_slot:
                cur.execute("DROP INDEX IF EXISTS ix_items_symbol_slot")
                cur.execute("""
                    CREATE TABLE items_new (
                        item_id UUID NOT NULL,
                        item_name VARCHAR(200) NOT NULL,
                        sort_order INTEGER,
                        unit VARCHAR(20) NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
                        legacy_part VARCHAR(50),
                        legacy_item_type VARCHAR(50),
                        supplier VARCHAR(200),
                        min_stock NUMERIC(15, 4),
                        model_symbol VARCHAR(20),
                        process_type_code VARCHAR(2),
                        serial_no INTEGER,
                        bom_completed_at DATETIME,
                        item_code VARCHAR(40),
                        deleted_at DATETIME,
                        PRIMARY KEY (item_id),
                        FOREIGN KEY(process_type_code) REFERENCES process_types (code)
                    )
                """)
                cur.execute("""
                    INSERT INTO items_new
                        (item_id, item_name, sort_order, unit, created_at, updated_at,
                         legacy_part, legacy_item_type, supplier, min_stock,
                         model_symbol, process_type_code, serial_no,
                         bom_completed_at, item_code, deleted_at)
                    SELECT item_id, item_name, sort_order, unit, created_at, updated_at,
                           legacy_part, legacy_item_type, supplier, min_stock,
                           model_symbol, process_type_code, serial_no,
                           bom_completed_at, item_code, deleted_at
                    FROM items
                """)
                cur.execute("DROP TABLE items")
                cur.execute("ALTER TABLE items_new RENAME TO items")
                cur.execute(
                    "CREATE INDEX IF NOT EXISTS ix_items_process_type_code ON items (process_type_code)"
                )
                cur.execute(
                    "CREATE INDEX IF NOT EXISTS ix_items_model_symbol ON items (model_symbol)"
                )
                cur.execute(
                    "CREATE INDEX IF NOT EXISTS ix_items_sort_order ON items (sort_order)"
                )
                cur.execute(
                    "CREATE INDEX IF NOT EXISTS ix_items_legacy_part ON items (legacy_part)"
                )
                cur.execute(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_items_item_code ON items(item_code)"
                )
            cur.execute("COMMIT")
        except Exception:
            cur.execute("ROLLBACK")
            raise
        finally:
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()
    finally:
        raw.close()


def _unify_quantity_columns_to_integer() -> None:
    """수량 컬럼 선언타입 NUMERIC(15,4)/REAL → INTEGER 통일 (스키마 진실화).

    앱은 이미 IntQuantity 로 쓰기 시점 int 강제 — 이 함수는 기존 DB 선언타입만 모델과
    일치시킨다(동작 변화 없음). fresh DB 는 create_all 이 이미 INTEGER 라 전부 NO-OP.
    items 등 자식 FK 많은 테이블 포함 → _drop_dead_m1_objects 와 동일하게 raw_connection +
    PRAGMA foreign_keys=OFF(트랜잭션 밖). 현재 sqlite_master DDL 을 읽어 수량 컬럼 타입만 치환
    → ORM 드리프트(없던 FK·중복 인덱스) 회피. 멱등 — 대상 컬럼이 이미 INTEGER 면 스킵.
    """
    import re

    qty_cols = {
        "items": {"min_stock"},
        "bom": {"quantity"},
        "inventory": {"quantity", "warehouse_qty", "pending_quantity"},
        "inventory_locations": {"quantity"},
        "transaction_logs": {"quantity_change", "quantity_before", "quantity_after", "transfer_qty"},
        "io_bundles": {"quantity"},
        "io_lines": {"quantity", "bom_expected", "shortage"},
        "stock_request_lines": {"quantity"},
    }
    # io_lines 는 stock_request_lines.operation_line_id 가 참조 → 먼저. items 는 자식 7개라 마지막.
    order = [
        "bom", "inventory", "inventory_locations", "transaction_logs",
        "io_bundles", "io_lines", "stock_request_lines", "items",
    ]

    # 0) 소수 수량 올림(ceil) — 정수 전용 정책 위반 데이터 정리. 타입 재생성보다 먼저 해야
    #    INTEGER 컬럼에 REAL 값(0.1 등)이 잔류하지 않는다. 멱등(소수 없으면 NO-OP).
    with engine.begin() as conn:
        for tbl, cols in qty_cols.items():
            for col in cols:
                conn.execute(text(
                    f"UPDATE {tbl} SET {col} = CAST({col} AS INTEGER) + "
                    f"(CASE WHEN {col} > CAST({col} AS INTEGER) THEN 1 ELSE 0 END) "
                    f"WHERE {col} IS NOT NULL AND {col} <> CAST({col} AS INTEGER)"
                ))

    raw = engine.raw_connection()
    try:
        cur = raw.cursor()
        for table in order:
            cur.execute(f"PRAGMA table_info({table})")
            info = [(r[1], (r[2] or "")) for r in cur.fetchall()]
            if not info:
                continue  # 테이블 부재(방어)
            targets = qty_cols[table]
            need = [c for c, t in info if c in targets and t.strip().upper() != "INTEGER"]
            if not need:
                continue  # 이미 INTEGER → 멱등 스킵

            cur.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,))
            create_sql = cur.fetchone()[0]
            cur.execute(
                "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL",
                (table,),
            )
            index_sqls = [r[0] for r in cur.fetchall()]

            typed_sql = create_sql
            for col in need:
                typed_sql = re.sub(
                    rf"(\b{re.escape(col)}\b\s+)(NUMERIC\s*\(\s*\d+\s*,\s*\d+\s*\)|REAL)",
                    r"\1INTEGER",
                    typed_sql,
                )
            if typed_sql == create_sql:
                # 대상 컬럼이 변환 가능한 타입(NUMERIC/REAL)이 아님 → 불필요한 재생성 방지, 스킵
                continue
            new_create = re.sub(
                rf'CREATE TABLE\s+(?:IF NOT EXISTS\s+)?("?){re.escape(table)}\1',
                f"CREATE TABLE {table}_new",
                typed_sql,
                count=1,
            )

            allcols = ", ".join(f'"{c}"' for c, _ in info)

            cur.execute("PRAGMA foreign_keys=OFF")
            try:
                cur.execute("BEGIN")
                cur.execute(new_create)
                cur.execute(f"INSERT INTO {table}_new ({allcols}) SELECT {allcols} FROM {table}")
                cur.execute(f"DROP TABLE {table}")
                cur.execute(f"ALTER TABLE {table}_new RENAME TO {table}")
                for isql in index_sqls:
                    cur.execute(isql)
                violations = cur.execute("PRAGMA foreign_key_check").fetchall()
                if violations:
                    raise RuntimeError(f"foreign_key_check 위반(after {table} rebuild): {violations}")
                cur.execute("COMMIT")
            except Exception:
                cur.execute("ROLLBACK")
                raise
            finally:
                cur.execute("PRAGMA foreign_keys=ON")
        cur.close()
    finally:
        raw.close()


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


def _drop_option_codes() -> None:
    """option_codes 마스터 + items.option_code 컬럼 제거. 멱등.

    items.option_code 는 FK 없는 단순 VARCHAR(10) → SQLite 의 DROP COLUMN
    직접 사용 가능 (3.35+). 테이블 재생성 불필요.
    """
    with engine.connect() as conn:
        conn.execute(text("DROP TABLE IF EXISTS option_codes"))
        cols = {r[1] for r in conn.execute(text("PRAGMA table_info(items)"))}
        if "option_code" in cols:
            conn.execute(text("ALTER TABLE items DROP COLUMN option_code"))
        conn.commit()


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


def _normalize_bom_uuid() -> None:
    """bom.bom_id 의 hyphen 포함 행을 no-hyphen hex 로 일괄 정규화.

    배경: PostgreSQL UUID dialect 가 SQLite 에서 no-hyphen hex(32자)로 바인딩하는데,
    일부 행이 hyphen 포함 36자 형식으로 삽입됨 → ORM filter 가 해당 행을 찾지 못해
    BOM 삭제·수정이 404 로 실패. 전체 18 테이블 조사 결과 bom.bom_id 만 영향.
    멱등 — hyphen 포함 행이 없으면 NO-OP.
    """
    with engine.connect() as conn:
        count = conn.execute(
            text("SELECT COUNT(*) FROM bom WHERE bom_id LIKE '%-%'")
        ).scalar()
        if not count:
            return
        conn.execute(text(
            "UPDATE bom SET bom_id = replace(bom_id, '-', '') WHERE bom_id LIKE '%-%'"
        ))
        conn.commit()


def _promote_model_9() -> None:
    """제품 모델 "9" 등록 — slot 6 예약행 승격 + 순수 "9-…" 품목 model_symbol 백필.

    기존 DB 는 product_symbols 가 이미 시드되어 seed_reference_data 가 스킵하므로
    (시드는 빈 테이블에만 동작) 여기서 slot 6 을 승격한다. Part A 의 items 재생성
    (model_symbol NOT NULL) 보다 **먼저** 실행해야 model_symbol IS NULL 2건이
    NOT NULL 위반을 일으키지 않는다. 멱등 — 이미 승격/백필된 환경이면 UPDATE 0행.
    """
    with engine.connect() as conn:
        conn.execute(text(
            "UPDATE product_symbols "
            "SET symbol='9', model_name='신제품', is_reserved=0 "
            "WHERE slot=6 AND symbol IS NULL"
        ))
        conn.execute(text(
            "UPDATE items SET model_symbol='9' "
            "WHERE model_symbol IS NULL AND mes_code LIKE '9-%'"
        ))
        conn.commit()


def _recreate_items_with_generated_mes_code() -> None:
    """items.mes_code 를 STORED generated 컬럼으로 전환 + 분해필드 NOT NULL + min_stock CHECK.

    SQLite 는 기존 컬럼을 generated 로 ALTER 못 함 → 테이블 재생성(_drop_dead_m1_objects 패턴:
    raw_connection + PRAGMA foreign_keys=OFF(트랜잭션 밖) + 명시 BEGIN/COMMIT).
    멱등 — items DDL 에 GENERATED 가 이미 있으면 NO-OP.
    선행: _promote_model_9 (model_symbol NULL=0). items 재생성기 중 마지막에 실행.
    컬럼 정의는 현행 mes.db DDL 기준(min_stock INTEGER — 수량 정수화 반영).
    생성열 mes_code 는 INSERT 컬럼 목록에서 제외 — SQLite 가 분해필드에서 계산한다.
    """
    if engine.dialect.name != "sqlite":
        return
    raw = engine.raw_connection()
    try:
        cur = raw.cursor()
        row = cur.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='items'"
        ).fetchone()
        if row is None:
            cur.close()
            return
        if "GENERATED" in (row[0] or "").upper():
            cur.close()
            return
        cur.execute("PRAGMA foreign_keys=OFF")
        try:
            cur.execute("BEGIN")
            cur.execute(
                """
                CREATE TABLE items_new (
                    item_id UUID NOT NULL,
                    item_name VARCHAR(200) NOT NULL,
                    sort_order INTEGER,
                    unit VARCHAR(20) NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    legacy_part VARCHAR(50),
                    legacy_item_type VARCHAR(50),
                    supplier VARCHAR(200),
                    min_stock INTEGER,
                    model_symbol VARCHAR(20) NOT NULL,
                    process_type_code VARCHAR(2) NOT NULL,
                    serial_no INTEGER NOT NULL,
                    bom_completed_at DATETIME,
                    mes_code VARCHAR(40) GENERATED ALWAYS AS (
                        model_symbol || '-' || process_type_code || '-' || printf('%04d', serial_no)
                    ) STORED,
                    deleted_at DATETIME,
                    PRIMARY KEY (item_id),
                    CONSTRAINT ck_items_min_stock_nonneg CHECK (min_stock >= 0 OR min_stock IS NULL),
                    FOREIGN KEY(process_type_code) REFERENCES process_types (code)
                )
                """
            )
            cur.execute(
                """
                INSERT INTO items_new
                    (item_id, item_name, sort_order, unit, created_at, updated_at,
                     legacy_part, legacy_item_type, supplier, min_stock,
                     model_symbol, process_type_code, serial_no, bom_completed_at, deleted_at)
                SELECT item_id, item_name, sort_order, unit, created_at, updated_at,
                       legacy_part, legacy_item_type, supplier, min_stock,
                       model_symbol, process_type_code, serial_no, bom_completed_at, deleted_at
                FROM items
                """
            )
            cur.execute("DROP TABLE items")
            cur.execute("ALTER TABLE items_new RENAME TO items")
            cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_items_mes_code ON items(mes_code) WHERE deleted_at IS NULL")
            cur.execute("CREATE INDEX IF NOT EXISTS ix_items_process_type_code ON items (process_type_code)")
            cur.execute("CREATE INDEX IF NOT EXISTS ix_items_model_symbol ON items (model_symbol)")
            cur.execute("CREATE INDEX IF NOT EXISTS ix_items_sort_order ON items (sort_order)")
            cur.execute("CREATE INDEX IF NOT EXISTS ix_items_legacy_part ON items (legacy_part)")
            violations = cur.execute("PRAGMA foreign_key_check").fetchall()
            if violations:
                raise RuntimeError(f"foreign_key_check 위반(after items generated rebuild): {violations}")
            cur.execute("COMMIT")
        except Exception:
            cur.execute("ROLLBACK")
            raise
        finally:
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()
    finally:
        raw.close()


def _make_mes_code_global_unique() -> None:
    """ix_items_mes_code 를 부분 unique(WHERE deleted_at IS NULL) → 전체 unique 로 복원.

    소프트삭제된 mes_code 도 영구 점유해 같은 코드 재등록을 차단한다(이력 추적성). R2-5 회귀.
    멱등 — 이미 전체면 NO-OP. SQLite 전용(dev).
    next_serial_no 가 삭제 포함 전체 max+1 이라 정상 신규 등록은 영향 없음.
    """
    if engine.dialect.name != "sqlite":
        return
    with engine.connect() as conn:
        row = conn.execute(text(
            "SELECT sql FROM sqlite_master WHERE type='index' AND name='ix_items_mes_code'"
        )).fetchone()
        existing = (row[0] if row else "") or ""
        if existing and "WHERE" not in existing.upper():
            return  # 이미 전체 unique
        conn.execute(text("DROP INDEX IF EXISTS ix_items_mes_code"))
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_items_mes_code ON items(mes_code)"
        ))
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

    # spec/barcode/legacy_file_type — 미사용 컬럼 제거. 멱등.
    try:
        _drop_unused_item_columns()
    except Exception as exc:  # noqa: BLE001
        msg = f"[migrate] unused item columns drop failed: {exc}"
        errors.append(msg)
        logger.warning(msg, exc_info=False)

    # M1(2026-04-17) 잔재 3종 제거 — variance_logs / process_flow_rules /
    # items.symbol_slot. 멱등.
    try:
        _drop_dead_m1_objects()
    except Exception as exc:  # noqa: BLE001
        msg = f"[migrate] dead M1 objects drop failed: {exc}"
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

    # option_codes 마스터 + items.option_code 컬럼 폐기 — 사용자 결정. 멱등.
    try:
        _drop_option_codes()
    except Exception as exc:  # noqa: BLE001
        msg = f"[migrate] option codes drop failed: {exc}"
        errors.append(msg)
        logger.warning(msg, exc_info=False)

    # 2026-06-01: items.item_code → mes_code rename (+ snapshot 컬럼). 멱등.
    # 모든 item_code 생성 헬퍼(_consolidate_item_code_columns, _drop_dead_m1_objects)
    # 이후에 실행해야 안전하므로 run_migrations 의 맨 끝에서 호출.
    try:
        _rename_item_code_to_mes_code()
    except Exception as exc:  # noqa: BLE001
        msg = f"[migrate] item_code → mes_code rename failed: {exc}"
        errors.append(msg)
        logger.warning(msg, exc_info=False)

    # 2026-06-02: 수량 컬럼 선언타입 NUMERIC/REAL → INTEGER 정합 (스키마 진실화). 멱등.
    # 테이블 재생성을 동반하므로 모든 컬럼 rename 이후(맨 끝)에 실행.
    try:
        _unify_quantity_columns_to_integer()
    except Exception as exc:  # noqa: BLE001
        msg = f"[migrate] quantity column integer unify failed: {exc}"
        errors.append(msg)
        logger.warning(msg, exc_info=False)

    # 2026-06-02: bom.bom_id UUID 포맷 정규화 (hyphen → no-hyphen hex). 멱등.
    # PostgreSQL UUID dialect 가 no-hyphen hex 로 바인딩해 hyphen 포함 행을 찾지 못함
    # → BOM 자식 삭제·수정 404 실패 원인. 전체 테이블 조사 결과 bom.bom_id 만 영향.
    try:
        _normalize_bom_uuid()
    except Exception as exc:  # noqa: BLE001
        msg = f"[migrate] bom UUID normalize failed: {exc}"
        errors.append(msg)
        logger.warning(msg, exc_info=False)

    # 2026-06-02: 제품 모델 "9" 정식 등록 — slot 6 예약행 승격 + 순수 "9-…" 품목 백필.
    # 아래 생성열 재생성(model_symbol NOT NULL) 보다 반드시 먼저. 멱등.
    try:
        _promote_model_9()
    except Exception as exc:  # noqa: BLE001
        msg = f"[migrate] model '9' promote/backfill failed: {exc}"
        errors.append(msg)
        logger.warning(msg, exc_info=False)

    # 2026-06-02: items.mes_code → STORED generated 컬럼 + 분해필드 NOT NULL + min_stock CHECK.
    # 진실소스 단일화(드리프트 원천 차단). 테이블 재생성 동반 → items 재생성기 중 맨 끝에서 실행. 멱등.
    try:
        _recreate_items_with_generated_mes_code()
    except Exception as exc:  # noqa: BLE001
        msg = f"[migrate] items generated mes_code recreation failed: {exc}"
        errors.append(msg)
        logger.warning(msg, exc_info=False)

    # ix_items_mes_code 부분 unique(deleted_at IS NULL) → 전체 unique 복원.
    # 소프트삭제된 mes_code 도 영구 점유해 재사용 차단(R2-5 회귀). items 재생성 이후 실행. 멱등.
    try:
        _make_mes_code_global_unique()
    except Exception as exc:  # noqa: BLE001
        msg = f"[migrate] mes_code global unique restore failed: {exc}"
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
