"""품목코드 기반 불량·정상 재작업 부서 라우팅 계약."""

from __future__ import annotations

import json
import uuid
from decimal import Decimal

import pytest
from sqlalchemy.orm import Query

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    LocationStatusEnum,
    ProcessType,
    RequestBucketEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services import sr_execution
from app.services import inv_transfer
from app.services.dept_adjustment import submit_normal_disassemble
from app.services.pin_auth import DEFAULT_PIN_HASH


def _employee(db_session, *, department: DepartmentEnum = DepartmentEnum.ASSEMBLY) -> Employee:
    employee = Employee(
        employee_code=f"AUTO-{uuid.uuid4().hex[:8]}",
        name="자동 부서 작업자",
        role=f"{department.value}/사원",
        department=department.value,
        level=EmployeeLevelEnum.STAFF,
        warehouse_role="none",
        display_order=0,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )
    db_session.add(employee)
    db_session.flush()
    return employee


def _production_quantity(db_session, item_id, department: DepartmentEnum) -> Decimal:
    location = db_session.query(InventoryLocation).filter_by(
        item_id=item_id,
        department=department,
        status=LocationStatusEnum.PRODUCTION,
    ).one()
    return Decimal(str(location.quantity))


def _set_total(db_session, item_id, quantity: Decimal) -> None:
    db_session.query(Inventory).filter_by(item_id=item_id).one().quantity = quantity
    db_session.flush()


def test_quarantine_rejects_forged_department_before_stock_change(
    client, db_session, make_item, make_location
):
    item = make_item(name="생산 격리", process_type_code="VR", warehouse_qty=Decimal("4"))
    make_location(
        item.item_id,
        department=DepartmentEnum.VACUUM,
        status=LocationStatusEnum.PRODUCTION,
        quantity=Decimal("3"),
    )
    _set_total(db_session, item.item_id, Decimal("7"))
    employee = _employee(db_session)
    db_session.commit()

    forged_production = client.post("/api/defects/quarantine", json={
        "item_id": str(item.item_id),
        "qty": "2",
        "source": "production",
        "source_dept": DepartmentEnum.ASSEMBLY.value,
        "target_dept": DepartmentEnum.ASSEMBLY.value,
        "reason_memo": "위조 부서",
        "actor_employee_id": str(employee.employee_id),
    })
    forged_warehouse = client.post("/api/defects/quarantine", json={
        "item_id": str(item.item_id),
        "qty": "1",
        "source": "warehouse",
        "source_dept": DepartmentEnum.VACUUM.value,
        "target_dept": DepartmentEnum.VACUUM.value,
        "reason_memo": "창고 위조 부서",
        "actor_employee_id": str(employee.employee_id),
    })

    assert forged_production.status_code == 422, forged_production.text
    assert forged_warehouse.status_code == 422, forged_warehouse.text
    assert _production_quantity(db_session, item.item_id, DepartmentEnum.VACUUM) == Decimal("3")
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().warehouse_qty == Decimal("4")


def test_quarantine_warehouse_uses_warehouse_target_and_exact_retry_is_idempotent(
    client, db_session, make_item
):
    item = make_item(name="창고 격리", process_type_code="TR", warehouse_qty=Decimal("4"))
    employee = _employee(db_session)
    payload = {
        "item_id": str(item.item_id),
        "qty": "2",
        "source": "warehouse",
        "target_dept": DepartmentEnum.WAREHOUSE.value,
        "reason_memo": "창고 정상 격리",
        "actor_employee_id": str(employee.employee_id),
        "client_request_id": "auto-department-exact-retry",
    }
    db_session.commit()

    first = client.post("/api/defects/quarantine", json=payload)
    second = client.post("/api/defects/quarantine", json=payload)

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().warehouse_qty == Decimal("2")


