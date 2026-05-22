---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/migrations/_archive/migrate_bf_to_af.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# migrate_bf_to_af.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/migrations/_archive/migrate_bf_to_af.py]]

## 원본 첫 줄 (또는 메타)

```
"""BF → AF 마이그레이션 스크립트.

기존 DB의 process_type_code='BF', category='BF' 데이터를 'AF'로 변경하고
누락 공정 코드(NR, NF, AF, PF)를 process_types 테이블에 추가한다.

사용법:
  dry-run (기본):  python scripts/migrations/migrate_bf_to_af.py
  실제 적용:       python scripts/migrations/migrate_bf_to_af.py --apply
"""

import argparse
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent.parent.parent / "backend" / "erp.db"

NEW_PROCESS_TYPES = [
    ("NR", "N", "R", 48, "튜닝 원자재"),
    ("NF", "N", "F", 52, "튜닝 F타입"),
    ("AF", "A", "F", 62, "조립 F타입"),
    ("PF", "P", "F", 72, "출하 F타입"),
]
```
