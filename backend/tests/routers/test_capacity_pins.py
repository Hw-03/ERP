"""Regression tests for model_pf_pins endpoints (GET/PUT/DELETE).

회귀 보호:
- items.item_id 는 UUIDString 타입으로 DB 에 hyphen 없는 hex(32자)로 저장된다.
- GET 응답은 표준 UUID 형식(36자, hyphen 있음)으로 변환해야 프론트가 보낸 값과
  정확히 일치한다 — 4df41ffb (2026-06-23) 가 이 변환을 GET 에 추가했다.
- 비대칭으로 보일 수 있지만 PUT 의 .hex 변환과 GET 의 표준화는 의도된 어댑터다.
"""

from __future__ import annotations

from decimal import Decimal

def test_pf_pins_get_empty_dict_when_no_pins(client):
    """지정이 하나도 없으면 빈 dict."""
    resp = client.get("/api/production/capacity/pf-pins")
    assert resp.status_code == 200
    assert resp.json() == {}


def test_pf_pins_put_then_get_returns_same_uuid_format(client, db_session, make_item):
    """PUT 으로 지정한 UUID 가 GET 에서 동일한 표준 형식으로 돌아온다.

    이게 보장되지 않으면 프론트가 "현재 지정된 PF" 와 "옵션 리스트의 PF" 매칭에 실패해
    새로고침 직후 지정이 사라진 것처럼 보인다 (4df41ffb 회귀 케이스).
    """
    pf = make_item(
        name="회귀PF", process_type_code="PF",
        warehouse_qty=Decimal("0"), model_symbol="3", serial_no=1,
    )
    db_session.commit()
    pf_uuid = str(pf.item_id)  # UUIDString → uuid.UUID 객체 → 표준 36자 문자열

    resp = client.put(
        "/api/production/capacity/pf-pins/3",
        json={"pf_item_id": pf_uuid},
    )
    assert resp.status_code == 204

    resp = client.get("/api/production/capacity/pf-pins")
    assert resp.status_code == 200
    assert resp.json() == {"3": pf_uuid}


def test_pf_pins_delete_removes_entry(client, db_session, make_item):
    """DELETE 후 GET 에 빠져있다. 없는 model_symbol DELETE 도 204."""
    pf = make_item(
        name="삭제PF", process_type_code="PF",
        warehouse_qty=Decimal("0"), model_symbol="4", serial_no=1,
    )
    db_session.commit()
    pf_uuid = str(pf.item_id)

    client.put("/api/production/capacity/pf-pins/4", json={"pf_item_id": pf_uuid})
    assert client.get("/api/production/capacity/pf-pins").json() == {"4": pf_uuid}

    resp = client.delete("/api/production/capacity/pf-pins/4")
    assert resp.status_code == 204
    assert client.get("/api/production/capacity/pf-pins").json() == {}

    # 없는 키 삭제도 멱등하게 204
    resp = client.delete("/api/production/capacity/pf-pins/none-existent")
    assert resp.status_code == 204


def test_pf_pins_rejects_non_pf_item(client, db_session, make_item):
    """PF 가 아닌 품목 지정은 400."""
    aa = make_item(name="AA중간재", process_type_code="AA", warehouse_qty=Decimal("0"))
    db_session.commit()

    resp = client.put(
        "/api/production/capacity/pf-pins/5",
        json={"pf_item_id": str(aa.item_id)},
    )
    assert resp.status_code == 400
