"""services/sr_execution.py 회귀 그물 테스트.

대상: _execute_line / _execute_all_lines / _finalize_submission.
현재 동작 고정용 — 코드는 절대 수정하지 않는다.

검증 초점:
- 요청 타입별(RAW_RECEIVE/RAW_SHIP/WAREHOUSE_TO_DEPT/DEPT_TO_WAREHOUSE/
  DEPT_INTERNAL/MARK_DEFECTIVE_WH/MARK_DEFECTIVE_PROD) 재고 이동 + TransactionLog 생성
- _finalize_submission 자가승인 분기 (창고 primary/deputy / admin / 일반직원 RESERVED)
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
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    LocationStatusEnum,
    RequestBucketEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services.pin_auth import DEFAULT_PIN_HASH
from app.services import sr_execution as svc

D = Decimal
ASSEMBLY = DepartmentEnum.ASSEMBLY
HV = DepartmentEnum.HIGH_VOLTAGE


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
    )
    db_session.add(req)
    db_session.flush()
    return req


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


def test_execute_line_warehouse_to_dept(db_session, make_item):
    """WAREHOUSE_TO_DEPT: 창고 -qty / 부서 생산 +qty, 총량 불변, change=0."""
    item = make_item(name="W2D", warehouse_qty=D("10"))
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


def test_execute_line_warehouse_to_dept_missing_dept_raises(db_session, make_item):
    """WAREHOUSE_TO_DEPT 인데 to_department 누락 → ValueError."""
    item = make_item(name="W2DX", warehouse_qty=D("10"))
    emp = _make_employee(db_session)
    req = _make_request(db_session, emp, request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT)
    line = _add_line(
        db_session, req, item, quantity=D("3"),
        from_bucket=RequestBucketEnum.WAREHOUSE, to_bucket=RequestBucketEnum.PRODUCTION,
        to_department=None,
    )

    with pytest.raises(ValueError):
        svc._execute_line(db_session, req, line, approver=emp, is_approval=False)


def test_execute_line_dept_to_warehouse(db_session, make_item, make_location):
    """DEPT_TO_WAREHOUSE: 부서 생산 -qty / 창고 +qty, 총량 불변, change=0."""
    item = make_item(name="D2W", warehouse_qty=D("0"))
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
    make_location(item.item_id, department=ASSEMBLY,
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
        from_department=ASSEMBLY.value,
    )

    svc._execute_line(db_session, req, line, approver=emp, is_approval=False)
    db_session.flush()

    assert _prod_qty(db_session, item.item_id, ASSEMBLY) == D("3")
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
    make_location(parent.item_id, department=ASSEMBLY,
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
        from_department=ASSEMBLY.value,
    )

    svc._execute_line(db_session, req, line, approver=emp, is_approval=False)
    db_session.flush()

    assert _prod_qty(db_session, parent.item_id, ASSEMBLY) == D("0")
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
    db_session, make_item, make_location
):
    """DEFECT_DISASSEMBLE: 격리 부모도 같은 정상/격리/폐기 3분할 모델을 사용한다."""
    parent = make_item(name="QD-PARENT", process_type_code="PF", warehouse_qty=D("0"))
    child = make_item(name="VAC-CHILD", process_type_code="VR", warehouse_qty=D("0"))
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


def test_execute_line_approval_releases_pending(db_session, make_item):
    """is_approval=True + from_bucket=WAREHOUSE → pending release 후 실재고 이동."""
    item = make_item(name="APR", warehouse_qty=D("10"), pending=D("3"))
    emp = _make_employee(db_session)
    req = _make_request(db_session, emp, request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT)
    line = _add_line(
        db_session, req, item, quantity=D("3"),
        from_bucket=RequestBucketEnum.WAREHOUSE, to_bucket=RequestBucketEnum.PRODUCTION,
        to_department=ASSEMBLY.value,
    )

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


# ══════════════════════════ _finalize_submission ══════════════════════════


def test_finalize_warehouse_primary_self_approves(db_session, make_item):
    """창고 primary 본인 wh_to_dept 제출 → 즉시 COMPLETED + 실재고 이동 + approved_by 기록."""
    item = make_item(name="FIN1", warehouse_qty=D("10"))
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


def test_finalize_admin_self_approves(db_session, make_item):
    """admin 요청자 → 창고 승인 없이도 자가승인 COMPLETED + approved_by 기록."""
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

    assert req.status == StockRequestStatusEnum.COMPLETED
    assert req.approved_by_employee_id == emp.employee_id  # admin self-approved
    assert _wh_qty(db_session, item.item_id) == D("6")


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

    svc.release_reservation(db_session, req)
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

    svc.release_reservation(db_session, req)
    db_session.flush()

    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    assert inv.pending_quantity == D("4")  # 불변
