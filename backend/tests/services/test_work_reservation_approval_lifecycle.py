"""Linked approval commands preserve the work reservation transaction contract."""
from collections.abc import Callable
from decimal import Decimal
import uuid

import pytest
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.models import (
    BOM, DepartmentEnum, Employee, Inventory, InventoryLocation, IoBatch, IoBundle, IoDraftReservation,
    IoLine, IoWorkReservationEvent, Item, RequestBucketEnum, StockRequest, StockRequestStatusEnum,
    StockRequestTypeEnum, TransactionLog,
)
from app.services import stock_request_actions as actions, stock_requests, sr_approval
from app.services.io_effective_plan import build_effective_plan
from app.services.pin_auth import DEFAULT_PIN_HASH
from app.services.sr_validation import LineInput
from app.services.work_reservation_errors import WorkReservationError


def _case(db, make_item, *, dual=False):
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(10))
    owner = Employee(employee_code=str(uuid.uuid4()), name="Owner", role="staff",
        department=DepartmentEnum.ASSEMBLY, is_active=True, pin_hash=DEFAULT_PIN_HASH)
    approver = Employee(employee_code=str(uuid.uuid4()), name="Approver", role="staff",
        department=DepartmentEnum.ASSEMBLY, warehouse_role="primary", department_role="primary",
        is_active=True, pin_hash=DEFAULT_PIN_HASH)
    db.add_all([owner, approver])
    db.flush()
    batch = IoBatch(work_type="warehouse_io", sub_type="warehouse_to_dept", status="reserved",
        requester_employee_id=owner.employee_id, requester_name=owner.name,
        requester_department=owner.department.value, revision=4, reservation_status="inactive")
    bundle = IoBundle(source_kind="direct_item", source_item_id=item.item_id,
        title_snapshot=item.item_name, quantity=2)
    line = IoLine(item_id=item.item_id, item_name_snapshot=item.item_name, unit="EA",
        direction="move", from_bucket="warehouse", to_bucket="production",
        to_department=DepartmentEnum.ASSEMBLY.value, quantity=2, origin="direct")
    bundle.lines.append(line)
    batch.bundles.append(bundle)
    db.add(batch)
    db.flush()
    request = stock_requests.create_request(db, requester=owner,
        request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT, lines_input=[LineInput(
            item_id=item.item_id, quantity=Decimal(2), from_bucket=RequestBucketEnum.WAREHOUSE,
            from_department=None, to_bucket=RequestBucketEnum.PRODUCTION,
            to_department=DepartmentEnum.ASSEMBLY)], reference_no=None, notes=None,
        requires_department_approval=dual)
    request.operation_batch_id = batch.batch_id
    request.lines[0].operation_line_id = line.line_id
    batch.effective_plan = build_effective_plan(db, batch)
    db.commit()
    return item, owner, approver, batch, request


def test_partial_approval_advances_once_and_retry_is_noop(db_session, make_item):
    _, _, approver, batch, request = _case(db_session, make_item, dual=True)
    for _ in range(2):
        actions.approve_warehouse_request(db_session, request, approver=approver, pin="0000")
        assert batch.revision == 5
    events = db_session.query(IoWorkReservationEvent).all()
    assert [(e.action, e.from_revision, e.to_revision) for e in events] == [("approval_changed", 4, 5)]
    assert request.status == StockRequestStatusEnum.RESERVED


def test_revert_reacquires_entire_draft_atomically(db_session, make_item):
    item, owner, _, batch, request = _case(db_session, make_item)
    actions.revert_to_draft(db_session, request=request, requester=owner, pin="0000", expected_revision=4)
    assert batch.status == "draft" and batch.revision == 5
    assert batch.reservation_status == "reserved"
    assert request.status == StockRequestStatusEnum.CANCELLED
    assert db_session.query(IoDraftReservation).one().quantity == 2
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().pending_quantity == 2
    assert db_session.query(IoWorkReservationEvent).one().action == "returned"


