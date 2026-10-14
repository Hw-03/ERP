"""Recovery fences decide an original command without reversing business work."""
import uuid

from app import models
from tests.routers.test_stocktakes import BASE, _headers, _round, _setup, _target, _token


def _resolve(client, token, kind, key, payload, *, admin=False):
    return client.post(f"{BASE}/commands/{key}/resolve", headers=_headers(token, admin=admin),
                       json={"kind": kind, "command_payload": payload, "reason": "Closed tab recovery"})


def test_fence_prevents_late_original_and_is_an_actor_scoped_terminal_receipt(client, db_session, make_item):
    item, admin, staff, other = _setup(db_session, make_item)
    admin_token, token, other_token = _token(client, admin), _token(client, staff), _token(client, other)
    round_ = _round(client, admin_token)
    target = _target(client, token, round_["round_id"], item.item_id)
    key = str(uuid.uuid4())
    payload = {"target_id": target["target_id"], "expected_target_version": target["target_version"], "round_epoch": round_["epoch"]}
    result = _resolve(client, token, "count_start", key, payload)
    assert result.status_code == 200, result.text
    assert result.json()["resolution"] == "NOT_APPLIED"
    assert _resolve(client, token, "count_start", key, payload).json() == result.json()
    lookup = client.get(f"{BASE}/commands/{key}?kind=count_start", headers={"X-Operator-Session": token})
    assert lookup.status_code == 409
    assert lookup.json()["detail"]["code"] == "COMMAND_NOT_APPLIED"
    assert lookup.json()["detail"]["extra"]["definitive"] is True
    assert client.get(f"{BASE}/commands/{key}?kind=count_start", headers={"X-Operator-Session": other_token}).status_code == 404
    late = client.post(f"{BASE}/targets/{target['target_id']}/counts", headers=_headers(token, key=key),
                       json={k: v for k, v in payload.items() if k != "target_id"})
    assert late.status_code == 409 and late.json()["detail"]["code"] == "COMMAND_NOT_APPLIED"
    assert db_session.query(models.StocktakeCount).count() == 0
    assert db_session.query(models.Inventory).filter_by(item_id=item.item_id).one().warehouse_qty == 10


def test_completed_command_resolution_keeps_original_result_and_receipt(client, db_session, make_item):
    _, admin, _, _ = _setup(db_session, make_item)
    token, key = _token(client, admin), str(uuid.uuid4())
    payload = {"title": "Completed preparation"}
    original = client.post(f"{BASE}/round-start-previews", headers=_headers(token, admin=True, key=key), json=payload)
    assert original.status_code == 200
    result = _resolve(client, token, "round_start_preview", key, payload, admin=True)
    assert result.status_code == 200, result.text
    assert result.json() == {"resolution": "COMPLETED", "receipt_id": original.json()["receipt_id"], "result": original.json()}
    assert client.get(f"{BASE}/commands/{key}?kind=round_start_preview", headers={"X-Operator-Session": token}).json() == original.json()
    assert db_session.query(models.StocktakeReceipt).count() == 1


def test_resolution_requires_department_role_and_canonical_payload(client, db_session, make_item):
    _, admin, staff, _ = _setup(db_session, make_item)
    token, staff_token, key = _token(client, admin), _token(client, staff), str(uuid.uuid4())
    assert _resolve(client, staff_token, "round_start_preview", key, {"title": "x"}, admin=True).status_code == 403
    assert _resolve(client, token, "unknown", key, {}, admin=True).status_code == 422
    assert _resolve(client, token, "round_start_preview", key, {"title": "x", "actor_id": str(admin.employee_id)}, admin=True).status_code == 422
    assert db_session.query(models.StocktakeReceipt).count() == 0
    assert _resolve(client, token, "round_start_preview", key, {"title": "x"}).status_code == 200
    conflict = _resolve(client, token, "round_start_preview", key, {"title": "y"}, admin=True)
    assert conflict.status_code == 409 and conflict.json()["detail"]["code"] == "IDEMPOTENCY_CONFLICT"


def test_fenced_close_preview_never_publishes_a_seal(client, db_session, make_item):
    _, admin, _, _ = _setup(db_session, make_item)
    token = _token(client, admin)
    round_ = _round(client, token)
    key = str(uuid.uuid4())
    payload = {"round_id": round_["round_id"], "mode": "PARTIAL", "reason": "Finish later", "confirmation_revision_ids": []}
    result = _resolve(client, token, "round_close_preview", key, payload, admin=True)
    assert result.status_code == 200, result.text
    late = client.post(f"{BASE}/rounds/{round_['round_id']}/close-previews", headers=_headers(token, admin=True, key=key),
                       json={k: v for k, v in payload.items() if k != "round_id"})
    assert late.status_code == 409 and late.json()["detail"]["code"] == "COMMAND_NOT_APPLIED"
    assert db_session.query(models.StocktakeCloseSeal).count() == 0
