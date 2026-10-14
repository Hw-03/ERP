"""Stocktake HTTP contract using only the isolated TestClient database."""
import uuid

import pytest

from app import models


BASE = "/api/stocktakes"
QUANTITIES = {"normal": 10, "defect": 0, "b_grade": 0, "obsolete": 0}


def _setup(db_session, make_item, *, extra_items=0):
    item = make_item(name="Counted item", warehouse_qty=10)
    for index in range(extra_items):
        make_item(name=f"Counted item {index}", warehouse_qty=0)
    admin = models.Employee(employee_code="COUNT-HTTP-ADMIN", name="Admin counter",
                            role="admin", department_role="primary")
    staff = models.Employee(employee_code="COUNT-HTTP-STAFF", name="Staff counter",
                            role="staff",)
    other = models.Employee(employee_code="COUNT-HTTP-OTHER", name="Other counter",
                            role="staff",)
    db_session.add_all([admin, staff, other, models.StocktakeControl(id=1, inventory_mode="POOL"),
                        models.InventoryScope(scope_key="warehouse", physical_department="창고"),
                        models.InventoryScope(scope_key="tube", physical_department="튜브"),
                        models.SystemSetting(setting_key="inventory_operation_cutover_at",
                                             setting_value="2000-01-01T00:00:00")])
    db_session.commit()
    return item, admin, staff, other


def _token(client, actor):
    response = client.post("/api/operator-sessions", json={
        "employee_id": str(actor.employee_id), "pin": "0000", "tab_id": str(uuid.uuid4())})
    assert response.status_code == 201, response.text
    return response.json()["token"]


def _headers(token, *, admin=False, key=None):
    headers = {"X-Operator-Session": token, "Idempotency-Key": key or str(uuid.uuid4())}
    if admin:
        headers["X-Admin-Pin"] = "0000"
    return headers


def _round(client, admin_token):
    preview = client.post(f"{BASE}/round-start-previews", json={"title": "API census"},
                          headers=_headers(admin_token, admin=True))
    assert preview.status_code == 200, preview.text
    result = client.post(f"{BASE}/rounds", headers=_headers(admin_token, admin=True), json={
        "preview_id": preview.json()["preview_id"], "preview_hash": preview.json()["preview_hash"]})
    assert result.status_code == 200, result.text
    return result.json()


def _target(client, token, round_id, item_id):
    response = client.get(f"{BASE}/rounds/{round_id}/targets",
                          params={"scope_id": "warehouse"}, headers={"X-Operator-Session": token})
    assert response.status_code == 200, response.text
    return next(row for row in response.json()["items"] if row["item_id"] == str(item_id))


def _start_count(client, token, round_, target):
    response = client.post(f"{BASE}/targets/{target['target_id']}/counts",
                           headers=_headers(token), json={
                               "expected_target_version": target["target_version"],
                               "round_epoch": round_["epoch"]})
    assert response.status_code == 200, response.text
    return response.json()


def test_target_departments_accept_repeated_values_and_reject_warehouse(db_session, make_item, client):
    _, admin, _, _ = _setup(db_session, make_item, extra_items=2)
    token = _token(client, admin)
    round_ = _round(client, token)
    endpoint = f"{BASE}/rounds/{round_['round_id']}/targets"
    headers = {"X-Operator-Session": token}
    response = client.get(endpoint, params=[("departments", "튜브"), ("departments", "고압"), ("group_by_item", "true")], headers=headers)
    assert response.status_code == 200, response.text
    assert len(response.json()["items"]) == 3
    assert client.get(endpoint, params={"departments": "창고"}, headers=headers).status_code == 422
    assert client.get(endpoint, params={"scope_kind": "warehouse"}, headers=headers).status_code == 200


def test_stocktake_reads_and_writes_require_operator_token(db_session, make_item, client):
    _setup(db_session, make_item)
    assert client.get(f"{BASE}/rounds").status_code == 401
    assert client.post(f"{BASE}/round-start-previews", json={"title": "Forbidden"},
                       headers={"Idempotency-Key": str(uuid.uuid4()), "X-Admin-Pin": "0000"}).status_code == 401
    assert db_session.query(models.StocktakeRound).count() == 0


