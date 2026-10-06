"""불량 통계 HTTP 계약 테스트."""

from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.routers import defects as defects_router


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


def test_report_route_defaults_month_and_passes_all_filters(monkeypatch, client):
    captured = {}
    item_id = "12345678-1234-1234-1234-123456789abc"

    def fake_report(db, *, period, anchor, filters):
        captured.update(period=period, anchor=anchor, filters=filters)
        return {
            "period": {"kind": period, "anchor": anchor, "start_date": date(2026, 9, 1), "end_date": date(2026, 9, 30)},
            "summary": {"record_count": 0, "quantity": 0},
            "timeline": [], "items": [], "reasons": [], "departments": [], "excluded_legacy_count": 0,
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
