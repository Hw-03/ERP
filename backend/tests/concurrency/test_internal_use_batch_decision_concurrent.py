"""사용출고 형제 요청의 마지막 승인 동시 경합 회귀 테스트."""

from __future__ import annotations

import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Event, Thread, current_thread

import pytest
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.database import Base
from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    Item,
    LocationStatusEnum,
    IoBatch,
    ProcessType,
    StockRequest,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    TransactionLog,
)
from app.schemas import IoSubmitRequest
from app.services import (
    internal_use_approval,
    io_actions,
    io_dispatch,
    stock_request_actions,
)
from app.services.pin_auth import DEFAULT_PIN_HASH


@pytest.fixture()
def postgres_make_session():
    """격리 schema에서 실제 PostgreSQL row/advisory lock 경합을 실행한다."""
    database_url = os.getenv("TEST_POSTGRES_URL", "").strip()
    if not database_url:
        pytest.skip("TEST_POSTGRES_URL이 없어 PostgreSQL 경합 검증을 건너뜁니다.")
    schema_name = f"test_internal_use_{uuid.uuid4().hex}"
    admin_engine = create_engine(database_url, poolclass=NullPool)
    with admin_engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema_name}"'))

    engine = create_engine(database_url, poolclass=NullPool)

    @event.listens_for(engine, "connect")
    def set_search_path(dbapi_connection, _connection_record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute(f'SET search_path TO "{schema_name}"')
        cursor.close()

    try:
        Base.metadata.create_all(bind=engine)
        factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        seed_session = factory()
        for code, prefix, suffix, order in (
            ("AR", "A", "R", 45),
            ("AF", "A", "F", 70),
            ("HF", "H", "F", 35),
        ):
            seed_session.add(
                ProcessType(
                    code=code,
                    prefix=prefix,
                    suffix=suffix,
                    stage_order=order,
                )
            )
        seed_session.commit()
        seed_session.close()
        yield factory
    finally:
        engine.dispose()
        with admin_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema_name}" CASCADE'))
        admin_engine.dispose()


def _employee(session, *, code: str, department: DepartmentEnum, **roles) -> Employee:
    employee = Employee(
        employee_code=code,
        name=code,
        role=f"{department.value}/사원",
        department=department,
        level=EmployeeLevelEnum.STAFF,
        warehouse_role=roles.get("warehouse_role", "none"),
        department_role=roles.get("department_role", "none"),
        display_order=0,
        is_active=True,
        pin_hash=DEFAULT_PIN_HASH,
    )
    session.add(employee)
    session.flush()
    return employee


