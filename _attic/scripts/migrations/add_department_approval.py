"""StockRequest 부서 결재 컬럼 추가 마이그레이션.

변경 내용:
  1. stock_requests.requires_department_approval BOOLEAN NOT NULL DEFAULT 0
  2. stock_requests.department_approved_by_employee_id (UUID FK, NULL 허용)
  3. stock_requests.department_approved_by_name TEXT NULL
  4. stock_requests.department_approved_at DATETIME NULL

실행: python scripts/migrations/add_department_approval.py
멱등: 두 번 실행해도 안전.
"""

import sqlite3
import sys
from pathlib import Path

DB_PATH = Path(__file__).parent.parent.parent / "backend" / "erp.db"

COLUMNS = [
    (
        "requires_department_approval",
        "ALTER TABLE stock_requests ADD COLUMN requires_department_approval BOOLEAN NOT NULL DEFAULT 0",
    ),
    (
        "department_approved_by_employee_id",
        "ALTER TABLE stock_requests ADD COLUMN department_approved_by_employee_id CHAR(32)",
    ),
    (
        "department_approved_by_name",
        "ALTER TABLE stock_requests ADD COLUMN department_approved_by_name VARCHAR(100)",
    ),
    (
        "department_approved_at",
        "ALTER TABLE stock_requests ADD COLUMN department_approved_at DATETIME",
    ),
]


def run() -> None:
    if not DB_PATH.exists():
        print(f"[오류] DB 파일을 찾을 수 없습니다: {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    print("=== StockRequest 부서 결재 컬럼 마이그레이션 시작 ===")

    existing_cols = {row[1] for row in cur.execute("PRAGMA table_info(stock_requests)").fetchall()}
    added = 0
    skipped = 0
    for col_name, sql in COLUMNS:
        if col_name in existing_cols:
            print(f"   - {col_name}: 이미 존재 - 스킵")
            skipped += 1
        else:
            cur.execute(sql)
            print(f"   - {col_name}: 추가 완료")
            added += 1

    print(f"[요약] 추가 {added}개, 스킵 {skipped}개")

    # 검증
    new_cols = {row[1] for row in cur.execute("PRAGMA table_info(stock_requests)").fetchall()}
    for col_name, _ in COLUMNS:
        assert col_name in new_cols, f"{col_name} 추가 실패"
    print("[검증] 4개 컬럼 모두 확인됨")

    conn.commit()
    conn.close()
    print("=== 마이그레이션 완료 ===")


if __name__ == "__main__":
    run()
