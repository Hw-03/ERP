"""불량 통계 HTTP 계약 테스트."""

from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.routers import defects as defects_router
from app.services.defect_records import create_record


EMPTY_CATEGORIES = [
    {"key": key, "label": label, "record_count": 0, "quantity": 0}
    for key, label in (("DEFECT", "불량"), ("B_GRADE", "B급"), ("OBSOLETE", "구형"))
]


def test_statistics_route_passes_repeated_filters(monkeypatch, client):
    captured = {}

    def fake_statistics(db, *, period, anchor, filters):
        captured.update(period=period, anchor=anchor, filters=filters)
        return {
            "period": {
                "kind": period,
                "anchor": anchor,
                "start_date": date(2026, 8, 31),
                "end_date": date(2026, 9, 6),
            },
            "summary": {
                "record_count": 0,
                "quantity": 0,
                "top_item": None,
                "top_reason": None,
            },
            "timeline": [],
            "items": [],
            "reasons": [],
            "departments": [],
            "excluded_legacy_count": 0,
            "categories": EMPTY_CATEGORIES,
            "excluded_category_count": 0,
        }

    monkeypatch.setattr(defects_router, "get_defect_statistics", fake_statistics)

    response = client.get(
        "/api/defects/statistics",
        params=[
            ("period", "week"),
            ("anchor", "2026-09-04"),
            ("department", "조립"),
            ("department", "진공"),
            ("model", "DX3000"),
            ("process_step", "A"),
        ],
    )

    assert response.status_code == 200, response.text
    assert captured["period"] == "week"
    assert captured["anchor"] == date(2026, 9, 4)
    assert captured["filters"].departments == ("조립", "진공")
    assert captured["filters"].models == ("DX3000",)
    assert captured["filters"].process_steps == ("A",)
    assert response.json()["categories"] == EMPTY_CATEGORIES
    assert response.json()["excluded_category_count"] == 0


def test_report_route_defaults_month_and_passes_all_filters(monkeypatch, client):
    captured = {}
    item_id = "12345678-1234-1234-1234-123456789abc"

    def fake_report(db, *, period, anchor, filters):
        captured.update(period=period, anchor=anchor, filters=filters)
        return {
            "period": {"kind": period, "anchor": anchor, "start_date": date(2026, 9, 1), "end_date": date(2026, 9, 30)},
            "summary": {"record_count": 0, "quantity": 0},
            "timeline": [], "items": [], "reasons": [], "departments": [], "excluded_legacy_count": 0,
            "categories": EMPTY_CATEGORIES, "excluded_category_count": 0,
            "as_of": datetime(2026, 9, 3, tzinfo=ZoneInfo("Asia/Seoul")),
            "observed_until": None, "is_partial": False, "comparison": None, "trend": [],
        }

    monkeypatch.setattr(defects_router, "get_defect_statistics_report", fake_report, raising=False)
    response = client.get("/api/defects/statistics/report", params=[
        ("anchor", "2026-09-03"), ("department", "조립"), ("department", "진공"),
        ("model", "DX3000"), ("process_step", "A"), ("reason", "외관"), ("item_id", item_id),
    ])
    assert response.status_code == 200, response.text
    assert captured["period"] == "month"
    assert captured["anchor"] == date(2026, 9, 3)
    assert captured["filters"].departments == ("조립", "진공")
    assert captured["filters"].models == ("DX3000",)
    assert captured["filters"].process_steps == ("A",)
    assert captured["filters"].reason == "외관"
    assert str(captured["filters"].item_id) == item_id
    assert client.get("/api/defects/statistics/report").status_code == 422


def test_both_statistics_routes_return_original_categories_and_quantities(db_session, client, make_item):
    from app.models import DefectReasonCategory

    reason_category = DefectReasonCategory(name="HTTP 과거 사유", normalized_name="HTTP 과거 사유", is_active=True, is_other=False)
    db_session.add(reason_category)
    db_session.flush()
    item = make_item(name="최초 분류 HTTP")
    for category, quantity in [("DEFECT", 4), ("B_GRADE", 5), ("OBSOLETE", 6)]:
        record = create_record(
            db_session, item_id=item.item_id, department="조립", quantity=quantity,
            actor_employee_id=None, actor_name="통계 작업자", reason_category=reason_category.name,
            reason_category_id=reason_category.category_id,
            memo=None, management_category=category, quarantined_at=datetime(2020, 9, 2),
        )
        record.management_category = "OBSOLETE"
        record.remaining_quantity = 0
    reason_category.name = reason_category.normalized_name = "HTTP 현재 사유"
    reason_category.is_active = False
    db_session.commit()
    for path in ("/api/defects/statistics", "/api/defects/statistics/report"):
        response = client.get(path, params={"period": "month", "anchor": "2020-09-03",
                                           "reason_category_id": str(reason_category.category_id),
                                           "reason": "HTTP 과거 사유"})
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["summary"]["quantity"] == 15
        assert [(entry["key"], entry["quantity"]) for entry in result["categories"]] == [
            ("DEFECT", 4), ("B_GRADE", 5), ("OBSOLETE", 6),
        ]
        assert result["excluded_category_count"] == 0
        assert result["reasons"] == [{"key": str(reason_category.category_id), "label": "HTTP 현재 사유",
                                      "record_count": 3, "quantity": 15}]
        assert record.reason_category == "HTTP 과거 사유"
        if path.endswith("/report"):
            assert result["comparison"]["categories"] == EMPTY_CATEGORIES