def _setup(make_session):
    session = make_session()
    requester = _employee(
        session,
        code="IU-RACE-REQ",
        department=DepartmentEnum.AS,
    )
    warehouse_approver = _employee(
        session,
        code="IU-RACE-WH",
        department=DepartmentEnum.WAREHOUSE,
        warehouse_role="primary",
    )
    department_approver = _employee(
        session,
        code="IU-RACE-DEPT",
        department=DepartmentEnum.AS,
        department_role="primary",
    )
    warehouse_item = Item(
        item_name="사용출고 경합 창고",
        process_type_code="AF",
        unit="EA",
        model_symbol="9",
        serial_no=1,
    )
    department_item = Item(
        item_name="사용출고 경합 부서",
        process_type_code="HF",
        unit="EA",
        model_symbol="9",
        serial_no=2,
    )
    session.add_all([warehouse_item, department_item])
    session.flush()
    session.add_all(
        [
            Inventory(
                item_id=warehouse_item.item_id,
                quantity=Decimal("5"),
                warehouse_qty=Decimal("5"),
                pending_quantity=Decimal("0"),
            ),
            Inventory(
                item_id=department_item.item_id,
                quantity=Decimal("5"),
                warehouse_qty=Decimal("0"),
                pending_quantity=Decimal("0"),
            ),
            InventoryLocation(
                item_id=department_item.item_id,
                department=DepartmentEnum.HIGH_VOLTAGE,
                status=LocationStatusEnum.PRODUCTION,
                quantity=Decimal("5"),
                pending_quantity=Decimal("0"),
            ),
        ]
    )
    session.commit()
    payload = IoSubmitRequest(
        requester_employee_id=requester.employee_id,
        work_type="internal_use",
        sub_type="internal_use_out",
        to_department=DepartmentEnum.AS.value,
        bundles=[
            {
                "bundle_id": str(uuid.uuid4()),
                "source_kind": "direct_item",
                "title": warehouse_item.item_name,
                "source_item_id": str(warehouse_item.item_id),
                "quantity": 1,
                "lines": [{
                    "line_id": str(uuid.uuid4()),
                    "item_id": str(warehouse_item.item_id),
                    "item_name": warehouse_item.item_name,
                    "direction": "out",
                    "from_bucket": "warehouse",
                    "to_bucket": "none",
                    "to_department": DepartmentEnum.AS.value,
                    "quantity": 1,
                    "included": True,
                    "origin": "direct",
                }],
            },
            {
                "bundle_id": str(uuid.uuid4()),
                "source_kind": "direct_item",
                "title": department_item.item_name,
                "source_item_id": str(department_item.item_id),
                "quantity": 1,
                "lines": [{
                    "line_id": str(uuid.uuid4()),
                    "item_id": str(department_item.item_id),
                    "item_name": department_item.item_name,
                    "direction": "out",
                    "from_bucket": "production",
                    "from_department": DepartmentEnum.HIGH_VOLTAGE.value,
                    "to_bucket": "none",
                    "to_department": DepartmentEnum.AS.value,
                    "quantity": 1,
                    "included": True,
                    "origin": "direct",
                }],
            },
        ],
    )
    submitted = io_actions.submit(session, payload)
    requests = session.query(StockRequest).filter_by(
        operation_batch_id=submitted["batch"]["batch_id"]
    ).all()
    result = {
        "batch_id": submitted["batch"]["batch_id"],
        "warehouse_request_id": next(
            request.request_id for request in requests if request.requires_warehouse_approval
        ),
        "department_request_id": next(
            request.request_id for request in requests if request.requires_department_approval
        ),
        "warehouse_approver_id": warehouse_approver.employee_id,
        "department_approver_id": department_approver.employee_id,
        "requester_id": requester.employee_id,
        "item_ids": (warehouse_item.item_id, department_item.item_id),
    }
    session.close()
    return result


@pytest.mark.usefixtures("concurrent_engine")
def test_concurrent_sibling_last_approvals_execute_batch_once(make_session):
    ids = _setup(make_session)

    def approve(request_key: str, actor_key: str, *, department: bool) -> None:
        session = make_session()
        try:
            request = session.get(StockRequest, ids[request_key])
            actor = session.get(Employee, ids[actor_key])
            if department:
                stock_request_actions.approve_department_request(
                    session, request, approver=actor, pin="0000"
                )
            else:
                stock_request_actions.approve_warehouse_request(
                    session, request, approver=actor, pin="0000"
                )
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [
            executor.submit(
                approve,
                "warehouse_request_id",
                "warehouse_approver_id",
                department=False,
            ),
            executor.submit(
                approve,
                "department_request_id",
                "department_approver_id",
                department=True,
            ),
        ]
        for future in futures:
            future.result(timeout=10)

    verify = make_session()
    requests = verify.query(StockRequest).filter_by(operation_batch_id=ids["batch_id"]).all()
    assert {request.status for request in requests} == {StockRequestStatusEnum.COMPLETED}
    assert verify.query(TransactionLog).filter(
        TransactionLog.item_id.in_(ids["item_ids"])
    ).count() == 2
    inventories = {
        inventory.item_id: inventory
        for inventory in verify.query(Inventory).filter(
            Inventory.item_id.in_(ids["item_ids"])
        )
    }
    assert inventories[ids["item_ids"][0]].warehouse_qty == Decimal("4")
    assert inventories[ids["item_ids"][1]].quantity == Decimal("4")
    verify.close()