def test_stock_request_exact_retry_survives_later_item_department_change(
    client, db_session, make_item, make_location
):
    item = make_item(name="멱등 라우팅", process_type_code="AR")
    make_location(
        item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        status=LocationStatusEnum.PRODUCTION,
        quantity=Decimal("2"),
    )
    _set_total(db_session, item.item_id, Decimal("2"))
    employee = _employee(db_session, department=DepartmentEnum.SALES)
    payload = {
        "requester_employee_id": str(employee.employee_id),
        "request_type": "scrap_normal",
        "client_request_id": "retry-after-process-change",
        "lines": [{
            "item_id": str(item.item_id),
            "quantity": 1,
            "from_bucket": "production",
            "from_department": DepartmentEnum.ASSEMBLY.value,
            "to_bucket": "none",
        }],
    }
    db_session.commit()

    first = client.post("/api/stock-requests", json=payload)
    assert first.status_code == 201, first.text
    item.process_type_code = "VR"
    db_session.commit()

    retry = client.post("/api/stock-requests", json=payload)

    assert retry.status_code == 201, retry.text
    assert retry.json()["request_id"] == first.json()["request_id"]
    assert db_session.query(StockRequest).filter(
        StockRequest.client_request_id == payload["client_request_id"]
    ).count() == 1
    assert _production_quantity(db_session, item.item_id, DepartmentEnum.ASSEMBLY) == Decimal("1")
    assert db_session.query(InventoryLocation).filter_by(
        item_id=item.item_id,
        department=DepartmentEnum.VACUUM,
        status=LocationStatusEnum.PRODUCTION,
    ).count() == 0


def test_warehouse_normal_request_does_not_require_item_department_mapping(
    client, db_session, make_item
):
    db_session.add(ProcessType(code="ZZ", prefix="Z", suffix="Z", stage_order=999))
    item = make_item(
        name="창고 미매핑 정상 폐기",
        process_type_code="ZZ",
        warehouse_qty=Decimal("2"),
    )
    employee = _employee(db_session, department=DepartmentEnum.SALES)
    db_session.commit()

    response = client.post("/api/stock-requests", json={
        "requester_employee_id": str(employee.employee_id),
        "request_type": "scrap_normal",
        "lines": [{
            "item_id": str(item.item_id),
            "quantity": 1,
            "from_bucket": "warehouse",
            "to_bucket": "none",
        }],
    })

    assert response.status_code == 201, response.text
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().warehouse_qty == Decimal("1")


def test_department_routing_item_locks_are_sorted_and_use_for_update(
    db_session, make_item, monkeypatch
):
    first = make_item(name="잠금 정렬 첫째")
    second = make_item(name="잠금 정렬 둘째")
    calls = []
    real_with_for_update = Query.with_for_update

    def track_with_for_update(query, *args, **kwargs):
        if query.column_descriptions[0].get("entity") is not None:
            calls.append(query.column_descriptions[0]["entity"])
        return real_with_for_update(query, *args, **kwargs)

    monkeypatch.setattr(Query, "with_for_update", track_with_for_update)

    locked = inv_transfer.lock_items_for_department_routing(
        db_session,
        [second.item_id, first.item_id],
    )

    assert calls == [type(first)]
    assert list(locked) == sorted([first.item_id, second.item_id])


@pytest.mark.parametrize(
    ("request_type", "from_bucket", "from_department"),
    [
        ("scrap_normal", "production", DepartmentEnum.ASSEMBLY.value),
        ("rework_normal", "warehouse", DepartmentEnum.VACUUM.value),
    ],
)
def test_stock_request_rejects_nonautomatic_normal_source_department(
    client, db_session, make_item, request_type, from_bucket, from_department
):
    item = make_item(name=f"{request_type} 부서 검증", process_type_code="VR", warehouse_qty=Decimal("5"))
    employee = _employee(db_session, department=DepartmentEnum.SALES)
    db_session.commit()

    response = client.post("/api/stock-requests", json={
        "requester_employee_id": str(employee.employee_id),
        "request_type": request_type,
        "lines": [{
            "item_id": str(item.item_id),
            "quantity": 1,
            "from_bucket": from_bucket,
            "from_department": from_department,
            "to_bucket": "none",
        }],
    })

    assert response.status_code == 422, response.text
    assert db_session.query(StockRequest).count() == 0


