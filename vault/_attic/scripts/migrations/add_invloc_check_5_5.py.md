---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/migrations/add_invloc_check_5_5.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# add_invloc_check_5_5.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/migrations/add_invloc_check_5_5.py]]

## 원본 첫 줄 (또는 메타)

```
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
```
