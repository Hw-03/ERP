"""Draft navigation reads stay bounded and never execute a stock command."""
from copy import deepcopy
from decimal import Decimal
import pytest

from sqlalchemy import event

from app.models import IoBatch, Inventory, ShippingAllocation, ShippingRequest
from app.schemas.io import IoDraftUpsert
from app.services import io_draft
from tests.routers.test_work_drafts import authenticated, drafts  # noqa: F401
from tests.services.test_io_draft_reservations import draft_payload, owner  # noqa: F401
from tests.services.test_work_reservation_backfill import legacy_batch


def test_count_is_authenticated_owner_only_without_detail(client, authenticated, drafts, monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("count must not construct a draft")

    monkeypatch.setattr(io_draft, "_draft_to_current_stock_payload", forbidden)
    assert client.get("/api/work-drafts/count").status_code == 401
    response = client.get("/api/work-drafts/count", headers=authenticated[0])
    assert response.status_code == 200, response.text
    assert response.json() == {"io_count": 1, "stock_request_count": 0, "total": 1}


def test_owned_single_draft_uses_current_stock_and_rejects_other_or_closed(client, db_session, authenticated, drafts):
    batch, legacy, _ = drafts
    path = f"/api/work-drafts/owned-io/{batch.batch_id}"
    response = client.get(path, headers=authenticated[0])
    assert response.status_code == 200, response.text
    assert response.json()["bundles"][0]["lines"][0]["shortage"] == 0
    batch.requester_employee_id = legacy.requester_employee_id
    db_session.commit()
    assert client.get(path, headers=authenticated[0]).status_code == 404
    batch.requester_employee_id = authenticated[1].employee_id
    batch.status = "completed"
    db_session.commit()
    assert client.get(path, headers=authenticated[0]).status_code == 404


def test_saved_plan_list_matches_single_reads_with_bounded_queries(db_session, make_item, owner):
    items = [make_item(process_type_code="AR", warehouse_qty=Decimal(100)) for _ in range(8)]
    actor_id = owner.employee_id
    for _ in range(3):
        payload = draft_payload(owner, items[0])
        for item in items[1:]:
            payload["bundles"].extend(draft_payload(owner, item)["bundles"])
        io_draft.save_draft(db_session, IoDraftUpsert.model_validate(payload))
    db_session.commit()
    batches = db_session.query(IoBatch).order_by(IoBatch.updated_at.desc()).all()
    expected = [deepcopy(io_draft._draft_to_current_stock_payload(db_session, batch)) for batch in batches]
    db_session.expire_all()
    statements = []

    def record(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    engine = db_session.get_bind()
    event.listen(engine, "before_cursor_execute", record)
    try:
        actual = io_draft.list_drafts(db_session, requester_employee_id=actor_id)
    finally:
        event.remove(engine, "before_cursor_execute", record)
    assert actual == expected
    assert len(statements) <= 20, f"executed {len(statements)} SQL statements"
    assert not any(sql.lstrip().upper().startswith(("UPDATE", "INSERT", "DELETE")) for sql in statements)


def test_legacy_draft_projection_preserves_normalization(db_session, make_item, owner):
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(100))
    batch = legacy_batch(db_session, owner, item)
    actor_id = owner.employee_id
    expected = deepcopy(io_draft._draft_to_current_stock_payload(db_session, batch))
    db_session.expire_all()
    assert io_draft.list_drafts(db_session, requester_employee_id=actor_id) == [expected]


@pytest.mark.parametrize("bucket", ["warehouse", "production"])
def test_bulk_shortages_match_owner_credit_shipping_and_shared_cell(db_session, make_item, make_location, owner, bucket):
    item = make_item(process_type_code="AR", warehouse_qty=Decimal(10))
    location = make_location(item.item_id, quantity=Decimal(10))
    payload = draft_payload(owner, item)
    payload["bundles"].extend(draft_payload(owner, item)["bundles"])
    if bucket == "production":
        payload["sub_type"] = "dept_to_warehouse"
        for bundle in payload["bundles"]:
            bundle["lines"][0].update(from_bucket="production", from_department="조립", to_bucket="warehouse", to_department=None)
    saved = io_draft.save_draft(db_session, IoDraftUpsert.model_validate(payload))
    shipping = ShippingRequest(base_pf_item_id=item.item_id, request_quantity=2)
    db_session.add(shipping)
    db_session.flush()
    db_session.add(ShippingAllocation(request_id=shipping.request_id, item_id=item.item_id, quantity=2,
        department=None if bucket == "warehouse" else "조립", status="RESERVED"))
    if bucket == "warehouse":
        db_session.query(Inventory).filter_by(item_id=item.item_id).one().warehouse_qty = 6
    else:
        location.quantity = 6
    db_session.commit()
    actor_id = owner.employee_id
    batch = db_session.get(IoBatch, saved["batch_id"])
    expected = deepcopy(io_draft._draft_to_current_stock_payload(db_session, batch))
    db_session.expire_all()
    actual = io_draft.list_drafts(db_session, requester_employee_id=actor_id)
    assert actual == [expected]
    assert [bundle["lines"][0]["shortage"] for bundle in actual[0]["bundles"]] == [0, 2]
