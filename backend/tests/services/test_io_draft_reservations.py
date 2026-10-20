"""Explicit saves reserve whole source cells without moving physical stock."""
from copy import deepcopy
from decimal import Decimal
import uuid

import pytest

from app.models import DepartmentEnum, Employee, Inventory, IoBatch, TransactionLog


@pytest.fixture
def owner(db_session):
    employee = Employee(employee_code="WORK-OWNER", name="예약 테스트", role="직원", department=DepartmentEnum.ASSEMBLY, is_active=True)
    db_session.add(employee)
    db_session.commit()
    return employee


def draft_payload(owner, item, quantity=3):
    """A warehouse transfer is a single input and a separate future destination."""
    return {
        "requester_employee_id": str(owner.employee_id), "work_type": "warehouse_io",
        "sub_type": "warehouse_to_dept", "client_request_id": str(uuid.uuid4()),
        "bundles": [{"bundle_id": str(uuid.uuid4()), "source_kind": "direct_item",
            "source_item_id": str(item.item_id), "title": item.item_name, "quantity": quantity,
            "lines": [{"line_id": str(uuid.uuid4()), "item_id": str(item.item_id),
                "item_name": item.item_name, "direction": "move", "from_bucket": "warehouse",
                "to_bucket": "production", "to_department": "조립", "quantity": quantity,
                "origin": "direct"}]}],
    }


def pending(db, item):
    db.expire_all()
    return db.query(Inventory).filter_by(item_id=item.item_id).one().pending_quantity


def test_save_reserves_and_replay_does_not_duplicate(client, db_session, make_item, owner):
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(10))
    payload = draft_payload(owner, item)
    response = client.put("/api/io/draft", json=payload)
    assert response.status_code == 200, response.text
    assert pending(db_session, item) == 3
    body = response.json()
    assert body["revision"] == 1
    assert body["reservation_status"] == "reserved"
    assert body["effective_plan"]["effects"][0]["kind"] == "move"
    replay = client.put("/api/io/draft", json=payload)
    assert replay.status_code == 200, replay.text
    assert replay.json()["batch_id"] == body["batch_id"]
    assert pending(db_session, item) == 3
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().warehouse_qty == 10
    assert db_session.query(TransactionLog).count() == 0


def test_edit_reuses_own_reservation_and_preserves_on_shortage(client, db_session, make_item, owner):
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(6))
    payload = draft_payload(owner, item)
    first = client.put("/api/io/draft", json=payload).json()
    payload.update(batch_id=first["batch_id"], expected_revision=1)
    for quantity, expected_version in [(5, 2), (2, 3)]:
        payload["bundles"][0]["lines"][0]["quantity"] = quantity
        response = client.put("/api/io/draft", json=payload)
        assert response.status_code == 200, response.text
        assert response.json()["revision"] == expected_version
        assert pending(db_session, item) == quantity
        payload["expected_revision"] = expected_version
    payload["notes"] = "must not persist"
    payload["bundles"][0]["lines"][0]["quantity"] = 7
    failed = client.put("/api/io/draft", json=payload)
    assert failed.status_code == 422, failed.text
    assert failed.json()["detail"]["code"] == "STOCK_SHORTAGE"
    assert failed.json()["detail"]["extra"]["reservation_shortages"][0]["available_quantity"] == 6
    assert pending(db_session, item) == 2
    batch = db_session.query(IoBatch).one()
    assert batch.revision == 3 and batch.notes != "must not persist"


