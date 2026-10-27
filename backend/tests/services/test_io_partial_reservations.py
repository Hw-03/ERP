"""Partial draft acquisition keeps desired effects and blocks incomplete submissions."""
from collections.abc import Callable
from decimal import Decimal
from typing import Any

import pytest
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.models import (
    Employee, Inventory, InventoryLocation, IoBatch, IoDraftReservation,
    IoWorkReservationEvent, Item, ShippingAllocation, ShippingRequest,
    StockRequest, TransactionLog,
)
from app.schemas.work_reservations import WorkReservationIssue
from tests.services.test_io_draft_reservations import draft_payload, owner, pending


@pytest.mark.parametrize("quantity", [Decimal(0), Decimal(1)])
def test_partial_save_and_creation_replay_keep_only_acquired_stock(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    owner: Employee, quantity: Decimal,
) -> None:
    """Even an empty acquisition is a saved reserved draft with its full plan."""
    item = make_item(process_type_code="AR", warehouse_qty=quantity)
    payload = draft_payload(owner, item, 3)
    response = client.put("/api/io/draft", json=payload)
    assert response.status_code == 200, response.text
    saved = response.json()
    assert saved["status"] == "draft" and saved["revision"] == 1
    assert saved["reservation_status"] == "reserved"
    issue = WorkReservationIssue.model_validate(saved["reservation_issue"])
    assert issue.code == "stock_shortage"
    shortage = issue.shortages[0]
    assert shortage.item_id == str(item.item_id)
    assert shortage.location.bucket == "warehouse"
    assert (shortage.required_quantity, shortage.available_quantity, shortage.shortage_quantity) == (
        3, int(quantity), 3 - int(quantity))
    assert saved["effective_plan"]["effects"][0]["quantity"] == 3
    assert saved["bundles"][0]["lines"][0]["quantity"] == 3
    assert saved["bundles"][0]["lines"][0]["shortage"] == 3 - int(quantity)
    assert pending(db_session, item) == quantity
    rows = db_session.query(IoDraftReservation).all()
    assert [row.quantity for row in rows] == ([int(quantity)] if quantity else [])

    replay = client.put("/api/io/draft", json=payload)
    assert replay.status_code == 200, replay.text
    assert replay.json()["batch_id"] == saved["batch_id"]
    assert replay.json()["revision"] == 1
    assert pending(db_session, item) == quantity
    assert db_session.query(IoWorkReservationEvent).count() == 1
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().warehouse_qty == quantity
    assert db_session.query(TransactionLog).count() == 0


def test_partial_draft_reads_credit_actual_reservation_and_keep_desired_forecast(
    client: TestClient, db_session: Session, make_item: Callable[..., Item], owner: Employee,
) -> None:
    """Read consumers distinguish the requested movement from acquired inputs."""
    from app.services.work_reservation_queries import bulk_inventory_work_status

    item = make_item(process_type_code="AR", warehouse_qty=Decimal(2))
    response = client.put("/api/io/draft", json=draft_payload(owner, item, 5))
    assert response.status_code == 200, response.text
    saved = response.json()
    params = {"requester_employee_id": str(owner.employee_id)}
    listed = client.get("/api/io/drafts", params=params)
    current = client.get("/api/io/draft", params={**params, "work_type": "warehouse_io",
        "sub_type": "warehouse_to_dept"})
    assert listed.status_code == current.status_code == 200
    for body in [listed.json()[0], current.json()]:
        assert body["reservation_issue"] == saved["reservation_issue"]
        assert body["bundles"][0]["lines"][0]["shortage"] == 3
        assert body["effective_plan"] == saved["effective_plan"]
    preview_payload = {"work_type": "warehouse_io", "sub_type": "warehouse_to_dept",
        "requester_employee_id": str(owner.employee_id), "to_department": "조립",
        "targets": [{"item_id": str(item.item_id), "quantity": 5}]}
    public = client.post("/api/io/preview", json=preview_payload)
    assert public.status_code == 200, public.text
    assert public.json()["bundles"][0]["lines"][0]["shortage"] == 5
    owned = client.post("/api/io/preview", json={**preview_payload, "owner_batch_id": saved["batch_id"]})
    assert owned.status_code == 200, owned.text
    assert owned.json()["bundles"][0]["lines"][0]["shortage"] == 3
    status = bulk_inventory_work_status(db_session, [item.item_id])[item.item_id]
    assert status["summary"]["work_reserved_quantity"] == 2
    work = status["works"][0]
    assert work["reserved_inputs"][0]["quantity"] == 2
    assert work["expected_effects"][0]["quantity"] == 5
    assert pending(db_session, item) == 2
    assert db_session.query(IoWorkReservationEvent).count() == 1
    assert db_session.query(TransactionLog).count() == 0


