---
type: file-explanation
source_path: "backend/tests/routers/test_transactions_summary.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_transactions_summary.py — test_transactions_summary.py 설명

## 이 파일은 무엇을 책임지나

`test_transactions_summary.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_seed_log`
- `_seed_batch_log`
- `test_summary_empty_db`
- `test_summary_categorizes_by_transaction_type`
- `test_summary_search_filter_applies`
- `test_summary_transaction_types_filter`
- `test_summary_department_counts`
- `test_summary_department_filter`
- `test_list_department_filter`
- `test_summary_process_step_filter`
- 그 외 7개 항목

## 연결되는 파일

- [[ERP/backend/tests/routers/📁_routers]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""GET /api/inventory/transactions/summary — 입출고 내역 KPI 집계 endpoint 테스트.

list_transactions 와 동일한 필터를 받지만 row 가 아니라 카운트 4개만 반환한다.
화면에 로드된 100건이 아니라 조건 전체 기준 KPI 를 위해 추가됨.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from app.models import (
    Employee,
    IoBatch,
    ItemModel,
    ProductSymbol,
    TransactionLog,
    TransactionTypeEnum,
)


def _seed_log(db_session, item, tx_type: TransactionTypeEnum, qty: Decimal, notes: str = "") -> None:
    db_session.add(
        TransactionLog(
            item_id=item.item_id,
            transaction_type=tx_type,
            quantity_change=qty,
            quantity_before=Decimal("0"),
            quantity_after=qty,
            notes=notes,
        )
    )


def _seed_batch_log(
    db_session,
    item,
    tx_type: TransactionTypeEnum,
    qty: Decimal,
    *,
    to_department: str | None = None,
    from_department: str | None = None,
    sub_type: str = "produce",
    transfer_qty: Decimal | None = None,
) -> None:
    """IoBatch 가 붙은 거래. 부서 라벨은 COALESCE(to, from).

    sub_type: IoBatch.sub_type (기본 'produce'). 기존 호출부 기본값 유지.
    transfer_qty: TransactionLog.transfer_qty (기본 None).
    """
    suffix = uuid.uuid4().hex[:8]
    emp = Employee(
        employee_code=f"E{suffix}",
        name="테스트작업자",
        role="작업자",
```
