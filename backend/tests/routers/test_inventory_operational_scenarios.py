from __future__ import annotations

from decimal import Decimal

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    LocationStatusEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services.pin_auth import DEFAULT_PIN_HASH, hash_pin

D = Decimal


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
        role=f"{department.value}/staff",
        department=department,
        level=level,
        warehouse_role=warehouse_role,
        department_role=department_role,
        display_order=0,
        is_active="true",
        pin_hash=hash_pin(pin) if pin != "0000" else DEFAULT_PIN_HASH,
    )
    db_session.add(emp)
    db_session.flush()
    return emp


def _stock_request(client, *, requester: Employee, request_type: str, lines: list[dict], **extra):
    payload = {
        "requester_employee_id": str(requester.employee_id),
        "request_type": request_type,
        "lines": lines,
    }
    payload.update(extra)
    res = client.post("/api/stock-requests", json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def _approve_warehouse(client, request_id: str, approver: Employee, pin: str = "0000"):
    res = client.post(
        f"/api/stock-requests/{request_id}/approve",
        json={"actor_employee_id": str(approver.employee_id), "pin": pin},
    )
    assert res.status_code == 200, res.text
    return res.json()


def _approve_department(client, request_id: str, approver: Employee, pin: str = "0000"):
    res = client.post(
        f"/api/stock-requests/{request_id}/department-approve",
        json={"actor_employee_id": str(approver.employee_id), "pin": pin},
    )
    assert res.status_code == 200, res.text
    return res.json()


def _inv(db_session, item_id):
    return db_session.query(Inventory).filter(Inventory.item_id == item_id).one()


def _loc_qty(
    db_session,
    item_id,
    *,
    department: DepartmentEnum,
    status: LocationStatusEnum = LocationStatusEnum.PRODUCTION,
) -> Decimal:
    loc = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == department,
            InventoryLocation.status == status,
        )
        .first()
    )
    return loc.quantity if loc else D("0")


def _latest_log(db_session, item_id, tx_type: TransactionTypeEnum) -> TransactionLog:
    return (
        db_session.query(TransactionLog)
        .filter(
            TransactionLog.item_id == item_id,
            TransactionLog.transaction_type == tx_type,
        )
        .order_by(TransactionLog.created_at.desc(), TransactionLog.log_id.desc())
        .first()
    )


def _assert_auditable(
    log: TransactionLog,
    employee: Employee | None = None,
    *,
    require_reference: bool = True,
):
    assert log is not None
    if require_reference:
        assert log.reference_no
    assert log.produced_by
    assert log.producer_employee_id is not None
    if employee is not None:
        assert log.producer_employee_id == employee.employee_id
    assert log.inventory_effect is not None
    assert any(Decimal(str(cell.get("delta", "0"))) != D("0") for cell in log.inventory_effect)