def test_revision_and_key_conflicts_and_soft_delete(client, db_session, make_item, owner):
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(10))
    payload = draft_payload(owner, item)
    saved = client.put("/api/io/draft", json=payload).json()
    changed = deepcopy(payload)
    changed["notes"] = "different intent"
    response = client.put("/api/io/draft", json=changed)
    assert response.status_code == 409, response.text
    assert response.json()["detail"]["code"] == "WORK_CREATE_KEY_CONFLICT"
    changed.update(batch_id=saved["batch_id"], expected_revision=0)
    assert client.put("/api/io/draft", json=changed).status_code == 409
    params = {"requester_employee_id": str(owner.employee_id), "expected_revision": 1}
    for _ in range(2):
        assert client.delete(f"/api/io/draft/{saved['batch_id']}", params=params).status_code == 204
    assert pending(db_session, item) == 0
    assert db_session.query(IoBatch).one().status == "cancelled"
    replay = client.put("/api/io/draft", json=payload)
    assert replay.status_code == 200 and replay.json()["status"] == "cancelled"
    assert pending(db_session, item) == 0


def test_preview_credits_only_active_owners_draft(client, db_session, make_item, owner):
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(3))
    saved = client.put("/api/io/draft", json=draft_payload(owner, item)).json()
    payload = {"work_type": "warehouse_io", "sub_type": "warehouse_to_dept",
        "requester_employee_id": str(owner.employee_id),
        "to_department": "조립", "targets": [{"item_id": str(item.item_id), "quantity": 3}]}
    public = client.post("/api/io/preview", json=payload)
    assert public.status_code == 200, public.text
    assert public.json()["bundles"][0]["lines"][0]["shortage"] == 3
    payload["owner_batch_id"] = saved["batch_id"]
    own = client.post("/api/io/preview", json=payload)
    assert own.status_code == 200, own.text
    assert own.json()["bundles"][0]["lines"][0]["shortage"] == 0
    payload["requester_employee_id"] = str(uuid.uuid4())
    assert client.post("/api/io/preview", json=payload).status_code == 403
    assert pending(db_session, item) == 3


def test_create_key_and_edit_revision_required(client, make_item, owner):
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(3))
    payload = draft_payload(owner, item)
    payload.pop("client_request_id")
    assert client.put("/api/io/draft", json=payload).status_code == 422
    payload["batch_id"] = str(uuid.uuid4())
    assert client.put("/api/io/draft", json=payload).status_code == 422


def test_other_owner_is_rejected_before_version_or_key_details(client, db_session, make_item, owner):
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(10))
    payload = draft_payload(owner, item)
    saved = client.put("/api/io/draft", json=payload).json()
    other = Employee(employee_code="WORK-OTHER", name="Other", role="staff", department=DepartmentEnum.ASSEMBLY, is_active=True)
    db_session.add(other)
    db_session.commit()
    payload["requester_employee_id"] = str(other.employee_id)
    response = client.put("/api/io/draft", json=payload)
    assert response.status_code == 403 and "current_revision" not in response.text
    payload.update(batch_id=saved["batch_id"], expected_revision=999)
    response = client.put("/api/io/draft", json=payload)
    assert response.status_code == 403 and "current_revision" not in response.text
    response = client.delete(f"/api/io/draft/{saved['batch_id']}", params={
        "requester_employee_id": str(other.employee_id), "expected_revision": 999})
    assert response.status_code == 403
    assert pending(db_session, item) == 3


def test_multi_material_edit_rolls_back_every_line_and_event(client, db_session, make_item, owner):
    from app.models import IoDraftReservation, IoWorkReservationEvent
    first = make_item(process_type_code="AR", warehouse_qty=Decimal(10))
    second = make_item(process_type_code="AR", warehouse_qty=Decimal(1))
    payload = draft_payload(owner, first)
    saved = client.put("/api/io/draft", json=payload).json()
    payload.update(batch_id=saved["batch_id"], expected_revision=1)
    payload["bundles"][0]["lines"][0]["quantity"] = 6
    payload["bundles"].extend(draft_payload(owner, second, 2)["bundles"])
    response = client.put("/api/io/draft", json=payload)
    assert response.status_code == 422, response.text
    assert pending(db_session, first) == 3 and pending(db_session, second) == 0
    assert db_session.query(IoDraftReservation).one().quantity == 3
    assert db_session.query(IoWorkReservationEvent).count() == 1
    batch = db_session.query(IoBatch).one()
    assert batch.revision == 1 and len(batch.bundles) == 1


