---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/migrations/_archive/migrate_ba_to_aa.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# migrate_ba_to_aa.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/migrations/_archive/migrate_ba_to_aa.py]]

## 원본 첫 줄 (또는 메타)

```
"""BA → AA 마이그레이션 스크립트.

기존 DB의 category='BA', process_type_code='BA' 데이터를 'AA'로 변경한다.
erp_code에 '-BA-' 패턴이 있으면 '-AA-'로 교체한다.

사용법:
  dry-run (기본):  python scripts/migrate_ba_to_aa.py
  실제 적용:       python scripts/migrate_ba_to_aa.py --apply
"""

import argparse
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[2] / "backend" / "erp.db"


def main(apply: bool) -> None:
    if not DB_PATH.exists():
        print(f"[ERROR] DB 파일 없음: {DB_PATH}")
        sys.exit(1)

    if apply:
```
