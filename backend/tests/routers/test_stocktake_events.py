"""Activity pages preserve sealed identity and chronological cursor boundaries."""
from datetime import datetime
import uuid

from app import models
from tests.routers.test_stocktakes import BASE, _headers, _round, _setup, _start_count, _target, _token


def test_activity_order_filters_and_sealed_identity(db_session, make_item, client):
    item, admin, staff, _ = _setup(db_session, make_item)
    token = _token(client, staff)
    round_ = _round(client, _token(client, admin))
    target = _target(client, token, round_["round_id"], item.item_id)
    count = _start_count(client, token, round_, target)
    url = f"{BASE}/rounds/{round_['round_id']}/events"
    events = db_session.query(models.StocktakeEvent).filter_by(round_id=uuid.UUID(round_["round_id"])).all()
    for index, event in enumerate(events):
        event.created_at = datetime(2026, 10, 8, 1, index)
    ids = [uuid.UUID(int=100), uuid.UUID(int=101), uuid.UUID(int=102)]
    for event_id, kind in zip(ids, ["COUNT_CONFIRMED", "DRAFT_SAVED", "COUNT_APPLIED"]):
        db_session.add(models.StocktakeEvent(event_id=event_id, round_id=uuid.UUID(round_["round_id"]),
            count_id=uuid.UUID(count["count_id"]), kind=kind, actor_id=staff.employee_id,
            actor_name=staff.name, created_at=datetime(2026, 10, 8, 2), payload={}))
    item.item_name = "Changed current name"
    db_session.commit()
    auth = {"X-Operator-Session": token}
    params = {"order": "latest", "include_saves": False, "limit": 1}
    first = client.get(url, params=params, headers=auth)
    assert first.status_code == 200, first.text
    page = first.json()
    row = page["items"][0]
    assert row["event_id"] == str(ids[2])
    assert row["item_name"] == target["item_name"] and row["scope_name"] == "창고"
    assert row["item_code"] == target["item_code"] and row["unit"] == target["unit"]
    second = client.get(url, params={**params, "cursor": page["next_cursor"]}, headers=auth).json()
    assert second["items"][0]["event_id"] == str(ids[0])
    mismatch = client.get(url, params={**params, "include_saves": True, "cursor": page["next_cursor"]}, headers=auth)
    assert mismatch.status_code == 409
    all_rows = client.get(url, params={"order": "latest"}, headers=auth).json()["items"]
    assert all_rows[1]["kind"] == "DRAFT_SAVED"
    legacy = client.get(url, params={"limit": 1}, headers=auth).json()
    legacy_next = client.get(url, params={"limit": 1, "cursor": legacy["next_cursor"]}, headers=auth)
    assert legacy_next.status_code == 200 and legacy_next.json()["items"][0]["event_id"] != legacy["items"][0]["event_id"]
    malformed = client.get(url, params={**params, "cursor": "invalid"}, headers=auth)
    assert malformed.status_code == 422
