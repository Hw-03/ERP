---
type: file-explanation
source_path: "backend/bootstrap_db.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# bootstrap_db.py — bootstrap_db.py 설명

## 이 파일은 무엇을 책임지나

`bootstrap_db.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/bootstrap_db.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_is_benign_migration_skip`
- `run_schema_create_all`
- `_consolidate_item_code_columns`
- `_drop_unused_item_columns`
- `_drop_dead_transaction_type_enum_values`
- `_cleanup_production_hierarchy`
- `_add_new_transaction_type_values`
- `run_migrations`
- `seed_reference_data`
- `backfill_item_codes`
- 그 외 5개 항목

## 연결되는 파일

- [[ERP/backend/📁_backend]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

큰 위험은 낮지만, 연결된 파일과 실행 위치를 확인한 뒤 수정하는 편이 안전합니다.

## 핵심 발췌

```python
"""
bootstrap_db.py — DB 스키마 / 마이그레이션 / 참조 데이터 / 품목코드 백필 통합 CLI.

FastAPI 앱 시작 시 자동 실행되던 부작용들을 여기로 옮겼다.
`uvicorn app.main:app` 만으로는 DB 가 변하지 않는다. 초기 설치 / 스키마 변경 /
시드 재적용이 필요한 시점에만 명시적으로 실행한다.

Usage:
    cd backend
    python bootstrap_db.py --all                # 스키마 + 마이그레이션 + 시드 + 품목코드 백필
    python bootstrap_db.py --schema --migrate   # DDL 관련만
    python bootstrap_db.py --seed               # 참조 데이터 (Employee/ProductSymbol/…)
    python bootstrap_db.py --item-code-backfill # item_code NULL 품목에 코드 부여
    python bootstrap_db.py --check              # 실행하지 않고 DB 상태만 점검

모듈로도 import 가능:
    from bootstrap_db import bootstrap_all, run_schema_create_all, run_migrations
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import text

from app.database import Base, SessionLocal, engine
from app.models import (
    Department,
    DepartmentEnum,
    Employee,
    EmployeeAssignedModel,  # noqa: F401 — metadata registration
    EmployeeLevelEnum,
    Item,
    OptionCode,
    ProcessFlowRule,
    ProcessType,
    ProductSymbol,
)
from app.services.pin_auth import DEFAULT_PIN_HASH
from app.utils.item_code import make_item_code

# bootstrap_db 는 uvicorn 밖에서 단독 실행되므로 setup_logging() 호출 없이도
# 동작해야 한다. 백엔드 표준 로거("mes") 네임스페이스를 그대로 쓰되,
# 핸들러 미설정 환경(=단독 CLI)에서도 메시지가 죽지 않도록 NullHandler 보강.
logger = logging.getLogger("mes")
if not logger.handlers:
    logger.addHandler(logging.NullHandler())
```
