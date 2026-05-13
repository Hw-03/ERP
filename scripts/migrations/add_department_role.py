"""Employee.department_role 컬럼 추가 + 시드 마이그레이션.

변경 내용:
  1. employees.department_role 컬럼 추가 (없을 때만)
  2. 이필욱 = 'primary' (부서 정), 김건호 = 'deputy' (부서 부) 시드 업데이트
  3. 결과 검증 (현재 부서 결재 보유자 명단 출력)

실행: python scripts/migrations/add_department_role.py
멱등: 두 번 실행해도 안전.
"""

import sqlite3
import sys
from pathlib import Path

DB_PATH = Path(__file__).parent.parent.parent / "backend" / "erp.db"


def run() -> None:
    if not DB_PATH.exists():
        print(f"[오류] DB 파일을 찾을 수 없습니다: {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    print("=== Employee.department_role 마이그레이션 시작 ===")

    # 1. department_role 컬럼 추가 (없을 때만)
    existing_cols = {row[1] for row in cur.execute("PRAGMA table_info(employees)").fetchall()}
    if "department_role" not in existing_cols:
        cur.execute(
            "ALTER TABLE employees ADD COLUMN department_role TEXT NOT NULL DEFAULT 'none'"
        )
        print("[1/3] employees.department_role 컬럼 추가 완료 (default='none')")
    else:
        print("[1/3] employees.department_role 이미 존재 - 스킵")

    # 2. 시드 업데이트
    SEED = [("이필욱", "primary"), ("김건호", "deputy")]
    seed_updates = 0
    for name, role in SEED:
        result = cur.execute(
            "UPDATE employees SET department_role = ? WHERE name = ?",
            (role, name),
        )
        affected = result.rowcount
        seed_updates += affected
        print(f"   - {name} → '{role}': {affected}건 변경")
    print(f"[2/3] 시드 업데이트 완료 (총 {seed_updates}건)")

    # 3. 검증 — 부서 결재 보유자 명단
    rows = cur.execute(
        "SELECT name, employee_code, department_role FROM employees "
        "WHERE department_role != 'none' "
        "ORDER BY CASE department_role WHEN 'primary' THEN 0 WHEN 'deputy' THEN 1 ELSE 2 END, name"
    ).fetchall()
    print("[3/3] 부서 결재 보유자 명단:")
    if not rows:
        print("   (없음)")
    else:
        for name, code, role in rows:
            label = "정" if role == "primary" else "부" if role == "deputy" else role
            print(f"   - {name} ({code}): {label}")

    conn.commit()
    conn.close()
    print("=== 마이그레이션 완료 ===")


if __name__ == "__main__":
    run()