def test_revert_shortage_preserves_approval_and_revision(db_session, make_item):
    item, owner, _, batch, request = _case(db_session, make_item)
    batch.bundles[0].lines[0].quantity = 11
    db_session.commit()
    with pytest.raises(WorkReservationError) as error:
        actions.revert_to_draft(db_session, request=request, requester=owner, pin="0000", expected_revision=4)
    assert error.value.code == "STOCK_SHORTAGE"
    assert request.status == StockRequestStatusEnum.RESERVED
    assert batch.status == "reserved" and batch.revision == 4
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().pending_quantity == 2
    assert db_session.query(IoWorkReservationEvent).count() == 0


def test_revert_owner_and_pin_precede_revision(db_session, make_item):
    _, owner, approver, batch, request = _case(db_session, make_item)
    with pytest.raises(PermissionError):
        actions.revert_to_draft(db_session, request=request, requester=approver, pin="0000", expected_revision=999)
    with pytest.raises(PermissionError):
        actions.revert_to_draft(db_session, request=request, requester=owner, pin="bad", expected_revision=999)
    with pytest.raises(WorkReservationError) as error:
        actions.revert_to_draft(db_session, request=request, requester=owner, pin="0000", expected_revision=999)
    assert error.value.code == "WORK_REVISION_CONFLICT"
    assert batch.revision == 4


def test_saved_plan_change_does_not_persist_approval_failure(db_session, make_item):
    item, _, approver, batch, request = _case(db_session, make_item)
    batch.bundles[0].lines[0].quantity = 3
    db_session.commit()
    with pytest.raises(WorkReservationError) as error:
        actions.approve_warehouse_request(db_session, request, approver=approver, pin="0000")
    assert error.value.code == "WORK_PLAN_CHANGED"
    assert request.status == StockRequestStatusEnum.RESERVED
    assert request.approved_at is None and batch.revision == 4
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().pending_quantity == 2


def test_execution_failure_persists_explicit_work_error(db_session, make_item, monkeypatch):
    item, _, approver, batch, request = _case(db_session, make_item)
    def fail(*args, **kwargs):
        raise ValueError("execution test failure")
    monkeypatch.setattr(sr_approval, "_execute_all_lines", fail)
    with pytest.raises(WorkReservationError) as error:
        actions.approve_warehouse_request(db_session, request, approver=approver, pin="0000")
    assert error.value.code == "WORK_APPROVAL_FAILED_PERSISTED"
    assert error.value.extra["state_committed"] is True
    assert error.value.extra["current_revision"] == 5
    assert request.status == StockRequestStatusEnum.FAILED_APPROVAL
    assert batch.revision == 5 and batch.reservation_status == "inactive"
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().pending_quantity == 0


def test_failure_record_does_not_overwrite_intervening_command(db_session, make_item, monkeypatch):
    item, _, approver, batch, request = _case(db_session, make_item)
    def fail(*args, **kwargs):
        raise ValueError("execution test failure")
    original = actions._record_failed_decision
    def intervening(db, **kwargs):
        batch.revision = 5
        db.commit()
        return original(db, **kwargs)
    monkeypatch.setattr(sr_approval, "_execute_all_lines", fail)
    monkeypatch.setattr(actions, "_record_failed_decision", intervening)
    with pytest.raises(WorkReservationError) as error:
        actions.approve_warehouse_request(db_session, request, approver=approver, pin="0000")
    assert error.value.code == "WORK_REVISION_CONFLICT"
    assert request.status == StockRequestStatusEnum.RESERVED
    assert batch.revision == 5
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().pending_quantity == 2


def test_failed_approval_commit_failure_never_claims_committed_state(db_session, make_item, monkeypatch):
    item, _, approver, batch, request = _case(db_session, make_item)
    def execute_failure(*args, **kwargs):
        raise ValueError("execution failure")
    def commit_failure():
        raise RuntimeError("commit failure")
    monkeypatch.setattr(sr_approval, "_execute_all_lines", execute_failure)
    monkeypatch.setattr(db_session, "commit", commit_failure)
    with pytest.raises(RuntimeError, match="commit failure"):
        actions.approve_warehouse_request(db_session, request, approver=approver, pin="0000")
    db_session.expire_all()
    assert request.status == StockRequestStatusEnum.RESERVED
    assert batch.revision == 4 and batch.status == "reserved"
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().pending_quantity == 2
    assert db_session.query(IoWorkReservationEvent).count() == 0


