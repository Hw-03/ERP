"""PUT /api/items/{item_id} — process_type_code 갱신 회귀 테스트.

이전 버그: ItemUpdate 스키마와 update_item 루프 모두 process_type_code 를
포함하지 않아 프론트에서 PUT 으로 보내도 백엔드가 무시했다. 이 테스트는
프론트와 백엔드 계약이 일치하는지 보장한다.

라우트는 @router.put — PATCH 가 아니라 PUT 으로 호출한다.
"""

from __future__ import annotations

import pytest

from app.models import AdminAuditLog

ADMIN_HEADERS = {"X-Admin-Pin": "0000"}


def test_update_item_changes_process_type_code(client, make_item):
    # 모든 품목은 모델을 가진다(불변식) — 공정 변경 시 422 가드를 통과하려면 모델 필요.
    item = make_item(name="공정변경대상", process_type_code="TR", model_symbol="3", serial_no=1)

    # 변경 전 baseline
    res = client.get(f"/api/items/{item.item_id}")
    assert res.status_code == 200
    assert res.json()["process_type_code"] == "TR"

    # PUT 으로 process_type_code 만 변경
    res = client.put(
        f"/api/items/{item.item_id}",
        headers=ADMIN_HEADERS,
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
        headers=ADMIN_HEADERS,
json={"item_name": "이름만 변경"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["item_name"] == "이름만 변경"
    assert body["process_type_code"] == "VA"


def test_update_item_legacy_fields(client, make_item):
    """legacy_part / legacy_item_type 갱신 (legacy_file_type 제거됨)."""
    item = make_item(name="레거시필드", process_type_code="TR")

    res = client.put(
        f"/api/items/{item.item_id}",
        headers=ADMIN_HEADERS,
json={
            "legacy_part": "PART_B",
            "legacy_item_type": "ITEM_C",
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["legacy_part"] == "PART_B"
    assert body["legacy_item_type"] == "ITEM_C"
    # process_type_code 는 그대로
    assert body["process_type_code"] == "TR"


def test_update_item_supplier(client, make_item):
    """supplier 단독 갱신."""
    item = make_item(name="공급업체", process_type_code="HF")

    res = client.put(
        f"/api/items/{item.item_id}",
        headers=ADMIN_HEADERS,
json={"supplier": "신규공급사 ABC"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["supplier"] == "신규공급사 ABC"


def test_update_item_min_stock_integer_only(client, make_item):
    """min_stock 은 정수 전용 — 소수는 거부(422), 정수는 허용·정수 직렬화."""
    item = make_item(name="안전재고", process_type_code="VR")

    # 소수는 거부
    res = client.put(
        f"/api/items/{item.item_id}",
        headers=ADMIN_HEADERS,
json={"min_stock": "12.5"},
    )
    assert res.status_code == 422, res.text

    # 정수는 허용 + 정수(JSON number)로 직렬화
    res = client.put(
        f"/api/items/{item.item_id}",
        headers=ADMIN_HEADERS,
json={"min_stock": 12},
    )
    assert res.status_code == 200, res.text
    assert res.json()["min_stock"] == 12


def test_update_item_rejects_negative_min_stock(client, make_item):
    item = make_item(name="음수 안전재고", process_type_code="VR")

    response = client.put(
        f"/api/items/{item.item_id}",
        headers=ADMIN_HEADERS,
        json={"min_stock": -1},
    )

    assert response.status_code == 422, response.text


def test_update_item_preserves_omitted_procurement_fields_and_clears_explicit_nulls(client, make_item):
    item = make_item(name="구매 마스터 수정", process_type_code="HR")
    configured = client.put(
        f"/api/items/{item.item_id}",
        headers=ADMIN_HEADERS,
        json={
            "supplier": "기존 공급사",
            "min_stock": 20,
            "supplier_item_code": "SUP-OLD",
            "standard_purchase_price": "100.25",
            "purchase_price_effective_date": "2026-09-01",
            "procurement_lead_time_days": 7,
            "minimum_order_quantity": 3,
            "reorder_point": 11,
            "purchase_memo": "기존 구매 조건",
        },
    )
    assert configured.status_code == 200, configured.text
    assert configured.json()["standard_purchase_price"] == "100.25"

    partial = client.put(
        f"/api/items/{item.item_id}",
        headers=ADMIN_HEADERS,
        json={"item_name": "구매 마스터 이름만 수정"},
    )
    assert partial.status_code == 200, partial.text
    body = partial.json()
    assert body["supplier"] == "기존 공급사"
    assert body["min_stock"] == 20
    assert body["supplier_item_code"] == "SUP-OLD"
    assert body["standard_purchase_price"] == "100.25"
    assert body["purchase_price_effective_date"] == "2026-09-01"
    assert body["procurement_lead_time_days"] == 7
    assert body["minimum_order_quantity"] == 3
    assert body["reorder_point"] == 11
    assert body["purchase_memo"] == "기존 구매 조건"

    cleared = client.put(
        f"/api/items/{item.item_id}",
        headers=ADMIN_HEADERS,
        json={
            "supplier": None,
            "min_stock": None,
            "supplier_item_code": None,
            "standard_purchase_price": None,
            "purchase_price_effective_date": None,
            "procurement_lead_time_days": None,
            "minimum_order_quantity": None,
            "reorder_point": None,
            "purchase_memo": None,
        },
    )
    assert cleared.status_code == 200, cleared.text
    body = cleared.json()
    for field in (
        "supplier",
        "min_stock",
        "supplier_item_code",
        "standard_purchase_price",
        "purchase_price_effective_date",
        "procurement_lead_time_days",
        "minimum_order_quantity",
        "reorder_point",
        "purchase_memo",
    ):
        assert body[field] is None


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("standard_purchase_price", "-0.01"),
        ("procurement_lead_time_days", -1),
        ("minimum_order_quantity", 0),
        ("reorder_point", -1),
    ],
)
def test_update_item_rejects_invalid_procurement_values(client, make_item, field, value):
    item = make_item(name=f"구매 수정 검증 {field}", process_type_code="HR")

    response = client.put(
        f"/api/items/{item.item_id}",
        headers=ADMIN_HEADERS,
        json={field: value},
    )

    assert response.status_code == 422, response.text


def test_update_item_empty_payload_no_change(client, make_item):
    """빈 payload 면 어떤 필드도 변경되지 않아야 한다."""
    item = make_item(name="원본유지", process_type_code="PA")

    res = client.put(
        f"/api/items/{item.item_id}",
        headers=ADMIN_HEADERS,
json={},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["item_name"] == "원본유지"
    assert body["process_type_code"] == "PA"


def test_update_item_can_clear_sales_review_required(client, make_item):
    item = make_item(name="영업 검토 품목", process_type_code="PA")

    enabled = client.put(
        f"/api/items/{item.item_id}",
        headers=ADMIN_HEADERS,
        json={"sales_review_required": True},
    )
    assert enabled.status_code == 200, enabled.text
    assert enabled.json()["sales_review_required"] is True

    cleared = client.put(
        f"/api/items/{item.item_id}",
        headers=ADMIN_HEADERS,
        json={"sales_review_required": False},
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["sales_review_required"] is False


def test_update_item_can_toggle_bom_stock_exempt(client, make_item):
    item = make_item(name="BOM 재고 미반영 대상", process_type_code="HR")

    before = client.get(f"/api/items/{item.item_id}")
    assert before.status_code == 200
    assert before.json()["bom_stock_exempt"] is False

    updated = client.put(
        f"/api/items/{item.item_id}",
        headers=ADMIN_HEADERS,
        json={"bom_stock_exempt": True},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["bom_stock_exempt"] is True

    reread = client.get(f"/api/items/{item.item_id}")
    assert reread.status_code == 200
    assert reread.json()["bom_stock_exempt"] is True


def _set_legacy_item_type(db_session, item, value):
    item.legacy_item_type = value
    db_session.flush()


@pytest.mark.parametrize(
    "original_type",
    ["원자재", "부자재", "기타", None, "불용"],
)
def test_bom_unmatched_disused_round_trip_restores_original_type(
    client,
    db_session,
    make_item,
    original_type,
):
    item = make_item(name=f"BOM 미매칭 원복 {original_type}")
    _set_legacy_item_type(db_session, item, original_type)

    disused = client.patch(
        f"/api/items/{item.item_id}/bom-unmatched-status",
        headers=ADMIN_HEADERS,
        json={"status": "DISUSED"},
    )
    assert disused.status_code == 200, disused.text
    assert disused.json()["bom_unmatched_status"] == "DISUSED"
    assert disused.json()["legacy_item_type"] == "불용"
    assert "pre_disused_legacy_item_type" not in disused.json()
    db_session.refresh(item)
    assert item.pre_disused_legacy_item_type == original_type

    cleared = client.patch(
        f"/api/items/{item.item_id}/bom-unmatched-status",
        headers=ADMIN_HEADERS,
        json={"status": None},
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["bom_unmatched_status"] is None
    assert cleared.json()["legacy_item_type"] == original_type
    db_session.refresh(item)
    assert item.pre_disused_legacy_item_type is None


@pytest.mark.parametrize("status", ["HOLD", "DUPLICATE"])
def test_bom_unmatched_non_disused_status_preserves_item_type(
    client,
    db_session,
    make_item,
    status,
):
    item = make_item(name=f"BOM 미매칭 {status}")
    _set_legacy_item_type(db_session, item, "부자재")

    response = client.patch(
        f"/api/items/{item.item_id}/bom-unmatched-status",
        headers=ADMIN_HEADERS,
        json={"status": status},
    )

    assert response.status_code == 200, response.text
    assert response.json()["bom_unmatched_status"] == status
    assert response.json()["legacy_item_type"] == "부자재"
    db_session.refresh(item)
    assert item.pre_disused_legacy_item_type is None


@pytest.mark.parametrize("next_status", ["HOLD", "DUPLICATE"])
def test_bom_unmatched_leaving_disused_restores_original_type(
    client,
    db_session,
    make_item,
    next_status,
):
    item = make_item(name=f"BOM 미매칭 {next_status} 전환")

    item.legacy_item_type = "기타"
    entered = client.patch(
        f"/api/items/{item.item_id}/bom-unmatched-status",
        headers=ADMIN_HEADERS,
        json={"status": "DISUSED"},
    )
    assert entered.status_code == 200, entered.text

    transitioned = client.patch(
        f"/api/items/{item.item_id}/bom-unmatched-status",
        headers=ADMIN_HEADERS,
        json={"status": next_status},
    )

    assert transitioned.status_code == 200, transitioned.text
    assert transitioned.json()["bom_unmatched_status"] == next_status
    assert transitioned.json()["legacy_item_type"] == "기타"
    db_session.refresh(item)
    assert item.bom_unmatched_status == next_status
    assert item.legacy_item_type == "기타"
    assert item.pre_disused_legacy_item_type is None


def test_bom_unmatched_status_requires_admin_pin(client, make_item):
    item = make_item(name="BOM 미매칭 권한")

    response = client.patch(
        f"/api/items/{item.item_id}/bom-unmatched-status",
        json={"status": "HOLD"},
    )

    assert response.status_code == 400


def test_bom_unmatched_status_rejects_unknown_status(client, make_item):
    item = make_item(name="BOM 미매칭 검증")

    response = client.patch(
        f"/api/items/{item.item_id}/bom-unmatched-status",
        headers=ADMIN_HEADERS,
        json={"status": "UNKNOWN"},
    )

    assert response.status_code == 422


def test_bom_unmatched_status_requires_status_field(client, make_item):
    item = make_item(name="BOM 미매칭 상태 필드")

    response = client.patch(
        f"/api/items/{item.item_id}/bom-unmatched-status",
        headers=ADMIN_HEADERS,
        json={},
    )

    assert response.status_code == 422


def test_bom_unmatched_same_status_is_idempotent(
    client,
    db_session,
    make_item,
    monkeypatch,
):
    from app.routers import items as items_router

    item = make_item(name="BOM 미매칭 멱등")
    _set_legacy_item_type(db_session, item, "원자재")
    emitted: list[tuple[str, dict]] = []
    monkeypatch.setattr(
        items_router,
        "_evt_emit",
        lambda action, **kwargs: emitted.append((action, kwargs)),
    )

    first = client.patch(
        f"/api/items/{item.item_id}/bom-unmatched-status",
        headers=ADMIN_HEADERS,
        json={"status": "DISUSED"},
    )
    assert first.status_code == 200, first.text
    audit_count = (
        db_session.query(AdminAuditLog)
        .filter(
            AdminAuditLog.action == "item.update",
            AdminAuditLog.target_id == str(item.item_id),
        )
        .count()
    )
    assert audit_count == 1
    assert [action for action, _kwargs in emitted] == ["item_update"]

    second = client.patch(
        f"/api/items/{item.item_id}/bom-unmatched-status",
        headers=ADMIN_HEADERS,
        json={"status": "DISUSED"},
    )

    assert second.status_code == 200, second.text
    assert second.json()["legacy_item_type"] == "불용"
    db_session.refresh(item)
    assert item.pre_disused_legacy_item_type == "원자재"
    assert (
        db_session.query(AdminAuditLog)
        .filter(
            AdminAuditLog.action == "item.update",
            AdminAuditLog.target_id == str(item.item_id),
        )
        .count()
        == audit_count
    )
    assert [action for action, _kwargs in emitted] == ["item_update"]


def test_update_item_manual_type_override_clears_disused_status(
    client,
    db_session,
    make_item,
    monkeypatch,
):
    from app.routers import items as items_router

    item = make_item(name="BOM 미매칭 수동 분류")
    _set_legacy_item_type(db_session, item, "원자재")
    emitted: list[str] = []
    monkeypatch.setattr(
        items_router,
        "_evt_emit",
        lambda action, **_kwargs: emitted.append(action),
    )
    entered = client.patch(
        f"/api/items/{item.item_id}/bom-unmatched-status",
        headers=ADMIN_HEADERS,
        json={"status": "DISUSED"},
    )
    assert entered.status_code == 200, entered.text
    assert emitted == ["item_update"]

    updated = client.put(
        f"/api/items/{item.item_id}",
        headers=ADMIN_HEADERS,
        json={"legacy_item_type": "부자재"},
    )

    assert updated.status_code == 200, updated.text
    assert updated.json()["legacy_item_type"] == "부자재"
    assert updated.json()["bom_unmatched_status"] is None
    db_session.refresh(item)
    assert item.pre_disused_legacy_item_type is None
    assert (
        db_session.query(AdminAuditLog)
        .filter(
            AdminAuditLog.action == "item.update",
            AdminAuditLog.target_id == str(item.item_id),
        )
        .count()
        == 2
    )
    assert emitted == ["item_update", "item_update"]
