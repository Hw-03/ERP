---
type: code-note
project: ERP
layer: scripts
source_path: scripts/migrations/add_invloc_check_5_5.py
status: active
updated: 2026-04-27
source_sha: f8b59b2d598f
tags:
  - erp
  - scripts
  - migration-script
  - py
---

# add_invloc_check_5_5.py

> [!summary] 역할
> 기존 데이터나 스키마를 새 기준에 맞추기 위해 한 번 실행하는 마이그레이션 스크립트다.

## 원본 위치

- Source: `scripts/migrations/add_invloc_check_5_5.py`
- Layer: `scripts`
- Kind: `migration-script`
- Size: `6610` bytes

## 연결

- Parent hub: [[scripts/migrations/migrations|scripts/migrations]]
- Related: [[scripts/scripts]]

## 읽는 포인트

- 실행 전 대상 DB/파일 경로를 확인한다.
- 운영 스크립트는 백업 여부와 되돌림 절차를 먼저 본다.

## 원본 발췌

````python
"""Phase 5.5-A: InventoryLocation 에 quantity >= 0 CheckConstraint 적용 + TransactionLog 복합 인덱스.

SQLite 는 ALTER ADD CONSTRAINT 미지원 → 테이블 재생성으로 적용.
인덱스는 SQLite 도 CREATE INDEX 즉시 가능.

이 스크립트는 idempotent — 여러 번 실행해도 안전.

사용:
    cd backend
    python ../scripts/migrations/add_invloc_check_5_5.py

5.6-A 보완:
- 백업: shutil.copy2 → sqlite3 backup API (WAL transaction-consistent)
- 재생성 후 status / updated_at 인덱스 보존
- PRAGMA foreign_key_check 추가 (integrity_check 와 함께)
- 실행 전 백엔드 종료 안내 + WAL checkpoint(TRUNCATE) 시도
"""

from __future__ import annotations

import sqlite3
import sys
import time
from datetime import datetime
from pathlib import Path

# Windows cp949 콘솔에서도 한글/em-dash 출력 가능하도록 utf-8 reconfigure.
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
DB_PATH = BACKEND_DIR / "erp.db"
BACKUP_DIR = BACKEND_DIR / "_backup"


def _backup() -> Path:
    """sqlite3 backup API 로 transaction-consistent 백업.

    shutil.copy2 는 WAL 모드에서 erp.db-wal 의 미flush 변경분이 누락될 수 있다.
    sqlite3.Connection.backup() 은 트랜잭션 단위 일관성을 보장하고 busy 시 자동 재시도한다.
    """
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dst = BACKUP_DIR / f"erp_PRE-MIG-5_5_{ts}.db"
    src = sqlite3.connect(DB_PATH)
    dst_conn = sqlite3.connect(dst)
    try:
        src.backup(dst_conn)
    finally:
        dst_conn.close()
        src.close()
    print(f"[MIG] backup → {dst} (sqlite3 backup API, WAL-safe)")
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

    print("[MIG] 백엔드(uvicorn) 가 실행 중이면 종료 후 진행하세요. 5초 후 계속...")
    time.sleep(5)

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys=ON")

    # WAL 잔여분 main DB 로 flush (busy 면 skip)
    try:
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        print("[MIG] PRAGMA wal_checkpoint(TRUNCATE) 적용")
    except sqlite3.OperationalError as exc:
        print(f"[MIG] wal_checkpoint skip — {exc}")

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
            CREATE INDEX IF NOT EXISTS ix_inventory_locations_status ON inventory_locations (status);
            CREATE INDEX IF NOT EXISTS ix_inventory_locations_updated_at ON inventory_locations (updated_at);
            COMMIT;
            """
        )
        conn.execute("PRAGMA foreign_keys=ON")
        print("[MIG] inventory_locations CHECK + 인덱스 4종 적용 완료")

    # 3) TransactionLog 복합 인덱스
    if _has_index(conn, "ix_tx_item_created"):
        print("[MIG] transaction_logs.ix_tx_item_created 이미 존재 — 스킵")
    else:
        conn.execute(
            "CREATE INDEX ix_tx_item_created ON transaction_logs (item_id, created_at)"
        )
        conn.commit()
        print("[MIG] transaction_logs ix_tx_item_created 생성")

    # 4) integrity_check + foreign_key_check
    res_int = conn.execute("PRAGMA integrity_check").fetchone()[0]
    fk_violations = conn.execute("PRAGMA foreign_key_check").fetchall()
    print(f"[MIG] PRAGMA integrity_check: {res_int}")
    print(f"[MIG] PRAGMA foreign_key_check: {len(fk_violations)} violation(s)")
    if fk_violations:
        for v in fk_violations[:10]:
            print(f"        {v}")

    conn.close()
    if res_int != "ok":
        return 3
    if fk_violations:
        return 4
    return 0


if __name__ == "__main__":
    sys.exit(main())
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
