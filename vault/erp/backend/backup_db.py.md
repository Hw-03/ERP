---
type: code-note
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/backup_db.py
tags: [vault, code-note, b-tier]
---

# backup_db.py — SQLite DB 백업 스크립트

> [!summary] 역할
> mes.db를 타임스탬프 파일로 복사. 30일 이상 된 백업 자동 정리 옵션 제공. cron 예시 포함.

## 1. 이 파일의 역할
- DB_SRC: backend/mes.db 기본 경로
- BACKUP_DIR: 백업 저장 위치 (기본 backend/)
- backup() — 파일 복사 + 타임스탐프 추가 (mes_backup[_label]_YYYYMMDD_HHMMSS.db)
- 오래된 백업 자동 정리 (keep_days 설정값 기본 30일)

## 2. 실제 원본 위치
`backend/backup_db.py` — 약 60줄

## 3. 주요 import
```python
import argparse, shutil
from datetime import datetime
from pathlib import Path
```

## 4. 어디서 쓰이는지
- 수동 백업: python backup_db.py
- cron 일일 백업: 0 2 * * * cd /app && python backup_db.py --label nightly
- DAILY_OPERATION_CHECKLIST.md에서 지정된 아침 8시 전 점검
- 재해복구 시나리오

## 5. ⚠️ 위험 포인트
- **shutil.copy2는 동기 블로킹** — DB 파일이 매우 크면(GB급) 시간 소요
- 백업 중 다른 쓰기 트랜잭션 발생 시 inconsistency 가능 (SQLite WAL 모드라도)
- --keep-days와 --no-cleanup 동시 사용 시 cleanup 안 됨
- 타임스탐프 이름 충돌은 없지만 초 단위로 다중 실행 시 주의

## 6. 수정 전 체크
- python backup_db.py 실행 후 mes_backup_*.db 생성 확인
- --label nightly 옵션 후 mes_backup_nightly_*.db 생성 확인
- 30일 이상 된 파일 정리 로직 테스트 (--keep-days 조정)
