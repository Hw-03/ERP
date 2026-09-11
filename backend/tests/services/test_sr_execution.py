"""services/sr_execution.py 회귀 그물 테스트.

대상: _execute_line / _execute_all_lines / _finalize_submission.
현재 동작의 회귀 방지용.

검증 초점:
- 요청 타입별(RAW_RECEIVE/RAW_SHIP/WAREHOUSE_TO_DEPT/DEPT_TO_WAREHOUSE/
  DEPT_INTERNAL/MARK_DEFECTIVE_WH/MARK_DEFECTIVE_PROD) 재고 이동 + TransactionLog 생성
- _finalize_submission 역할별 자가승인과 일반직원 RESERVED 분기
- 정상 경로 + ValueError (필수 부서 누락, 재고 부족, 미지원 타입)
- 재고 불변식 (총량 보존 이동은 quantity_change=0)
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from decimal import Decimal

import pytest

from app.models import (
    DepartmentEnum,
    DefectInventoryMovement,
    DefectQuarantineRecord,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryOperation,
    InventoryOperationEffect,
    InventoryOperationRoleEnum,
    InventoryLocation,
    LocationStatusEnum,
    RequestBucketEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    SystemSetting,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services.pin_auth import DEFAULT_PIN_HASH
from app.services import sr_approval
from app.services import inventory_operation_cancellation as cancellation_svc
from app.services import sr_execution as svc

D = Decimal
ASSEMBLY = DepartmentEnum.ASSEMBLY
HV = DepartmentEnum.HIGH_VOLTAGE
TUBE = DepartmentEnum.TUBE


# ──────────────────────────── helpers ────────────────────────────


def _make_employee(
    db_session,
    *,
    code: str = "E01",
    name: str = "직원",
    warehouse_role: str = "none",
    department_role: str = "none",
    level: EmployeeLevelEnum = EmployeeLevelEnum.STAFF,
) -> Employee:
    emp = Employee(
        employee_code=code,
        name=name,
        role="조립/사원",
        department=ASSEMBLY.value,
        level=level,
        warehouse_role=warehouse_role,
        department_role=department_role,
        display_order=0,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )
    db_session.add(emp)
    db_session.flush()
    return emp


def _make_request(
    db_session,
    requester: Employee,
    *,
    request_type: StockRequestTypeEnum,
    requires_warehouse_approval: bool = True,
    requires_department_approval: bool = False,
    notes: str | None = None,
    reason_category: str | None = None,
    reason_memo: str | None = None,
    client_request_id: str | None = None,
) -> StockRequest:
    req = StockRequest(
        request_code=f"SR-TEST-{uuid.uuid4().hex[:8].upper()}",
        requester_employee_id=requester.employee_id,
        requester_name=requester.name,
        requester_department=requester.department,
        request_type=request_type,
        status=StockRequestStatusEnum.SUBMITTED,
        requires_warehouse_approval=requires_warehouse_approval,
        requires_department_approval=requires_department_approval,
        notes=notes,
        reason_category=reason_category,
        reason_memo=reason_memo,
        client_request_id=client_request_id,
    )
    db_session.add(req)
    db_session.flush()
    return req


def test_batch_defect_request_rejects_quantity_that_no_longer_matches_record(
    db_session, make_item, make_location
):
    item = make_item(name="BATCH-STALE-UP", process_type_code="AR", warehouse_qty=D("0"))
    make_location(
        item.item_id,
        department=ASSEMBLY,
        status=LocationStatusEnum.DEFECTIVE,
        quantity=D("2"),
    )
    employee = _make_employee(db_session, code="BATCH-STALE-UP")
    record = DefectQuarantineRecord(
        item_id=item.item_id,
        department=ASSEMBLY.value,
        original_quantity=D("2"),
        remaining_quantity=D("2"),
    )
    db_session.add(record)
    db_session.flush()
    request = _make_request(
        db_session,
        employee,
        request_type=StockRequestTypeEnum.DEFECT_SCRAP,
        client_request_id="defect-batch:test-stale-up",
    )
    line = _add_line(
        db_session,
        request,
        item,
        quantity=D("1"),
        from_bucket=RequestBucketEnum.DEFECTIVE,
        to_bucket=RequestBucketEnum.NONE,
        from_department=ASSEMBLY.value,
        record_id=record.record_id,
    )

    with pytest.raises(ValueError, match="처리 가능 수량이 변경"):
        svc._execute_all_lines(
            db_session,
            request,
            [line],
            operator_name=employee.name,
            approver=employee,
        )

    assert record.remaining_quantity == D("2")
    assert _defective_qty(db_session, item.item_id, ASSEMBLY) == D("2")
    assert _logs(db_session, item.item_id) == []


def test_batch_defect_request_checks_every_record_before_any_inventory_change(
    db_session, make_item, make_location
):
    item = make_item(name="BATCH-STALE-ATOMIC", process_type_code="AR", warehouse_qty=D("0"))
    make_location(
        item.item_id,
        department=ASSEMBLY,
        status=LocationStatusEnum.DEFECTIVE,
        quantity=D("5"),
    )
    employee = _make_employee(db_session, code="BATCH-STALE-ATOMIC")
    records = [
        DefectQuarantineRecord(
            item_id=item.item_id,
            department=ASSEMBLY.value,
            original_quantity=quantity,
            remaining_quantity=quantity,
        )
        for quantity in (D("2"), D("3"))
    ]
    db_session.add_all(records)
    db_session.flush()
    request = _make_request(
        db_session,
        employee,
        request_type=StockRequestTypeEnum.DEFECT_SCRAP,
        client_request_id="defect-batch:test-atomic-stale",
    )
    lines = [
        _add_line(
            db_session,
            request,
            item,
            quantity=D("2"),
            from_bucket=RequestBucketEnum.DEFECTIVE,
            to_bucket=RequestBucketEnum.NONE,
            from_department=ASSEMBLY.value,
            record_id=record.record_id,
        )
        for record in records
    ]

    with pytest.raises(ValueError, match="처리 가능 수량이 변경"):
        svc._execute_all_lines(
            db_session,
            request,
            lines,
            operator_name=employee.name,
            approver=employee,
        )

    assert [record.remaining_quantity for record in records] == [D("2"), D("3")]
    assert _defective_qty(db_session, item.item_id, ASSEMBLY) == D("5")
    assert _logs(db_session, item.item_id) == []


def _add_line(
    db_session,
    request: StockRequest,
    item,
    *,
    quantity: Decimal,
    from_bucket: RequestBucketEnum,
    to_bucket: RequestBucketEnum,
    from_department: str | None = None,
    to_department: str | None = None,
    record_id: uuid.UUID | None = None,
) -> StockRequestLine:
    line = StockRequestLine(
        request_id=request.request_id,
        item_id=item.item_id,
        item_name_snapshot=item.item_name,
        quantity=quantity,
        from_bucket=from_bucket,
        to_bucket=to_bucket,
        from_department=from_department,
        to_department=to_department,
        status=StockRequestStatusEnum.SUBMITTED,
        defect_quarantine_record_id=record_id,
    )
    db_session.add(line)
    db_session.flush()
    return line


def _wh_qty(db_session, item_id) -> Decimal:
    inv = db_session.query(Inventory).filter(Inventory.item_id == item_id).first()
    return inv.warehouse_qty if inv else D("0")


def _total_qty(db_session, item_id) -> Decimal:
    inv = db_session.query(Inventory).filter(Inventory.item_id == item_id).first()
    return inv.quantity if inv else D("0")


def _prod_qty(db_session, item_id, dept=ASSEMBLY) -> Decimal:
    loc = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == dept.value,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .first()
    )
    return loc.quantity if loc else D("0")


def _loc_pending(db_session, item_id, dept=ASSEMBLY) -> Decimal:
    loc = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == dept.value,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .first()
    )
    return loc.pending_quantity if loc else D("0")


def _defective_qty(db_session, item_id, dept=ASSEMBLY) -> Decimal:
    loc = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == dept.value,
            InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
        )
        .first()
    )
    return loc.quantity if loc else D("0")


def _logs(db_session, item_id) -> list[TransactionLog]:
    return (
        db_session.query(TransactionLog)
        .filter(TransactionLog.item_id == item_id)
        .all()
    )


# ══════════════════════════ _execute_line ══════════════════════════


def test_execute_line_raw_receive(db_session, make_item):
    """RAW_RECEIVE: 창고 입고 +qty, RECEIVE 로그, quantity_change=+qty."""
    item = make_item(name="RR", warehouse_qty=D("0"))
    emp = _make_employee(db_session)
    req = _make_request(db_session, emp, request_type=StockRequestTypeEnum.RAW_RECEIVE)
    line = _add_line(
        db_session, req, item, quantity=D("5"),
        from_bucket=RequestBucketEnum.NONE, to_bucket=RequestBucketEnum.WAREHOUSE,
    )

    svc._execute_line(db_session, req, line, approver=emp, is_approval=False)
    db_session.flush()

    assert _wh_qty(db_session, item.item_id) == D("5")
    logs = _logs(db_session, item.item_id)
    assert len(logs) == 1
    assert logs[0].transaction_type == TransactionTypeEnum.RECEIVE
    assert logs[0].quantity_change == D("5")
    assert logs[0].quantity_before == D("0")
    assert logs[0].quantity_after == D("5")
    assert logs[0].reference_no == req.request_code
    assert "즉시 처리" in (logs[0].notes or "")


def test_execute_line_raw_ship(db_session, make_item):
    """RAW_SHIP: 창고 출고 -qty, SHIP 로그, quantity_change=-qty."""
    item = make_item(name="RS", warehouse_qty=D("10"))
    emp = _make_employee(db_session)
    req = _make_request(db_session, emp, request_type=StockRequestTypeEnum.RAW_SHIP)
    line = _add_line(
        db_session, req, item, quantity=D("4"),
        from_bucket=RequestBucketEnum.WAREHOUSE, to_bucket=RequestBucketEnum.NONE,
    )

    svc._execute_line(db_session, req, line, approver=emp, is_approval=False)
    db_session.flush()

    assert _wh_qty(db_session, item.item_id) == D("6")
    logs = _logs(db_session, item.item_id)
    assert len(logs) == 1
    assert logs[0].transaction_type == TransactionTypeEnum.SHIP
    assert logs[0].quantity_change == D("-4")


def test_execute_line_internal_use_from_department_only_consumes_that_location(
    db_session, make_item, make_location
):
    item = make_item(name="IU-DEPT", process_type_code="HF", warehouse_qty=D("7"))
    make_location(
        item.item_id,
        department=HV,
        status=LocationStatusEnum.PRODUCTION,
        quantity=D("5"),
    )
    inventory = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    inventory.quantity = D("12")
    employee = _make_employee(db_session)
    request = _make_request(
        db_session,
        employee,
        request_type=StockRequestTypeEnum.INTERNAL_USE,
        requires_warehouse_approval=False,
        requires_department_approval=True,
    )
    line = _add_line(
        db_session,
        request,
        item,
        quantity=D("2"),
        from_bucket=RequestBucketEnum.PRODUCTION,
        from_department=HV.value,
        to_bucket=RequestBucketEnum.NONE,
        to_department=DepartmentEnum.AS.value,
    )

    svc._execute_line(db_session, request, line, approver=employee, is_approval=True)
    db_session.flush()

    assert _wh_qty(db_session, item.item_id) == D("7")
    assert _prod_qty(db_session, item.item_id, HV) == D("3")
    assert _total_qty(db_session, item.item_id) == D("10")
    logs = _logs(db_session, item.item_id)
    assert len(logs) == 1
    assert logs[0].transaction_type == TransactionTypeEnum.INTERNAL_USE
    assert logs[0].reference_no == request.request_code


def test_execute_line_warehouse_to_dept(db_session, make_item):
    """WAREHOUSE_TO_DEPT: 창고 -qty / 부서 생산 +qty, 총량 불변, change=0."""
    item = make_item(name="W2D", process_type_code="AR", warehouse_qty=D("10"))
    emp = _make_employee(db_session)
    req = _make_request(db_session, emp, request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT)
    line = _add_line(
        db_session, req, item, quantity=D("3"),
        from_bucket=RequestBucketEnum.WAREHOUSE, to_bucket=RequestBucketEnum.PRODUCTION,
        to_department=ASSEMBLY.value,
    )

    svc._execute_line(db_session, req, line, approver=emp, is_approval=False)
    db_session.flush()

    assert _wh_qty(db_session, item.item_id) == D("7")
    assert _prod_qty(db_session, item.item_id, ASSEMBLY) == D("3")
    assert _total_qty(db_session, item.item_id) == D("10")  # 총량 불변
    logs = _logs(db_session, item.item_id)
    assert len(logs) == 1
    assert logs[0].transaction_type == TransactionTypeEnum.TRANSFER_TO_PROD
    assert logs[0].quantity_change == D("0")


def test_execute_line_warehouse_to_dept_missing_dept_uses_item_code(db_session, make_item):
    """WAREHOUSE_TO_DEPT는 요청 부서가 없어도 품목 코드 부서로 실행한다."""
    item = make_item(name="W2DX", process_type_code="AR", warehouse_qty=D("10"))
    emp = _make_employee(db_session)
    req = _make_request(db_session, emp, request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT)
    line = _add_line(
        db_session, req, item, quantity=D("3"),
        from_bucket=RequestBucketEnum.WAREHOUSE, to_bucket=RequestBucketEnum.PRODUCTION,
        to_department=None,
    )

    svc._execute_line(db_session, req, line, approver=emp, is_approval=False)
    assert _prod_qty(db_session, item.item_id, ASSEMBLY) == D("3")


def test_execute_line_dept_to_warehouse(db_session, make_item, make_location):
    """DEPT_TO_WAREHOUSE: 부서 생산 -qty / 창고 +qty, 총량 불변, change=0."""
    item = make_item(name="D2W", process_type_code="AR", warehouse_qty=D("0"))
    make_location(item.item_id, department=ASSEMBLY,
                  status=LocationStatusEnum.PRODUCTION, quantity=D("5"))
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = D("5")
    db_session.flush()

    emp = _make_employee(db_session)
    req = _make_request(db_session, emp, request_type=StockRequestTypeEnum.DEPT_TO_WAREHOUSE)
    line = _add_line(
        db_session, req, item, quantity=D("2"),
        from_bucket=RequestBucketEnum.PRODUCTION, to_bucket=RequestBucketEnum.WAREHOUSE,
        from_department=ASSEMBLY.value,
    )

    svc._execute_line(db_session, req, line, approver=emp, is_approval=False)
    db_session.flush()

    assert _prod_qty(db_session, item.item_id, ASSEMBLY) == D("3")
    assert _wh_qty(db_session, item.item_id) == D("2")
    assert _total_qty(db_session, item.item_id) == D("5")
    logs = _logs(db_session, item.item_id)
    assert len(logs) == 1
    assert logs[0].transaction_type == TransactionTypeEnum.TRANSFER_TO_WH
    assert logs[0].quantity_change == D("0")
    # from_department 기록 확인
    assert logs[0].department == ASSEMBLY.value


def test_execute_line_dept_to_warehouse_missing_dept_raises(db_session, make_item):
    """DEPT_TO_WAREHOUSE 인데 from_department 누락 → ValueError."""
    item = make_item(name="D2WX", warehouse_qty=D("0"))
    emp = _make_employee(db_session)
    req = _make_request(db_session, emp, request_type=StockRequestTypeEnum.DEPT_TO_WAREHOUSE)
    line = _add_line(
        db_session, req, item, quantity=D("2"),
        from_bucket=RequestBucketEnum.PRODUCTION, to_bucket=RequestBucketEnum.WAREHOUSE,
        from_department=None,
    )
    with pytest.raises(ValueError):
        svc._execute_line(db_session, req, line, approver=emp, is_approval=False)


def test_execute_line_dept_internal(db_session, make_item, make_location):
    """DEPT_INTERNAL: 출발부서 -qty / 도착부서 +qty, 총량 불변."""
    item = make_item(name="DI", warehouse_qty=D("0"))
    make_location(item.item_id, department=ASSEMBLY,
                  status=LocationStatusEnum.PRODUCTION, quantity=D("5"))
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = D("5")
    db_session.flush()

    emp = _make_employee(db_session)
    req = _make_request(
        db_session, emp, request_type=StockRequestTypeEnum.DEPT_INTERNAL,
        requires_warehouse_approval=False,
    )
    line = _add_line(
        db_session, req, item, quantity=D("3"),
        from_bucket=RequestBucketEnum.PRODUCTION, to_bucket=RequestBucketEnum.PRODUCTION,
        from_department=ASSEMBLY.value, to_department=HV.value,
    )

    svc._execute_line(db_session, req, line, approver=emp, is_approval=False)
    db_session.flush()

    assert _prod_qty(db_session, item.item_id, ASSEMBLY) == D("2")
    assert _prod_qty(db_session, item.item_id, HV) == D("3")
    assert _total_qty(db_session, item.item_id) == D("5")
    logs = _logs(db_session, item.item_id)
    assert len(logs) == 1
    assert logs[0].transaction_type == TransactionTypeEnum.TRANSFER_DEPT


def test_execute_line_mark_defective_wh(db_session, make_item):
    """MARK_DEFECTIVE_WH: 창고 -qty / 부서 격리 +qty, 총량 불변."""
    item = make_item(name="MDW", warehouse_qty=D("8"))
    emp = _make_employee(db_session)
    req = _make_request(db_session, emp, request_type=StockRequestTypeEnum.MARK_DEFECTIVE_WH)
    line = _add_line(
        db_session, req, item, quantity=D("3"),
        from_bucket=RequestBucketEnum.WAREHOUSE, to_bucket=RequestBucketEnum.DEFECTIVE,
        to_department=ASSEMBLY.value,
    )

    svc._execute_line(db_session, req, line, approver=emp, is_approval=False)
    db_session.flush()

    assert _wh_qty(db_session, item.item_id) == D("5")
    assert _defective_qty(db_session, item.item_id, ASSEMBLY) == D("3")
    assert _total_qty(db_session, item.item_id) == D("8")
    logs = _logs(db_session, item.item_id)
    assert len(logs) == 1
    assert logs[0].transaction_type == TransactionTypeEnum.MARK_DEFECTIVE
    record = (
        db_session.query(DefectQuarantineRecord)
        .filter(DefectQuarantineRecord.item_id == item.item_id)
        .one()
    )
    assert record.remaining_quantity == D("3")
    assert record.department == ASSEMBLY.value
    assert logs[0].defect_quarantine_record_id == record.record_id


def test_execute_line_mark_defective_prod(db_session, make_item, make_location):
    """MARK_DEFECTIVE_PROD: 부서 생산 -qty / 부서 격리 +qty, 총량 불변."""
    item = make_item(name="MDP", warehouse_qty=D("0"))
    make_location(item.item_id, department=ASSEMBLY,
                  status=LocationStatusEnum.PRODUCTION, quantity=D("6"))
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = D("6")
    db_session.flush()

    emp = _make_employee(db_session)
    req = _make_request(
        db_session, emp, request_type=StockRequestTypeEnum.MARK_DEFECTIVE_PROD,
        requires_warehouse_approval=False,
    )
    line = _add_line(
        db_session, req, item, quantity=D("2"),
        from_bucket=RequestBucketEnum.PRODUCTION, to_bucket=RequestBucketEnum.DEFECTIVE,
        from_department=ASSEMBLY.value, to_department=ASSEMBLY.value,
    )

    svc._execute_line(db_session, req, line, approver=emp, is_approval=False)
    db_session.flush()

    assert _prod_qty(db_session, item.item_id, ASSEMBLY) == D("4")
    assert _defective_qty(db_session, item.item_id, ASSEMBLY) == D("2")
    assert _total_qty(db_session, item.item_id) == D("6")
    logs = _logs(db_session, item.item_id)
    assert len(logs) == 1
    assert logs[0].transaction_type == TransactionTypeEnum.MARK_DEFECTIVE



def test_execute_line_scrap_normal_from_production(db_session, make_item, make_location):
    """SCRAP_NORMAL: 부서 PRODUCTION 차감, 총량 감소, DEFECT_SCRAP 로그 생성."""
    item = make_item(name="SNP", warehouse_qty=D("0"))
    make_location(item.item_id, department=DepartmentEnum.TUBE,
                  status=LocationStatusEnum.PRODUCTION, quantity=D("5"))
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = D("5")
    db_session.flush()

    emp = _make_employee(db_session)
    req = _make_request(
        db_session, emp, request_type=StockRequestTypeEnum.SCRAP_NORMAL,
        requires_warehouse_approval=False,
        reason_category="기타",
        reason_memo="즉시 폐기",
    )
    line = _add_line(
        db_session, req, item, quantity=D("2"),
        from_bucket=RequestBucketEnum.PRODUCTION, to_bucket=RequestBucketEnum.NONE,
        from_department=DepartmentEnum.TUBE.value,
    )

    svc._execute_line(db_session, req, line, approver=emp, is_approval=False)
    db_session.flush()

    assert _prod_qty(db_session, item.item_id, DepartmentEnum.TUBE) == D("3")
    assert _total_qty(db_session, item.item_id) == D("3")
    logs = _logs(db_session, item.item_id)
    assert len(logs) == 1
    assert logs[0].transaction_type == TransactionTypeEnum.DEFECT_SCRAP
    assert logs[0].quantity_change == D("-2")


def test_execute_line_rework_normal_splits_children_by_item_department(
    db_session, make_item, make_location
):
    """REWORK_NORMAL: 정상 부모 차감 후 하위 정상/격리/폐기를 품목코드 부서 기준으로 처리."""
    parent = make_item(name="RN-PARENT", process_type_code="PF", warehouse_qty=D("0"))
    normal_child = make_item(name="TUBE-CHILD", process_type_code="TR", warehouse_qty=D("0"))
    defective_child = make_item(name="HV-CHILD", process_type_code="HR", warehouse_qty=D("0"))
    scrap_child = make_item(name="ASSY-CHILD", process_type_code="AR", warehouse_qty=D("0"))
    make_location(parent.item_id, department=DepartmentEnum.SHIPPING,
                  status=LocationStatusEnum.PRODUCTION, quantity=D("2"))
    inv = db_session.query(Inventory).filter(Inventory.item_id == parent.item_id).first()
    inv.quantity = D("2")
    db_session.flush()

    emp = _make_employee(db_session)
    req = _make_request(
        db_session,
        emp,
        request_type=StockRequestTypeEnum.REWORK_NORMAL,
        requires_warehouse_approval=False,
        reason_category="기타",
        reason_memo="바로 재작업",
        notes=json.dumps({
            "child_decisions": [
                {
                    "item_id": str(normal_child.item_id),
                    "qty": "2",
                    "normal_qty": "2",
                    "defective_qty": "0",
                    "scrap_qty": "0",
                },
                {
                    "item_id": str(defective_child.item_id),
                    "qty": "2",
                    "normal_qty": "0",
                    "defective_qty": "1",
                    "scrap_qty": "1",
                    "reason_memo": "재검 필요",
                },
                {
                    "item_id": str(scrap_child.item_id),
                    "qty": "2",
                    "normal_qty": "0",
                    "defective_qty": "0",
                    "scrap_qty": "2",
                },
            ]
        }),
    )
    line = _add_line(
        db_session, req, parent, quantity=D("2"),
        from_bucket=RequestBucketEnum.PRODUCTION, to_bucket=RequestBucketEnum.NONE,
        from_department=DepartmentEnum.SHIPPING.value,
    )

    svc._execute_line(db_session, req, line, approver=emp, is_approval=False)
    db_session.flush()

    assert _prod_qty(db_session, parent.item_id, DepartmentEnum.SHIPPING) == D("0")
    assert _total_qty(db_session, parent.item_id) == D("0")
    assert _prod_qty(db_session, normal_child.item_id, DepartmentEnum.TUBE) == D("2")
    assert _defective_qty(db_session, defective_child.item_id, DepartmentEnum.HIGH_VOLTAGE) == D("1")
    assert _total_qty(db_session, defective_child.item_id) == D("1")
    assert _total_qty(db_session, scrap_child.item_id) == D("0")

    parent_logs = _logs(db_session, parent.item_id)
    assert [log.transaction_type for log in parent_logs] == [TransactionTypeEnum.DISASSEMBLE]
    assert parent_logs[0].quantity_change == D("-2")
    assert parent_logs[0].reason_category == "기타"
    assert parent_logs[0].reason_memo == "바로 재작업"
    assert parent_logs[0].notes.startswith("[rework:normal]")

    normal_log = db_session.query(TransactionLog).filter(
        TransactionLog.item_id == normal_child.item_id,
        TransactionLog.transaction_type == TransactionTypeEnum.RECEIVE,
    ).one()
    defective_log = db_session.query(TransactionLog).filter(
        TransactionLog.item_id == defective_child.item_id,
        TransactionLog.transaction_type == TransactionTypeEnum.MARK_DEFECTIVE,
    ).one()
    defective_scrap_log = db_session.query(TransactionLog).filter(
        TransactionLog.item_id == defective_child.item_id,
        TransactionLog.transaction_type == TransactionTypeEnum.DEFECT_SCRAP,
    ).one()
    scrap_log = db_session.query(TransactionLog).filter(
        TransactionLog.item_id == scrap_child.item_id,
        TransactionLog.transaction_type == TransactionTypeEnum.DEFECT_SCRAP,
    ).one()
    assert normal_log.department == DepartmentEnum.TUBE.value
    assert defective_log.department == DepartmentEnum.HIGH_VOLTAGE.value
    assert defective_scrap_log.department == DepartmentEnum.HIGH_VOLTAGE.value
    assert scrap_log.department == DepartmentEnum.ASSEMBLY.value


def test_execute_line_defect_disassemble_uses_three_way_child_split(
    db_session, make_item, make_location, make_bom
):
    """DEFECT_DISASSEMBLE: 격리 부모도 같은 정상/격리/폐기 3분할 모델을 사용한다."""
    parent = make_item(name="QD-PARENT", process_type_code="PF", warehouse_qty=D("0"))
    child = make_item(name="VAC-CHILD", process_type_code="VR", warehouse_qty=D("0"))
    make_bom(parent.item_id, child.item_id, D("1"))
    make_location(parent.item_id, department=ASSEMBLY,
                  status=LocationStatusEnum.DEFECTIVE, quantity=D("3"))
    inv = db_session.query(Inventory).filter(Inventory.item_id == parent.item_id).first()
    inv.quantity = D("3")
    db_session.flush()

    emp = _make_employee(db_session)
    req = _make_request(
        db_session,
        emp,
        request_type=StockRequestTypeEnum.DEFECT_DISASSEMBLE,
        requires_warehouse_approval=False,
        notes=json.dumps({
            "child_decisions": [{
                "item_id": str(child.item_id),
                "qty": "3",
                "normal_qty": "1",
                "defective_qty": "1",
                "scrap_qty": "1",
            }]
        }),
    )
    line = _add_line(
        db_session, req, parent, quantity=D("3"),
        from_bucket=RequestBucketEnum.DEFECTIVE, to_bucket=RequestBucketEnum.NONE,
        from_department=ASSEMBLY.value,
    )

    svc._execute_line(db_session, req, line, approver=emp, is_approval=False)
    db_session.flush()

    assert _defective_qty(db_session, parent.item_id, ASSEMBLY) == D("0")
    assert _prod_qty(db_session, child.item_id, DepartmentEnum.VACUUM) == D("1")
    assert _defective_qty(db_session, child.item_id, DepartmentEnum.VACUUM) == D("1")
    assert _total_qty(db_session, child.item_id) == D("2")

    child_logs = _logs(db_session, child.item_id)
    assert [log.transaction_type for log in child_logs] == [
        TransactionTypeEnum.RECEIVE,
        TransactionTypeEnum.MARK_DEFECTIVE,
        TransactionTypeEnum.DEFECT_SCRAP,
    ]
    child_record = (
        db_session.query(DefectQuarantineRecord)
        .filter(DefectQuarantineRecord.item_id == child.item_id)
        .one()
    )
    child_mark_log = next(
        log
        for log in child_logs
        if log.transaction_type == TransactionTypeEnum.MARK_DEFECTIVE
    )
    assert child_record.remaining_quantity == D("1")
    assert child_mark_log.defect_quarantine_record_id == child_record.record_id


def test_execute_line_defect_disassemble_rejects_stale_bom_quantity_before_inventory_changes(
    db_session, make_item, make_location, make_bom
):
    parent = make_item(name="STALE-PARENT", process_type_code="PF", warehouse_qty=D("0"))
    child = make_item(name="STALE-CHILD", process_type_code="VR", warehouse_qty=D("0"))
    make_bom(parent.item_id, child.item_id, D("1"))
    make_location(
        parent.item_id,
        department=ASSEMBLY,
        status=LocationStatusEnum.DEFECTIVE,
        quantity=D("2"),
    )
    inv = db_session.query(Inventory).filter(Inventory.item_id == parent.item_id).one()
    inv.quantity = D("2")
    employee = _make_employee(db_session)
    request = _make_request(
        db_session,
        employee,
        request_type=StockRequestTypeEnum.DEFECT_DISASSEMBLE,
        requires_warehouse_approval=False,
        notes=json.dumps({
            "child_decisions": [{
                "item_id": str(child.item_id),
                "qty": "3",
                "normal_qty": "3",
                "defective_qty": "0",
                "scrap_qty": "0",
            }]
        }),
    )
    line = _add_line(
        db_session,
        request,
        parent,
        quantity=D("2"),
        from_bucket=RequestBucketEnum.DEFECTIVE,
        to_bucket=RequestBucketEnum.NONE,
        from_department=ASSEMBLY.value,
    )

    with pytest.raises(ValueError, match="BOM"):
        svc._execute_line(db_session, request, line, approver=employee, is_approval=False)

    assert _defective_qty(db_session, parent.item_id, ASSEMBLY) == D("2")
    assert _total_qty(db_session, child.item_id) == D("0")
    assert _logs(db_session, parent.item_id) == []
    assert _logs(db_session, child.item_id) == []


def test_execute_all_lines_defect_disassemble_aggregates_source_records_once(
    db_session, make_item, make_location, make_bom
):
    parent = make_item(name="MULTI-PARENT", process_type_code="PF", warehouse_qty=D("0"))
    child = make_item(name="MULTI-CHILD", process_type_code="VR", warehouse_qty=D("0"))
    make_bom(parent.item_id, child.item_id, D("1"))
    make_location(
        parent.item_id,
        department=ASSEMBLY,
        status=LocationStatusEnum.DEFECTIVE,
        quantity=D("3"),
    )
    parent_inventory = db_session.query(Inventory).filter(
        Inventory.item_id == parent.item_id
    ).one()
    parent_inventory.quantity = D("3")
    employee = _make_employee(db_session, code="MULTI-REWORK")
    records = [
        DefectQuarantineRecord(
            item_id=parent.item_id,
            department=ASSEMBLY.value,
            original_quantity=quantity,
            remaining_quantity=quantity,
            quarantined_by_employee_id=employee.employee_id,
            quarantined_by_name=employee.name,
        )
        for quantity in (D("1"), D("2"))
    ]
    db_session.add_all(records)
    db_session.add(
        SystemSetting(
            setting_key="inventory_operation_cutover_at",
            setting_value="2026-01-01T00:00:00",
        )
    )
    db_session.flush()
    request = _make_request(
        db_session,
        employee,
        request_type=StockRequestTypeEnum.DEFECT_DISASSEMBLE,
        requires_warehouse_approval=False,
        notes=json.dumps({
            "child_decisions": [{
                "item_id": str(child.item_id),
                "qty": "3",
                "normal_qty": "3",
                "defective_qty": "0",
                "scrap_qty": "0",
            }]
        }),
    )
    lines = [
        _add_line(
            db_session,
            request,
            parent,
            quantity=record.remaining_quantity,
            from_bucket=RequestBucketEnum.DEFECTIVE,
            to_bucket=RequestBucketEnum.NONE,
            from_department=ASSEMBLY.value,
            record_id=record.record_id,
        )
        for record in records
    ]

    svc._execute_all_lines(
        db_session,
        request,
        lines,
        operator_name=employee.name,
        approver=employee,
    )
    db_session.flush()

    assert _defective_qty(db_session, parent.item_id, ASSEMBLY) == D("0")
    assert _prod_qty(db_session, child.item_id, DepartmentEnum.VACUUM) == D("3")
    assert [record.remaining_quantity for record in records] == [D("0"), D("0")]
    parent_logs = _logs(db_session, parent.item_id)
    assert [log.transaction_type for log in parent_logs] == [
        TransactionTypeEnum.DISASSEMBLE
    ]
    assert parent_logs[0].quantity_change == D("-3")
    movements = (
        db_session.query(DefectInventoryMovement)
        .filter(DefectInventoryMovement.record_id.in_([record.record_id for record in records]))
        .order_by(DefectInventoryMovement.record_id)
        .all()
    )
    assert {
        movement.record_id: movement.quantity_delta for movement in movements
    } == {
        records[0].record_id: D("-1"),
        records[1].record_id: D("-2"),
    }
    assert len({movement.operation_id for movement in movements}) == 1
    assert movements[0].operation_id == parent_logs[0].operation_id

    request.status = StockRequestStatusEnum.COMPLETED
    request.completed_at = datetime.utcnow()
    for line in lines:
        line.status = StockRequestStatusEnum.COMPLETED
    db_session.commit()
    operation = db_session.get(InventoryOperation, parent_logs[0].operation_id)
    preview = cancellation_svc.preview_cancellation(
        db_session,
        operation.operation_id,
        now=operation.effective_at,
    )
    assert preview.can_cancel is True, preview.blockers

    cancellation_svc.cancel_operation(
        db_session,
        operation_id=operation.operation_id,
        canceller=employee,
        reason="다건 재작업 취소",
        plan_hash=preview.plan_hash,
        now=operation.effective_at,
    )

    db_session.expire_all()
    assert _defective_qty(db_session, parent.item_id, ASSEMBLY) == D("3")
    assert _prod_qty(db_session, child.item_id, DepartmentEnum.VACUUM) == D("0")
    assert [
        db_session.get(DefectQuarantineRecord, record.record_id).remaining_quantity
        for record in records
    ] == [D("1"), D("2")]
    reversed_movements = db_session.query(DefectInventoryMovement).filter(
        DefectInventoryMovement.reverses_movement_id.isnot(None)
    ).all()
    assert {movement.record_id for movement in reversed_movements} == {
        record.record_id for record in records
    }


def test_execute_all_lines_defect_disassemble_rejects_duplicate_record_before_mutation(
    db_session, make_item, make_location, make_bom
):
    parent = make_item(name="DUP-PARENT", process_type_code="PF", warehouse_qty=D("0"))
    child = make_item(name="DUP-CHILD", process_type_code="VR", warehouse_qty=D("0"))
    make_bom(parent.item_id, child.item_id, D("1"))
    make_location(
        parent.item_id,
        department=ASSEMBLY,
        status=LocationStatusEnum.DEFECTIVE,
        quantity=D("2"),
    )
    db_session.query(Inventory).filter(Inventory.item_id == parent.item_id).one().quantity = D("2")
    employee = _make_employee(db_session, code="DUP-REWORK")
    record = DefectQuarantineRecord(
        item_id=parent.item_id,
        department=ASSEMBLY.value,
        original_quantity=D("2"),
        remaining_quantity=D("2"),
    )
    db_session.add(record)
    db_session.flush()
    request = _make_request(
        db_session,
        employee,
        request_type=StockRequestTypeEnum.DEFECT_DISASSEMBLE,
        requires_warehouse_approval=False,
        notes=json.dumps({
            "child_decisions": [{
                "item_id": str(child.item_id),
                "qty": "2",
                "normal_qty": "2",
                "defective_qty": "0",
                "scrap_qty": "0",
            }]
        }),
    )
    lines = [
        _add_line(
            db_session,
            request,
            parent,
            quantity=D("1"),
            from_bucket=RequestBucketEnum.DEFECTIVE,
            to_bucket=RequestBucketEnum.NONE,
            from_department=ASSEMBLY.value,
            record_id=record.record_id,
        )
        for _ in range(2)
    ]

    with pytest.raises(ValueError, match="중복"):
        svc._execute_all_lines(
            db_session,
            request,
            lines,
            operator_name=employee.name,
            approver=employee,
        )

    assert _defective_qty(db_session, parent.item_id, ASSEMBLY) == D("2")
    assert record.remaining_quantity == D("2")
    assert _prod_qty(db_session, child.item_id, DepartmentEnum.VACUUM) == D("0")
    assert _logs(db_session, parent.item_id) == []


def test_prepare_defect_disassemble_sources_rejects_stale_record_quantity(
    db_session, make_item, make_location
):
    parent = make_item(name="STALE-MULTI-PARENT", process_type_code="PF", warehouse_qty=D("0"))
    make_location(
        parent.item_id,
        department=ASSEMBLY,
        status=LocationStatusEnum.DEFECTIVE,
        quantity=D("2"),
    )
    db_session.query(Inventory).filter(Inventory.item_id == parent.item_id).one().quantity = D("2")
    employee = _make_employee(db_session, code="STALE-MULTI-REWORK")
    records = [
        DefectQuarantineRecord(
            item_id=parent.item_id,
            department=ASSEMBLY.value,
            original_quantity=D("1"),
            remaining_quantity=D("1"),
        )
        for _ in range(2)
    ]
    db_session.add_all(records)
    db_session.flush()
    request = _make_request(
        db_session,
        employee,
        request_type=StockRequestTypeEnum.DEFECT_DISASSEMBLE,
    )
    lines = [
        _add_line(
            db_session,
            request,
            parent,
            quantity=quantity,
            from_bucket=RequestBucketEnum.DEFECTIVE,
            to_bucket=RequestBucketEnum.NONE,
            from_department=ASSEMBLY.value,
            record_id=record.record_id,
        )
        for record, quantity in zip(records, (D("1"), D("2")))
    ]

    with pytest.raises(ValueError, match="처리 가능 수량"):
        svc._prepare_defect_disassemble_sources(db_session, lines)

    assert _defective_qty(db_session, parent.item_id, ASSEMBLY) == D("2")
    assert [record.remaining_quantity for record in records] == [D("1"), D("1")]
    assert _logs(db_session, parent.item_id) == []

def test_execute_line_raw_ship_insufficient_raises(db_session, make_item):
    """RAW_SHIP 창고 재고 부족 → ValueError."""
    item = make_item(name="RSX", warehouse_qty=D("2"))
    emp = _make_employee(db_session)
    req = _make_request(db_session, emp, request_type=StockRequestTypeEnum.RAW_SHIP)
    line = _add_line(
        db_session, req, item, quantity=D("5"),
        from_bucket=RequestBucketEnum.WAREHOUSE, to_bucket=RequestBucketEnum.NONE,
    )
    with pytest.raises(ValueError):
        svc._execute_line(db_session, req, line, approver=emp, is_approval=False)


def test_release_then_execute_line_approval_consumes_stock(db_session, make_item):
    """Final approval releases the request once before line execution."""
    item = make_item(name="APR", process_type_code="AR", warehouse_qty=D("10"), pending=D("3"))
    emp = _make_employee(db_session)
    req = _make_request(db_session, emp, request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT)
    line = _add_line(
        db_session, req, item, quantity=D("3"),
        from_bucket=RequestBucketEnum.WAREHOUSE, to_bucket=RequestBucketEnum.PRODUCTION,
        to_department=ASSEMBLY.value,
    )
    req.status = StockRequestStatusEnum.RESERVED

    svc.release_reservation(db_session, req, actor=emp)
    svc._execute_line(db_session, req, line, approver=emp, is_approval=True)
    db_session.flush()

    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    assert inv.pending_quantity == D("0")  # release 됨
    assert inv.warehouse_qty == D("7")
    assert _prod_qty(db_session, item.item_id, ASSEMBLY) == D("3")
    logs = _logs(db_session, item.item_id)
    assert len(logs) == 1
    assert "승인 처리" in (logs[0].notes or "")


# ══════════════════════════ _execute_all_lines ══════════════════════════


def test_execute_all_lines_multiline(db_session, make_item):
    """다라인 RAW_RECEIVE: 각 라인 처리 + 라인당 로그 1개."""
    item_a = make_item(name="MA", warehouse_qty=D("0"))
    item_b = make_item(name="MB", warehouse_qty=D("1"))
    emp = _make_employee(db_session)
    req = _make_request(db_session, emp, request_type=StockRequestTypeEnum.RAW_RECEIVE)
    line_a = _add_line(
        db_session, req, item_a, quantity=D("4"),
        from_bucket=RequestBucketEnum.NONE, to_bucket=RequestBucketEnum.WAREHOUSE,
    )
    line_b = _add_line(
        db_session, req, item_b, quantity=D("2"),
        from_bucket=RequestBucketEnum.NONE, to_bucket=RequestBucketEnum.WAREHOUSE,
    )

    svc._execute_all_lines(
        db_session, req, [line_a, line_b],
        operator_name=emp.name, approver=emp, is_approval=False,
    )
    db_session.flush()

    assert _wh_qty(db_session, item_a.item_id) == D("4")
    assert _wh_qty(db_session, item_b.item_id) == D("3")
    assert len(_logs(db_session, item_a.item_id)) == 1
    assert len(_logs(db_session, item_b.item_id)) == 1


def test_execute_all_lines_records_one_operation_for_request(db_session, make_item):
    item_a = make_item(name="원장 요청 A", warehouse_qty=D("0"))
    item_b = make_item(name="원장 요청 B", warehouse_qty=D("0"))
    employee = _make_employee(db_session, code="SR-LEDGER")
    request = _make_request(
        db_session,
        employee,
        request_type=StockRequestTypeEnum.RAW_RECEIVE,
    )
    lines = [
        _add_line(
            db_session,
            request,
            item,
            quantity=D("1"),
            from_bucket=RequestBucketEnum.NONE,
            to_bucket=RequestBucketEnum.WAREHOUSE,
        )
        for item in (item_a, item_b)
    ]
    db_session.add(
        SystemSetting(
            setting_key="inventory_operation_cutover_at",
            setting_value="2026-01-01T00:00:00",
        )
    )
    db_session.commit()

    svc._execute_all_lines(
        db_session,
        request,
        lines,
        operator_name=employee.name,
        approver=employee,
    )
    db_session.flush()

    operation = db_session.query(InventoryOperation).one()
    logs = db_session.query(TransactionLog).order_by(TransactionLog.created_at).all()
    assert {log.operation_id for log in logs} == {operation.operation_id}
    assert {log.operation_role for log in logs} == {
        InventoryOperationRoleEnum.PRIMARY
    }
    effect = db_session.query(InventoryOperationEffect).one()
    assert effect.subject_type == "StockRequest"
    assert effect.before_state == {"status": "submitted"}
    assert effect.after_state == {"status": "completed"}


def test_execute_all_lines_prelocks_physical_ledger_before_line_execution(
    db_session,
    make_item,
    monkeypatch,
):
    """승인 라인이 격리 레코드에 접근하기 전에 B/Z/U 잠금까지 끝내야 한다."""
    from app.services import warehouse_map as warehouse_map_svc

    item = make_item(name="physical-prelock-before-record", warehouse_qty=D("1"))
    employee = _make_employee(db_session, code="SR-PHYSICAL-PRELOCK")
    request = _make_request(
        db_session,
        employee,
        request_type=StockRequestTypeEnum.DEFECT_SCRAP,
    )
    line = _add_line(
        db_session,
        request,
        item,
        quantity=D("1"),
        from_bucket=RequestBucketEnum.DEFECTIVE,
        to_bucket=RequestBucketEnum.NONE,
        from_department=ASSEMBLY.value,
    )
    events: list[tuple[str, object]] = []

    monkeypatch.setattr(svc, "_uses_row_locks", lambda _db: True)
    monkeypatch.setattr(
        svc.inventory_svc,
        "_ensure_and_lock_inventories",
        lambda _db, item_ids: events.append(("inventory", item_ids)) or {},
    )

    def lock_physical(_db, **kwargs):
        events.append(("physical", kwargs))

    monkeypatch.setattr(warehouse_map_svc, "lock_warehouse_map_rows", lock_physical)
    monkeypatch.setattr(
        svc,
        "_execute_line",
        lambda *_args, **_kwargs: events.append(("record", line.item_id)),
    )

    svc._execute_all_lines(
        db_session,
        request,
        [line],
        operator_name=employee.name,
        approver=employee,
        is_approval=True,
    )

    assert events == [
        ("inventory", [item.item_id]),
        (
            "physical",
            {
                "item_ids": [item.item_id],
                "include_boxes_for_item_ids": True,
                "include_zones_for_item_ids": True,
            },
        ),
        ("record", item.item_id),
    ]


# ══════════════════════════ _finalize_submission ══════════════════════════


def test_finalize_warehouse_primary_self_approves(db_session, make_item):
    """창고 primary 본인 wh_to_dept 제출 → 즉시 COMPLETED + 실재고 이동 + approved_by 기록."""
    item = make_item(name="FIN1", process_type_code="AR", warehouse_qty=D("10"))
    emp = _make_employee(db_session, warehouse_role="primary")
    req = _make_request(
        db_session, emp, request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
        requires_warehouse_approval=True,
    )
    _add_line(
        db_session, req, item, quantity=D("4"),
        from_bucket=RequestBucketEnum.WAREHOUSE, to_bucket=RequestBucketEnum.PRODUCTION,
        to_department=ASSEMBLY.value,
    )

    now = datetime.utcnow()
    svc._finalize_submission(db_session, request=req, requester=emp, now=now)
    db_session.flush()

    assert req.status == StockRequestStatusEnum.COMPLETED
    assert req.completed_at == now
    assert req.approved_at == now
    # 자가승인 → approved_by 기록
    assert req.approved_by_employee_id == emp.employee_id
    assert req.approved_by_name == emp.name
    # 컬럼은 그대로 True 유지 (감사 추적 보존)
    assert req.requires_warehouse_approval is True

    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    assert inv.warehouse_qty == D("6")
    assert inv.pending_quantity == D("0")  # pending 자체가 생기지 않음
    assert _prod_qty(db_session, item.item_id, ASSEMBLY) == D("4")
    assert len(_logs(db_session, item.item_id)) == 1
    assert all(li.status == StockRequestStatusEnum.COMPLETED for li in req.lines)


def test_finalize_warehouse_deputy_self_approves(db_session, make_item):
    """창고 deputy 도 동일하게 자가승인 → COMPLETED."""
    item = make_item(name="FIN2", warehouse_qty=D("5"))
    emp = _make_employee(db_session, warehouse_role="deputy")
    req = _make_request(
        db_session, emp, request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
        requires_warehouse_approval=True,
    )
    _add_line(
        db_session, req, item, quantity=D("2"),
        from_bucket=RequestBucketEnum.WAREHOUSE, to_bucket=RequestBucketEnum.PRODUCTION,
        to_department=ASSEMBLY.value,
    )

    svc._finalize_submission(db_session, request=req, requester=emp, now=datetime.utcnow())
    db_session.flush()

    assert req.status == StockRequestStatusEnum.COMPLETED
    assert _wh_qty(db_session, item.item_id) == D("3")


def test_finalize_warehouse_primary_self_approves_dual_request(db_session, make_item):
    item = make_item(name="dual-self-approval", warehouse_qty=D("5"))
    requester = _make_employee(
        db_session,
        code="DUAL-WH-SELF",
        warehouse_role="primary",
    )
    request = _make_request(
        db_session,
        requester,
        request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
        requires_warehouse_approval=True,
        requires_department_approval=True,
    )
    _add_line(
        db_session,
        request,
        item,
        quantity=D("2"),
        from_bucket=RequestBucketEnum.WAREHOUSE,
        to_bucket=RequestBucketEnum.PRODUCTION,
        to_department=ASSEMBLY.value,
    )

    svc._finalize_submission(
        db_session,
        request=request,
        requester=requester,
        now=datetime.utcnow(),
    )
    db_session.flush()

    assert request.status == StockRequestStatusEnum.RESERVED
    assert request.approved_by_employee_id == requester.employee_id
    assert request.department_approved_by_employee_id is None
    assert _wh_qty(db_session, item.item_id) == D("5")
    inventory = db_session.query(Inventory).filter(
        Inventory.item_id == item.item_id
    ).one()
    assert inventory.pending_quantity == D("2")


def test_finalize_department_primary_waits_for_warehouse_before_self_approval(
    db_session,
    make_item,
):
    item = make_item(name="dual-department-self-approval", warehouse_qty=D("5"))
    requester = _make_employee(
        db_session,
        code="DUAL-DEPT-SELF",
        warehouse_role="none",
    )
    requester.department_role = "primary"
    request = _make_request(
        db_session,
        requester,
        request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
        requires_warehouse_approval=True,
        requires_department_approval=True,
    )
    _add_line(
        db_session,
        request,
        item,
        quantity=D("2"),
        from_bucket=RequestBucketEnum.WAREHOUSE,
        to_bucket=RequestBucketEnum.PRODUCTION,
        to_department=ASSEMBLY.value,
    )

    svc._finalize_submission(
        db_session,
        request=request,
        requester=requester,
        now=datetime.utcnow(),
    )
    db_session.flush()

    assert request.status == StockRequestStatusEnum.RESERVED
    assert request.approved_by_employee_id is None
    assert request.department_approved_by_employee_id is None
    assert _wh_qty(db_session, item.item_id) == D("5")


def test_finalize_admin_does_not_self_approve_department_part(db_session, make_item):
    item = make_item(name="dual-admin-department-rule", warehouse_qty=D("5"))
    requester = _make_employee(
        db_session,
        code="DUAL-ADMIN",
        level=EmployeeLevelEnum.ADMIN,
    )
    request = _make_request(
        db_session,
        requester,
        request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
        requires_warehouse_approval=True,
        requires_department_approval=True,
    )
    _add_line(
        db_session,
        request,
        item,
        quantity=D("2"),
        from_bucket=RequestBucketEnum.WAREHOUSE,
        to_bucket=RequestBucketEnum.PRODUCTION,
        to_department=ASSEMBLY.value,
    )

    svc._finalize_submission(
        db_session,
        request=request,
        requester=requester,
        now=datetime.utcnow(),
    )
    db_session.flush()

    assert request.status == StockRequestStatusEnum.RESERVED
    assert request.department_approved_by_employee_id is None
    inventory = db_session.query(Inventory).filter(
        Inventory.item_id == item.item_id
    ).one()
    assert inventory.pending_quantity == D("2")


def test_finalize_non_warehouse_requester_reserves(db_session, make_item):
    """warehouse_role=none 일반 직원의 wh_to_dept → RESERVED + pending 생성, 로그 없음."""
    item = make_item(name="FIN3", warehouse_qty=D("5"))
    emp = _make_employee(db_session, warehouse_role="none")
    req = _make_request(
        db_session, emp, request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
        requires_warehouse_approval=True,
    )
    _add_line(
        db_session, req, item, quantity=D("2"),
        from_bucket=RequestBucketEnum.WAREHOUSE, to_bucket=RequestBucketEnum.PRODUCTION,
        to_department=ASSEMBLY.value,
    )

    svc._finalize_submission(db_session, request=req, requester=emp, now=datetime.utcnow())
    db_session.flush()

    assert req.status == StockRequestStatusEnum.RESERVED
    assert req.reserved_at is not None
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    assert inv.pending_quantity == D("2")
    assert inv.warehouse_qty == D("5")  # 미차감
    assert len(_logs(db_session, item.item_id)) == 0  # 승인 전 로그 없음
    assert all(li.status == StockRequestStatusEnum.RESERVED for li in req.lines)


def test_finalize_dept_to_warehouse_reserves_production_source(
    db_session, make_item, make_location
):
    item = make_item(name="department-source")
    make_location(item.item_id, department=ASSEMBLY, quantity=D("5"))
    requester = _make_employee(db_session, warehouse_role="none")
    request = _make_request(
        db_session,
        requester,
        request_type=StockRequestTypeEnum.DEPT_TO_WAREHOUSE,
        requires_warehouse_approval=True,
    )
    _add_line(
        db_session,
        request,
        item,
        quantity=D("4"),
        from_bucket=RequestBucketEnum.PRODUCTION,
        to_bucket=RequestBucketEnum.WAREHOUSE,
        from_department=ASSEMBLY.value,
    )

    svc._finalize_submission(
        db_session, request=request, requester=requester, now=datetime.utcnow()
    )
    db_session.flush()

    assert request.status == StockRequestStatusEnum.RESERVED
    assert _loc_pending(db_session, item.item_id) == D("4")


def test_approve_dept_to_warehouse_rereserves_live_code_source(
    db_session, make_item, make_location, monkeypatch
):
    """승인 전 코드가 바뀌면 기존 예약을 푼 뒤 새 부서를 다시 예약해 실행한다."""
    item = make_item(name="live D2W reservation", process_type_code="AR", warehouse_qty=D("0"))
    make_location(item.item_id, department=ASSEMBLY, quantity=D("1"))
    make_location(item.item_id, department=TUBE, quantity=D("1"))
    requester = _make_employee(db_session, warehouse_role="none")
    approver = _make_employee(db_session, code="WH-APP", warehouse_role="primary")
    request = _make_request(
        db_session,
        requester,
        request_type=StockRequestTypeEnum.DEPT_TO_WAREHOUSE,
        requires_warehouse_approval=True,
    )
    _add_line(
        db_session,
        request,
        item,
        quantity=D("1"),
        from_bucket=RequestBucketEnum.PRODUCTION,
        to_bucket=RequestBucketEnum.WAREHOUSE,
        from_department=ASSEMBLY.value,
    )
    svc._finalize_submission(db_session, request=request, requester=requester, now=datetime.utcnow())
    assert request.status == StockRequestStatusEnum.RESERVED

    item.process_type_code = "TR"
    db_session.flush()
    from app.services import sr_reservation

    original_reserve = sr_reservation.reserve_lines
    reroute_reservations: list[str | None] = []

    def capture_live_reservation(db, lines, *, employee=None):
        lines = list(lines)
        reroute_reservations.extend(line.from_department for line in lines)
        return original_reserve(db, lines, employee=employee)

    monkeypatch.setattr(sr_reservation, "reserve_lines", capture_live_reservation)
    sr_approval.approve_request(db_session, request, approver=approver, pin="0000")

    assert reroute_reservations == [TUBE.value]
    assert request.lines[0].from_department == TUBE.value
    assert _prod_qty(db_session, item.item_id, ASSEMBLY) == D("1")
    assert _prod_qty(db_session, item.item_id, TUBE) == D("0")
    assert _loc_pending(db_session, item.item_id, TUBE) == D("0")
    assert _wh_qty(db_session, item.item_id) == D("1")


def test_live_reroute_preflight_does_not_consume_competing_pending_stock(
    db_session, make_item, make_location
):
    """코드 변경 뒤 새 부서의 다른 대기 예약을 넘겨 출고할 수 없다."""
    item = make_item(name="competing live D2W", process_type_code="AR", warehouse_qty=D("0"))
    make_location(item.item_id, department=ASSEMBLY, quantity=D("1"))
    make_location(item.item_id, department=TUBE, quantity=D("1"))
    requester = _make_employee(db_session, warehouse_role="none")
    old_request = _make_request(
        db_session,
        requester,
        request_type=StockRequestTypeEnum.DEPT_TO_WAREHOUSE,
        requires_warehouse_approval=True,
    )
    _add_line(
        db_session,
        old_request,
        item,
        quantity=D("1"),
        from_bucket=RequestBucketEnum.PRODUCTION,
        to_bucket=RequestBucketEnum.WAREHOUSE,
        from_department=ASSEMBLY.value,
    )
    svc._finalize_submission(
        db_session, request=old_request, requester=requester, now=datetime.utcnow()
    )
    item.process_type_code = "TR"
    db_session.flush()

    competing_request = _make_request(
        db_session,
        requester,
        request_type=StockRequestTypeEnum.DEPT_TO_WAREHOUSE,
        requires_warehouse_approval=True,
    )
    _add_line(
        db_session,
        competing_request,
        item,
        quantity=D("1"),
        from_bucket=RequestBucketEnum.PRODUCTION,
        to_bucket=RequestBucketEnum.WAREHOUSE,
        from_department=TUBE.value,
    )
    svc._finalize_submission(
        db_session, request=competing_request, requester=requester, now=datetime.utcnow()
    )
    assert _loc_pending(db_session, item.item_id, TUBE) == D("1")

    svc.release_reservation(db_session, old_request, actor=requester)
    with pytest.raises(ValueError, match="부서 가용 재고 부족"):
        svc.reroute_and_preflight_dept_to_warehouse(
            db_session,
            old_request,
            actor=requester,
        )

    assert _prod_qty(db_session, item.item_id, TUBE) == D("1")
    assert _loc_pending(db_session, item.item_id, TUBE) == D("1")
    assert _wh_qty(db_session, item.item_id) == D("0")


def test_finalize_inbound_only_approval_stays_submitted(db_session, make_item):
    item = make_item(name="inbound-only")
    requester = _make_employee(db_session, warehouse_role="none")
    request = _make_request(
        db_session,
        requester,
        request_type=StockRequestTypeEnum.RAW_RECEIVE,
        requires_warehouse_approval=True,
    )
    _add_line(
        db_session,
        request,
        item,
        quantity=D("4"),
        from_bucket=RequestBucketEnum.NONE,
        to_bucket=RequestBucketEnum.WAREHOUSE,
    )

    svc._finalize_submission(
        db_session, request=request, requester=requester, now=datetime.utcnow()
    )

    assert request.status == StockRequestStatusEnum.SUBMITTED
    assert all(line.status == StockRequestStatusEnum.SUBMITTED for line in request.lines)


def test_finalize_no_approval_required_completes(db_session, make_item, make_location):
    """승인 불필요(dept_internal, requires_*=False) → 즉시 COMPLETED, approved_by null 유지."""
    item = make_item(name="FIN4", warehouse_qty=D("0"))
    make_location(item.item_id, department=ASSEMBLY,
                  status=LocationStatusEnum.PRODUCTION, quantity=D("5"))
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = D("5")
    db_session.flush()

    emp = _make_employee(db_session, warehouse_role="none")
    req = _make_request(
        db_session, emp, request_type=StockRequestTypeEnum.DEPT_INTERNAL,
        requires_warehouse_approval=False, requires_department_approval=False,
    )
    _add_line(
        db_session, req, item, quantity=D("3"),
        from_bucket=RequestBucketEnum.PRODUCTION, to_bucket=RequestBucketEnum.PRODUCTION,
        from_department=ASSEMBLY.value, to_department=HV.value,
    )

    svc._finalize_submission(db_session, request=req, requester=emp, now=datetime.utcnow())
    db_session.flush()

    assert req.status == StockRequestStatusEnum.COMPLETED
    # 결재 불필요 타입 → approved_by null 유지 (같은 사람 요청자/승인자 혼란 방지)
    assert req.approved_by_employee_id is None
    assert req.approved_by_name is None
    assert _prod_qty(db_session, item.item_id, ASSEMBLY) == D("2")
    assert _prod_qty(db_session, item.item_id, HV) == D("3")
    assert len(_logs(db_session, item.item_id)) == 1


def test_finalize_admin_without_warehouse_role_waits_for_approval(db_session, make_item):
    """admin level만으로는 창고 결재 권한이 생기지 않는다."""
    item = make_item(name="FIN5", warehouse_qty=D("9"))
    emp = _make_employee(db_session, warehouse_role="none", level=EmployeeLevelEnum.ADMIN)
    req = _make_request(
        db_session, emp, request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
        requires_warehouse_approval=True,
    )
    _add_line(
        db_session, req, item, quantity=D("3"),
        from_bucket=RequestBucketEnum.WAREHOUSE, to_bucket=RequestBucketEnum.PRODUCTION,
        to_department=ASSEMBLY.value,
    )

    svc._finalize_submission(db_session, request=req, requester=emp, now=datetime.utcnow())
    db_session.flush()

    assert req.status == StockRequestStatusEnum.RESERVED
    assert req.approved_by_employee_id is None
    assert _wh_qty(db_session, item.item_id) == D("9")
    inventory = db_session.query(Inventory).filter(
        Inventory.item_id == item.item_id
    ).one()
    assert inventory.pending_quantity == D("3")


# ══════════════════════════ release_reservation ══════════════════════════


def test_release_reservation_restores_pending(db_session, make_item):
    """RESERVED 상태 라인의 pending 원복."""
    item = make_item(name="REL", warehouse_qty=D("10"), pending=D("4"))
    emp = _make_employee(db_session)
    req = _make_request(db_session, emp, request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT)
    req.status = StockRequestStatusEnum.RESERVED
    _add_line(
        db_session, req, item, quantity=D("4"),
        from_bucket=RequestBucketEnum.WAREHOUSE, to_bucket=RequestBucketEnum.PRODUCTION,
        to_department=ASSEMBLY.value,
    )
    db_session.flush()

    svc.release_reservation(db_session, req, actor=emp)
    db_session.flush()

    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    assert inv.pending_quantity == D("0")


def test_release_reservation_noop_when_not_reserved(db_session, make_item):
    """RESERVED 가 아니면 아무 변화 없음 (pending 유지)."""
    item = make_item(name="REL2", warehouse_qty=D("10"), pending=D("4"))
    emp = _make_employee(db_session)
    req = _make_request(db_session, emp, request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT)
    req.status = StockRequestStatusEnum.SUBMITTED  # not RESERVED
    _add_line(
        db_session, req, item, quantity=D("4"),
        from_bucket=RequestBucketEnum.WAREHOUSE, to_bucket=RequestBucketEnum.PRODUCTION,
        to_department=ASSEMBLY.value,
    )
    db_session.flush()

    svc.release_reservation(db_session, req, actor=emp)
    db_session.flush()

    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    assert inv.pending_quantity == D("4")  # 불변


def test_release_reservation_locks_sorted_unique_inventories_before_source_release(
    db_session, make_item, monkeypatch
):
    from app.services import sr_reservation

    first = make_item(name="release-lock-first", warehouse_qty=D("10"))
    second = make_item(name="release-lock-second", warehouse_qty=D("10"))
    emp = _make_employee(db_session, code="REL-LOCK")
    req = _make_request(
        db_session,
        emp,
        request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
    )
    req.status = StockRequestStatusEnum.RESERVED
    for item in (second, first, second):
        _add_line(
            db_session,
            req,
            item,
            quantity=D("1"),
            from_bucket=RequestBucketEnum.WAREHOUSE,
            to_bucket=RequestBucketEnum.PRODUCTION,
            to_department=ASSEMBLY.value,
        )

    events = []

    def lock_inventories(_db, item_ids):
        events.append(("lock", item_ids))
        return {item_id: object() for item_id in item_ids}

    def _release_lines_stub(_db, _lines, **_kwargs):
        events.append(("release", None))

    monkeypatch.setattr(svc, "_uses_row_locks", lambda _db: True)
    monkeypatch.setattr(svc.inventory_svc, "lock_inventories", lock_inventories)
    monkeypatch.setattr(sr_reservation, "_release_lines", _release_lines_stub)

    svc.release_reservation(db_session, req, actor=emp)

    assert events == [
        ("lock", sorted({first.item_id, second.item_id})),
        ("release", None),
    ]


@pytest.mark.parametrize("operation", ["release", "execute"])
def test_rework_first_prelock_includes_recursive_child_tree(
    db_session, make_item, monkeypatch, operation
):
    from app.services import sr_reservation

    parent = make_item(name=f"rework-{operation}-parent")
    branch = make_item(name=f"rework-{operation}-branch")
    normal = make_item(name=f"rework-{operation}-normal")
    defective = make_item(name=f"rework-{operation}-defective")
    scrap = make_item(name=f"rework-{operation}-scrap")
    employee = _make_employee(db_session, code=f"RW-{operation.upper()}")
    request = _make_request(
        db_session,
        employee,
        request_type=StockRequestTypeEnum.REWORK_NORMAL,
        requires_warehouse_approval=False,
        notes=json.dumps(
            {
                "child_decisions": [
                    {
                        "item_id": str(branch.item_id),
                        "qty": "1",
                        "children": [
                            {
                                "item_id": str(normal.item_id),
                                "qty": "1",
                                "normal_qty": "1",
                                "defective_qty": "0",
                                "scrap_qty": "0",
                            },
                            {
                                "item_id": str(defective.item_id),
                                "qty": "1",
                                "normal_qty": "0",
                                "defective_qty": "1",
                                "scrap_qty": "0",
                            },
                            {
                                "item_id": str(scrap.item_id),
                                "qty": "1",
                                "normal_qty": "0",
                                "defective_qty": "0",
                                "scrap_qty": "1",
                            },
                        ],
                    }
                ]
            }
        ),
    )
    request.status = StockRequestStatusEnum.RESERVED
    line = _add_line(
        db_session,
        request,
        parent,
        quantity=D("1"),
        from_bucket=RequestBucketEnum.PRODUCTION,
        to_bucket=RequestBucketEnum.NONE,
        from_department=ASSEMBLY.value,
    )
    expected_ids = sorted(
        {parent.item_id, branch.item_id, normal.item_id, defective.item_id, scrap.item_id}
    )
    events = []

    monkeypatch.setattr(svc, "_uses_row_locks", lambda _db: True)
    monkeypatch.setattr(
        svc.inventory_svc,
        "_ensure_and_lock_inventories",
        lambda _db, item_ids: events.append(("lock", item_ids)) or {},
    )
    if operation == "release":
        monkeypatch.setattr(
            sr_reservation,
            "_release_lines",
            lambda *_args, **_kwargs: events.append(("release", None)),
        )
        svc.release_reservation(db_session, request, actor=employee)
    else:
        monkeypatch.setattr(
            svc,
            "_execute_line",
            lambda *_args, **_kwargs: events.append(("execute", line.item_id)),
        )
        svc._execute_all_lines(
            db_session,
            request,
            [line],
            operator_name=employee.name,
            approver=employee,
        )

    assert events[0] == ("lock", expected_ids)


@pytest.mark.parametrize(
    "request_type",
    [
        StockRequestTypeEnum.REWORK_NORMAL,
        StockRequestTypeEnum.DEFECT_DISASSEMBLE,
    ],
)
def test_execute_all_lines_locks_all_rework_items_before_touched_inventories(
    db_session, make_item, monkeypatch, request_type
):
    parent = make_item(name=f"{request_type.value}-lock-parent")
    child = make_item(name=f"{request_type.value}-lock-child")
    employee = _make_employee(db_session, code=f"LOCK-{request_type.value}")
    request = _make_request(
        db_session,
        employee,
        request_type=request_type,
        requires_warehouse_approval=False,
        notes=json.dumps({
            "child_decisions": [{
                "item_id": str(child.item_id),
                "qty": "1",
                "normal_qty": "1",
                "defective_qty": "0",
                "scrap_qty": "0",
            }],
        }),
    )
    line = _add_line(
        db_session,
        request,
        parent,
        quantity=D("1"),
        from_bucket=RequestBucketEnum.PRODUCTION,
        to_bucket=RequestBucketEnum.NONE,
        from_department=ASSEMBLY.value,
    )
    expected_ids = sorted([parent.item_id, child.item_id])
    events = []

    monkeypatch.setattr(svc, "_uses_row_locks", lambda _db: True)
    monkeypatch.setattr(svc, "_requires_exact_defect_selection", lambda *_args: False)
    monkeypatch.setattr(
        svc,
        "lock_items_for_department_routing",
        lambda _db, item_ids: events.append(("items", sorted(item_ids))) or {},
    )
    monkeypatch.setattr(
        svc.inventory_svc,
        "_ensure_and_lock_inventories",
        lambda _db, item_ids: events.append(("inventory", item_ids)) or {},
    )
    monkeypatch.setattr(svc, "_execute_line", lambda *_args, **_kwargs: None)

    svc._execute_all_lines(
        db_session,
        request,
        [line],
        operator_name=employee.name,
        approver=employee,
    )

    assert events[:2] == [("items", expected_ids), ("inventory", expected_ids)]
