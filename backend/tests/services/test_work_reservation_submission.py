"""Reservation handoff is one command, without a second pending deduction."""
from copy import deepcopy
from decimal import Decimal

import pytest

from app.models import Inventory, IoBatch, IoDraftReservation, IoWorkReservationEvent, TransactionLog
from tests.services.test_io_draft_reservations import draft_payload, owner


def test_draft_submit_hands_off_without_double_pending(client, db_session, make_item, owner):
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(3))
    saved = client.put("/api/io/draft", json=draft_payload(owner, item)).json()
    response = client.post(f"/api/io/draft/{saved['batch_id']}/submit", params={
        "requester_employee_id": str(owner.employee_id)}, json={"expected_revision": 1})
    assert response.status_code == 201, response.text
    assert response.json()["batch"]["revision"] == 2
    assert response.json()["batch"]["reservation_status"] == "inactive"
    db_session.expire_all()
    stock = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    assert stock.pending_quantity == 3 and stock.warehouse_qty == 3
    assert db_session.query(IoDraftReservation).count() == 0
    assert db_session.query(TransactionLog).count() == 0
    assert db_session.query(IoWorkReservationEvent).filter_by(action="submitted").count() == 1


@pytest.mark.parametrize("body,code", [({}, 422), ({"expected_revision": 0}, 409)])
def test_draft_submit_requires_current_version(client, db_session, make_item, owner, body, code):
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(3))
    saved = client.put("/api/io/draft", json=draft_payload(owner, item)).json()
    response = client.post(f"/api/io/draft/{saved['batch_id']}/submit", params={
        "requester_employee_id": str(owner.employee_id)}, json=body)
    assert response.status_code == code, response.text
    db_session.expire_all()
    assert db_session.query(IoBatch).one().revision == 1
    assert db_session.query(IoDraftReservation).one().quantity == 3


def test_direct_submit_key_replay_and_changed_intent(client, db_session, make_item, owner):
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(6))
    payload = draft_payload(owner, item)
    first = client.post("/api/io/submit", json=payload)
    assert first.status_code == 201, first.text
    replay = client.post("/api/io/submit", json=payload)
    assert replay.status_code == 201, replay.text
    assert replay.json()["batch"]["batch_id"] == first.json()["batch"]["batch_id"]
    assert replay.json()["batch"]["revision"] == 1
    altered = deepcopy(payload)
    altered["notes"] = "changed intent"
    conflict = client.post("/api/io/submit", json=altered)
    assert conflict.status_code == 409, conflict.text
    assert conflict.json()["detail"]["code"] == "WORK_CREATE_KEY_CONFLICT"
    db_session.expire_all()
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().pending_quantity == 3
    assert db_session.query(IoWorkReservationEvent).count() == 1


def test_direct_submit_requires_creation_key(client, make_item, owner):
    payload = draft_payload(owner, make_item(process_type_code="AR", warehouse_qty=Decimal(6)))
    payload.pop("client_request_id")
    assert client.post("/api/io/submit", json=payload).status_code == 422


def test_failed_execution_restores_draft_ledger_and_revision(client, db_session, make_item, owner, monkeypatch):
    from app.services import io_dispatch
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(3))
    saved = client.put("/api/io/draft", json=draft_payload(owner, item)).json()
    def fail(*args, **kwargs):
        raise ValueError("injected execution failure")
    monkeypatch.setattr(io_dispatch, "_execute_submission", fail)
    response = client.post(f"/api/io/draft/{saved['batch_id']}/submit", params={
        "requester_employee_id": str(owner.employee_id)}, json={"expected_revision": 1})
    assert response.status_code == 422, response.text
    db_session.expire_all()
    batch = db_session.query(IoBatch).one()
    assert batch.status == "draft" and batch.revision == 1
    assert db_session.query(IoDraftReservation).one().quantity == 3
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().pending_quantity == 3
    assert db_session.query(IoWorkReservationEvent).count() == 1