@pytest.mark.parametrize("bucket", ["warehouse", "production"])
def test_partial_save_cannot_take_other_draft_approval_or_shipping_stock(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation], owner: Employee, bucket: str,
) -> None:
    """Each physical source protects all existing allocation classes once."""
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(10 if bucket == "warehouse" else 0),
        pending=Decimal(2 if bucket == "warehouse" else 0))
    location = None
    if bucket == "production":
        location = make_location(item.item_id, quantity=Decimal(10))
        location.pending_quantity = 2
    shipping = ShippingRequest(base_pf_item_id=item.item_id, request_quantity=1)
    db_session.add(shipping)
    db_session.flush()
    db_session.add(ShippingAllocation(request_id=shipping.request_id, item_id=item.item_id,
        quantity=1, department="조립" if location else None, status="RESERVED"))
    db_session.commit()

    def payload_for(quantity: int) -> dict[str, Any]:
        """Route both drafts to the same warehouse or production source."""
        payload = draft_payload(owner, item, quantity)
        if location:
            payload["sub_type"] = "dept_to_warehouse"
            payload["bundles"][0]["lines"][0].update(from_bucket="production", from_department="조립",
                to_bucket="warehouse", to_department=None)
        return payload

    first = client.put("/api/io/draft", json=payload_for(2))
    assert first.status_code == 200, first.text
    second = client.put("/api/io/draft", json=payload_for(10))
    assert second.status_code == 200, second.text
    shortage = second.json()["reservation_issue"]["shortages"][0]
    assert shortage["location"]["bucket"] == bucket
    assert (shortage["required_quantity"], shortage["available_quantity"], shortage["shortage_quantity"]) == (10, 5, 5)
    rows = {str(row.batch_id): row.quantity for row in db_session.query(IoDraftReservation)}
    assert rows == {first.json()["batch_id"]: 2, second.json()["batch_id"]: 5}
    db_session.expire_all()
    stock = location if location else db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    assert stock.pending_quantity == 9
    assert (stock.quantity if location else stock.warehouse_qty) == 10
    assert db_session.query(ShippingAllocation).one().quantity == 1
    assert db_session.query(TransactionLog).count() == 0


def test_partial_draft_rejects_stale_edit_without_changing_ledger(
    client: TestClient, db_session: Session, make_item: Callable[..., Item], owner: Employee,
) -> None:
    """Shortage persistence does not weaken optimistic concurrency."""
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(1))
    payload = draft_payload(owner, item, 3)
    response = client.put("/api/io/draft", json=payload)
    assert response.status_code == 200, response.text
    saved = response.json()
    payload.update(batch_id=saved["batch_id"], expected_revision=0, notes="stale")
    response = client.put("/api/io/draft", json=payload)
    assert response.status_code == 409, response.text
    assert response.json()["detail"]["code"] == "WORK_REVISION_CONFLICT"
    db_session.expire_all()
    batch = db_session.query(IoBatch).one()
    assert batch.revision == 1 and batch.notes != "stale"
    assert batch.reservation_issue == saved["reservation_issue"]
    assert pending(db_session, item) == 1
    assert db_session.query(IoDraftReservation).one().quantity == 1
    assert db_session.query(IoWorkReservationEvent).count() == 1