def test_available_subtracts_approval_shipping_and_draft_once(client, db_session, make_item, owner):
    from app.models import ShippingRequest, ShippingAllocation
    from app.services.stock_availability import AvailabilityCell, figure_for_cell
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(10), pending=Decimal(2))
    shipping = ShippingRequest(base_pf_item_id=item.item_id, request_quantity=1)
    db_session.add(shipping)
    db_session.flush()
    db_session.add(ShippingAllocation(request_id=shipping.request_id, item_id=item.item_id,
                                     quantity=1, department=None, status="RESERVED"))
    db_session.commit()
    response = client.put("/api/io/draft", json=draft_payload(owner, item, 3))
    assert response.status_code == 200, response.text
    assert pending(db_session, item) == 5
    assert figure_for_cell(db_session, AvailabilityCell.warehouse(item.item_id)).available == 4


def test_read_saved_draft_reuses_ledger_without_mutating_stock(client, db_session, make_item, owner):
    from app.models import IoWorkReservationEvent
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(3))
    saved = client.put("/api/io/draft", json=draft_payload(owner, item)).json()
    response = client.get("/api/io/drafts", params={"requester_employee_id": str(owner.employee_id)})
    assert response.status_code == 200, response.text
    assert response.json()[0]["bundles"][0]["lines"][0]["shortage"] == 0
    assert response.json()[0]["effective_plan"] == saved["effective_plan"]
    assert pending(db_session, item) == 3
    assert db_session.query(IoWorkReservationEvent).count() == 1


def test_future_receipt_cannot_fund_current_input(db_session, make_item, owner):
    from app.services.io_reservations import replace_reservations
    from app.services.work_reservation_errors import WorkReservationError
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(0))
    batch = IoBatch(work_type="process", sub_type="produce", requester_employee_id=owner.employee_id,
        requester_name=owner.name, requester_department="조립", status="draft")
    db_session.add(batch)
    db_session.flush()
    identity = {"item_id": str(item.item_id), "bundle_id": str(uuid.uuid4()), "item_name": item.item_name, "mes_code": item.mes_code, "unit": "EA", "quantity": 5}
    plan = {"version": 1, "fingerprint": "example", "effects": [
        {**identity, "kind": "in", "from": None, "to": {"bucket": "warehouse", "department": None}},
        {**identity, "kind": "out", "from": {"bucket": "warehouse", "department": None}, "to": None}]}
    with pytest.raises(WorkReservationError) as error:
        replace_reservations(db_session, batch, plan)
    assert error.value.code == "STOCK_SHORTAGE"
    assert error.value.extra["reservation_shortages"][0]["available_quantity"] == 0


@pytest.mark.parametrize("endpoint", ["draft", "direct_id", "direct_key"])
def test_invalid_snapshot_or_creation_key_cannot_bypass_submit_guards(client, db_session, make_item, owner, endpoint):
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(10))
    payload = draft_payload(owner, item)
    batch = IoBatch(work_type="warehouse_io", sub_type="warehouse_to_dept", status="draft",
        requester_employee_id=owner.employee_id, requester_name=owner.name, requester_department="조립",
        revision=1, reservation_status="reserved", creation_payload_hash="a" * 64,
        client_request_id=payload["client_request_id"], effective_plan={"version": 1, "fingerprint": "a", "effects": []})
    db_session.add(batch)
    db_session.commit()
    if endpoint == "draft":
        result = client.post(f"/api/io/draft/{batch.batch_id}/submit", params={
            "requester_employee_id": str(owner.employee_id)}, json={"expected_revision": 1})
    else:
        if endpoint == "direct_id":
            payload["batch_id"] = str(batch.batch_id)
            payload["client_request_id"] = str(uuid.uuid4())
        result = client.post("/api/io/submit", json=payload)
    assert result.status_code == 409, result.text
    assert result.json()["detail"]["code"] == {
        "draft": "WORK_PLAN_CHANGED", "direct_id": "WORK_STATE_CONFLICT", "direct_key": "WORK_CREATE_KEY_CONFLICT",
    }[endpoint]
    db_session.expire_all()
    assert db_session.query(IoBatch).one().status == "draft"
    assert db_session.query(TransactionLog).count() == 0


