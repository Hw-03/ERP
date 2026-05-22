---
type: file-explanation
source_path: "scripts/ops/check_inventory_integrity.py"
importance: critical
layer: scripts
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# check_inventory_integrity.py — check_inventory_integrity.py 설명

## 이 파일은 무엇을 책임지나

`check_inventory_integrity.py`는 운영자가 백업, 복구, 헬스체크, 정합성 확인에 쓰는 운영 스크립트입니다.

## 업무 흐름에서의 의미

운영 중 장애 대응, 백업, 복구, 정합성 점검처럼 실제 데이터 안전과 연결됩니다.

## 언제 보면 좋나

- 운영 점검, 백업, 복구, 정합성 확인이 필요할 때
- 장애 대응 절차를 검토할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_f`
- `check_negative_inventory`
- `check_negative_locations`
- `check_pending_exceeds_warehouse`
- `check_total_mismatch`
- `check_stale_reserved`
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
"""재고 무결성 직접 점검 (서버 없이 DB 직접 접속).

사용법:
    # SQLite (기본)
    python scripts/ops/check_inventory_integrity.py

    # 환경변수로 DB URL 지정
    DATABASE_URL=postgresql://mes_user:mes_pass@localhost:5432/mes_db \
        python scripts/ops/check_inventory_integrity.py

    # --db-url 인수로 직접 지정
    python scripts/ops/check_inventory_integrity.py --db-url postgresql://...

종료 코드:
    0 = 전체 PASS
    1 = 위반 항목 있음
"""

import argparse
import os
import sys
from decimal import Decimal
from pathlib import Path

# backend를 sys.path에 추가
BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env")

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# --db-url 인수 파싱 (main() 이전에 수행해야 DATABASE_URL 오버라이드가 가능)
_parser = argparse.ArgumentParser(add_help=False)
_parser.add_argument("--db-url", dest="db_url", default=None)
_args, _ = _parser.parse_known_args()

DATABASE_URL = (
    _args.db_url
    or os.getenv("DATABASE_URL")
    or f"sqlite:///{(BACKEND_DIR / 'mes.db').as_posix()}"
)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
Session = sessionmaker(bind=engine)


def _f(val) -> Decimal:
    return Decimal(str(val)) if val is not None else Decimal("0")
```
