---
type: code-note
project: DEXCOWIN MES
layer: backend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/archive_old_logs.py
tags: [vault, code-note, auto-generated, stub]
---

# archive_old_logs.py

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/backend/archive_old_logs.py]]

## 원본 첫 줄

```
"""
거래 이력 아카이빙 스크립트.

6개월 이상 된 TransactionLog 레코드를 archived_at 필드로 마킹한다.
실제 삭제는 하지 않으므로 감사 목적으로 데이터는 보존된다.
API의 include_archived=false(기본값) 조건으로 일반 조회에서는 제외된다.

사용법:
    python archive_old_logs.py              # 6개월 이상, 실제 반영
    python archive_old_logs.py --months 12  # 12개월 이상
    python archive_old_logs.py --dry-run    # 대상 건수만 출력 (반영 안 함)
"""

import argparse
from datetime import datetime, timedelta

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.database import SessionLocal
from app.models import TransactionLog


def archive(months: int, dry_run: bool) -> None:
    cutoff = datetime.utcnow() - timedelta(days=30 * months)
    db = SessionLocal()
    try:
        q = db.query(TransactionLog).filter(
```
