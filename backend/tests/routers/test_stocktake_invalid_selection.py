"""Invalid public selections and cursor bytes fail at the HTTP boundary."""
import base64
import json
import uuid

import pytest

from app.services.item_search import get_search_config
from app.services.stocktake_common import fingerprint
from tests.routers.test_stocktakes import (
    BASE, QUANTITIES, _headers, _round, _setup, _start_count, _target, _token,
)


def test_duplicate_confirmation_selection_is_422(db_session, make_item, client):
    item, admin, staff, _ = _setup(db_session, make_item)
    admin_token, staff_token = _token(client, admin), _token(client, staff)
    round_ = _round(client, admin_token)
    count = _start_count(client, staff_token, round_,
                         _target(client, staff_token, round_["round_id"], item.item_id))
    saved = client.patch(f"{BASE}/counts/{count['count_id']}", headers=_headers(staff_token), json={
        "expected_version": count["version"], "fence": count["fence"], "quantities": QUANTITIES})
    assert saved.status_code == 200, saved.text
    confirmed = client.post(f"{BASE}/counts/{count['count_id']}/confirm",
                            headers=_headers(staff_token), json={
                                "expected_version": saved.json()["version"], "fence": saved.json()["fence"]})
    assert confirmed.status_code == 200, confirmed.text
    revision = confirmed.json()["confirmation_revision_id"]
    selected = client.post(f"{BASE}/rounds/{round_['round_id']}/application-previews",
                           headers=_headers(staff_token), json={
                               "confirmation_revision_ids": [revision, revision]})
    assert selected.status_code == 422, selected.text


@pytest.mark.parametrize("cursor", [
    "***",
    base64.urlsafe_b64encode(b"not-json").decode(),
    base64.urlsafe_b64encode(b"[]").decode(),
    base64.urlsafe_b64encode(b"null").decode(),
    "bad-uuid",
])
def test_invalid_target_cursors_are_422(db_session, make_item, client, cursor):
    _, admin, _, _ = _setup(db_session, make_item)
    token = _token(client, admin)
    round_ = _round(client, token)
    if cursor == "bad-uuid":
        context = fingerprint([round_["round_id"], round_["target_generation"], None, None, "", None, [], [], "AND", None, [], "dashboard-v2",
                               get_search_config(db_session)["version"]])
        cursor = base64.urlsafe_b64encode(json.dumps({
            "v": 2, "context": context, "last": [0, 0, 0, "", "not-a-uuid", 1, "warehouse", "not-a-uuid"]}).encode()).decode()
    response = client.get(f"{BASE}/rounds/{round_['round_id']}/targets",
                          params={"cursor": cursor}, headers={"X-Operator-Session": token})
    assert response.status_code == 422, response.text
    assert response.json()["detail"]["code"] == "VALIDATION_ERROR"


def test_another_employee_cannot_retrieve_success_receipt(db_session, make_item, client):
    _, admin, staff, _ = _setup(db_session, make_item)
    admin_token, staff_token = _token(client, admin), _token(client, staff)
    key = str(uuid.uuid4())
    preview = client.post(f"{BASE}/round-start-previews", headers=_headers(admin_token, admin=True, key=key),
                          json={"title": "Private receipt"})
    assert preview.status_code == 200, preview.text
    own = client.get(f"{BASE}/commands/{key}", params={"kind": "round_start_preview"},
                     headers={"X-Operator-Session": admin_token})
    assert own.status_code == 200 and own.json() == preview.json()
    other = client.get(f"{BASE}/commands/{key}", params={"kind": "round_start_preview"},
                       headers={"X-Operator-Session": staff_token})
    assert other.status_code == 404
    assert other.json()["detail"]["code"] == "NOT_FOUND"
