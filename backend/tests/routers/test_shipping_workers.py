"""Workers are free text metadata; changing them cannot execute shipping work."""
from datetime import datetime

import pytest
from sqlalchemy import select

from app.models import BOM, Base, Employee, Item, ShippingRequest, ShippingRequestEvent, ShippingRequestRevision, ShippingRequestStatusEnum
from app.services import shipping as shipping_svc
from app.schemas.shipping import ShippingRequestCreate, ShippingRequestUpdate


@pytest.fixture
def shipping_work(db_session, make_item):
    item = make_item(name="Workers PF", process_type_code="PF")
    actor = Employee(employee_code="workers-editor", name="Actual Editor", department="조립", role="worker", is_active=True)
    db_session.add(actor)
    request = ShippingRequest(base_pf_item_id=item.item_id, requested_by_name="Original Requester", invoice_number="KEEP-001", serial_numbers="SN-KEEP")
    db_session.add(request)
    db_session.commit()
    return request, actor


def test_create_and_update_support_normalized_workers():
    payload = {"base_pf_item_id": "00000000-0000-0000-0000-000000000001", "worker_names": "  Alice, Bob\r\nCharlie/Dan  "}
    assert ShippingRequestCreate.model_validate(payload).model_dump()["worker_names"] == "Alice, Bob Charlie/Dan"
    assert ShippingRequestUpdate.model_validate({"worker_names": "\n  "}).model_dump()["worker_names"] is None
    assert "worker_names" not in ShippingRequestUpdate().model_dump(exclude_unset=True)


def test_workers_patch_isolated_and_audited(client, db_session, shipping_work):
    request, actor = shipping_work
    request.updated_at = datetime(2026, 10, 20)
    db_session.commit()
    before = shipping_svc._revision_snapshot(request)
    untouched_tables = [table for table in Base.metadata.sorted_tables if table.name not in {
        "shipping_requests", "shipping_request_revisions", "shipping_request_events", "data_revision", "activity_audit_logs"}]
    before_rows = {table.name: db_session.execute(select(table)).all() for table in untouched_tables}
    response = client.patch(f"/api/shipping/requests/{request.request_id}/workers", headers={"X-MES-Employee-Code": actor.employee_code},
        json={"worker_names": "  Alice, Bob\r\nCharlie  "})
    assert response.status_code == 200, response.text
    assert response.json()["worker_names"] == "Alice, Bob Charlie"
    db_session.refresh(request)
    after = shipping_svc._revision_snapshot(request)
    assert {key: value for key, value in after.items() if key != "worker_names"} == {key: value for key, value in before.items() if key != "worker_names"}
    assert request.status == ShippingRequestStatusEnum.PREPARING
    assert request.serial_numbers == "SN-KEEP" and request.prepared_by_employee_id is None
    revision = db_session.query(ShippingRequestRevision).one()
    assert revision.edited_by_employee_id == actor.employee_id
    assert revision.edited_by_name == actor.name
    assert revision.affects_preparation is False
    assert revision.changes == [{"field": "worker_names", "before": None, "after": "Alice, Bob Charlie"}]
    event = db_session.query(ShippingRequestEvent).one()
    assert event.event_type == "WORKERS_UPDATED"
    assert request.updated_at > datetime(2026, 10, 20)
    assert {table.name: db_session.execute(select(table)).all() for table in untouched_tables} == before_rows
    updated_at = request.updated_at
    same = client.patch(f"/api/shipping/requests/{request.request_id}/workers", headers={"X-MES-Employee-Code": actor.employee_code}, json={"worker_names": "Alice, Bob Charlie"})
    assert same.status_code == 200
    assert db_session.query(ShippingRequestRevision).count() == 1
    assert db_session.query(ShippingRequestEvent).count() == 1
    db_session.refresh(request)
    assert request.updated_at == updated_at
    cleared = client.patch(f"/api/shipping/requests/{request.request_id}/workers", headers={"X-MES-Employee-Code": actor.employee_code}, json={"worker_names": " \n "})
    assert cleared.status_code == 200 and cleared.json()["worker_names"] is None


@pytest.mark.parametrize("status", ["PREPARED", "PICKED_UP", "CANCELLED"])
def test_workers_patch_rejects_non_preparing(client, db_session, shipping_work, status):
    request, actor = shipping_work
    request.status = ShippingRequestStatusEnum(status)
    db_session.commit()
    response = client.patch(f"/api/shipping/requests/{request.request_id}/workers", headers={"X-MES-Employee-Code": actor.employee_code}, json={"worker_names": "Blocked"})
    assert response.status_code == 422
    assert db_session.query(ShippingRequestRevision).count() == 0


