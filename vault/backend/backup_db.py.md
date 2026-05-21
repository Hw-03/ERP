---
type: code-note
project: DEXCOWIN MES
layer: backend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/backup_db.py
tags: [vault, code-note, auto-generated, stub]
---

# backup_db.py

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/backend/backup_db.py]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"""
SQLite DB 백업 스크립트.

기존 mes_backup_YYYYMMDD_HHMMSS.db 패턴을 유지한다.
30일 이상 된 백업 파일을 자동 정리하는 옵션을 제공한다.

사용법:
    python backup_db.py                    # 기본 백업
    python backup_db.py --label nightly    # mes_backup_nightly_20260514_020000.db
    python backup_db.py --keep-days 60     # 60일 이상 된 백업 정리 (기본 30)
    python backup_db.py --no-cleanup       # 오래된 백업 정리 안 함

cron 예시 (매일 새벽 2시):
    0 2 * * * cd /app && python backup_db.py --label nightly >> /var/log/backup.log 2>&1
"""

import argparse
import shutil
from datetime import datetime
from pathlib import Path


DB_SRC = Path(__file__).parent / "mes.db"
BACKUP_DIR = Path(__file__).parent


def backup(label: str, keep_days: int, no_cleanup: bool) -> None:
    if not DB_SRC.exists():
        print(f"[오류] DB 파일을 찾을 수 없습니다: {DB_SRC}")
        return
```
