---
type: file-explanation
source_path: "backend/backup_db.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# backup_db.py — backup_db.py 설명

## 이 파일은 무엇을 책임지나

`backup_db.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/backup_db.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `backup`

## 연결되는 파일

- [[ERP/backend/📁_backend]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
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

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    suffix = f"_{label}" if label else ""
    dest = BACKUP_DIR / f"mes_backup{suffix}_{ts}.db"

    shutil.copy2(DB_SRC, dest)
    size_kb = dest.stat().st_size // 1024
    print(f"백업 완료: {dest.name} ({size_kb:,} KB)")

    if no_cleanup:
        return

    cutoff_ts = datetime.now().timestamp() - keep_days * 86400
    removed = 0
    for old in BACKUP_DIR.glob("mes_backup*.db"):
        if old == dest:
            continue
        if old.stat().st_mtime < cutoff_ts:
            old.unlink()
            removed += 1
            print(f"  오래된 백업 삭제: {old.name}")
    if removed:
        print(f"  총 {removed}개 삭제 ({keep_days}일 기준)")
```
