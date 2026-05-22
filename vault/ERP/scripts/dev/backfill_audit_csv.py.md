---
type: code-note
project: DEXCOWIN MES
layer: scripts
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/scripts/dev/backfill_audit_csv.py
tags: [vault, code-note, auto-generated, stub]
---

# backfill_audit_csv.py

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/scripts/dev/backfill_audit_csv.py]]

## 원본 첫 줄

```
#!/usr/bin/env python3
"""외부 심사용 입출고 CSV 백필 / catch-up 스크립트.

DB 의 `TransactionLog` 를 기준으로 월별 CSV(`backend/data/audit_csv/inout_YYYY-MM.csv`)
를 재작성한다. Idempotent — 몇 번 실행해도 같은 결과.

사용법:
    # 기본 (기존 CSV 덮어쓰기)
    python scripts/dev/backfill_audit_csv.py

    # 저장 경로 override
    AUDIT_CSV_DIR=D:/audit python scripts/dev/backfill_audit_csv.py

    # PostgreSQL 운영 DB
    DATABASE_URL=postgresql://... python scripts/dev/backfill_audit_csv.py
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv  # noqa: E402
load_dotenv(BACKEND_DIR / ".env")

from app.database import SessionLocal  # noqa: E402
from app.services import audit_csv  # noqa: E402
```
