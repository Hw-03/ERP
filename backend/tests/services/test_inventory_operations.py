"""공통 작업 원장 활성화 시각 계약."""

from __future__ import annotations

from datetime import datetime

from app.models import SystemSetting
from app.services import inventory_operations as operation_svc


def test_cutover_with_timezone_is_normalized_to_utc_naive(db_session) -> None:
    db_session.add(
        SystemSetting(
            setting_key=operation_svc.CUTOVER_SETTING_KEY,
            setting_value="2026-08-25T09:00:00+09:00",
        )
    )
    db_session.commit()

    assert operation_svc.cutover_at(db_session) == datetime(2026, 8, 25, 0, 0)
    assert operation_svc.is_ledger_active(
        db_session,
        at=datetime(2026, 8, 25, 0, 0),
    )
