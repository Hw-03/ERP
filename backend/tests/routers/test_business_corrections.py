"""Administrative correction review binds operator identity and requires a fresh PIN."""
from tests.routers.test_stocktakes import _headers, _token
from tests.services.test_business_corrections import shipping_source

BASE = "/api/inventory/business-corrections"


def test_correction_http_review_approval_and_receipt(client, db_session, make_item):
    env, _, _, source, _ = shipping_source(db_session, make_item)
    token = _token(client, env[1])
    payload = {"source_type": "InventoryOperation", "source_id": str(source.operation_id),
               "target_status": "CANCELLED", "reason": "Wrong status", "evidence": "Checked dispatch document"}
    created = client.post(BASE, json=payload, headers=_headers(token))
    assert created.status_code == 200, created.text
    correction = created.json()
    detail = client.get(f"{BASE}/{correction['correction_id']}", headers={"X-Operator-Session": token})
    assert detail.status_code == 200 and detail.json()["scope_hash"] == correction["scope_hash"]
    review = f"{BASE}/{correction['correction_id']}/previews"
    assert client.post(review, json={"expected_version": 1}, headers=_headers(token)).status_code == 422
    preview = client.post(review, json={"expected_version": 1}, headers=_headers(token, admin=True))
    assert preview.status_code == 200, preview.text
    headers = _headers(token, admin=True)
    body = {"expected_version": 1, "preview_id": preview.json()["preview_id"], "preview_hash": preview.json()["preview_hash"]}
    approved = client.post(f"{BASE}/{correction['correction_id']}/approve", json=body, headers=headers)
    assert approved.status_code == 200 and approved.json()["status"] == "APPLIED", approved.text
    duplicate = client.post(f"{BASE}/{correction['correction_id']}/approve", json=body, headers=headers)
    assert duplicate.json() == approved.json()
    events = client.get(f"{BASE}/{correction['correction_id']}/events", headers={"X-Operator-Session": token})
    assert [event["kind"] for event in events.json()["items"]] == ["REQUESTED", "APPLIED"]


def test_correction_http_requires_operator_and_forbids_body_actor(client, db_session, make_item):
    env, _, _, source, _ = shipping_source(db_session, make_item)
    assert client.get(BASE).status_code == 401
    token = _token(client, env[1])
    result = client.post(BASE, headers=_headers(token), json={"source_type": "InventoryOperation",
        "source_id": str(source.operation_id), "target_status": "CANCELLED", "reason": "Wrong",
        "evidence": "Checked", "actor_id": str(env[1].employee_id)})
    assert result.status_code == 422
