"""Close HTTP contracts preserve authenticated history and frozen report pages."""
import uuid

from app import models
from tests.routers.test_stocktakes import BASE, _headers, _round, _setup, _start_count, _target, _token


def test_partial_close_history_pagination_and_frozen_kpi(db_session, make_item, client):
    item, admin, staff, _ = _setup(db_session, make_item, extra_items=104)
    admin_token, staff_token = _token(client, admin), _token(client, staff)
    round_ = _round(client, admin_token)
    targets = client.get(f"{BASE}/rounds/{round_['round_id']}/targets", params={"limit": 200},
                         headers={"X-Operator-Session": staff_token}).json()["items"]
    target = next(row for row in targets if row["item_id"] == str(item.item_id))
    count = _start_count(client, staff_token, round_, target)
    url = f"{BASE}/rounds/{round_['round_id']}"
    worker_items = [{"owner_id": str(staff.employee_id), "owner_name": staff.name,
                     "surveyed": 1, "confirmed": 0, "applied": 0,
                     "quantities_by_unit": [{"unit": "EA", "surveyed": 0, "confirmed": 0, "applied": 0}]}]
    assert client.get(url + "/progress", headers=_headers(staff_token)).json()["worker_items"] == worker_items
    body = {"mode": "PARTIAL", "reason": "Shift finished", "confirmation_revision_ids": []}
    assert client.post(url + "/close-previews", json=body, headers=_headers(staff_token, admin=True)).status_code == 403
    proposed = client.post(url + "/close-previews", json=body, headers=_headers(admin_token, admin=True))
    assert proposed.status_code == 200, proposed.text
    proposal = proposed.json()
    auth = {"X-Operator-Session": admin_token}
    evidence_url = f"{BASE}/close-previews/{proposal['preview_id']}/entries"
    first = client.get(evidence_url, headers=auth).json()
    second = client.get(evidence_url, params={"offset": first["next_offset"]}, headers=auth).json()
    third = client.get(evidence_url, params={"offset": second["next_offset"]}, headers=auth).json()
    assert len(first["items"]) == len(second["items"]) == 100 and len(third["items"]) == 10 and third["next_offset"] is None
    assert len({row["target_id"] for row in first["items"] + second["items"] + third["items"]}) == 210
    close_body = {key: proposal[key] for key in ("preview_id", "preview_hash")}
    assert client.post(url + "/close", json=close_body, headers=_headers(staff_token)).status_code == 403
    key = str(uuid.uuid4())
    closed = client.post(url + "/close", json=close_body, headers=_headers(admin_token, key=key))
    assert closed.status_code == 200, closed.text
    assert client.post(url + "/close", json=close_body, headers=_headers(admin_token, admin=True, key=key)).json() == closed.json()
    report = client.get(url + "/progress", headers=auth).json()
    assert report["worker_items"] == worker_items
    assert report["summary"]["total"] == 210 and report["summary"]["unconfirmed"] == 210
    assert client.get(url + "/close-evidence", headers=auth).json()["reason"] == "Shift finished"
    events = client.get(url + "/events", headers=auth).json()["items"]
    close_event = next(row for row in events if row["kind"] == "ROUND_CLOSED")
    assert close_event["actor_id"] == str(admin.employee_id)
    assert close_event["payload"]["invalidated_epoch"] == round_["epoch"]
    assert client.get(f"{BASE}/counts/{count['count_id']}", headers=auth).json()["status"] == "CLOSED_UNAPPLIED"
    inventory = db_session.query(models.Inventory).filter_by(item_id=item.item_id).one()
    inventory.quantity = inventory.warehouse_qty = 8
    db_session.commit()
    assert client.get(url + "/progress", headers=auth).json() == report


def test_closed_progress_projects_selected_quantities_from_sealed_manifest(db_session, make_item, client):
    item, admin, staff, _ = _setup(db_session, make_item)
    admin_token, staff_token = _token(client, admin), _token(client, staff)
    round_ = _round(client, admin_token)
    target = _target(client, staff_token, round_["round_id"], item.item_id)
    count = _start_count(client, staff_token, round_, target)
    quantities = {"normal": 10, "defect": 0, "b_grade": 0, "obsolete": 0}
    saved_response = client.patch(f"{BASE}/counts/{count['count_id']}", headers=_headers(staff_token),
        json={"expected_version": count["version"], "fence": count["fence"], "quantities": quantities})
    assert saved_response.status_code == 200, saved_response.text
    saved = saved_response.json()
    confirmed_response = client.post(f"{BASE}/counts/{count['count_id']}/confirm", headers=_headers(staff_token),
        json={"expected_version": saved["version"], "fence": saved["fence"]})
    assert confirmed_response.status_code == 200, confirmed_response.text
    confirmed = confirmed_response.json()
    url = f"{BASE}/rounds/{round_['round_id']}"
    auth = _headers(staff_token)
    live = client.get(url + "/progress", headers=auth).json()["worker_items"]
    assert live == [{"owner_id": str(staff.employee_id), "owner_name": staff.name,
        "surveyed": 1, "confirmed": 1, "applied": 0,
        "quantities_by_unit": [{"unit": "EA", "surveyed": 10, "confirmed": 10, "applied": 0}]}]
    preview_response = client.post(url + "/close-previews", headers=_headers(admin_token), json={
        "mode": "PARTIAL", "reason": "Shift finished",
        "confirmation_revision_ids": [confirmed["confirmation_revision_id"]]})
    assert preview_response.status_code == 200, preview_response.text
    preview = preview_response.json()
    closed = client.post(url + "/close", headers=_headers(admin_token), json={
        "preview_id": preview["preview_id"], "preview_hash": preview["preview_hash"]})
    assert closed.status_code == 200, closed.text
    auth = _headers(admin_token)
    report_response = client.get(url + "/progress", headers=auth)
    assert report_response.status_code == 200, report_response.text
    report = report_response.json()
    assert report["worker_items"] == [{"owner_id": str(staff.employee_id), "owner_name": staff.name,
        "surveyed": 1, "confirmed": 1, "applied": 1,
        "quantities_by_unit": [{"unit": "EA", "surveyed": 10, "confirmed": 10, "applied": 10}]}]
    inventory = db_session.query(models.Inventory).filter_by(item_id=item.item_id).one()
    inventory.quantity = inventory.warehouse_qty = 99
    db_session.commit()
    assert client.get(url + "/progress", headers=auth).json() == report