def test_inventory_day_flow_preserves_quantities_and_audit_trail(db_session, client, make_item):
    item = make_item(name="ops-day-flow", process_type_code="TR", warehouse_qty=D("0"))
    warehouse_user = _make_employee(
        db_session,
        code="OPWH1",
        name="warehouse operator",
        warehouse_role="primary",
    )
    worker = _make_employee(db_session, code="OPWK1", name="assembly worker")
    dept_approver = _make_employee(
        db_session,
        code="OPDP1",
        name="department approver",
        department=DepartmentEnum.HIGH_VOLTAGE,
        department_role="primary",
    )
    db_session.commit()

    received = _stock_request(
        client,
        requester=warehouse_user,
        request_type="raw_receive",
        lines=[{
            "item_id": str(item.item_id),
            "quantity": "100",
            "from_bucket": "none",
            "to_bucket": "warehouse",
        }],
        notes="initial confirmed receive",
    )
    assert received["status"] == "completed"
    db_session.expire_all()
    assert _inv(db_session, item.item_id).warehouse_qty == D("100")
    assert _inv(db_session, item.item_id).quantity == D("100")
    _assert_auditable(_latest_log(db_session, item.item_id, TransactionTypeEnum.RECEIVE), warehouse_user)

    move_to_dept = _stock_request(
        client,
        requester=worker,
        request_type="warehouse_to_dept",
        lines=[{
            "item_id": str(item.item_id),
            "quantity": "30",
            "from_bucket": "warehouse",
            "to_bucket": "production",
            "to_department": DepartmentEnum.ASSEMBLY.value,
        }],
    )
    assert move_to_dept["status"] == "reserved"
    db_session.expire_all()
    assert _inv(db_session, item.item_id).warehouse_qty == D("100")
    assert _inv(db_session, item.item_id).pending_quantity == D("30")

    approved_move = _approve_warehouse(client, move_to_dept["request_id"], warehouse_user)
    assert approved_move["status"] == "completed"
    db_session.expire_all()
    assert _inv(db_session, item.item_id).warehouse_qty == D("70")
    assert _inv(db_session, item.item_id).pending_quantity == D("0")
    assert _inv(db_session, item.item_id).quantity == D("100")
    assert _loc_qty(db_session, item.item_id, department=DepartmentEnum.ASSEMBLY) == D("30")
    _assert_auditable(
        _latest_log(db_session, item.item_id, TransactionTypeEnum.TRANSFER_TO_PROD),
        warehouse_user,
    )

    internal_move = _stock_request(
        client,
        requester=worker,
        request_type="dept_internal",
        lines=[{
            "item_id": str(item.item_id),
            "quantity": "12",
            "from_bucket": "production",
            "from_department": DepartmentEnum.ASSEMBLY.value,
            "to_bucket": "production",
            "to_department": DepartmentEnum.HIGH_VOLTAGE.value,
        }],
    )
    assert internal_move["status"] == "completed"
    db_session.expire_all()
    assert _loc_qty(db_session, item.item_id, department=DepartmentEnum.ASSEMBLY) == D("18")
    assert _loc_qty(db_session, item.item_id, department=DepartmentEnum.HIGH_VOLTAGE) == D("12")
    assert _inv(db_session, item.item_id).quantity == D("100")
    _assert_auditable(_latest_log(db_session, item.item_id, TransactionTypeEnum.TRANSFER_DEPT), worker)

    quarantine = client.post("/api/defects/quarantine", json={
        "item_id": str(item.item_id),
        "qty": "5",
        "source": "production",
        "source_dept": DepartmentEnum.HIGH_VOLTAGE.value,
        "target_dept": DepartmentEnum.HIGH_VOLTAGE.value,
        "reason_category": "inspection fail",
        "reason_memo": "day flow quarantine",
        "actor_employee_id": str(worker.employee_id),
    })
    assert quarantine.status_code == 200, quarantine.text
    db_session.expire_all()
    assert _loc_qty(db_session, item.item_id, department=DepartmentEnum.HIGH_VOLTAGE) == D("7")
    assert _loc_qty(
        db_session,
        item.item_id,
        department=DepartmentEnum.HIGH_VOLTAGE,
        status=LocationStatusEnum.DEFECTIVE,
    ) == D("5")
    assert _inv(db_session, item.item_id).quantity == D("100")
    mark_log = _latest_log(db_session, item.item_id, TransactionTypeEnum.MARK_DEFECTIVE)
    _assert_auditable(mark_log, worker, require_reference=False)
    assert mark_log.reason_category == "inspection fail"

    defect_return = _stock_request(
        client,
        requester=worker,
        request_type="defect_return",
        requires_department_approval=True,
        lines=[{
            "item_id": str(item.item_id),
            "quantity": "2",
            "from_bucket": "defective",
            "from_department": DepartmentEnum.HIGH_VOLTAGE.value,
            "to_bucket": "none",
        }],
        notes="return defective sample",
    )
    if defect_return["status"] != "completed":
        defect_return = _approve_department(client, defect_return["request_id"], dept_approver)
    assert defect_return["status"] == "completed"
    db_session.expire_all()
    assert _loc_qty(
        db_session,
        item.item_id,
        department=DepartmentEnum.HIGH_VOLTAGE,
        status=LocationStatusEnum.DEFECTIVE,
    ) == D("3")
    assert _inv(db_session, item.item_id).quantity == D("98")
    return_log = _latest_log(db_session, item.item_id, TransactionTypeEnum.SUPPLIER_RETURN)
    _assert_auditable(return_log)

    cancel = client.post(
        f"/api/inventory/transactions/{return_log.log_id}/cancel",
        json={"reason": "return entered by mistake", "employee_code": "OPDP1", "pin": "0000"},
    )
    assert cancel.status_code == 200, cancel.text
    db_session.expire_all()
    assert _loc_qty(
        db_session,
        item.item_id,
        department=DepartmentEnum.HIGH_VOLTAGE,
        status=LocationStatusEnum.DEFECTIVE,
    ) == D("5")
    assert _inv(db_session, item.item_id).quantity == D("100")
    cancelled_return = db_session.query(TransactionLog).filter(TransactionLog.log_id == return_log.log_id).one()
    assert cancelled_return.cancelled is True
    assert cancelled_return.cancel_reason == "return entered by mistake"