---
type: file-explanation
source_path: "backend/seed.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# seed.py — seed.py 설명

## 이 파일은 무엇을 책임지나

`seed.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/seed.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `parse_decimal`
- `csv_category_to_process_type`
- `infer_legacy_process_type`
- `infer_employee_level`
- `extract_legacy_init_db`
- `reset_core_tables`
- `seed_employees`
- `seed_from_legacy_html`
- `run_seed`
- `seed`

## 연결되는 파일

- [[ERP/backend/📁_backend]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""
Seed SQLite MES data from ERP_Master_DB.csv.

[레거시 부트스트랩 전용] — settings./reset 에서는 사용하지 않음.
운영 초기화는 app/services/seed_cleanup.py (722 정리본 기준) 를 사용.

Usage:
    python backend/seed.py
    cd backend && python seed.py
"""

from __future__ import annotations

import csv
import json
import os
import re
import sys
from argparse import ArgumentParser
from collections import Counter
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
CSV_PATH = PROJECT_ROOT / "data" / "ERP_Master_DB.csv"
SQLITE_PATH = BACKEND_DIR / "mes.db"
LEGACY_HTML_PATH = PROJECT_ROOT / "_legacy_import" / "inventory_v2.html"

sys.path.insert(0, str(BACKEND_DIR))
os.environ["DATABASE_URL"] = f"sqlite:///{SQLITE_PATH.as_posix()}"

from app.database import Base, SessionLocal, engine
from app.models import (
    BOM,
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    Item,
    LocationStatusEnum,
    TransactionLog,
)
from app.services.inventory import PROCESS_TYPE_TO_DEPT

# R 시리즈(원자재)는 창고 보관. A/F 시리즈는 부서 InventoryLocation에 적재.
_R_SERIES = {"TR", "HR", "VR", "NR", "AR", "PR"}


# CSV `category_code` 컬럼 (RM/TA/.../FG/UK 11개)을 process_type_code 18개로 매핑.
# category 컬럼은 제거됐으므로 process_type_code에 직접 채운다.
# RM은 legacy_part 기반으로 더 정확히 분기 (자재창고→TR / 고압파트→HR / 진공파트→VR / 튜닝파트→NR / 조립출하→AR / 출하→PR).
```
