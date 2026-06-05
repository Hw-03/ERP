---
type: file-explanation
source_path: "backend/app/services/audit_csv.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# audit_csv.py — audit_csv.py 설명

## 이 파일은 무엇을 책임지나

`audit_csv.py`는 `audit_csv` 업무 규칙을 실제로 실행하는 Python 코드입니다. 라우터보다 안쪽에서 DB 조회와 변경을 담당합니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `get_csv_dir`
- `path_for_month`
- `_fmt_num`
- `row_from_log`
- `_append_rows`
- `_append_logs`
- `list_available_months`
- `backfill_all`
- `_collect_after_flush`
- `_emit_after_commit`
- 그 외 2개 항목

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.
- [[ERP/backend/app/schemas.py]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/database.py]] — `database.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/app/database.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 조심할 점

서비스는 DB 변경을 포함할 수 있습니다. 같은 도메인의 라우터, 모델, 테스트를 함께 확인해야 합니다.

## 핵심 발췌

```python
"""외부 심사 대응용 입출고 CSV 미러.

DB 의 `TransactionLog` 가 source-of-truth 이고, 이 모듈은 그 미러를 디스크에 떨군다.
- 자재 이동 거래(RECEIVE/SHIP/TRANSFER_*/ADJUST/SUPPLIER_RETURN/
  MARK_DEFECTIVE/DISASSEMBLE) 만 기록한다. 생산 내부 소비(PRODUCE/BACKFLUSH)는 제외.
- 월별 CSV (`inout_YYYY-MM.csv`) 에 거래 1건 = 1줄로 append.
- `created_at` 기준으로 파일이 결정되므로 월말 자정 경계도 자연스럽게 분기된다.
- 트랜잭션이 commit 된 직후에만 append (롤백된 거래는 남지 않는다). 파일 IO 실패는
  거래 자체를 막지 않으며, 누락분은 `scripts/dev/backfill_audit_csv.py` 가 메운다.
"""

from __future__ import annotations

import csv
import logging
import os
import threading
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Iterable

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.database import BACKEND_DIR, SessionLocal
from app.models import Item, TransactionLog, TransactionTypeEnum

_log = logging.getLogger(__name__)


# 외부 로그에 포함할 거래 유형 — 자재 이동만.
AUDIT_TX_TYPES: frozenset[TransactionTypeEnum] = frozenset({
    TransactionTypeEnum.RECEIVE,
    TransactionTypeEnum.SHIP,
    TransactionTypeEnum.TRANSFER_TO_PROD,
    TransactionTypeEnum.TRANSFER_TO_WH,
    TransactionTypeEnum.TRANSFER_DEPT,
    TransactionTypeEnum.ADJUST,
    TransactionTypeEnum.SUPPLIER_RETURN,
    TransactionTypeEnum.MARK_DEFECTIVE,
    TransactionTypeEnum.DISASSEMBLE,
})


# 한글 라벨 — 본 모듈이 외부 제출용 단일 진실. 라우터의 `_TX_OP` 와 표현이 달라질
# 수 있으므로 의존하지 않고 자체 정의한다.
TX_TYPE_LABEL_KO: dict[str, str] = {
    "RECEIVE": "입고",
    "SHIP": "출고",
    "TRANSFER_TO_PROD": "창고→생산 이동",
    "TRANSFER_TO_WH": "생산→창고 이동",
    "TRANSFER_DEPT": "부서간 이동",
    "ADJUST": "수량 조정",
    "SUPPLIER_RETURN": "공급사 반품",
```
