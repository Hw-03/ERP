---
type: file-explanation
source_path: "scripts/ops/restore_db.py"
importance: critical
layer: scripts
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# restore_db.py — restore_db.py 설명

## 이 파일은 무엇을 책임지나

`restore_db.py`는 운영자가 백업, 복구, 헬스체크, 정합성 확인에 쓰는 운영 스크립트입니다.

## 업무 흐름에서의 의미

운영 중 장애 대응, 백업, 복구, 정합성 점검처럼 실제 데이터 안전과 연결됩니다.

## 언제 보면 좋나

- 운영 점검, 백업, 복구, 정합성 확인이 필요할 때
- 장애 대응 절차를 검토할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `restore_sqlite`
- `restore_postgres`
- `_run_integrity_check`
- `parse_args`
- `main`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/docs/operations/DAILY_OPERATION_CHECKLIST.md]] — `DAILY_OPERATION_CHECKLIST.md`는 프로젝트 기준이나 운영 방법을 설명하는 원본 문서입니다.
- [[ERP/docs/operations/INCIDENT_RESPONSE.md]] — `INCIDENT_RESPONSE.md`는 프로젝트 기준이나 운영 방법을 설명하는 원본 문서입니다.
- [[ERP/backend/app/services/integrity.py]] — `integrity.py`는 `integrity` 업무 규칙을 실제로 실행하는 Python 코드입니다. 라우터보다 안쪽에서 DB 조회와 변경을 담당합니다.

## 조심할 점

이 파일은 운영 데이터, 재고 수량, 승인 상태, DB 구조, 백업/복구 중 하나와 직접 연결됩니다. 수정 전에는 관련 테스트, 백업 여부, 연결 화면/API를 반드시 확인해야 합니다.

## 핵심 발췌

```python
#!/usr/bin/env python3
"""DB 복구 유틸리티.

사용법:
    # SQLite 파일 복구
    python scripts/ops/restore_db.py --sqlite outputs/backups/mes_20260508_120000.db --target backend/mes.db

    # PostgreSQL 덤프 복구 (Docker 컨테이너 기준)
    python scripts/ops/restore_db.py --postgres outputs/backups/mes_20260508_120000.sql --container <container>

    # 복구 후 무결성 자동 점검 (--check 플래그)
    python scripts/ops/restore_db.py --sqlite ... --check

주의:
    - 복구 전 현재 DB를 자동으로 .pre-restore 백업합니다.
    - PostgreSQL 복구는 기존 DB를 DROP → CREATE → psql import 합니다.
"""

import argparse
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path


BACKUP_DIR = Path(__file__).resolve().parents[2] / "outputs" / "backups"
PROJECT_ROOT = Path(__file__).resolve().parents[2]


def restore_sqlite(backup_path: str, target_path: str, run_check: bool) -> None:
    src = Path(backup_path).resolve()
    dst = Path(target_path).resolve()

    if not src.exists():
        print(f"❌ 백업 파일 없음: {src}")
        sys.exit(1)

    if dst.exists():
        pre_restore = dst.with_suffix(f".pre-restore.{datetime.now().strftime('%Y%m%d_%H%M%S')}.db")
        shutil.copy2(dst, pre_restore)
        print(f"  현재 DB 백업: {pre_restore}")

    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    size_kb = dst.stat().st_size // 1024
    print(f"✅ SQLite 복구 완료: {src.name} → {dst} ({size_kb} KB)")

    if run_check:
        _run_integrity_check(db_url=f"sqlite:///{dst}")


def restore_postgres(
    backup_path: str,
    container: str | None,
```
