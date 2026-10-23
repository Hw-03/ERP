"""HTTP resume accepts saved automatic routes while retaining every pause boundary."""
from copy import deepcopy
import json
import uuid

import pytest

from app import models
from tests.services.test_stocktake_counts import setup_round
from tests.services.test_work_stocktake_pause import mark_applied


def _paused_http_work(client, db, make_item, make_location, make_bom, request_type):
    db.add_all([models.Department(name="튜브", is_active=True),
        models.Department(name="조립", is_active=True),
        models.InventoryScope(scope_key="assembly", physical_department="조립")])
    child = make_item() if request_type == "rework_normal" else None
    _, actor, item, round_, _ = setup_round(db, make_item)
    notes = "saved work"
    if child is not None:
        make_bom(item.item_id, child.item_id, qty=1)
        notes = json.dumps({"child_decisions": [{"item_id": str(child.item_id),
            "qty": 3, "normal_qty": 3, "defective_qty": 0, "scrap_qty": 0}]})
    make_location(item.item_id, department=models.DepartmentEnum.TUBE, quantity=10)
    make_location(item.item_id, department=models.DepartmentEnum.ASSEMBLY, quantity=10)
    db.commit()
    inbound = request_type == "warehouse_to_dept"
    payload = {"requester_employee_id": str(actor.employee_id), "request_type": request_type,
        "notes": notes, "lines": [{"item_id": str(item.item_id), "quantity": 3,
            "from_bucket": "warehouse" if inbound else "production",
            "from_department": None if inbound else "튜브",
            "to_bucket": "production" if inbound else "warehouse" if request_type == "dept_to_warehouse" else "none",
            "to_department": "튜브" if inbound else None}]}
    response = client.put("/api/stock-requests/draft", json=payload)
    assert response.status_code == 200, response.text
    saved = response.json()
    assert saved["stocktake_pause"]["state"] == "blocked"
    item.process_type_code = "AR"
    db.commit()
    payload["stocktake_resume_token"] = saved["stocktake_pause"]["token"]
    if child is not None:
        mark_applied(db, round_["round_id"], child.item_id, scopes=("tube",))
    return item, round_, saved, payload


@pytest.mark.parametrize("request_type", ["warehouse_to_dept", "dept_to_warehouse", "scrap_normal", "rework_normal"])
@pytest.mark.parametrize("applied,allowed", [
    (("warehouse", "tube", "assembly"), True),
    (("warehouse", "tube"), False),
    (("warehouse", "assembly"), False),
])
def test_http_resume_normalizes_only_after_confirming_old_and_new_cells(
    client, db_session, make_item, make_location, make_bom, request_type, applied, allowed,
):
    item, round_, saved, payload = _paused_http_work(
        client, db_session, make_item, make_location, make_bom, request_type)
    mark_applied(db_session, round_["round_id"], item.item_id, scopes=applied)
    response = client.put("/api/stock-requests/draft", json=payload)
    assert response.status_code == (200 if allowed else 409), response.text
    if not allowed:
        # The shared client fixture replaces get_db, including its exception rollback.
        db_session.rollback()
    request = db_session.get(models.StockRequest, uuid.UUID(saved["request_id"]))
    field = "to_department" if request_type == "warehouse_to_dept" else "from_department"
    assert getattr(request.lines[0], field) == ("조립" if allowed else "튜브")
    pause = db_session.get(models.StocktakeWorkPause, ("stock_request", request.request_id))
    assert (pause is None) == allowed
    assert request.notes == saved["notes"]


@pytest.mark.parametrize("token,expected_status", [(None, 422), ("forged", 409)])
def test_http_stale_route_cannot_bypass_validation_without_valid_resume(
    client, db_session, make_item, make_location, make_bom, token, expected_status,
):
    item, round_, saved, payload = _paused_http_work(
        client, db_session, make_item, make_location, make_bom, "warehouse_to_dept")
    mark_applied(db_session, round_["round_id"], item.item_id, scopes=("warehouse", "tube", "assembly"))
    payload = deepcopy(payload)
    payload["stocktake_resume_token"] = str(uuid.uuid4()) if token else None
    response = client.put("/api/stock-requests/draft", json=payload)
    assert response.status_code == expected_status, response.text
    db_session.rollback()
    request = db_session.get(models.StockRequest, uuid.UUID(saved["request_id"]))
    assert request.lines[0].to_department == "튜브"
    assert db_session.get(models.StocktakeWorkPause, ("stock_request", request.request_id)) is not None
