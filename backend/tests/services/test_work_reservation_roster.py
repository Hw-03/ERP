"""Roster fallback changes only pending approval policy, never physical work."""
from copy import deepcopy
from decimal import Decimal

import pytest

from app.models import DepartmentEnum, Inventory, InventoryLocation, IoBatch, IoWorkReservationEvent, StockRequest, StockRequestStatusEnum, TransactionLog
from app.services import io_actions, internal_use_approval
from tests.services.test_io_actions import _internal_use_payload, _make_requester


def _submitted_case(db, make_item, make_location, *, auto_special=False):
    special_item = make_item(process_type_code="AR", warehouse_qty=Decimal(0))
    warehouse_item = make_item(process_type_code="AF", warehouse_qty=Decimal(5))
    make_location(special_item.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal(5))
    requester = _make_requester(db, department=DepartmentEnum.AS, warehouse_role="none", as_research_approver=auto_special)
    special = requester if auto_special else _make_requester(db, warehouse_role="none", as_research_approver=True)
    department = _make_requester(db, department=DepartmentEnum.AS, warehouse_role="none", department_role="primary")
    warehouse = _make_requester(db, warehouse_role="primary")
    payload = _internal_use_payload(requester, [special_item, warehouse_item])
    payload.bundles[0].lines[0].from_bucket = "production"
    payload.bundles[0].lines[0].from_department = DepartmentEnum.ASSEMBLY.value
    result = io_actions.submit(db, payload)
    batch = db.get(IoBatch, result["batch"]["batch_id"])
    requests = db.query(StockRequest).filter_by(operation_batch_id=batch.batch_id).all()
    special_request = next(row for row in requests if row.requires_as_research_approval)
    warehouse_request = next(row for row in requests if row.requires_warehouse_approval)
    return batch, special, department, warehouse, special_request, warehouse_request


def _disable(client, special):
    return client.put(f"/api/employees/{special.employee_id}", headers={"X-Admin-Pin": "0000"},
        json={"as_research_approver": False})


def _approve(client, request, actor, endpoint):
    return client.post(f"/api/stock-requests/{request.request_id}/{endpoint}",
        json={"actor_employee_id": str(actor.employee_id), "pin": "0000"})


@pytest.mark.parametrize("reactivate", [False, True])
def test_roster_fallback_can_finish_and_preserves_physical_plan(client, db_session, make_item, make_location, reactivate):
    batch, special, department, warehouse, request, warehouse_request = _submitted_case(db_session, make_item, make_location)
    original_plan = deepcopy(batch.effective_plan)
    original_revision = batch.revision
    response = _disable(client, special)
    assert response.status_code == 200, response.text
    db_session.expire_all()
    assert request.requires_department_approval and not request.requires_as_research_approval
    if reactivate:
        response = client.put(f"/api/employees/{special.employee_id}", headers={"X-Admin-Pin": "0000"},
            json={"as_research_approver": True})
        assert response.status_code == 200, response.text
    response = _approve(client, request, department, "department-approve")
    assert response.status_code == 200, response.text
    assert batch.effective_plan["effects"] == original_plan["effects"]
    assert batch.effective_plan["fingerprint"] != original_plan["fingerprint"]
    assert batch.revision == original_revision + 2
    events = db_session.query(IoWorkReservationEvent).filter_by(batch_id=batch.batch_id, from_revision=original_revision).all()
    assert len(events) == 1
    assert events[0].action == "approval_changed" and events[0].actor_employee_id is None
    assert events[0].reason == "last_as_research_approver_removed"
    assert db_session.query(TransactionLog).count() == 0
    response = _approve(client, warehouse_request, warehouse, "approve")
    assert response.status_code == 200, response.text
    assert batch.status == "completed" and batch.revision == original_revision + 3
    assert db_session.query(TransactionLog).count() == 2
    assert all(row.pending_quantity == 0 for row in db_session.query(Inventory))
    assert all(row.pending_quantity == 0 for row in db_session.query(InventoryLocation))


def test_autoapproved_special_decision_survives_roster_removal(client, db_session, make_item, make_location):
    batch, special, department, warehouse, request, warehouse_request = _submitted_case(db_session, make_item, make_location, auto_special=True)
    pending_item = make_item(process_type_code="AR", warehouse_qty=Decimal(0))
    make_location(pending_item.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal(5))
    pending_owner = _make_requester(db_session, department=DepartmentEnum.AS, warehouse_role="none")
    pending_payload = _internal_use_payload(pending_owner, [pending_item])
    pending_payload.bundles[0].lines[0].from_bucket = "production"
    pending_payload.bundles[0].lines[0].from_department = DepartmentEnum.ASSEMBLY.value
    pending_result = io_actions.submit(db_session, pending_payload)
    pending_batch = db_session.get(IoBatch, pending_result["batch"]["batch_id"])
    pending_request = db_session.query(StockRequest).filter_by(operation_batch_id=pending_batch.batch_id).one()
    pending_revision = pending_batch.revision
    original_plan, original_revision = deepcopy(batch.effective_plan), batch.revision
    original_approved = request.as_research_approved_at
    assert original_approved is not None
    response = _disable(client, special)
    assert response.status_code == 200, response.text
    db_session.expire_all()
    assert request.requires_as_research_approval and not request.requires_department_approval
    assert request.as_research_approved_at == original_approved
    assert batch.revision == original_revision and batch.effective_plan == original_plan
    assert pending_batch.revision == pending_revision + 1
    assert pending_request.requires_department_approval and not pending_request.requires_as_research_approval
    response = _approve(client, warehouse_request, warehouse, "approve")
    assert response.status_code == 200, response.text
    assert batch.status == "completed"
    assert request.as_research_approved_at == original_approved
    response = _approve(client, pending_request, department, "department-approve")
    assert response.status_code == 200, response.text
    assert pending_batch.status == "completed"


def test_roster_fallback_does_not_bless_unrelated_plan_drift(client, db_session, make_item, make_location):
    batch, special, _, _, request, _ = _submitted_case(db_session, make_item, make_location)
    original_plan, original_revision = deepcopy(batch.effective_plan), batch.revision
    batch.bundles[0].lines[0].quantity = 2
    db_session.commit()
    response = _disable(client, special)
    assert response.status_code == 409, response.text
    assert response.json()["detail"]["code"] == "WORK_PLAN_CHANGED"
    db_session.expire_all()
    assert request.requires_as_research_approval and not request.requires_department_approval
    assert batch.revision == original_revision and batch.effective_plan == original_plan
    assert special.as_research_approver


def test_roster_fallback_retry_is_noop(client, db_session, make_item, make_location):
    batch, special, _, _, _, _ = _submitted_case(db_session, make_item, make_location)
    assert _disable(client, special).status_code == 200
    revision = batch.revision
    event_count = db_session.query(IoWorkReservationEvent).count()
    assert internal_use_approval.reclassify_undecided_if_no_active_approver(db_session) == 0
    assert batch.revision == revision
    assert db_session.query(IoWorkReservationEvent).count() == event_count