def _preapprove_warehouse(make_session, ids) -> None:
    session = make_session()
    try:
        request = session.get(StockRequest, ids["warehouse_request_id"])
        actor = session.get(Employee, ids["warehouse_approver_id"])
        stock_request_actions.approve_warehouse_request(
            session, request, approver=actor, pin="0000"
        )
    finally:
        session.close()


@pytest.mark.usefixtures("concurrent_engine")
def test_concurrent_last_approve_reject_has_one_coherent_settlement(make_session):
    ids = _setup(make_session)
    _preapprove_warehouse(make_session, ids)

    def decide(*, approve: bool) -> None:
        session = make_session()
        try:
            request = session.get(StockRequest, ids["department_request_id"])
            actor = session.get(Employee, ids["department_approver_id"])
            if approve:
                stock_request_actions.approve_department_request(
                    session, request, approver=actor, pin="0000"
                )
            else:
                stock_request_actions.reject_department_request(
                    session,
                    request,
                    approver=actor,
                    pin="0000",
                    reason="동시 반려",
                )
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [
            executor.submit(decide, approve=True),
            executor.submit(decide, approve=False),
        ]
        for future in futures:
            try:
                future.result(timeout=10)
            except ValueError:
                pass

    verify = make_session()
    batch = verify.get(IoBatch, ids["batch_id"])
    log_count = verify.query(TransactionLog).filter(
        TransactionLog.item_id.in_(ids["item_ids"])
    ).count()
    assert (batch.status, log_count) in {
        ("completed", 2),
        ("partially_completed", 1),
    }
    assert log_count == verify.query(TransactionLog.operation_line_id).distinct().count()
    verify.close()


@pytest.mark.usefixtures("concurrent_engine")
def test_concurrent_last_approve_cancel_never_executes_twice(make_session):
    ids = _setup(make_session)
    _preapprove_warehouse(make_session, ids)

    def approve_last() -> None:
        session = make_session()
        try:
            request = session.get(StockRequest, ids["department_request_id"])
            actor = session.get(Employee, ids["department_approver_id"])
            stock_request_actions.approve_department_request(
                session, request, approver=actor, pin="0000"
            )
        finally:
            session.close()

    def cancel_batch() -> None:
        session = make_session()
        try:
            request = session.get(StockRequest, ids["department_request_id"])
            requester = session.get(Employee, ids["requester_id"])
            stock_request_actions.cancel_request(
                session, request, requester=requester, pin="0000"
            )
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(approve_last), executor.submit(cancel_batch)]
        for future in futures:
            try:
                future.result(timeout=10)
            except ValueError:
                pass

    verify = make_session()
    batch = verify.get(IoBatch, ids["batch_id"])
    log_count = verify.query(TransactionLog).filter(
        TransactionLog.item_id.in_(ids["item_ids"])
    ).count()
    assert (batch.status, log_count) in {("completed", 2), ("cancelled", 0)}
    assert log_count == verify.query(TransactionLog.operation_line_id).distinct().count()
    verify.close()


