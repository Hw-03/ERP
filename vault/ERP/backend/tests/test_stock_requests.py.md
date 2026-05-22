---
type: file-explanation
source_path: "backend/tests/test_stock_requests.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_stock_requests.py — test_stock_requests.py 설명

## 이 파일은 무엇을 책임지나

`test_stock_requests.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_make_employee`
- `_create_request_via_api`
- `test_warehouse_to_dept_request_reserves_pending`
- `test_request_fails_when_not_enough_available`
- `test_multiline_request_rolls_back_when_one_line_short`
- `test_approve_consumes_pending_and_moves_stock`
- `test_warehouse_primary_self_approves_on_submit`
- `test_warehouse_deputy_self_approves_on_submit`
- `test_non_warehouse_requester_still_reserves`
- `test_reject_releases_pending`
- 그 외 8개 항목

## 연결되는 파일

- [[ERP/backend/tests/📁_tests]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""StockRequest 워크플로 테스트.

시나리오:
1. wh-to-dept 요청 생성 → pending 증가, warehouse_qty 불변, status=RESERVED
2. 가용 부족 → 422 응답, 점유 미생성
3. 다라인 중 1개 부족 → 전체 롤백
4. 승인 시 pending 차감 + 실재고 이동 + TransactionLog 기록
5. 반려 시 pending 원복
6. 본인 취소
7. DEPT_INTERNAL 즉시 처리 (자동 COMPLETED)
8. warehouse_role=none 직원 승인 시도 → 403
   추가: PIN 오류 / FAILED_APPROVAL / 완료 후 재처리 거부
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    LocationStatusEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services.pin_auth import DEFAULT_PIN_HASH, hash_pin


# ---------------------------------------------------------------------------
# 직원 헬퍼
# ---------------------------------------------------------------------------


def _make_employee(
    db_session,
    *,
    code: str,
    name: str,
    department: DepartmentEnum = DepartmentEnum.ASSEMBLY,
    warehouse_role: str = "none",
    level: EmployeeLevelEnum = EmployeeLevelEnum.STAFF,
    pin: str = "0000",
) -> Employee:
    emp = Employee(
        employee_code=code,
        name=name,
```