def test_stock_request_allows_each_production_line_its_own_item_department(
    client, db_session, make_item, make_location
):
    tube = make_item(name="튜브 폐기", process_type_code="TR")
    vacuum = make_item(name="진공 폐기", process_type_code="VR")
    make_location(tube.item_id, department=DepartmentEnum.TUBE, status=LocationStatusEnum.PRODUCTION, quantity=Decimal("2"))
    make_location(vacuum.item_id, department=DepartmentEnum.VACUUM, status=LocationStatusEnum.PRODUCTION, quantity=Decimal("2"))
    _set_total(db_session, tube.item_id, Decimal("2"))
    _set_total(db_session, vacuum.item_id, Decimal("2"))
    employee = _employee(db_session, department=DepartmentEnum.SALES)
    db_session.commit()

    response = client.post("/api/stock-requests", json={
        "requester_employee_id": str(employee.employee_id),
        "request_type": "scrap_normal",
        "lines": [
            {"item_id": str(tube.item_id), "quantity": 1, "from_bucket": "production", "from_department": DepartmentEnum.TUBE.value, "to_bucket": "none"},
            {"item_id": str(vacuum.item_id), "quantity": 1, "from_bucket": "production", "from_department": DepartmentEnum.VACUUM.value, "to_bucket": "none"},
        ],
    })

    assert response.status_code == 201, response.text
    assert _production_quantity(db_session, tube.item_id, DepartmentEnum.TUBE) == Decimal("1")
    assert _production_quantity(db_session, vacuum.item_id, DepartmentEnum.VACUUM) == Decimal("1")


def test_scrap_execution_reloads_current_item_department(
    db_session, make_item, make_location
):
    item = make_item(name="실행 시점 부서", process_type_code="AR")
    make_location(item.item_id, department=DepartmentEnum.VACUUM, status=LocationStatusEnum.PRODUCTION, quantity=Decimal("2"))
    _set_total(db_session, item.item_id, Decimal("2"))
    employee = _employee(db_session, department=DepartmentEnum.SALES)
    request = StockRequest(
        requester_employee_id=employee.employee_id,
        requester_name=employee.name,
        requester_department=employee.department,
        request_type=StockRequestTypeEnum.SCRAP_NORMAL,
        status=StockRequestStatusEnum.SUBMITTED,
        requires_warehouse_approval=False,
    )
    db_session.add(request)
    db_session.flush()
    line = StockRequestLine(
        request_id=request.request_id,
        item_id=item.item_id,
        item_name_snapshot=item.item_name,
        mes_code_snapshot=item.mes_code,
        quantity=Decimal("1"),
        from_bucket=RequestBucketEnum.PRODUCTION,
        from_department=DepartmentEnum.ASSEMBLY.value,
        to_bucket=RequestBucketEnum.NONE,
    )
    db_session.add(line)
    item.process_type_code = "VR"
    db_session.flush()

    sr_execution._execute_line(db_session, request, line, approver=employee, is_approval=False)

    assert line.from_department == DepartmentEnum.VACUUM.value
    assert _production_quantity(db_session, item.item_id, DepartmentEnum.VACUUM) == Decimal("1")


