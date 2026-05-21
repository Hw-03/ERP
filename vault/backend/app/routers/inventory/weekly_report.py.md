---
type: code-note
project: DEXCOWIN MES
layer: backend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/app/routers/inventory/weekly_report.py
tags: [vault, code-note, auto-generated, stub]
---

# weekly_report.py

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/backend/app/routers/inventory/weekly_report.py]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"""주간보고: GET /weekly-report — ?F 계열 품목의 주차별 재고 변화 집계."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Inventory, Item, ProductSymbol, TransactionLog, TransactionTypeEnum
from app.schemas import (
    WeeklyGroupReport,
    WeeklyItemReport,
    WeeklyProductionModelRow,
    WeeklyReportResponse,
    WeeklyReportSummary,
    WeeklyWarning,
)

from ._shared import PROCESS_TYPE_LABELS

router = APIRouter()

_F_CODES = ["TF", "HF", "VF", "NF", "AF", "PF"]

_PROD_CODES = ["TF", "HF", "VF", "NF", "AF", "PF"]
```