def test_workers_patch_requires_real_actor_and_length(client, shipping_work):
    request, actor = shipping_work
    path = f"/api/shipping/requests/{request.request_id}/workers"
    assert client.patch(path, json={"worker_names": "A"}).status_code == 400
    assert client.patch(path, headers={"X-MES-Employee-Code": actor.employee_code}, json={"worker_names": "x" * 201}).status_code == 422


def test_existing_update_without_workers_preserves_value(db_session, shipping_work, monkeypatch):
    request, actor = shipping_work
    request.worker_names = "Keep workers"
    db_session.commit()
    monkeypatch.setattr(shipping_svc, "_resolve_final_items", lambda db, req: None)
    shipping_svc.update_request(db_session, request.request_id, {"notes": "New note"}, actor)
    db_session.refresh(request)
    assert request.worker_names == "Keep workers"


def test_create_and_general_update_store_workers(client, db_session, make_item, make_bom, shipping_work):
    actor = shipping_work[1]
    pa = make_item(name="Workers base PA", process_type_code="PA")
    pf = make_item(name="Workers create PF", process_type_code="PF")
    make_bom(pf.item_id, pa.item_id, 1)
    db_session.commit()
    created = client.post("/api/shipping/requests", json={"base_pf_item_id": str(pf.item_id),
        "requested_by_name": "Requester", "worker_names": " Worker A\nWorker B "})
    assert created.status_code == 201, created.text
    assert created.json()["worker_names"] == "Worker A Worker B"
    path = f"/api/shipping/requests/{created.json()['request_id']}"
    changed = client.patch(path, headers={"X-MES-Employee-Code": actor.employee_code}, json={"worker_names": "  Worker C  "})
    assert changed.status_code == 200, changed.text
    assert changed.json()["worker_names"] == "Worker C"
    preserved = client.patch(path, headers={"X-MES-Employee-Code": actor.employee_code}, json={"requested_by_name": "Changed requester"})
    assert preserved.status_code == 200 and preserved.json()["worker_names"] == "Worker C"


def test_workers_patch_uses_status_refreshed_under_lock(db_session, shipping_work):
    request, actor = shipping_work
    db_session.execute(ShippingRequest.__table__.update().where(ShippingRequest.request_id == request.request_id).values(status="PREPARED"))
    assert request.status == ShippingRequestStatusEnum.PREPARING
    with pytest.raises(shipping_svc.ShippingError, match="준비 중"):
        shipping_svc.update_workers(db_session, request.request_id, "Blocked", actor)
    assert db_session.query(ShippingRequestRevision).count() == 0


def test_general_workers_only_patch_preserves_owned_final_bom(client, db_session, make_item, make_bom, shipping_work):
    actor = shipping_work[1]
    component = make_item(name="Owned component", process_type_code="AF")
    extra = make_item(name="Owned extra", process_type_code="PR")
    pa = make_item(name="Owned base PA", process_type_code="PA")
    pf = make_item(name="Owned base PF", process_type_code="PF")
    make_bom(pa.item_id, component.item_id, 1)
    make_bom(pf.item_id, pa.item_id, 1)
    db_session.commit()
    created = client.post("/api/shipping/requests", json={"base_pf_item_id": str(pf.item_id),
        "finalization_mode": "CREATE_NEW", "custom_pa_name": "Owned new PA", "custom_pf_name": "Owned new PF",
        "bom_lines": [{"parent_stage": "PA", "child_item_id": str(item.item_id), "quantity": 1} for item in (component, extra)]})
    assert created.status_code == 201, created.text
    before = db_session.execute(select(BOM.__table__).order_by(BOM.bom_id)).all()
    item_times = db_session.execute(select(Item.item_id, Item.updated_at, Item.bom_completed_at).order_by(Item.item_id)).all()
    changed = client.patch(f"/api/shipping/requests/{created.json()['request_id']}",
        headers={"X-MES-Employee-Code": actor.employee_code}, json={"worker_names": "Workers only"})
    assert changed.status_code == 200, changed.text
    assert db_session.execute(select(BOM.__table__).order_by(BOM.bom_id)).all() == before
    assert db_session.execute(select(Item.item_id, Item.updated_at, Item.bom_completed_at).order_by(Item.item_id)).all() == item_times
