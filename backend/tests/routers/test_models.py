"""제품 모델 라우터 — create_model 예약슬롯 승격 동작.

시드가 slot 1~100 을 미리 채워(예약분 포함) create_model 이 '빈 slot 번호'를 찾으려다
항상 400 이던 버그의 회귀 가드. 픽스: 가장 낮은 예약 슬롯을 승격한다.
"""

from app.models import ProductSymbol


def _seed_symbols(db):
    # 배정 1종 + 예약 2종
    db.add(ProductSymbol(slot=1, symbol="3", model_name="DX3000", is_reserved=False))
    db.add(ProductSymbol(slot=2, symbol=None, model_name=None, is_reserved=True))
    db.add(ProductSymbol(slot=3, symbol=None, model_name=None, is_reserved=True))
    db.commit()


def test_create_model_promotes_lowest_reserved_slot(client, db_session):
    _seed_symbols(db_session)
    res = client.post("/api/models", json={"model_name": "NEWMODEL", "symbol": "9"})
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["slot"] == 2  # 최저 예약 슬롯 승격
    assert body["symbol"] == "9"
    assert body["model_name"] == "NEWMODEL"
    row = db_session.query(ProductSymbol).filter_by(slot=2).first()
    assert not row.is_reserved


def test_create_model_duplicate_name_409(client, db_session):
    _seed_symbols(db_session)
    res = client.post("/api/models", json={"model_name": "DX3000", "symbol": "Z"})
    assert res.status_code == 409, res.text


def test_create_model_duplicate_symbol_409(client, db_session):
    _seed_symbols(db_session)
    res = client.post("/api/models", json={"model_name": "OTHER", "symbol": "3"})
    assert res.status_code == 409, res.text


def test_create_model_no_reserved_slot_400(client, db_session):
    db_session.add(ProductSymbol(slot=1, symbol="3", model_name="DX3000", is_reserved=False))
    db_session.commit()
    res = client.post("/api/models", json={"model_name": "NEW", "symbol": "9"})
    assert res.status_code == 400, res.text