@pytest.mark.parametrize("quantity", [-1, 1.5, True])
def test_invalid_quantities_are_rejected_without_creating_work(client, db_session, make_item, owner, quantity):
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(10))
    payload = draft_payload(owner, item)
    payload["bundles"][0]["lines"][0]["quantity"] = quantity
    assert client.put("/api/io/draft", json=payload).status_code == 422
    assert db_session.query(IoBatch).count() == 0


def test_inactive_owner_cannot_replay_modify_or_delete(client, db_session, make_item, owner):
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(3))
    payload = draft_payload(owner, item)
    saved = client.put("/api/io/draft", json=payload).json()
    owner.is_active = False
    db_session.commit()
    assert client.put("/api/io/draft", json=payload).status_code == 403
    payload.update(batch_id=saved["batch_id"], expected_revision=999)
    assert client.put("/api/io/draft", json=payload).status_code == 403
    assert client.delete(f"/api/io/draft/{saved['batch_id']}", params={
        "requester_employee_id": str(owner.employee_id), "expected_revision": 999}).status_code == 403
    assert pending(db_session, item) == 3


@pytest.mark.parametrize("quantity", [-1, True])
def test_line_quantity_schema_rejects_negative_and_bool(quantity):
    from pydantic import ValidationError
    from app.schemas.io import IoLinePayload
    with pytest.raises(ValidationError):
        IoLinePayload(line_id=uuid.uuid4(), item_id=uuid.uuid4(), item_name="Item", direction="out",
            from_bucket="warehouse", to_bucket="none", quantity=quantity, origin="direct")


def test_compare_and_swap_rejects_stale_identity_map(db_session, owner):
    from sqlalchemy import update
    from app.services.io_reservations import advance_revision
    from app.services.work_reservation_errors import WorkReservationError
    batch = IoBatch(work_type="process", sub_type="produce", status="draft", revision=1,
        requester_employee_id=owner.employee_id, requester_name=owner.name, requester_department="조립")
    db_session.add(batch)
    db_session.flush()
    db_session.execute(update(IoBatch).where(IoBatch.batch_id == batch.batch_id).values(revision=2)
                       .execution_options(synchronize_session=False))
    assert batch.revision == 1
    with pytest.raises(WorkReservationError) as error:
        advance_revision(db_session, batch, 1)
    assert error.value.code == "WORK_REVISION_CONFLICT" and batch.revision == 2


def test_edit_changes_source_without_leaving_old_reservation(client, db_session, make_item, make_location, owner):
    from app.models import InventoryLocation, IoDraftReservation
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(10))
    make_location(item.item_id, quantity=Decimal(10))
    payload = draft_payload(owner, item, 3)
    saved = client.put("/api/io/draft", json=payload).json()
    payload.update(batch_id=saved["batch_id"], expected_revision=1, sub_type="dept_to_warehouse")
    payload["bundles"][0]["lines"][0].update(from_bucket="production", from_department="조립",
        to_bucket="warehouse", to_department=None)
    response = client.put("/api/io/draft", json=payload)
    assert response.status_code == 200, response.text
    assert pending(db_session, item) == 0
    assert db_session.query(InventoryLocation).filter_by(item_id=item.item_id).one().pending_quantity == 3
    assert db_session.query(IoDraftReservation).one().source_bucket == "production"


def test_saved_routes_do_not_change_when_item_department_changes(client, db_session, make_item, owner):
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(3))
    saved = client.put("/api/io/draft", json=draft_payload(owner, item)).json()
    item.process_type_code = "TR"
    db_session.commit()
    response = client.get("/api/io/drafts", params={"requester_employee_id": str(owner.employee_id)})
    assert response.status_code == 200, response.text
    current = response.json()[0]
    assert current["bundles"][0]["lines"][0]["to_department"] == "조립"
    assert current["effective_plan"] == saved["effective_plan"]
    assert current["department_routes_normalized"] is False