def test_round_route_requires_department_approval_and_all_commands_need_key(db_session, make_item, client):
    _, admin, staff, _ = _setup(db_session, make_item)
    admin_token, staff_token = _token(client, admin), _token(client, staff)
    endpoint = f"{BASE}/round-start-previews"
    no_key = client.post(endpoint, json={"title": "No key"},
                         headers={"X-Operator-Session": admin_token, "X-Admin-Pin": "0000"})
    assert no_key.status_code == 422
    no_pin = client.post(endpoint, json={"title": "No pin"}, headers=_headers(admin_token))
    assert no_pin.status_code == 200
    wrong_pin = client.post(endpoint, json={"title": "Wrong pin"}, headers={
        **_headers(admin_token), "X-Admin-Pin": "9999"})
    assert wrong_pin.status_code == 200
    staff_attempt = client.post(endpoint, json={"title": "Staff"}, headers=_headers(staff_token, admin=True))
    assert staff_attempt.status_code == 403
    assert db_session.query(models.StocktakeRound).count() == 0


def test_route_rejects_body_identity_and_strict_quantities(db_session, make_item, client):
    item, admin, staff, _ = _setup(db_session, make_item)
    admin_token, staff_token = _token(client, admin), _token(client, staff)
    round_ = _round(client, admin_token)
    target = _target(client, staff_token, round_["round_id"], item.item_id)
    body_id = client.post(f"{BASE}/targets/{target['target_id']}/counts", headers=_headers(staff_token), json={
        "expected_target_version": target["target_version"], "round_epoch": round_["epoch"],
        "employee_id": str(admin.employee_id)})
    assert body_id.status_code == 422
    count = _start_count(client, staff_token, round_, target)
    assert count["owner_id"] == str(staff.employee_id)
    body = {"expected_version": count["version"], "fence": count["fence"]}
    for quantities in ({**QUANTITIES, "normal": True},
                       {**QUANTITIES, "normal": 2147483647, "defect": 1},
                       {**QUANTITIES, "unexpected": 0}):
        rejected = client.patch(f"{BASE}/counts/{count['count_id']}", headers=_headers(staff_token),
                                json={**body, "quantities": quantities})
        assert rejected.status_code == 422, rejected.text
    assert db_session.get(models.StocktakeCount, uuid.UUID(count["count_id"])).version == count["version"]


def test_staff_can_count_but_another_employee_cannot_save(db_session, make_item, client):
    item, admin, staff, other = _setup(db_session, make_item)
    admin_token, staff_token, other_token = _token(client, admin), _token(client, staff), _token(client, other)
    round_ = _round(client, admin_token)
    count = _start_count(client, staff_token, round_,
                         _target(client, staff_token, round_["round_id"], item.item_id))
    save = client.patch(f"{BASE}/counts/{count['count_id']}", headers=_headers(other_token), json={
        "expected_version": count["version"], "fence": count["fence"], "quantities": QUANTITIES})
    assert save.status_code == 403
    assert save.json()["detail"]["code"] == "NOT_COUNT_OWNER"
    assert db_session.get(models.StocktakeCount, uuid.UUID(count["count_id"])).version == count["version"]


