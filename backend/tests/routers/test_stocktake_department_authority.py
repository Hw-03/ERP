"""Round management follows department approval roles, not admin or warehouse roles."""
import uuid

import pytest

from app import models
from tests.routers.test_stocktakes import BASE, _headers, _round, _setup, _token


@pytest.mark.parametrize("role", ["primary", "deputy"])
def test_department_approver_can_start_without_admin_pin(db_session, make_item, client, role):
    _, _, staff, _ = _setup(db_session, make_item)
    staff.department_role = role
    db_session.commit()
    token = _token(client, staff)
    preview = client.post(f"{BASE}/round-start-previews", json={"title": "Department census"}, headers=_headers(token))
    assert preview.status_code == 200, preview.text
    result = client.post(f"{BASE}/rounds", json={key: preview.json()[key] for key in ("preview_id", "preview_hash")}, headers=_headers(token))
    assert result.status_code == 200, result.text


@pytest.mark.parametrize("role", ["primary", "deputy"])
def test_department_approver_manages_append_close_and_recovery_without_pin(db_session, make_item, client, role):
    _, _, staff, _ = _setup(db_session, make_item)
    staff.department_role = role
    db_session.commit()
    token = _token(client, staff)
    row = _round(client, token)
    make_item(name="New census target", warehouse_qty=0)
    db_session.commit()
    url = f"{BASE}/rounds/{row['round_id']}"
    auth = _headers(token)
    preview = client.post(url + "/target-append-previews", headers=auth)
    assert preview.status_code == 200, preview.text
    seal = {key: preview.json()[key] for key in ("preview_id", "preview_hash")}
    appended = client.post(url + "/target-appends", json=seal, headers=_headers(token))
    assert appended.status_code == 200, appended.text
    body = {"mode": "PARTIAL", "reason": "Finish later", "confirmation_revision_ids": []}
    preview = client.post(url + "/close-previews", json=body, headers=_headers(token))
    assert preview.status_code == 200, preview.text
    seal = {key: preview.json()[key] for key in ("preview_id", "preview_hash")}
    key = str(uuid.uuid4())
    closed = client.post(url + "/close", json=seal, headers=_headers(token, key=key))
    assert closed.status_code == 200, closed.text
    assert client.get(url + "/close-evidence", headers=auth).status_code == 200
    assert client.get(f"{BASE}/rounds", headers=auth).status_code == 200
    resolved = client.post(f"{BASE}/commands/{key}/resolve", json={"kind": "round_close", "command_payload": {"round_id": row["round_id"], **seal}, "reason": "Receipt recovery"}, headers=auth)
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["resolution"] == "COMPLETED"
    assert client.post(f"{BASE}/counts/{uuid.uuid4()}/force-release", json={"expected_version": 1, "fence": 1, "reason_code": "OPERATOR_REQUEST", "reason": "test"}, headers=_headers(token, admin=True)).status_code == 404


@pytest.mark.parametrize("warehouse_role", ["none", "primary", "deputy"])
def test_other_roles_cannot_manage_or_list_round_history(db_session, make_item, client, warehouse_role):
    _, _, staff, _ = _setup(db_session, make_item)
    staff.department_role, staff.warehouse_role = "none", warehouse_role
    db_session.commit()
    token = _token(client, staff)
    auth = _headers(token, admin=True)
    assert client.post(f"{BASE}/round-start-previews", json={"title": "Forbidden"}, headers=auth).status_code == 403
    assert client.get(f"{BASE}/rounds", headers=auth).status_code == 403
    assert client.get(f"{BASE}/rounds?active_only=true", headers=auth).json() == {"items": []}
    for path, body in [("target-append-previews", None), ("close-previews", {"mode": "PARTIAL", "reason": "test", "confirmation_revision_ids": []})]:
        assert client.post(f"{BASE}/rounds/{uuid.uuid4()}/{path}", json=body, headers=auth).status_code == 403
    assert db_session.query(models.StocktakeReceipt).count() == 0


def test_revoked_department_role_blocks_replay_and_resolution(db_session, make_item, client):
    _, admin, _, _ = _setup(db_session, make_item)
    admin.department_role = "primary"
    db_session.commit()
    token = _token(client, admin)
    key = str(uuid.uuid4())
    body = {"title": "Original request"}
    assert client.post(f"{BASE}/round-start-previews", json=body, headers=_headers(token, admin=True, key=key)).status_code == 200
    admin.department_role = "none"
    db_session.commit()
    assert client.post(f"{BASE}/round-start-previews", json=body, headers=_headers(token, admin=True, key=key)).status_code == 403
    assert client.post(f"{BASE}/commands/{key}/resolve", json={"kind": "round_start_preview", "command_payload": body, "reason": "recovery"}, headers=_headers(token, admin=True)).status_code == 403


def test_worker_can_read_active_progress_but_not_closed_history(db_session, make_item, client):
    _, admin, staff, _ = _setup(db_session, make_item)
    admin.department_role = "primary"
    db_session.commit()
    manager_token, worker_token = _token(client, admin), _token(client, staff)
    row = _round(client, manager_token)
    auth = _headers(worker_token)
    assert len(client.get(f"{BASE}/rounds?active_only=true", headers=auth).json()["items"]) == 1
    for path in ("", "/progress", "/events", "/targets"):
        assert client.get(f"{BASE}/rounds/{row['round_id']}{path}", headers=auth).status_code == 200
    round_row = db_session.get(models.StocktakeRound, uuid.UUID(row["round_id"]))
    round_row.status = "CLOSED_PARTIAL"
    db_session.commit()
    assert client.get(f"{BASE}/rounds?active_only=true", headers=auth).json() == {"items": []}
    for path in ("", "/progress", "/events", "/targets", "/waiting-targets", "/waiting-selection", "/close-evidence"):
        assert client.get(f"{BASE}/rounds/{row['round_id']}{path}", headers=auth).status_code == 403
    assert client.get(f"{BASE}/close-previews/{uuid.uuid4()}/entries", headers=auth).status_code == 403
