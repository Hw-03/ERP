---
type: file-explanation
source_path: "_attic/scripts/migrations/add_department_role.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# add_department_role.py — add_department_role.py 설명

## 이 파일은 무엇을 책임지나

`add_department_role.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `run`

## 연결되는 파일

- [[ERP/_attic/scripts/migrations/📁_migrations]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
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
```
