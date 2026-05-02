"""PUT /api/items/{item_id} — process_type_code 갱신 회귀 테스트.

이전 버그: ItemUpdate 스키마와 update_item 루프 모두 process_type_code 를
포함하지 않아 프론트에서 PUT 으로 보내도 백엔드가 무시했다. 이 테스트는
프론트와 백엔드 계약이 일치하는지 보장한다.

라우트는 @router.put — PATCH 가 아니라 PUT 으로 호출한다.
"""

from __future__ import annotations


def test_update_item_changes_process_type_code(client, make_item):
    item = make_item(name="공정변경대상", process_type_code="TR")

    # 변경 전 baseline
    res = client.get(f"/api/items/{item.item_id}")
    assert res.status_code == 200
    assert res.json()["process_type_code"] == "TR"

    # PUT 으로 process_type_code 만 변경
    res = client.put(
        f"/api/items/{item.item_id}",
        json={"process_type_code": "HF"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["process_type_code"] == "HF"

    # 재조회 시에도 유지되는지
    res = client.get(f"/api/items/{item.item_id}")
    assert res.status_code == 200
    assert res.json()["process_type_code"] == "HF"


def test_update_item_does_not_clear_process_type_code_when_omitted(client, make_item):
    """다른 필드 갱신 시 process_type_code 가 유지되는지."""
    item = make_item(name="유지대상", process_type_code="VA")

    res = client.put(
        f"/api/items/{item.item_id}",
        json={"item_name": "이름만 변경"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["item_name"] == "이름만 변경"
    assert body["process_type_code"] == "VA"


def test_update_item_legacy_fields(client, make_item):
    """legacy_file_type / legacy_part / legacy_item_type / legacy_model 갱신."""
    item = make_item(name="레거시필드", process_type_code="TR")

    res = client.put(
        f"/api/items/{item.item_id}",
        json={
            "legacy_file_type": "FILE_A",
            "legacy_part": "PART_B",
            "legacy_item_type": "ITEM_C",
            "legacy_model": "MODEL_D",
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["legacy_file_type"] == "FILE_A"
    assert body["legacy_part"] == "PART_B"
    assert body["legacy_item_type"] == "ITEM_C"
    assert body["legacy_model"] == "MODEL_D"
    # process_type_code 는 그대로
    assert body["process_type_code"] == "TR"


def test_update_item_supplier(client, make_item):
    """supplier 단독 갱신."""
    item = make_item(name="공급업체", process_type_code="HF")

    res = client.put(
        f"/api/items/{item.item_id}",
        json={"supplier": "신규공급사 ABC"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["supplier"] == "신규공급사 ABC"


def test_update_item_min_stock_decimal(client, make_item):
    """min_stock 은 Decimal — 문자열 / 숫자 둘 다 허용되는지."""
    item = make_item(name="안전재고", process_type_code="VR")

    res = client.put(
        f"/api/items/{item.item_id}",
        json={"min_stock": "12.5"},
    )
    assert res.status_code == 200, res.text
    # 응답 직렬화는 string 또는 float — 둘 다 12.5 동등성으로 검증
    assert float(res.json()["min_stock"]) == 12.5


def test_update_item_empty_payload_no_change(client, make_item):
    """빈 payload 면 어떤 필드도 변경되지 않아야 한다."""
    item = make_item(name="원본유지", process_type_code="PA")

    res = client.put(
        f"/api/items/{item.item_id}",
        json={},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["item_name"] == "원본유지"
    assert body["process_type_code"] == "PA"
