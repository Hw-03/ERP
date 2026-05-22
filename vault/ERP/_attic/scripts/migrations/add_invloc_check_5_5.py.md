---
type: file-explanation
source_path: "_attic/scripts/migrations/add_invloc_check_5_5.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# add_invloc_check_5_5.py — add_invloc_check_5_5.py 설명

## 이 파일은 무엇을 책임지나

`add_invloc_check_5_5.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_backup`
- `_has_check_constraint`
- `_has_index`
- `_violations`
- `main`

## 연결되는 파일

- [[ERP/_attic/scripts/migrations/📁_migrations]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
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

# Windows cp949 콘솔에서도 한글/em-dash 출력 가능하도록 utf-8 reconfigure.
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
DB_PATH = BACKEND_DIR / "erp.db"
BACKUP_DIR = BACKEND_DIR / "_backup"


def _backup() -> Path:
    """sqlite3 backup API 로 transaction-consistent 백업.

    shutil.copy2 는 WAL 모드에서 erp.db-wal 의 미flush 변경분이 누락될 수 있다.
    sqlite3.Connection.backup() 은 트랜잭션 단위 일관성을 보장하고 busy 시 자동 재시도한다.
    """
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dst = BACKUP_DIR / f"erp_PRE-MIG-5_5_{ts}.db"
    src = sqlite3.connect(DB_PATH)
    dst_conn = sqlite3.connect(dst)
    try:
        src.backup(dst_conn)
    finally:
        dst_conn.close()
        src.close()
    print(f"[MIG] backup → {dst} (sqlite3 backup API, WAL-safe)")
```
