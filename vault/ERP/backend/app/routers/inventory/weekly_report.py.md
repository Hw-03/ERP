---
type: file-explanation
source_path: "backend/app/routers/inventory/weekly_report.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# weekly_report.py — weekly_report.py 설명

## 이 파일은 무엇을 책임지나

`weekly_report.py`는 재고 업무 API 중 한 영역을 맡는 Python 코드입니다. 화면에서 들어온 요청을 검증하고 실제 재고 서비스로 넘기는 관문입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_load_model_symbols`
- `_resolve_model`
- `_current_week_bounds`
- `get_weekly_report`
- `API GET "/weekly-report"`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/services/inventory.py]] — 입고, 출고, 부서 이동, 불량 처리처럼 실제 재고 숫자를 바꾸는 업무 규칙을 담은 핵심 파일입니다.
- [[ERP/backend/app/services/stock_math.py]] — 여러 재고 숫자를 일관된 방식으로 계산하고 검증하기 위한 보조 함수입니다.
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.
- [[ERP/frontend/lib/api/inventory.ts]] — `inventory.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 조심할 점

API 응답 형식이나 상태 코드를 바꾸면 프론트 화면과 자동 테스트가 같이 영향을 받습니다.

## 핵심 발췌

```python
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

_DEPT_NAMES: dict[str, str] = {
    "TF": "튜브",
    "HF": "고압",
    "VF": "진공",
    "NF": "튜닝",
    "AF": "조립",
    "PF": "출하",
}

# 생산/입고 집계 타입
_IN_TYPES = {
    TransactionTypeEnum.RECEIVE,
    TransactionTypeEnum.PRODUCE,
}

# 출고/소비 집계 타입
_OUT_TYPES = {
    TransactionTypeEnum.SHIP,
    TransactionTypeEnum.BACKFLUSH,
}


def _load_model_symbols(db: Session) -> tuple[dict[str, str], list[str]]:
    """ProductSymbol 테이블에서 단일-글자 symbol → model_name 매핑과
```
