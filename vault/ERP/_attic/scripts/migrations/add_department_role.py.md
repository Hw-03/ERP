---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/migrations/add_department_role.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# add_department_role.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/migrations/add_department_role.py]]

## 원본 첫 줄 (또는 메타)

```
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
```
