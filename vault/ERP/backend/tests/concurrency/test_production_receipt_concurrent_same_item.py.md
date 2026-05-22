---
type: file-explanation
source_path: "backend/tests/concurrency/test_production_receipt_concurrent_same_item.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_production_receipt_concurrent_same_item.py — test_production_receipt_concurrent_same_item.py 설명

## 이 파일은 무엇을 책임지나

`test_production_receipt_concurrent_same_item.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_setup`
- `_assert_clean_one_winner`
- `_assert_invariant_and_no_orphans`
- `test_concurrent_production_receipt_same_component_real_race`
- `test_concurrent_production_receipt_loser_late_value_error`

## 연결되는 파일

- [[ERP/backend/tests/concurrency/📁_concurrency]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""동시성 회귀 테스트 (WS9 / audit risk #3):

같은 부품을 소모하는 생산 입고(production receipt) 2건 경합 시:

  - 정확히 1건만 2xx, 나머지 1건은 깨끗한 4xx (422 STOCK_SHORTAGE) — 500/unhandled 아님
  - 처리 후 재고 불변식 유지 (quantity == warehouse_qty + Σ InventoryLocation)
    → services/integrity.check_inventory_consistency 재사용
  - 실패한 요청은 orphan TransactionLog 0건, 부분 배치 없음 (loser 의 쓰기 완전 롤백)

production.py receipt 경로(_explode_bom → 사전 가용성 검사 → consume_warehouse
원자적 가드 → PRODUCE 적재)를 HTTP 계층으로 통과시킨다.

두 가지 각도로 핀:
  1) test_..._real_race — 실제 2스레드 동시 HTTP 요청 (conftest 의 파일 기반
     SQLite + BEGIN IMMEDIATE 로 writer 직렬화). SQLite 자연 동작을 핀.
  2) test_..._loser_late_value_error — pre-check 를 둘 다 통과한 뒤 loser 의
     consume_warehouse 가 원자적 가드에서 ValueError 를 늦게 던지는 정확한
     시나리오를 결정적으로 재현. 라우터의 에러 매핑(audit 핵심)을 핀.

fixture(concurrent_engine / make_session)는 같은 디렉터리 conftest.py
(파일 기반 SQLite + NullPool + BEGIN IMMEDIATE)를 사용한다 — in-memory
StaticPool 로는 다중 연결 lock 경합이 재현되지 않으므로.
"""

from __future__ import annotations

import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.models import (
    BOM,
    Inventory,
    Item,
    TransactionLog,
    TransactionTypeEnum,
)


def _setup(make_session, component_wh_qty: Decimal):
    """완제품 P + 부품 C (BOM: P 1개당 C 1개). C 창고 재고 = component_wh_qty."""
    session = make_session()

    parent = Item(item_name="동시생산_완제품", process_type_code="TF", unit="EA")
    child = Item(item_name="동시생산_부품", process_type_code="TR", unit="EA")
    session.add_all([parent, child])
```
