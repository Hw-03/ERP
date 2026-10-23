"""Preparing shipping joins the shared SQL page without inventing employee identity."""
from datetime import datetime

import pytest
from sqlalchemy import event

from app.models import ShippingRequest, ShippingRequestBomLine, ShippingRequestCompanionLine, ShippingRequestStatusEnum
from tests.routers.test_work_drafts import authenticated, drafts  # noqa: F401
from tests.services.test_io_draft_reservations import owner  # noqa: F401


@pytest.fixture
def shipping(db_session, make_item):
    base = make_item(name="Shipping Base PF", process_type_code="PF")
    final = make_item(name="Shipping Final PF", process_type_code="PF")
    companion = make_item(name="Shipping Companion", process_type_code="PR")
    request = ShippingRequest(base_pf_item_id=base.item_id, final_pf_item_id=final.item_id, request_quantity=4,
        requested_by_name="Actual Requester", invoice_number="SHIP-001", updated_at=datetime(2026, 10, 20, 1, 30))
    request.companion_lines = [ShippingRequestCompanionLine(item_id=companion.item_id, quantity=2, unit="BOX")]
    db_session.add(request)
    db_session.commit()
    return request, final, companion


def test_shipping_joins_count_and_pages_between_existing_kinds(client, authenticated, drafts, shipping):
    pages = [client.get("/api/work-drafts", headers=authenticated[0], params={"skip": index, "limit": 1}).json() for index in range(3)]
    assert [page["total"] for page in pages] == [3, 3, 3]
    assert [page["items"][0]["kind"] for page in pages] == ["stock_request", "shipping", "io"]
    row = pages[1]["items"][0]
    assert row["requester_employee_id"] is None and row["requester_active"] is False
    assert row["requester_name"] == "Actual Requester" and row["requester_department"] == "출하"
    assert row["targets"][0]["item_name"] == "Shipping Final PF" and row["targets"][0]["quantity"] == 4


@pytest.mark.parametrize("search", ["Shipping Final PF", "출하", "Worker Free Text"])
def test_shipping_searches_before_paging(client, db_session, authenticated, shipping, search):
    shipping[0].worker_names = "Worker Free Text"
    db_session.commit()
    page = client.get("/api/work-drafts", headers=authenticated[0], params={"search": search, "requester_department": "출하"}).json()
    assert page["total"] == 1 and page["items"][0]["kind"] == "shipping"


def test_shipping_never_joins_employee_scoped_work(client, authenticated, owner, shipping):
    page = client.get("/api/work-drafts", headers=authenticated[0], params={"requester_employee_id": str(owner.employee_id)}).json()
    assert page["total"] == 0


def test_shipping_preserves_personal_counts_and_shared_nullable_fields(client, authenticated, drafts, shipping):
    """Shipping does not become owned work or acquire stocktake pause metadata."""
    count = client.get("/api/work-drafts/count", headers=authenticated[0])
    assert count.status_code == 200
    assert count.json() == {"io_count": 1, "stock_request_count": 0, "total": 1}
    page = client.get("/api/work-drafts", headers=authenticated[0], params={"requester_department": "출하"})
    assert page.status_code == 200
    row = page.json()["items"][0]
    assert row["notes"] is None and row["stocktake_pause"] is None
    detail = client.get(f"/api/work-drafts/shipping/{shipping[0].request_id}", headers=authenticated[0])
    assert detail.status_code == 200
    assert detail.json()["notes"] is None and detail.json()["stocktake_pause"] is None


def test_shipping_detail_readonly_unknown_reservations_and_status_gate(client, db_session, authenticated, shipping):
    request, final, companion = shipping
    path = f"/api/work-drafts/shipping/{request.request_id}"
    response = client.get(path, headers=authenticated[0])
    assert response.status_code == 200, response.text
    detail = response.json()
    assert detail["shipping_summary"] == {"invoice_number": "SHIP-001", "companion_lines": [{"item_id": str(companion.item_id), "item_name": companion.item_name,
        "mes_code": companion.mes_code, "quantity": 2, "unit": "BOX"}]}
    assert all(detail[field] is None for field in ["reservation_status", "reservation_issue", "reserved_inputs", "expected_effects", "forecast_issue"])
    request.status = ShippingRequestStatusEnum.PREPARED
    db_session.commit()
    assert client.get(path, headers=authenticated[0]).status_code == 404
    assert client.get("/api/work-drafts", headers=authenticated[0]).json()["total"] == 0


def test_shipping_falls_back_to_base_without_requester(client, db_session, authenticated, shipping):
    request = shipping[0]
    request.final_pf_item_id = None
    request.requested_by_name = None
    db_session.commit()
    row = client.get("/api/work-drafts", headers=authenticated[0]).json()["items"][0]
    assert row["targets"][0]["item_name"] == "Shipping Base PF"
    assert row["requester_name"] == ""


def test_shipping_code_search_department_sort_and_stable_ties(client, db_session, authenticated, drafts, shipping):
    request, final, _ = shipping
    batch, legacy, _ = drafts
    request.updated_at = batch.updated_at = legacy.updated_at
    db_session.commit()
    code_page = client.get("/api/work-drafts", headers=authenticated[0], params={"search": final.mes_code}).json()
    assert code_page["total"] == 1 and code_page["items"][0]["id"] == str(request.request_id)
    tied = client.get("/api/work-drafts", headers=authenticated[0]).json()
    assert [row["kind"] for row in tied["items"]] == ["io", "shipping", "stock_request"]
    departments = client.get("/api/work-drafts", headers=authenticated[0], params={"sort": "department"}).json()
    assert [row["requester_department"] for row in departments["items"]] == ["튜브", "조립", "출하"]


def test_shipping_list_loads_page_only_and_no_shipping_line_graphs(client, db_session, authenticated, shipping):
    request = shipping[0]
    for index in range(20):
        db_session.add(ShippingRequest(base_pf_item_id=request.base_pf_item_id, request_quantity=1,
            updated_at=datetime(2026, 10, 21, index)))
    db_session.commit()
    loaded, writes = [], []
    def loaded_row(session, instance):
        loaded.append(instance)
    def statement(connection, cursor, sql, parameters, context, executemany):
        if sql.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE")):
            writes.append(sql)
    db_session.expunge_all()
    event.listen(db_session, "loaded_as_persistent", loaded_row)
    event.listen(db_session.bind, "before_cursor_execute", statement)
    try:
        page = client.get("/api/work-drafts", headers=authenticated[0], params={"limit": 2})
    finally:
        event.remove(db_session, "loaded_as_persistent", loaded_row)
        event.remove(db_session.bind, "before_cursor_execute", statement)
    assert page.status_code == 200 and page.json()["total"] == 21
    assert len([row for row in loaded if isinstance(row, ShippingRequest)]) == 2
    assert not [row for row in loaded if isinstance(row, (ShippingRequestBomLine, ShippingRequestCompanionLine))]
    assert writes == []
