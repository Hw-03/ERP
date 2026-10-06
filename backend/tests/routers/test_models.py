"""제품 모델 라우터 — create_model 예약슬롯 승격 동작.

시드가 slot 1~100 을 미리 채워(예약분 포함) create_model 이 '빈 slot 번호'를 찾으려다
항상 400 이던 버그의 회귀 가드. 픽스: 가장 낮은 예약 슬롯을 승격한다.
"""

from app.models import Employee, EmployeeAssignedModel, Item, ProductSymbol
from app.utils.mes_code import refresh_symbol_cache

ADMIN_HEADERS = {"X-Admin-Pin": "0000"}


def _seed_symbols(db):
    # 배정 1종 + 예약 2종
    db.add(ProductSymbol(slot=1, symbol="3", model_name="DX3000", is_reserved=False))
    db.add(ProductSymbol(slot=2, symbol=None, model_name=None, is_reserved=True))
    db.add(ProductSymbol(slot=3, symbol=None, model_name=None, is_reserved=True))
    db.commit()


def test_create_model_promotes_lowest_reserved_slot(client, db_session):
    _seed_symbols(db_session)
    res = client.post("/api/models", headers=ADMIN_HEADERS, json={"model_name": "NEWMODEL", "symbol": "9"})
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["slot"] == 2  # 최저 예약 슬롯 승격
    assert body["symbol"] == "9"
    assert body["model_name"] == "NEWMODEL"
    row = db_session.query(ProductSymbol).filter_by(slot=2).first()
    assert not row.is_reserved


def test_create_model_duplicate_name_409(client, db_session):
    _seed_symbols(db_session)
    res = client.post("/api/models", headers=ADMIN_HEADERS, json={"model_name": "DX3000", "symbol": "Z"})
    assert res.status_code == 409, res.text


def test_create_model_duplicate_symbol_409(client, db_session):
    _seed_symbols(db_session)
    res = client.post("/api/models", headers=ADMIN_HEADERS, json={"model_name": "OTHER", "symbol": "3"})
    assert res.status_code == 409, res.text


def test_create_model_no_reserved_slot_400(client, db_session):
    db_session.add(ProductSymbol(slot=1, symbol="3", model_name="DX3000", is_reserved=False))
    db_session.commit()
    res = client.post("/api/models", headers=ADMIN_HEADERS, json={"model_name": "NEW", "symbol": "9"})
    assert res.status_code == 400, res.text


def test_create_model_without_symbol_rejects_exhausted_auto_symbols(client, db_session):
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    db_session.add_all([
        ProductSymbol(slot=index, symbol=symbol, model_name=f"MODEL-{index}", is_reserved=False)
        for index, symbol in enumerate(alphabet, start=1)
    ])
    db_session.add(ProductSymbol(slot=len(alphabet) + 1, symbol=None, model_name=None, is_reserved=True))
    db_session.add(Item(item_name="기존 연결", process_type_code="HR", model_symbol="A", serial_no=1))
    db_session.commit()

    response = client.post("/api/models", headers=ADMIN_HEADERS, json={"model_name": "NO-SYMBOL"})
    assert response.status_code == 400, response.text
    assert db_session.query(ProductSymbol).filter_by(slot=len(alphabet) + 1).one().symbol is None


def test_model_symbol_change_cannot_reinterpret_existing_item(client, db_session):
    db_session.add_all([
        ProductSymbol(slot=1, symbol="A", model_name="A", is_reserved=False),
        ProductSymbol(slot=2, symbol="B", model_name="B", is_reserved=False),
        ProductSymbol(slot=3, symbol=None, model_name=None, is_reserved=True),
    ])
    db_session.commit()
    refresh_symbol_cache(db_session)
    created = client.post("/api/items", headers=ADMIN_HEADERS, json={
        "item_name": "연결 보호", "process_type_code": "HR", "model_slots": [1, 2], "initial_quantity": 0,
    })
    assert created.status_code == 201, created.text
    item_id = created.json()["item_id"]
    assert client.post("/api/models", headers=ADMIN_HEADERS, json={"model_name": "AB", "symbol": "AB"}).status_code == 409
    assert client.put("/api/models/2", headers=ADMIN_HEADERS, json={"model_name": "B", "symbol": "AB", "pin": "0000"}).status_code == 409
    assert client.get(f"/api/items/{item_id}").json()["model_slots"] == [1, 2]


