"""Public census summaries expose only the committed closing snapshot."""
import uuid
from collections.abc import Callable
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import models
from tests.routers.test_stocktakes import BASE, _headers, _round, _setup, _token


def _close(client: TestClient, token: str, round_id: str) -> dict:
    """Create real sealed evidence in the isolated test database."""
    url = f"{BASE}/rounds/{round_id}"
    preview = client.post(url + "/close-previews", headers=_headers(token), json={
        "mode": "PARTIAL", "reason": "Summary test", "confirmation_revision_ids": []})
    assert preview.status_code == 200, preview.text
    result = client.post(url + "/close", headers=_headers(token), json={
        key: preview.json()[key] for key in ("preview_id", "preview_hash")})
    assert result.status_code == 200, result.text
    return result.json()


def test_summary_requires_session_and_distinguishes_no_history(
    db_session: Session, make_item: Callable, client: TestClient,
) -> None:
    """An empty response is a successful authenticated read, not a 404 UUID parse."""
    _, manager, worker, _ = _setup(db_session, make_item)
    endpoint = f"{BASE}/rounds/latest-summary"
    assert client.get(endpoint).status_code == 401
    for employee in (manager, worker):
        response = client.get(endpoint, headers=_headers(_token(client, employee)))
        assert response.status_code == 200, response.text
        assert response.json() == {"summary": None}
    _round(client, _token(client, manager))
    assert client.get(endpoint, headers=_headers(_token(client, worker))).json() == {"summary": None}


@pytest.mark.parametrize("status", ["CLOSED_FULL", "CLOSED_PARTIAL"])
def test_summary_uses_frozen_item_counts_without_disclosing_details(
    db_session: Session, make_item: Callable, client: TestClient, status: str,
) -> None:
    """Live stock changes and private evidence fields must not affect this projection."""
    item, manager, worker, _ = _setup(db_session, make_item)
    token = _token(client, manager)
    round_ = _round(client, token)
    result = _close(client, token, round_["round_id"])
    row = db_session.get(models.StocktakeRound, uuid.UUID(round_["round_id"]))
    row.status = status
    manifest = db_session.get(models.StocktakeCloseManifest, uuid.UUID(result["manifest_id"]))
    expected = {"total": 8, "confirmed": 6, "applied": 4, "unconfirmed": 2}
    manifest.header = {**manifest.header, "projected_item_summary": expected,
                       "item_summary": {"total": 999}, "reason": "Private reason"}
    item.quantity = 999
    db_session.commit()
    auth = _headers(_token(client, worker))
    response = client.get(f"{BASE}/rounds/latest-summary", headers=auth)
    assert response.status_code == 200, response.text
    assert response.json() == {"summary": {
        "round_id": round_["round_id"], "title": row.title, "status": status,
        "closed_at": row.closed_at.isoformat() + "Z", "item_summary": expected}}
    for suffix in ("", "/targets", "/progress", "/events", "/close-evidence"):
        assert client.get(f"{BASE}/rounds/{round_['round_id']}{suffix}", headers=auth).status_code == 403


def test_latest_summary_orders_by_closure_not_start_and_has_stable_ties(
    db_session: Session, make_item: Callable, client: TestClient,
) -> None:
    """A current active round must never displace the most recently closed one."""
    _, manager, worker, _ = _setup(db_session, make_item)
    token = _token(client, manager)
    closed = []
    for _ in range(2):
        round_ = _round(client, token)
        _close(client, token, round_["round_id"])
        closed.append(db_session.get(models.StocktakeRound, uuid.UUID(round_["round_id"])))
    _round(client, token)
    now = datetime.utcnow()
    closed[0].closed_at, closed[1].closed_at = now, now - timedelta(days=1)
    db_session.commit()
    auth = _headers(_token(client, worker))
    endpoint = f"{BASE}/rounds/latest-summary"
    assert client.get(endpoint, headers=auth).json()["summary"]["round_id"] == str(closed[0].round_id)
    closed[1].closed_at = now
    db_session.commit()
    expected = str(max(row.round_id for row in closed))
    assert client.get(endpoint, headers=auth).json()["summary"]["round_id"] == expected


def test_legacy_summary_missing_item_counts_is_not_reported_as_zero(
    db_session: Session, make_item: Callable, client: TestClient,
) -> None:
    """Metadata survives old evidence without fabricating a successful count."""
    _, manager, worker, _ = _setup(db_session, make_item)
    token = _token(client, manager)
    round_ = _round(client, token)
    result = _close(client, token, round_["round_id"])
    manifest = db_session.get(models.StocktakeCloseManifest, uuid.UUID(result["manifest_id"]))
    manifest.header = {key: value for key, value in manifest.header.items() if key != "projected_item_summary"}
    db_session.commit()
    response = client.get(f"{BASE}/rounds/latest-summary", headers=_headers(_token(client, worker)))
    assert response.status_code == 200, response.text
    assert response.json()["summary"]["round_id"] == round_["round_id"]
    assert response.json()["summary"]["item_summary"] is None
