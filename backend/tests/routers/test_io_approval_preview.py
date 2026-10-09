"""실제 미리보기의 승인 경로는 제출 판정과 같고 재고·원장을 쓰지 않는다."""
from decimal import Decimal
import uuid

import pytest

from app.models import DepartmentEnum, Employee, Inventory, InventoryLocation, TransactionLog


@pytest.mark.parametrize("code,source,special_active,expected", [
    ("AR", "department", True, "as_research"),
    ("AA", "department", True, "as_research"),
    ("HF", "department", True, "department"),
    ("AR", "department", False, "department"),
    ("AA", "department", False, "department"),
    ("HF", "department", False, "department"),
    ("AR", "warehouse", True, "warehouse"),
    ("AR", "warehouse", False, "warehouse"),
])
def test_preview_approval_kind_matches_real_submit_without_inventory_write(
    client, db_session, make_item, make_location,
    code: str, source: str, special_active: bool, expected: str,
) -> None:
    """비활성 전용 승인자도 0명으로 판정하고 제출 때 같은 경로를 재확인한다."""
    requester = Employee(employee_code=f"PREVIEW-{uuid.uuid4().hex[:8]}", name="요청자",
                         department=DepartmentEnum.AS, role="직원", is_active=True)
    special = Employee(employee_code=f"SPECIAL-{uuid.uuid4().hex[:8]}", name="전용 결재자",
                       department=DepartmentEnum.RESEARCH, role="직원", is_active=special_active,
                       as_research_approver=True)
    db_session.add_all([requester, special])
    item = make_item(process_type_code=code, warehouse_qty=Decimal("5"))
    department = DepartmentEnum.HIGH_VOLTAGE if code == "HF" else DepartmentEnum.ASSEMBLY
    make_location(item.item_id, department=department, quantity=Decimal("5"))
    db_session.flush()
    before = {
        model.__tablename__: [tuple(row) for row in db_session.execute(model.__table__.select()).all()]
        for model in (Inventory, InventoryLocation, TransactionLog)
    }
    payload = {"requester_employee_id": str(requester.employee_id), "work_type": "internal_use",
               "sub_type": "internal_use_out", "to_department": "AS"}
    response = client.post("/api/io/preview", json={**payload, "targets": [{
        "source_kind": "manual", "source_location": source, "item_id": str(item.item_id), "quantity": 1,
    }]})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["bundles"][0]["lines"][0]["approval_kind"] == expected
    assert {
        model.__tablename__: [tuple(row) for row in db_session.execute(model.__table__.select()).all()]
        for model in (Inventory, InventoryLocation, TransactionLog)
    } == before
    submitted = client.post("/api/io/submit", json={**payload, "bundles": result["bundles"]})
    assert submitted.status_code == 201, submitted.text
    assert {row["approval_kind"] for row in submitted.json()["stock_requests"]} == {expected}
