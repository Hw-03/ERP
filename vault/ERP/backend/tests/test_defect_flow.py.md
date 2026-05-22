---
type: file-explanation
source_path: "backend/tests/test_defect_flow.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_defect_flow.py — test_defect_flow.py 설명

## 이 파일은 무엇을 책임지나

`test_defect_flow.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_make_employee`
- `_make_defective_location`
- `test_quarantine_sets_defective_at_and_logs`
- `test_unquarantine_clears_defective_at_and_logs`
- `test_defect_scrap_via_stock_request`
- `test_defective_disassemble_keep_scrap`
- `test_defect_return_via_stock_request`
- `test_return_to_supplier_from_normal_production`
- `test_kpi_returns_counts`
- `test_locations_returns_defective_list`

## 연결되는 파일

- [[ERP/backend/tests/📁_tests]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""불량 처리 흐름 통합 테스트 — Phase 2.

시나리오:
1. 격리 (POST /api/defects/quarantine) → InventoryLocation DEFECTIVE, defective_at 채움, MARK_DEFECTIVE 로그
2. 정상복귀 (POST /api/defects/unquarantine) → defective_at NULL, UNMARK_DEFECTIVE 로그
3. 격리 → stock_request(DEFECT_SCRAP) 발의 → 부서 결재자 승인 → DEFECT_SCRAP 로그, 재고 차감
4. 격리 → submit_defective_disassemble(keep, scrap, keep) → DISASSEMBLE + RECEIVE×2 + DEFECT_SCRAP
5. R 정상 → stock_request(DEFECT_RETURN) 발의 → 부서 결재 승인 → SUPPLIER_RETURN 로그
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
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services.pin_auth import DEFAULT_PIN_HASH, hash_pin
from app.services import inventory as inventory_svc


# ---------------------------------------------------------------------------
# 픽스처 헬퍼
# ---------------------------------------------------------------------------


def _make_employee(
    db_session,
    *,
    code: str,
    name: str,
    department: DepartmentEnum = DepartmentEnum.ASSEMBLY,
    warehouse_role: str = "none",
    department_role: str = "none",
    level: EmployeeLevelEnum = EmployeeLevelEnum.STAFF,
    pin: str = "0000",
) -> Employee:
    emp = Employee(
        employee_code=code,
        name=name,
        role=f"{department.value}/사원",
        department=department.value if isinstance(department, DepartmentEnum) else department,
```
