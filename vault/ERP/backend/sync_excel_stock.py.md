---
type: code-note
project: ERP
layer: backend
source_path: erp/backend/sync_excel_stock.py
status: active
updated: 2026-04-27
source_sha: 265948b32528
tags:
  - erp
  - backend
  - source-file
  - py
---

# sync_excel_stock.py

> [!summary] 역할
> 원본 프로젝트의 `sync_excel_stock.py` 파일을 Obsidian에서 추적하기 위한 미러 노트다.

## 원본 위치

- Source: `backend/sync_excel_stock.py`
- Layer: `backend`
- Kind: `source-file`
- Size: `8666` bytes

## 연결

- Parent hub: [[backend/backend|backend]]
- Related: [[backend/backend]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

> 전체 260줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````python
"""
Sync legacy metadata and current stock from ERP Excel workbooks into backend/erp.db.

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
SQLITE_PATH = BACKEND_DIR / "erp.db"

sys.path.insert(0, str(BACKEND_DIR))
os.environ["DATABASE_URL"] = f"sqlite:///{SQLITE_PATH.as_posix()}"

from app.database import SessionLocal
from app.models import Inventory, Item


CATEGORY_TO_FILE_TYPE: dict[str, str] = {
# ... (이하 185줄 생략. 원본 참조)

````
