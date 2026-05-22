---
type: file-explanation
source_path: "_attic/scripts/migrations/add_department_approval.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# add_department_approval.py — add_department_approval.py 설명

## 이 파일은 무엇을 책임지나

`add_department_approval.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

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
```