@pytest.mark.parametrize("restocked", [False, True])
def test_partial_submit_requires_resave_then_hands_off_without_double_reservation(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    owner: Employee, restocked: bool,
) -> None:
    """New free stock cannot silently fill an incomplete saved acquisition at submit."""
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(1))
    payload = draft_payload(owner, item, 3)
    response = client.put("/api/io/draft", json=payload)
    assert response.status_code == 200, response.text
    saved = response.json()
    if restocked:
        inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
        inventory.quantity = inventory.warehouse_qty = 3
        db_session.commit()
    params = {"requester_employee_id": str(owner.employee_id)}
    submit_path = f"/api/io/draft/{saved['batch_id']}/submit"
    blocked = client.post(submit_path, params=params, json={"expected_revision": 1})
    assert blocked.status_code == 422, blocked.text
    assert blocked.json()["detail"]["code"] == "STOCK_SHORTAGE"
    shortage = blocked.json()["detail"]["extra"]["reservation_shortages"][0]
    assert (shortage["required_quantity"], shortage["available_quantity"], shortage["shortage_quantity"]) == (3, 1, 2)
    db_session.expire_all()
    batch = db_session.query(IoBatch).one()
    assert batch.status == "draft" and batch.revision == 1
    assert batch.reservation_issue == saved["reservation_issue"]
    assert pending(db_session, item) == 1
    assert db_session.query(IoDraftReservation).one().quantity == 1
    assert db_session.query(IoWorkReservationEvent).count() == 1
    assert db_session.query(StockRequest).count() == 0
    assert db_session.query(TransactionLog).count() == 0
    if not restocked:
        return

    payload.update(batch_id=saved["batch_id"], expected_revision=1)
    topped_up = client.put("/api/io/draft", json=payload)
    assert topped_up.status_code == 200, topped_up.text
    assert topped_up.json()["revision"] == 2
    assert topped_up.json()["reservation_issue"] is None
    assert topped_up.json()["bundles"][0]["lines"][0]["shortage"] == 0
    assert pending(db_session, item) == 3
    assert db_session.query(IoDraftReservation).one().quantity == 3
    submitted = client.post(submit_path, params=params, json={"expected_revision": 2})
    assert submitted.status_code == 201, submitted.text
    assert submitted.json()["batch"]["revision"] == 3
    assert pending(db_session, item) == 3
    assert db_session.query(IoDraftReservation).count() == 0
    assert db_session.query(StockRequest).count() == 1
    assert db_session.query(IoWorkReservationEvent).filter_by(action="submitted").count() == 1
    assert db_session.query(TransactionLog).count() == 0


def test_direct_submit_shortage_rolls_back_partial_acquisition(
    client: TestClient, db_session: Session, make_item: Callable[..., Item], owner: Employee,
) -> None:
    """The convenience submit command must still fail atomically on insufficient inputs."""
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(1))
    db_session.commit()
    response = client.post("/api/io/submit", json=draft_payload(owner, item, 3))
    assert response.status_code == 422, response.text
    assert response.json()["detail"]["code"] == "STOCK_SHORTAGE"
    assert pending(db_session, item) == 0
    assert db_session.query(IoBatch).count() == 0
    assert db_session.query(IoDraftReservation).count() == 0
    assert db_session.query(IoWorkReservationEvent).count() == 0
    assert db_session.query(StockRequest).count() == 0
    assert db_session.query(TransactionLog).count() == 0


def test_delete_partial_draft_releases_only_its_actual_acquisition(
    client: TestClient, db_session: Session, make_item: Callable[..., Item], owner: Employee,
) -> None:
    """Deleting desired quantity five cannot release another draft's two units."""
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(3))
    first = client.put("/api/io/draft", json=draft_payload(owner, item, 2))
    assert first.status_code == 200, first.text
    second = client.put("/api/io/draft", json=draft_payload(owner, item, 5))
    assert second.status_code == 200, second.text
    response = client.delete(f"/api/io/draft/{second.json()['batch_id']}", params={
        "requester_employee_id": str(owner.employee_id), "expected_revision": 1})
    assert response.status_code == 204, response.text
    assert pending(db_session, item) == 2
    row = db_session.query(IoDraftReservation).one()
    assert str(row.batch_id) == first.json()["batch_id"] and row.quantity == 2
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().warehouse_qty == 3
    assert db_session.query(TransactionLog).count() == 0


def test_negative_free_stock_cannot_create_negative_reservation(
    client: TestClient, db_session: Session, make_item: Callable[..., Item], owner: Employee,
) -> None:
    """Existing shipping allocations may exhaust free stock; acquisition bottoms out at zero."""
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(0))
    shipping = ShippingRequest(base_pf_item_id=item.item_id, request_quantity=1)
    db_session.add(shipping)
    db_session.flush()
    db_session.add(ShippingAllocation(request_id=shipping.request_id, item_id=item.item_id,
        quantity=1, department=None, status="RESERVED"))
    db_session.commit()
    response = client.put("/api/io/draft", json=draft_payload(owner, item, 3))
    assert response.status_code == 200, response.text
    shortage = response.json()["reservation_issue"]["shortages"][0]
    assert (shortage["available_quantity"], shortage["shortage_quantity"]) == (0, 3)
    assert db_session.query(IoDraftReservation).count() == 0
    assert pending(db_session, item) == 0
    assert db_session.query(ShippingAllocation).one().quantity == 1
