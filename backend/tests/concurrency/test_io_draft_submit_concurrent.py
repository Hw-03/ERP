"""동일 IoBatch draft의 동시 제출은 한 번만 실행되어야 한다."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from decimal import Decimal
import uuid

import pytest

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    IoBatch,
    IoBundle,
    IoLine,
    Item,
    RequestBucketEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    TransactionLog,
)
from app.services import io_actions
from app.services import stock_request_actions
from app.services.pin_auth import DEFAULT_PIN_HASH


def _setup_draft(make_session):
    session = make_session()
    requester = Employee(
        employee_code="IO-DRAFT-CONCURRENT",
        name="동시 제출자",
        role="창고/사원",
        department=DepartmentEnum.WAREHOUSE.value,
        level=EmployeeLevelEnum.STAFF,
        is_active=True,
        display_order=0,
    )
    item = Item(
        item_name="동시 draft 입고품",
        process_type_code="TR",
        unit="EA",
        model_symbol="9",
        serial_no=1,
    )
    session.add_all([requester, item])
    session.flush()
    session.add(
        Inventory(
            item_id=item.item_id,
            quantity=Decimal("0"),
            warehouse_qty=Decimal("0"),
            pending_quantity=Decimal("0"),
        )
    )
    batch = IoBatch(
        batch_id=uuid.uuid4(),
        work_type="receive",
        sub_type="receive_supplier",
        status="draft",
        requester_employee_id=requester.employee_id,
        requester_name=requester.name,
        requester_department=requester.department,
        requires_approval=False,
    )
    session.add(batch)
    session.flush()
    bundle = IoBundle(
        bundle_id=uuid.uuid4(),
        batch_id=batch.batch_id,
        source_kind="direct_item",
        source_item_id=item.item_id,
        title_snapshot=item.item_name,
        quantity=Decimal("1"),
    )
    session.add(bundle)
    session.flush()
    session.add(
        IoLine(
            line_id=uuid.uuid4(),
            bundle_id=bundle.bundle_id,
            item_id=item.item_id,
            item_name_snapshot=item.item_name,
            mes_code_snapshot=item.mes_code,
            unit=item.unit,
            direction="in",
            from_bucket="none",
            to_bucket="warehouse",
            quantity=Decimal("1"),
            included=True,
            selected=True,
            origin="direct",
        )
    )
    session.commit()
    ids = (batch.batch_id, requester.employee_id, item.item_id)
    session.close()
    return ids


def _setup_reserved_revert_request(make_session):
    session = make_session()
    requester = Employee(
        employee_code="SR-REVERT-STALE",
        name="stale 요청자",
        role="조립/사원",
        department=DepartmentEnum.ASSEMBLY.value,
        level=EmployeeLevelEnum.STAFF,
        is_active=True,
        display_order=0,
        pin_hash=DEFAULT_PIN_HASH,
    )
    item = Item(
        item_name="stale 요청 재고",
        process_type_code="TR",
        unit="EA",
        model_symbol="9",
        serial_no=1,
    )
    session.add_all([requester, item])
    session.flush()
    session.add(
        Inventory(
            item_id=item.item_id,
            quantity=Decimal("5"),
            warehouse_qty=Decimal("5"),
            pending_quantity=Decimal("2"),
        )
    )
    batch = IoBatch(
        batch_id=uuid.uuid4(),
        work_type="warehouse_io",
        sub_type="warehouse_to_dept",
        status="reserved",
        requester_employee_id=requester.employee_id,
        requester_name=requester.name,
        requester_department=requester.department,
        requires_approval=True,
    )
    session.add(batch)
    session.flush()
    request = StockRequest(
        requester_employee_id=requester.employee_id,
        requester_name=requester.name,
        requester_department=requester.department,
        request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
        status=StockRequestStatusEnum.RESERVED,
        requires_warehouse_approval=True,
        operation_batch_id=batch.batch_id,
    )
    session.add(request)
    session.flush()
    session.add(
        StockRequestLine(
            request_id=request.request_id,
            item_id=item.item_id,
            item_name_snapshot=item.item_name,
            mes_code_snapshot=item.mes_code,
            quantity=Decimal("2"),
            from_bucket=RequestBucketEnum.WAREHOUSE,
            to_bucket=RequestBucketEnum.PRODUCTION,
            status=StockRequestStatusEnum.RESERVED,
        )
    )
    session.commit()
    ids = (request.request_id, requester.employee_id, batch.batch_id, item.item_id)
    session.close()
    return ids


@pytest.mark.usefixtures("concurrent_engine")
def test_concurrent_existing_draft_submit_applies_exactly_one_effect(
    concurrent_engine, make_session
):
    batch_id, requester_id, item_id = _setup_draft(make_session)
    successes: list[str] = []
    failures: list[str] = []

    def submit_once() -> None:
        session = make_session()
        try:
            io_actions.submit_existing_draft(
                session,
                batch_id=batch_id,
                requester_employee_id=requester_id,
            )
            successes.append("ok")
        except ValueError as exc:
            failures.append(str(exc))
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(submit_once) for _ in range(2)]
        for future in as_completed(futures):
            future.result()

    verify = make_session()
    batch = verify.query(IoBatch).filter(IoBatch.batch_id == batch_id).one()
    inventory = verify.query(Inventory).filter(Inventory.item_id == item_id).one()
    log_count = verify.query(TransactionLog).filter(TransactionLog.item_id == item_id).count()
    verify.close()

    assert successes == ["ok"]
    assert len(failures) == 1
    assert batch.status == "completed"
    assert inventory.warehouse_qty == Decimal("1")
    assert log_count == 1


@pytest.mark.usefixtures("concurrent_engine")
def test_revert_to_draft_reloads_clicked_request_after_router_preread(
    make_session,
):
    request_id, requester_id, batch_id, item_id = _setup_reserved_revert_request(
        make_session
    )
    router_session = make_session()
    router_session.expire_on_commit = False
    preread_request = (
        router_session.query(StockRequest)
        .filter(StockRequest.request_id == request_id)
        .one()
    )
    requester = (
        router_session.query(Employee)
        .filter(Employee.employee_id == requester_id)
        .one()
    )
    router_session.commit()

    other_session = make_session()
    completed_request = (
        other_session.query(StockRequest)
        .filter(StockRequest.request_id == request_id)
        .one()
    )
    completed_request.status = StockRequestStatusEnum.COMPLETED
    for line in completed_request.lines:
        line.status = StockRequestStatusEnum.COMPLETED
    other_session.commit()
    other_session.close()

    with pytest.raises(ValueError, match="수정할 수 없는 요청 상태"):
        stock_request_actions.revert_to_draft(
            router_session,
            request=preread_request,
            requester=requester,
            pin="0000",
        )
    router_session.close()

    verify = make_session()
    batch = verify.query(IoBatch).filter(IoBatch.batch_id == batch_id).one()
    request = verify.query(StockRequest).filter(StockRequest.request_id == request_id).one()
    line = verify.query(StockRequestLine).filter(StockRequestLine.request_id == request_id).one()
    inventory = verify.query(Inventory).filter(Inventory.item_id == item_id).one()
    verify.close()

    assert batch.status == "reserved"
    assert request.status == StockRequestStatusEnum.COMPLETED
    assert line.status == StockRequestStatusEnum.COMPLETED
    assert inventory.pending_quantity == Decimal("2")