def test_postgres_failed_last_approval_keeps_batch_lock_until_failed_commit(
    postgres_make_session,
    monkeypatch,
):
    ids = _setup(postgres_make_session)
    _preapprove_warehouse(postgres_make_session, ids)
    execution_entered = Event()
    allow_failure = Event()
    legacy_record_entered = Event()
    allow_legacy_record = Event()
    original_apply_line = io_dispatch._apply_line
    original_record_failed = stock_request_actions._record_failed_decision

    def fail_only_first_approver(*args, **kwargs):
        if current_thread().name == "failing-approval":
            execution_entered.set()
            assert allow_failure.wait(timeout=10)
            raise RuntimeError("PostgreSQL 최종 승인 실행 실패")
        return original_apply_line(*args, **kwargs)

    def pause_legacy_separate_failure_record(*args, **kwargs):
        legacy_record_entered.set()
        assert allow_legacy_record.wait(timeout=10)
        return original_record_failed(*args, **kwargs)

    monkeypatch.setattr(io_dispatch, "_apply_line", fail_only_first_approver)
    monkeypatch.setattr(
        stock_request_actions,
        "_record_failed_decision",
        pause_legacy_separate_failure_record,
    )
    outcomes: list[str] = []

    def approve_last() -> None:
        session = postgres_make_session()
        try:
            request = session.get(StockRequest, ids["department_request_id"])
            actor = session.get(Employee, ids["department_approver_id"])
            stock_request_actions.approve_department_request(
                session,
                request,
                approver=actor,
                pin="0000",
            )
            outcomes.append("approved")
        except Exception as exc:
            outcomes.append(type(exc).__name__)
        finally:
            session.close()

    failing = Thread(target=approve_last, name="failing-approval")
    competing = Thread(target=approve_last, name="competing-approval")
    failing.start()
    assert execution_entered.wait(timeout=10)
    competing.start()
    allow_failure.set()
    if legacy_record_entered.wait(timeout=1):
        competing.join(timeout=10)
        allow_legacy_record.set()
    failing.join(timeout=10)
    competing.join(timeout=10)
    assert not failing.is_alive()
    assert not competing.is_alive()

    verify = postgres_make_session()
    try:
        batch = verify.get(IoBatch, ids["batch_id"])
        requests = verify.query(StockRequest).filter_by(
            operation_batch_id=ids["batch_id"]
        ).all()
        assert batch.status == "failed"
        assert {request.status for request in requests} == {
            StockRequestStatusEnum.FAILED_APPROVAL
        }
        assert verify.query(TransactionLog).filter(
            TransactionLog.item_id.in_(ids["item_ids"])
        ).count() == 0
        assert "approved" not in outcomes
    finally:
        verify.close()


@pytest.mark.usefixtures("concurrent_engine")
def test_concurrent_last_two_special_approver_deactivations_cannot_skip_fallback(
    make_session,
):
    setup = make_session()
    requester = _employee(
        setup,
        code="IU-ROSTER-REQ",
        department=DepartmentEnum.AS,
    )
    first = _employee(
        setup,
        code="IU-ROSTER-A",
        department=DepartmentEnum.RESEARCH,
    )
    second = _employee(
        setup,
        code="IU-ROSTER-B",
        department=DepartmentEnum.RESEARCH,
    )
    first.as_research_approver = True
    second.as_research_approver = True
    request = StockRequest(
        requester_employee_id=requester.employee_id,
        requester_name=requester.name,
        requester_department=requester.department,
        request_type=StockRequestTypeEnum.INTERNAL_USE,
        status=StockRequestStatusEnum.RESERVED,
        requires_warehouse_approval=False,
        requires_department_approval=False,
        requires_as_research_approval=True,
    )
    setup.add(request)
    setup.commit()
    employee_ids = (first.employee_id, second.employee_id)
    request_id = request.request_id
    setup.close()

    def deactivate(employee_id) -> None:
        session = make_session()
        try:
            employee = session.get(Employee, employee_id)
            employee.is_active = False
            internal_use_approval.reclassify_undecided_if_no_active_approver(session)
            session.commit()
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(deactivate, employee_id) for employee_id in employee_ids]
        for future in futures:
            future.result(timeout=10)

    verify = make_session()
    persisted = verify.get(StockRequest, request_id)
    assert persisted.requires_as_research_approval is False
    assert persisted.requires_department_approval is True
    assert persisted.approval_department == DepartmentEnum.AS.value
    verify.close()