def test_normal_rework_rejects_unmapped_child_before_parent_stock_changes(
    db_session, make_item, make_location
):
    parent = make_item(name="재작업 부모", process_type_code="AR")
    db_session.add(ProcessType(code="ZZ", prefix="Z", suffix="Z", stage_order=999))
    db_session.flush()
    unmapped_child = make_item(name="미매핑 자식", process_type_code="ZZ")
    make_location(parent.item_id, department=DepartmentEnum.ASSEMBLY, status=LocationStatusEnum.PRODUCTION, quantity=Decimal("2"))
    _set_total(db_session, parent.item_id, Decimal("2"))

    with pytest.raises(ValueError, match="품목코드로 부서를 찾을 수 없습니다"):
        submit_normal_disassemble(
            db_session,
            parent.item_id,
            Decimal("1"),
            "production",
            DepartmentEnum.ASSEMBLY,
            [{
                "item_id": str(unmapped_child.item_id),
                "qty": "1",
                "normal_qty": "1",
                "defective_qty": "0",
                "scrap_qty": "0",
            }],
            reason_category="기타",
            reason_memo="미매핑 거절",
            actor=_employee(db_session),
        )

    assert _production_quantity(db_session, parent.item_id, DepartmentEnum.ASSEMBLY) == Decimal("2")


def test_draft_submit_rejects_department_stale_after_item_process_change(
    client, db_session, make_item, make_location
):
    item = make_item(name="초안 재검증", process_type_code="AR")
    make_location(
        item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        status=LocationStatusEnum.PRODUCTION,
        quantity=Decimal("2"),
    )
    make_location(
        item.item_id,
        department=DepartmentEnum.VACUUM,
        status=LocationStatusEnum.PRODUCTION,
        quantity=Decimal("2"),
    )
    _set_total(db_session, item.item_id, Decimal("4"))
    employee = _employee(db_session, department=DepartmentEnum.SALES)
    db_session.commit()

    draft = client.put("/api/stock-requests/draft", json={
        "requester_employee_id": str(employee.employee_id),
        "request_type": "scrap_normal",
        "lines": [{
            "item_id": str(item.item_id),
            "quantity": 1,
            "from_bucket": "production",
            "from_department": DepartmentEnum.ASSEMBLY.value,
            "to_bucket": "none",
        }],
    })
    assert draft.status_code == 200, draft.text
    item.process_type_code = "VR"
    db_session.commit()

    submitted = client.post(
        f"/api/stock-requests/{draft.json()['request_id']}/submit",
        json={"requester_employee_id": str(employee.employee_id)},
    )

    assert submitted.status_code == 422, submitted.text
    assert _production_quantity(db_session, item.item_id, DepartmentEnum.ASSEMBLY) == Decimal("2")
    assert _production_quantity(db_session, item.item_id, DepartmentEnum.VACUUM) == Decimal("2")
    assert db_session.get(StockRequest, draft.json()["request_id"]).status == StockRequestStatusEnum.DRAFT


def test_normal_rework_service_uses_parent_item_department_not_passed_source_department(
    db_session, make_item, make_location
):
    parent = make_item(name="서비스 부모 부서", process_type_code="AR")
    child = make_item(name="서비스 자식 부서", process_type_code="TR")
    make_location(
        parent.item_id,
        department=DepartmentEnum.ASSEMBLY,
        status=LocationStatusEnum.PRODUCTION,
        quantity=Decimal("2"),
    )
    _set_total(db_session, parent.item_id, Decimal("2"))

    submit_normal_disassemble(
        db_session,
        parent.item_id,
        Decimal("1"),
        "production",
        DepartmentEnum.VACUUM,
        [{
            "item_id": str(child.item_id),
            "qty": "1",
            "normal_qty": "1",
            "defective_qty": "0",
            "scrap_qty": "0",
        }],
        reason_category="기타",
        reason_memo="직접 호출",
        actor=_employee(db_session),
    )

    parent_log = db_session.query(TransactionLog).filter(
        TransactionLog.item_id == parent.item_id,
        TransactionLog.transaction_type == TransactionTypeEnum.DISASSEMBLE,
    ).one()
    assert _production_quantity(db_session, parent.item_id, DepartmentEnum.ASSEMBLY) == Decimal("1")
    assert parent_log.department == DepartmentEnum.ASSEMBLY.value
