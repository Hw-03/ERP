---
type: file-explanation
source_path: "backend/sync_excel_stock.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# sync_excel_stock.py — sync_excel_stock.py 설명

## 이 파일은 무엇을 책임지나

`sync_excel_stock.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/sync_excel_stock.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `normalize_text`
- `to_decimal`
- `to_number`
- `load_master_rows`
- `apply_metadata`
- `queue_rows`
- `consume_match`
- `sum_row_cells`
- `load_stock_updates`
- `sync`

## 연결되는 파일

- [[ERP/backend/📁_backend]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

큰 위험은 낮지만, 연결된 파일과 실행 위치를 확인한 뒤 수정하는 편이 안전합니다.

## 핵심 발췌

```python
"""
Sync legacy metadata and current stock from Excel workbooks into backend/mes.db.

Usage:
    python backend/sync_excel_stock.py
    cd backend && python sync_excel_stock.py
"""

from __future__ import annotations

import csv
import os
import re
import sys
from collections import Counter, defaultdict
from decimal import Decimal
from pathlib import Path

from openpyxl import load_workbook


BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"
CSV_PATH = DATA_DIR / "ERP_Master_DB.csv"
SQLITE_PATH = BACKEND_DIR / "mes.db"

sys.path.insert(0, str(BACKEND_DIR))
os.environ["DATABASE_URL"] = f"sqlite:///{SQLITE_PATH.as_posix()}"

from app.database import SessionLocal
from app.models import Inventory, Item


PROCESS_TYPE_TO_FILE_TYPE: dict[str, str] = {
    "TR": "원자재", "HR": "원자재", "VR": "원자재",
    "NR": "원자재", "AR": "원자재", "PR": "원자재",
    "TA": "조립자재", "TF": "조립자재",
    "HA": "발생부자재", "HF": "발생부자재",
    "VA": "발생부자재", "VF": "발생부자재",
    "NA": "조립자재", "NF": "조립자재",
    "AA": "조립자재", "AF": "조립자재",
    "PA": "조립자재", "PF": "완제품",
}

PROCESS_TYPE_TO_PART: dict[str, str] = {
    "TR": "자재창고", "HR": "자재창고", "VR": "자재창고",
    "NR": "자재창고", "AR": "자재창고", "PR": "자재창고",
    "TA": "튜브파트", "TF": "튜브파트",
    "HA": "고압파트", "HF": "고압파트",
    "VA": "진공파트", "VF": "진공파트",
    "NA": "튜닝파트", "NF": "튜닝파트",
    "AA": "조립출하", "AF": "조립출하",
    "PA": "출하", "PF": "출하",
}
```
