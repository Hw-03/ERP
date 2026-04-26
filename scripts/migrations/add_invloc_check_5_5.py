"""Phase 5.5-A: InventoryLocation 에 quantity >= 0 CheckConstraint 적용 + TransactionLog 복합 인덱스.

SQLite 는 ALTER ADD CONSTRAINT 미지원 → 테이블 재생성으로 적용.
인덱스는 SQLite 도 CREATE INDEX 즉시 가능.

이 스크립트는 idempotent — 여러 번 실행해도 안전.

사용:
    cd backend
    python ../scripts/migrations/add_invloc_check_5_5.py
"""

from __future__ import annotations

import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
DB_PATH = BACKEND_DIR / "erp.db"
BACKUP_DIR = BACKEND_DIR / "_backup"


def _backup() -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dst = BACKUP_DIR / f"erp_PRE-MIG-5_5_{ts}.db"
    shutil.copy2(DB_PATH, dst)
    print(f"[MIG] backup → {dst}")
    return dst


def _has_check_constraint(conn: sqlite3.Connection, table: str, fragment: str) -> bool:
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    return row is not None and fragment.lower() in (row[0] or "").lower()


def _has_index(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='index' AND name=?", (name,)
    ).fetchone()
    return row is not None


def _violations(conn: sqlite3.Connection) -> int:
    return conn.execute(
        "SELECT COUNT(*) FROM inventory_locations WHERE quantity < 0"
    ).fetchone()[0]


def main() -> int:
    if not DB_PATH.exists():
        print(f"[MIG] {DB_PATH} 없음 — bootstrap_db.py --schema 먼저 실행하세요.")
        return 1

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys=ON")

    # 1) 사전 검증
    bad = _violations(conn)
    if bad > 0:
        print(f"[MIG] inventory_locations 에 quantity<0 행 {bad}개 — 마이그 중단.")
        print("      reconcile 스크립트로 복구 후 재실행하세요.")
        conn.close()
        return 2

    # 2) CheckConstraint
    if _has_check_constraint(conn, "inventory_locations", "ck_invloc_quantity_nonneg"):
        print("[MIG] inventory_locations.ck_invloc_quantity_nonneg 이미 존재 — 스킵")
    else:
        _backup()
        print("[MIG] inventory_locations 테이블 재생성 (CheckConstraint 추가)")
        # 외래키 제약 끄고 임시 작업
        conn.execute("PRAGMA foreign_keys=OFF")
        conn.executescript(
            """
            BEGIN;
            CREATE TABLE inventory_locations__new (
                location_id CHAR(32) NOT NULL,
                item_id CHAR(32) NOT NULL,
                department VARCHAR(20) NOT NULL,
                status VARCHAR(20) NOT NULL,
                quantity NUMERIC(15, 4) NOT NULL DEFAULT 0,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (location_id),
                FOREIGN KEY(item_id) REFERENCES items (item_id) ON DELETE CASCADE,
                CONSTRAINT uq_invloc_item_dept_status UNIQUE (item_id, department, status),
                CONSTRAINT ck_invloc_quantity_nonneg CHECK (quantity >= 0)
            );
            INSERT INTO inventory_locations__new
                SELECT location_id, item_id, department, status, quantity, updated_at
                FROM inventory_locations;
            DROP TABLE inventory_locations;
            ALTER TABLE inventory_locations__new RENAME TO inventory_locations;
            CREATE INDEX IF NOT EXISTS ix_invloc_item ON inventory_locations (item_id);
            CREATE INDEX IF NOT EXISTS ix_invloc_dept ON inventory_locations (department);
            COMMIT;
            """
        )
        conn.execute("PRAGMA foreign_keys=ON")
        print("[MIG] inventory_locations CHECK 적용 완료")

    # 3) TransactionLog 복합 인덱스
    if _has_index(conn, "ix_tx_item_created"):
        print("[MIG] transaction_logs.ix_tx_item_created 이미 존재 — 스킵")
    else:
        conn.execute(
            "CREATE INDEX ix_tx_item_created ON transaction_logs (item_id, created_at)"
        )
        conn.commit()
        print("[MIG] transaction_logs ix_tx_item_created 생성")

    # 4) integrity_check
    res = conn.execute("PRAGMA integrity_check").fetchone()[0]
    print(f"[MIG] PRAGMA integrity_check: {res}")
    conn.close()
    return 0 if res == "ok" else 3


if __name__ == "__main__":
    sys.exit(main())