def test_final_rejection_sets_inactive_once(db_session, make_item):
    item, _, approver, batch, request = _case(db_session, make_item)
    for _ in range(2):
        actions.reject_warehouse_request(db_session, request, approver=approver, pin="0000", reason="reject")
    assert batch.status == "rejected" and batch.reservation_status == "inactive"
    assert batch.revision == 5
    assert db_session.query(IoWorkReservationEvent).count() == 1
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().pending_quantity == 0


def test_approval_contract_shortage_does_not_become_persisted_failure(db_session, make_item):
    item, _, approver, batch, request = _case(db_session, make_item)
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    inventory.warehouse_qty = inventory.quantity = 1
    inventory.pending_quantity = 0
    request.status = request.lines[0].status = StockRequestStatusEnum.SUBMITTED
    batch.status = "submitted"
    db_session.commit()
    with pytest.raises(WorkReservationError) as error:
        actions.approve_warehouse_request(db_session, request, approver=approver, pin="0000")
    assert error.value.code == "STOCK_SHORTAGE"
    assert request.status == StockRequestStatusEnum.SUBMITTED
    assert error.value.extra["reservation_shortages"][0]["shortage_quantity"] == 1
    assert inventory.pending_quantity == 0 and batch.revision == 4


def test_internal_settlement_failure_commits_once(db_session, make_item, monkeypatch):
    from app.services import internal_use_approval
    item, _, approver, batch, request = _case(db_session, make_item)
    batch.work_type = "internal_use"
    batch.sub_type = "internal_use_out"
    batch.to_department = "연구"
    line = batch.bundles[0].lines[0]
    line.direction, line.to_bucket, line.to_department = "out", "none", None
    request.request_type = StockRequestTypeEnum.INTERNAL_USE
    request.lines[0].to_bucket, request.lines[0].to_department = RequestBucketEnum.NONE, None
    batch.effective_plan = build_effective_plan(db_session, batch)
    db_session.commit()
    def fail(*args, **kwargs):
        raise RuntimeError("settlement failure")
    monkeypatch.setattr(internal_use_approval, "settle_if_decided", fail)
    with pytest.raises(WorkReservationError) as error:
        actions.approve_warehouse_request(db_session, request, approver=approver, pin="0000")
    assert error.value.code == "IO_SETTLEMENT_FAILED_PERSISTED"
    assert error.value.extra["state_committed"] is True
    assert batch.status == "failed" and batch.reservation_status == "inactive" and batch.revision == 5
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().pending_quantity == 0
    assert db_session.query(IoWorkReservationEvent).one().action == "settlement_failed"


def test_adjust_rejection_returns_without_draft_reservation(db_session, make_item):
    item, _, approver, batch, request = _case(db_session, make_item, dual=True)
    batch.work_type, batch.sub_type = "process", "adjust_out"
    request.requires_warehouse_approval = False
    db_session.commit()
    actions.reject_department_request(db_session, request, approver=approver, pin="0000", reason="adjust")
    assert batch.status == "draft" and batch.revision == 5
    assert batch.reservation_status == "inactive"
    assert batch.reservation_issue["code"] == "returned_after_rejection"
    from app.schemas.work_reservations import WorkReservationIssue
    WorkReservationIssue.model_validate(batch.reservation_issue)
    assert db_session.query(IoDraftReservation).count() == 0
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().pending_quantity == 0


