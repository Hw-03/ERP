import pytest
from app.models import AdminAuditLog, Employee
from app.services.operator_session import issue_session


@pytest.fixture
def operator(db_session):
    actor = Employee(employee_code="search-staff", name="Staff", role="staff")
    db_session.add(actor)
    db_session.flush()
    token, _ = issue_session(db_session, employee=actor, tab_id="search")
    return {"X-Operator-Session": token}


def test_config_read_and_staff_alias_idempotency(client, make_item, operator, db_session):
    item = make_item()
    empty = client.get("/api/item-search/config")
    assert empty.status_code == 200
    assert empty.json()["synonym_groups"] == []
    assert client.post(f"/api/item-search/items/{item.item_id}/aliases", json={"alias": "Battery"}).status_code == 401
    path = f"/api/item-search/items/{item.item_id}/aliases"
    first = client.post(path, json={"alias": "Battery"}, headers=operator)
    assert first.status_code == 200
    assert client.post(path, json={"alias": "BAT-TERY"}, headers=operator).json() == first.json()
    assert client.get("/api/item-search/config").json()["version"] != empty.json()["version"]
    logs = db_session.query(AdminAuditLog).filter_by(target_type="item_alias").all()
    assert len(logs) == 1
    assert logs[0].actor_pin_role == "operator" and logs[0].actor_employee_code == "search-staff"
    other = make_item()
    wrong = f"/api/item-search/items/{other.item_id}/aliases/{first.json()['alias_id']}"
    assert client.delete(wrong, headers=operator).status_code == 404
    delete = path + "/" + first.json()["alias_id"]
    assert client.delete(delete, headers=operator).status_code == 204
    assert client.delete(delete, headers=operator).status_code == 204


def test_synonym_validation_and_optimistic_version(client, operator):
    path = "/api/item-search/synonym-groups"
    assert client.post(path, json={"terms": ["---", "Battery"]}, headers=operator).status_code == 422
    group = client.post(path, json={"terms": ["Battery", "Power"]}, headers=operator)
    assert group.status_code == 200
    group = group.json()
    assert client.post(path, json={"terms": ["Bat-tery", "Other"]}, headers=operator).status_code == 409
    endpoint = path + "/" + group["group_id"]
    assert client.put(endpoint, json={"terms": ["Battery", "Cell"], "expected_version": 1}, headers=operator).json()["version"] == 2
    assert client.put(endpoint, json={"terms": ["Battery", "Bad"], "expected_version": 1}, headers=operator).status_code == 409
    assert client.delete(endpoint + "?expected_version=1", headers=operator).status_code == 409
    assert client.delete(endpoint + "?expected_version=2", headers=operator).status_code == 204


def test_same_group_normalized_duplicates_keep_first_spelling(client, operator):
    response = client.post("/api/item-search/synonym-groups", json={"terms": ["B/D", "BD", "Board"]}, headers=operator)
    assert response.status_code == 200
    assert response.json()["terms"] == ["B/D", "Board"]
    assert client.post("/api/item-search/synonym-groups", json={"terms": ["B / D", "BD"]}, headers=operator).status_code == 422


def test_deleted_synonym_group_audit_preserves_deleted_terms(client, operator, db_session):
    group = client.post("/api/item-search/synonym-groups", json={"terms": ["Battery", "Cell"]}, headers=operator).json()
    response = client.delete(f"/api/item-search/synonym-groups/{group['group_id']}?expected_version=1", headers=operator)
    assert response.status_code == 204
    log = db_session.query(AdminAuditLog).filter_by(action="item_search.group_remove").one()
    assert log.payload_summary == "Battery, Cell"
    assert log.actor_employee_code == "search-staff" and log.actor_pin_role == "operator"
    assert client.get("/api/item-search/config").json()["synonym_groups"] == []


def test_item_list_uses_synonyms_and_correlated_aliases(client, make_item, operator):
    wanted = make_item(name="Battery Module")
    other = make_item(name="Different")
    assert client.post("/api/item-search/synonym-groups", json={"terms": ["Battery", "Cell"]}, headers=operator).status_code == 200
    for alias in ["Power Cell", "Cell Unit"]:
        assert client.post(f"/api/item-search/items/{wanted.item_id}/aliases", json={"alias": alias}, headers=operator).status_code == 200
    results = client.get("/api/items", params={"search": "Cell"})
    assert results.status_code == 200
    assert [item["item_id"] for item in results.json()] == [str(wanted.item_id)]
    assert str(other.item_id) not in str(results.json())


def test_history_cursor_binds_search_config(client, operator):
    from app.routers.inventory.transactions import _display_group_cursor
    from app.schemas import TransactionDisplayGroupResponse
    group = TransactionDisplayGroupResponse(type="operation", key="00000000-0000-0000-0000-000000000001",
        logs=[], stocktake={"created_at": "2026-10-14T00:00:00Z"})
    version = client.get("/api/item-search/config").json()["version"]
    cursor = _display_group_cursor(group, search_version=version)
    assert client.post("/api/item-search/synonym-groups", json={"terms": ["Battery", "Cell"]}, headers=operator).status_code == 200
    response = client.get("/api/inventory/transactions/display-groups", params={"cursor": cursor})
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "SEARCH_CONFIG_STALE"