@pytest.mark.parametrize("sub_type", ["produce", "disassemble"])
@pytest.mark.parametrize("scenario", ["standard", "custom", "excluded", "exempt"])
def test_saved_plan_remains_verifiable_after_dispatch_preparation(
    db_session, make_item, make_location, make_bom, sub_type, scenario,
):
    from tests.services.test_io_effective_plan import _process_batch
    from app.services import io_dispatch, io_reservations
    from app.services.io_effective_plan import build_effective_plan
    batch, requester, *_ = _process_batch(db_session, make_item, make_location, make_bom,
        sub_type=sub_type, scenario=scenario)
    batch.effective_plan = build_effective_plan(db_session, batch)
    io_dispatch._execute_submission(db_session, requester=requester, batch=batch)
    assert io_reservations.validate_saved_plan(db_session, batch) == batch.effective_plan


def test_settlement_failure_commit_error_restores_saved_reservation(db_session, make_item, monkeypatch):
    from app.services import io_actions, io_dispatch, io_draft
    from tests.services.test_io_actions import _make_requester, _internal_use_payload
    item = make_item(process_type_code="AF", warehouse_qty=Decimal(3))
    requester = _make_requester(db_session)
    saved = io_draft.save_draft(db_session, _internal_use_payload(requester, [item]))
    db_session.commit()
    def execute_failure(*args, **kwargs):
        raise ValueError("execution failure")
    def commit_failure():
        raise RuntimeError("commit failure")
    monkeypatch.setattr(io_dispatch, "_apply_line", execute_failure)
    monkeypatch.setattr(db_session, "commit", commit_failure)
    with pytest.raises(RuntimeError, match="commit failure"):
        io_actions.submit_existing_draft(db_session, batch_id=saved["batch_id"],
            requester_employee_id=requester.employee_id, expected_revision=1)
    db_session.expire_all()
    batch = db_session.query(IoBatch).one()
    assert batch.status == "draft" and batch.revision == 1
    assert db_session.query(IoDraftReservation).one().quantity == 1
    stock = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    assert stock.warehouse_qty == 3 and stock.pending_quantity == 1
    assert db_session.query(TransactionLog).count() == 0
    assert db_session.query(IoWorkReservationEvent).count() == 1


@pytest.mark.parametrize("saved_draft", [False, True])
@pytest.mark.parametrize("contract_error", ["plan", "permission"])
def test_internal_use_settlement_contract_errors_roll_back(db_session, make_item, monkeypatch, saved_draft, contract_error):
    from app.services import io_actions, io_draft, internal_use_approval
    from app.services.work_reservation_errors import WorkReservationError
    from tests.services.test_io_actions import _make_requester, _internal_use_payload
    item = make_item(process_type_code="AF", warehouse_qty=Decimal(3))
    requester = _make_requester(db_session)
    payload = _internal_use_payload(requester, [item])
    saved = io_draft.save_draft(db_session, payload) if saved_draft else None
    db_session.commit()
    error = WorkReservationError("WORK_PLAN_CHANGED", "plan changed") if contract_error == "plan" else PermissionError("permission changed")
    def fail(*args, **kwargs):
        raise error
    monkeypatch.setattr(internal_use_approval, "settle_if_decided", fail)
    with pytest.raises(type(error)) as raised:
        if saved:
            io_actions.submit_existing_draft(db_session, batch_id=saved["batch_id"],
                requester_employee_id=requester.employee_id, expected_revision=1)
        else:
            io_actions.submit(db_session, payload)
    assert raised.value is error
    db_session.expire_all()
    stock = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    assert stock.warehouse_qty == 3 and stock.pending_quantity == (1 if saved else 0)
    assert db_session.query(TransactionLog).count() == 0
    if saved:
        batch = db_session.query(IoBatch).one()
        assert batch.status == "draft" and batch.revision == 1
        assert db_session.query(IoDraftReservation).one().quantity == 1
    else:
        assert db_session.query(IoBatch).count() == 0
