"""수동 PF 기준 API 제거 회귀 테스트."""

from __future__ import annotations

import uuid

import pytest


@pytest.mark.parametrize(
    ("method", "url", "payload"),
    [
        ("get", "/api/production/capacity/pf-pins", None),
        ("put", "/api/production/capacity/pf-pins/3", {"pf_item_id": str(uuid.uuid4())}),
        ("delete", "/api/production/capacity/pf-pins/3", None),
    ],
)
def test_manual_pf_pin_endpoints_are_removed(client, method, url, payload):
    """자동 기준 전환 뒤에는 수동 지정 API를 제공하지 않는다."""
    request_kwargs = {"json": payload} if payload is not None else {}
    response = getattr(client, method)(url, **request_kwargs)

    assert response.status_code == 404