@pytest.mark.parametrize("final_rejection", [False, True])
def test_internal_rejection_without_execution_survives_plan_drift(
    db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation], final_rejection: bool,
) -> None:
    """실재고 실행이 없는 반려는 변경된 계획을 승인하지 않고 기존 예약만 해제한다."""
    from tests.services.test_work_reservation_roster import _submitted_case

    batch, special, _, warehouse, special_request, warehouse_request = _submitted_case(
        db_session, make_item, make_location,
    )
    if final_rejection:
        actions.reject_as_research_request(
            db_session, special_request, approver=special, pin="0000", reason="first rejection",
        )
    item = db_session.get(Item, special_request.lines[0].item_id)
    item.process_type_code = "HR"
    db_session.commit()
    revision = batch.revision
    plan = batch.effective_plan

    actions.reject_warehouse_request(
        db_session, warehouse_request, approver=warehouse, pin="0000", reason="obsolete work",
    )

    assert batch.status == ("rejected" if final_rejection else "reserved")
    assert batch.revision == revision + 1 and batch.effective_plan == plan
    assert warehouse_request.status == StockRequestStatusEnum.REJECTED
    assert warehouse_request.rejected_reason == "obsolete work"
    assert special_request.status == (
        StockRequestStatusEnum.REJECTED if final_rejection else StockRequestStatusEnum.RESERVED
    )
    assert all(row.pending_quantity == 0 for row in db_session.query(Inventory))
    location = db_session.query(InventoryLocation).filter_by(item_id=item.item_id).one()
    assert location.quantity == 5 and location.pending_quantity == (0 if final_rejection else 1)
    assert db_session.query(TransactionLog).count() == 0
    event = db_session.query(IoWorkReservationEvent).filter_by(from_revision=revision).one()
    assert event.action == "approval_changed" and event.to_revision == revision + 1


def test_return_mode_rejection_cancels_approved_sibling_despite_plan_drift(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_bom: Callable[..., BOM],
) -> None:
    """반환 모드의 반려는 선승인 여부와 계획 변경에 관계없이 물리 실행을 취소한다."""
    from tests.test_io_v2 import _parent_return_payload, _submit

    payload, parent, child, _, _, warehouse, department, _ = _parent_return_payload(
        client, db_session, make_item, make_bom,
    )
    response = _submit(client, json=payload)
    assert response.status_code == 201, response.text
    batch = db_session.query(IoBatch).one()
    requests = db_session.query(StockRequest).all()
    outbound = next(row for row in requests if row.requires_warehouse_approval)
    returned = next(row for row in requests if row.requires_department_approval)
    actions.approve_warehouse_request(db_session, outbound, approver=warehouse, pin="0000")
    child.bom_stock_exempt = True
    db_session.commit()
    revision = batch.revision

    actions.reject_department_request(
        db_session, returned, approver=department, pin="0000", reason="cancel returns",
    )

    assert batch.status == "rejected" and batch.revision == revision + 1
    assert returned.status == StockRequestStatusEnum.REJECTED
    assert outbound.status == StockRequestStatusEnum.CANCELLED and outbound.approved_at is not None
    stock = db_session.query(Inventory).filter_by(item_id=parent.item_id).one()
    assert stock.warehouse_qty == 10 and stock.pending_quantity == 0
    assert db_session.query(TransactionLog).count() == 0


@pytest.mark.parametrize("execute_on_rejection", [False, True])
def test_internal_plan_drift_still_blocks_approved_effect_execution(
    db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation], execute_on_rejection: bool,
) -> None:
    """일반 사용출고의 마지막 반려가 형제 승인분을 실행할 때도 계획 검증은 유지한다."""
    from tests.services.test_work_reservation_roster import _submitted_case

    batch, special, _, warehouse, special_request, warehouse_request = _submitted_case(
        db_session, make_item, make_location,
    )
    if execute_on_rejection:
        actions.approve_warehouse_request(db_session, warehouse_request, approver=warehouse, pin="0000")
    db_session.get(Item, special_request.lines[0].item_id).process_type_code = "HR"
    db_session.commit()
    revision = batch.revision

    with pytest.raises(WorkReservationError) as error:
        if execute_on_rejection:
            actions.reject_as_research_request(
                db_session, special_request, approver=special, pin="0000", reason="last decision",
            )
        else:
            actions.approve_warehouse_request(db_session, warehouse_request, approver=warehouse, pin="0000")

    assert error.value.code == "WORK_PLAN_CHANGED"
    assert batch.status == "reserved" and batch.revision == revision
    assert special_request.status == warehouse_request.status == StockRequestStatusEnum.RESERVED
    assert special_request.rejected_at is None
    assert sum(row.pending_quantity for row in db_session.query(Inventory)) == 1
    assert sum(row.pending_quantity for row in db_session.query(InventoryLocation)) == 1
    assert db_session.query(TransactionLog).count() == 0
