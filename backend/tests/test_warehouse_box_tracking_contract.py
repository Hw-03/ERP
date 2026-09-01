"""박스 추적 설정은 물리 차감 토글이 아닌 UI 표시 호환 계약이다."""

from app.routers.warehouse_map.boxes import set_box_tracking
from app.routers.warehouse_map.query import get_box_tracking
from app.schemas.warehouse import BoxTrackingResponse, BoxTrackingUpdate
from app.services import warehouse_map


EXPECTED_DESCRIPTION = (
    "박스 배치 UI 표시 선호도입니다. 물리 원장 차감에는 영향을 주지 않습니다."
)


def test_box_tracking_schema_describes_ui_only_compatibility_setting() -> None:
    response_schema = BoxTrackingResponse.model_json_schema()
    update_schema = BoxTrackingUpdate.model_json_schema()

    assert response_schema["properties"]["enabled"]["description"] == EXPECTED_DESCRIPTION
    assert update_schema["properties"]["enabled"]["description"] == EXPECTED_DESCRIPTION


def test_box_tracking_routes_do_not_describe_enabled_as_physical_deduction_toggle() -> None:
    for endpoint in (get_box_tracking, set_box_tracking):
        assert endpoint.__doc__ is not None
        assert "UI 표시" in endpoint.__doc__
        assert "물리 원장 차감에는 영향을 주지" in endpoint.__doc__


def test_box_tracking_ui_defaults_to_visible_when_setting_is_absent(db_session) -> None:
    assert warehouse_map.is_box_tracking_enabled(db_session) is True