def test_submitted_batch_cannot_give_preview_credit(client, db_session, make_item, owner):
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(3))
    saved = client.put("/api/io/draft", json=draft_payload(owner, item)).json()
    db_session.query(IoBatch).one().status = "reserved"
    db_session.commit()
    response = client.post("/api/io/preview", json={"work_type": "warehouse_io", "sub_type": "warehouse_to_dept",
        "to_department": "조립", "requester_employee_id": str(owner.employee_id), "owner_batch_id": saved["batch_id"],
        "targets": [{"item_id": str(item.item_id), "quantity": 3}]})
    assert response.status_code == 409, response.text
    assert response.json()["detail"]["code"] == "WORK_STATE_CONFLICT"


def test_legacy_unreserved_draft_cannot_submit(client, db_session, owner):
    batch = IoBatch(work_type="warehouse_io", sub_type="warehouse_to_dept", status="draft",
        requester_employee_id=owner.employee_id, requester_name=owner.name, requester_department="조립")
    db_session.add(batch)
    db_session.commit()
    response = client.post(f"/api/io/draft/{batch.batch_id}/submit", params={"requester_employee_id": str(owner.employee_id)}, json={"expected_revision": 0})
    assert response.status_code == 409, response.text
    assert response.json()["detail"]["code"] == "WORK_RESERVATION_REQUIRED"
    db_session.expire_all()
    assert batch.status == "draft"


@pytest.mark.parametrize("sub_type", ["produce", "disassemble"])
@pytest.mark.parametrize("scenario", ["standard", "custom", "exempt", "excluded"])
def test_saved_bom_reserves_effective_inputs_only(client, db_session, make_item, make_bom, make_location, owner, sub_type, scenario):
    from app.models import IoDraftReservation
    parent = make_item(name="Parent", process_type_code="AF")
    child = make_item(name="Child", process_type_code="AR")
    make_bom(parent.item_id, child.item_id, Decimal(2))
    make_location(parent.item_id, quantity=Decimal(20))
    make_location(child.item_id, quantity=Decimal(20))
    if scenario == "exempt":
        child.bom_stock_exempt = True
    db_session.commit()
    preview = client.post("/api/io/preview", json={"work_type": "process", "sub_type": sub_type,
        "to_department": "조립", "targets": [{"item_id": str(parent.item_id), "quantity": 1}]})
    assert preview.status_code == 200, preview.text
    bundles = preview.json()["bundles"]
    child_line = next(line for line in bundles[0]["lines"] if line["origin"] == "bom_auto")
    if scenario == "custom":
        child_line["quantity"] = 3
    elif scenario == "excluded":
        child_line["included"] = False
    response = client.put("/api/io/draft", json={"work_type": "process", "sub_type": sub_type,
        "requester_employee_id": str(owner.employee_id), "client_request_id": str(uuid.uuid4()),
        "to_department": "조립", "bundles": bundles})
    assert response.status_code == 200, response.text
    plan = response.json()["effective_plan"]
    input_totals = {effect["item_id"]: effect["quantity"] for effect in plan["effects"] if effect["from"] is not None}
    expected = (
        {str(child.item_id): 2} if scenario == "standard" and sub_type == "produce" else
        {str(parent.item_id): 1} if scenario in {"standard", "exempt"} and sub_type == "disassemble" else
        {str(child.item_id): 3} if scenario == "custom" and sub_type == "disassemble" else {})
    assert input_totals == expected
    assert {str(row.item_id): row.quantity for row in db_session.query(IoDraftReservation).all()} == expected
    assert response.json()["reservation_status"] == ("reserved" if expected else "not_required")
    assert db_session.query(TransactionLog).count() == 0