@pytest.mark.parametrize("bulk", [False, True])
def test_end_to_end_count_apply_replay_and_actor_scoped_receipt(db_session, make_item, client, bulk):
    item, admin, staff, other = _setup(db_session, make_item)
    admin_token, staff_token, other_token = _token(client, admin), _token(client, staff), _token(client, other)
    round_ = _round(client, admin_token)
    target = _target(client, staff_token, round_["round_id"], item.item_id)
    count = _start_count(client, staff_token, round_, target)
    save = client.patch(f"{BASE}/counts/{count['count_id']}", headers=_headers(staff_token),
                        json={"expected_version": count["version"], "fence": count["fence"],
                              "quantities": QUANTITIES})
    assert save.status_code == 200, save.text
    saved = save.json()
    confirm = client.post(f"{BASE}/counts/{count['count_id']}/confirm", headers=_headers(staff_token),
                          json={"expected_version": saved["version"], "fence": saved["fence"]})
    assert confirm.status_code == 200, confirm.text
    confirmed = confirm.json()
    rid = round_["round_id"]
    kind = "application_bulk_apply" if bulk else "application_apply"
    preview_route = "application-bulk-previews" if bulk else "application-previews"
    apply_route = "bulk-applications" if bulk else "applications"
    waiting_url = f"{BASE}/rounds/{rid}/waiting-targets"
    own = client.get(waiting_url, headers={"X-Operator-Session": staff_token}).json()
    assert own["total_items"] == 1 and len(own["items"]) == 1
    assert client.get(waiting_url, headers={"X-Operator-Session": other_token}).json()["items"] == []
    assert client.get(waiting_url, headers={"X-Operator-Session": admin_token}).json()["items"] == []
    selected = client.get(f"{BASE}/rounds/{rid}/waiting-selection", headers={"X-Operator-Session": staff_token}).json()
    assert selected["total_items"] == 1 and selected["items"][0]["confirmation_revision_id"] == confirmed["confirmation_revision_id"]
    assert client.get(f"{BASE}/rounds/{rid}/progress", headers={"X-Operator-Session": staff_token}).json()["my_waiting"] == {"items": 1, "locations": 1}
    assert client.get(waiting_url, params={"departments": "창고"}, headers={"X-Operator-Session": staff_token}).status_code == 422
    denied = client.post(f"{BASE}/rounds/{rid}/{preview_route}", headers=_headers(other_token),
                         json={"confirmation_revision_ids": [confirmed["confirmation_revision_id"]]})
    assert denied.status_code == 403
    preview = client.post(f"{BASE}/rounds/{rid}/{preview_route}",
                          headers=_headers(staff_token), json={
                              "confirmation_revision_ids": [confirmed["confirmation_revision_id"]]})
    assert preview.status_code == 200, preview.text
    assert preview.json()["can_apply"] is True
    key = str(uuid.uuid4())
    payload = {"preview_id": preview.json()["preview_id"], "preview_hash": preview.json()["preview_hash"]}
    apply_url = f"{BASE}/rounds/{rid}/{apply_route}"
    assert client.post(apply_url, headers=_headers(other_token), json=payload).status_code == 403
    applied = client.post(apply_url, headers=_headers(staff_token, key=key), json=payload)
    assert applied.status_code == 200, applied.text
    assert client.post(apply_url, headers=_headers(staff_token, key=key), json=payload).json() == applied.json()
    lookup = client.get(f"{BASE}/commands/{key}", params={"kind": kind},
                        headers={"X-Operator-Session": staff_token})
    assert lookup.status_code == 200 and lookup.json() == applied.json()
    assert client.get(f"{BASE}/commands/{key}", params={"kind": kind},
                      headers={"X-Operator-Session": other_token}).status_code == 404
    assert client.get(f"{BASE}/commands/{key}", headers={"X-Operator-Session": staff_token}).status_code == 422
    assert client.get(f"{BASE}/commands/{key}", params={"kind": "count_save"},
                      headers={"X-Operator-Session": staff_token}).status_code == 404
    assert client.get(f"{BASE}/counts/{count['count_id']}",
                      headers={"X-Operator-Session": staff_token}).json()["status"] == "APPLIED"
    assert db_session.query(models.Inventory).filter_by(item_id=item.item_id).one().warehouse_qty == 10
    assert db_session.query(models.StocktakeApplication).count() == 1


def test_target_cursor_default_limit_cap_filter_and_generation(db_session, make_item, client):
    _, admin, _, _ = _setup(db_session, make_item, extra_items=51)
    token = _token(client, admin)
    round_ = _round(client, token)
    url = f"{BASE}/rounds/{round_['round_id']}/targets"
    first = client.get(url, headers={"X-Operator-Session": token})
    assert first.status_code == 200, first.text
    assert len(first.json()["items"]) == 50 and first.json()["next_cursor"]
    all_rows = client.get(url, params={"limit": 200}, headers={"X-Operator-Session": token})
    assert all_rows.status_code == 200 and len(all_rows.json()["items"]) == 104
    assert client.get(url, params={"limit": 201}, headers={"X-Operator-Session": token}).status_code == 422
    filtered = client.get(url, params={"cursor": first.json()["next_cursor"], "search": "Counted item"},
                          headers={"X-Operator-Session": token})
    assert filtered.status_code == 409
    assert filtered.json()["detail"]["code"] == "TARGET_CURSOR_STALE"
    make_item(name="Later item", warehouse_qty=0)
    db_session.commit()
    append_preview = client.post(f"{BASE}/rounds/{round_['round_id']}/target-append-previews",
                                 headers=_headers(token, admin=True))
    assert append_preview.status_code == 200, append_preview.text
    appended = client.post(f"{BASE}/rounds/{round_['round_id']}/target-appends",
                           headers=_headers(token, admin=True), json={
                               "preview_id": append_preview.json()["preview_id"],
                               "preview_hash": append_preview.json()["preview_hash"]})
    assert appended.status_code == 200, appended.text
    assert appended.json()["target_generation"] > round_["target_generation"]
    stale = client.get(url, params={"cursor": first.json()["next_cursor"]},
                       headers={"X-Operator-Session": token})
    assert stale.status_code == 409
    assert stale.json()["detail"]["code"] == "TARGET_CURSOR_STALE"