def test_delete_model_cascades_employee_assignment(client, db_session):
    model = ProductSymbol(slot=1, symbol="QF1", model_name="QA", is_reserved=False)
    employee = Employee(employee_code="E999", name="QA 담당", role="직원", department="조립", is_active="true")
    db_session.add_all([model, employee])
    db_session.flush()
    db_session.add(EmployeeAssignedModel(employee_id=employee.employee_id, slot=1, priority=0))
    db_session.commit()
    before = client.get("/api/employees")
    assert before.status_code == 200
    assert before.json()[0]["assigned_model_slots"] == [1]
    deleted = client.request("DELETE", "/api/models/1", headers=ADMIN_HEADERS, json={"pin": "0000"})
    assert deleted.status_code == 204, deleted.text
    after = client.get("/api/employees")
    assert after.status_code == 200
    assert after.json()[0]["assigned_model_slots"] == []


def test_delete_model_checks_parsed_slots_across_all_items(client, db_session):
    db_session.add_all([
        ProductSymbol(slot=1, symbol="A", model_name="A", is_reserved=False),
        ProductSymbol(slot=2, symbol="AB", model_name="AB", is_reserved=False),
    ])
    db_session.commit()
    refresh_symbol_cache(db_session)
    created = client.post("/api/items", headers=ADMIN_HEADERS, json={
        "item_name": "AB linked", "process_type_code": "HR", "model_slots": [2], "initial_quantity": 0,
    })
    assert created.status_code == 201, created.text
    assert client.request("DELETE", "/api/models/2", headers=ADMIN_HEADERS, json={"pin": "0000"}).status_code == 409
    assert client.request("DELETE", "/api/models/1", headers=ADMIN_HEADERS, json={"pin": "0000"}).status_code == 204
    assert client.get(f"/api/items/{created.json()['item_id']}").json()["model_slots"] == [2]


def test_model_symbol_rejects_delimiter_and_explicit_empty_update(client, db_session):
    _seed_symbols(db_session)
    assert client.post("/api/models", headers=ADMIN_HEADERS, json={"model_name": "A-B", "symbol": "A-B"}).status_code == 422
    for symbol in ("A-B", ""):
        response = client.put("/api/models/1", headers=ADMIN_HEADERS, json={"symbol": symbol, "pin": "0000"})
        assert response.status_code == 422, response.text
    assert client.get("/api/models").json()[0]["symbol"] == "3"


def test_existing_item_guard_uses_mes_code_prefix_consumed_by_api(client, db_session):
    db_session.add_all([
        ProductSymbol(slot=1, symbol="A", model_name="A", is_reserved=False),
        ProductSymbol(slot=2, symbol="A-B", model_name="legacy", is_reserved=False),
    ])
    item = Item(item_name="legacy delimiter", process_type_code="HR", model_symbol="A-B", serial_no=1)
    db_session.add(item)
    db_session.commit()
    refresh_symbol_cache(db_session)
    assert client.get(f"/api/items/{item.item_id}").json()["model_slots"] == [1]
    assert client.post("/api/items", headers=ADMIN_HEADERS, json={
        "item_name": "reject legacy symbol", "process_type_code": "HR", "model_slots": [2], "initial_quantity": 0,
    }).status_code == 422
    assert client.put("/api/models/1", headers=ADMIN_HEADERS, json={"symbol": "Z", "pin": "0000"}).status_code == 409
    assert client.request("DELETE", "/api/models/1", headers=ADMIN_HEADERS, json={"pin": "0000"}).status_code == 409
