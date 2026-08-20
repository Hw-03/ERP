from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    Item,
    LocationStatusEnum,
    RequestBucketEnum,
    StockRequest,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
)
from app.services import inventory as inventory_svc
from app.services import sr_approval
from app.services import stock_requests
from app.services.pin_auth import DEFAULT_PIN_HASH
from app.services.sr_validation import LineInput


D = Decimal
ASSEMBLY = DepartmentEnum.ASSEMBLY
TUBE = DepartmentEnum.TUBE


def _seed_item(make_session, *, assembly_qty: int, tube_qty: int = 0):
    session = make_session()
    item = Item(
        item_name="reservation concurrency",
        process_type_code="TR",
        unit="EA",
        model_symbol="9",
        serial_no=1,
    )
    session.add(item)
    session.flush()
    session.add(
        Inventory(
            item_id=item.item_id,
            quantity=assembly_qty + tube_qty,
            warehouse_qty=0,
            pending_quantity=0,
        )
    )
    for department, quantity in ((ASSEMBLY, assembly_qty), (TUBE, tube_qty)):
        if quantity:
            session.add(
                InventoryLocation(
                    item_id=item.item_id,
                    department=department,
                    status=LocationStatusEnum.PRODUCTION,
                    quantity=quantity,
                    pending_quantity=0,
                )
            )
    session.commit()
    item_id = item.item_id
    session.close()
    return item_id


def test_concurrent_same_location_cannot_oversubscribe(make_session):
    item_id = _seed_item(make_session, assembly_qty=5)

    def reserve() -> bool:
        session = make_session()
        try:
            inventory_svc._reserve_location(
                session,
                item_id,
                D("4"),
                department=ASSEMBLY,
                status=LocationStatusEnum.PRODUCTION,
            )
            session.commit()
            return True
        except ValueError:
            session.rollback()
            return False
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: reserve(), range(2)))

    assert sorted(results) == [False, True]
    verify = make_session()
    location = verify.query(InventoryLocation).filter(
        InventoryLocation.item_id == item_id,
        InventoryLocation.department == ASSEMBLY,
    ).one()
    assert location.pending_quantity == D("4")
    verify.close()


def test_concurrent_different_departments_reserve_independently(make_session):
    item_id = _seed_item(make_session, assembly_qty=5, tube_qty=5)

    def reserve(department: DepartmentEnum) -> None:
        session = make_session()
        try:
            inventory_svc._reserve_location(
                session,
                item_id,
                D("4"),
                department=department,
                status=LocationStatusEnum.PRODUCTION,
            )
            session.commit()
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        list(executor.map(reserve, (ASSEMBLY, TUBE)))

    verify = make_session()
    locations = {
        row.department: row.pending_quantity
        for row in verify.query(InventoryLocation).filter(
            InventoryLocation.item_id == item_id
        )
    }
    assert locations == {ASSEMBLY.value: D("4"), TUBE.value: D("4")}
    verify.close()


def test_approve_cancel_race_leaves_no_location_reservation(make_session):
    item_id = _seed_item(make_session, assembly_qty=5)
    setup = make_session()
    requester = Employee(
        employee_code="RACE-REQ",
        name="requester",
        role="assembly/staff",
        department=ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        warehouse_role="none",
        department_role="none",
        display_order=0,
        is_active=True,
        pin_hash=DEFAULT_PIN_HASH,
    )
    approver = Employee(
        employee_code="RACE-APP",
        name="approver",
        role="warehouse/primary",
        department=DepartmentEnum.WAREHOUSE,
        level=EmployeeLevelEnum.STAFF,
        warehouse_role="primary",
        department_role="none",
        display_order=0,
        is_active=True,
        pin_hash=DEFAULT_PIN_HASH,
    )
    setup.add_all((requester, approver))
    setup.flush()
    request = stock_requests.create_request(
        setup,
        requester=requester,
        request_type=StockRequestTypeEnum.DEPT_TO_WAREHOUSE,
        lines_input=[
            LineInput(
                item_id=item_id,
                quantity=D("3"),
                from_bucket=RequestBucketEnum.PRODUCTION,
                from_department=ASSEMBLY,
                to_bucket=RequestBucketEnum.WAREHOUSE,
                to_department=None,
            )
        ],
        reference_no=None,
        notes=None,
    )
    setup.commit()
    request_id = request.request_id
    requester_id = requester.employee_id
    approver_id = approver.employee_id
    setup.close()

    def approve() -> str:
        session = make_session()
        try:
            loaded = session.get(StockRequest, request_id)
            actor = session.get(Employee, approver_id)
            sr_approval.approve_request(session, loaded, approver=actor, pin="0000")
            session.commit()
            return "approved"
        except ValueError:
            session.rollback()
            return "lost"
        finally:
            session.close()

    def cancel() -> str:
        session = make_session()
        try:
            loaded = session.get(StockRequest, request_id)
            actor = session.get(Employee, requester_id)
            sr_approval.cancel_request(session, loaded, requester=actor, pin="0000")
            session.commit()
            return "cancelled"
        except ValueError:
            session.rollback()
            return "lost"
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        approve_future = executor.submit(approve)
        cancel_future = executor.submit(cancel)
        outcomes = {approve_future.result(), cancel_future.result()}

    assert "lost" in outcomes
    verify = make_session()
    final_request = verify.get(StockRequest, request_id)
    location = verify.query(InventoryLocation).filter(
        InventoryLocation.item_id == item_id,
        InventoryLocation.department == ASSEMBLY,
        InventoryLocation.status == LocationStatusEnum.PRODUCTION,
    ).one()
    assert final_request.status in {
        StockRequestStatusEnum.COMPLETED,
        StockRequestStatusEnum.CANCELLED,
    }
    assert location.pending_quantity == D("0")
    verify.close()
