"""정합성 확인 뒤 신규 취소 원장과 주간 기준을 전향 활성화한다."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models import AdminAuditLog, SystemSetting
from app.services.inventory_integrity import diagnose_inventory_integrity
from app.services.inventory_operations import CUTOVER_SETTING_KEY
from app.services.weekly_report_contract import WEEKLY_V2_SETTING_KEY


KST = ZoneInfo("Asia/Seoul")


class InventoryOperationActivationError(RuntimeError):
    """활성화 전 진단이나 설정 불변식이 실패했을 때 발생한다."""


@dataclass(frozen=True)
class InventoryOperationActivationReport:
    applied: bool
    approved_by: str
    ledger_starts_at: datetime
    weekly_starts_at: datetime


def _next_kst_monday(now: datetime) -> datetime:
    aware = now if now.tzinfo is not None else now.replace(tzinfo=UTC)
    kst_now = aware.astimezone(KST)
    days_until_monday = 7 - kst_now.weekday()
    target_date = kst_now.date() + timedelta(days=days_until_monday)
    return datetime.combine(target_date, time.min, tzinfo=KST)


def _stored_datetime(db: Session, key: str) -> datetime | None:
    setting = db.get(SystemSetting, key)
    if setting is None:
        return None
    try:
        return datetime.fromisoformat(setting.setting_value)
    except ValueError as exc:
        raise InventoryOperationActivationError(f"손상된 활성화 설정입니다: {key}") from exc


def _upsert_setting(db: Session, key: str, value: datetime) -> None:
    setting = db.get(SystemSetting, key)
    serialized = value.isoformat()
    if setting is None:
        db.add(SystemSetting(setting_key=key, setting_value=serialized))
    else:
        setting.setting_value = serialized


def activate_inventory_operation_contract(
    db: Session,
    *,
    approved_by: str,
    now: datetime | None = None,
    weekly_starts_at: datetime | None = None,
    apply: bool = False,
) -> InventoryOperationActivationReport:
    """기존 설정은 보존하고 최초 활성화만 진단 통과 뒤 기록한다."""
    if not approved_by.strip():
        raise InventoryOperationActivationError("승인자가 필요합니다.")
    resolved_now = now or datetime.now(UTC)
    if resolved_now.tzinfo is None:
        resolved_now = resolved_now.replace(tzinfo=UTC)
    ledger_start = _stored_datetime(db, CUTOVER_SETTING_KEY) or resolved_now.astimezone(UTC)
    weekly_start = (
        _stored_datetime(db, WEEKLY_V2_SETTING_KEY)
        or weekly_starts_at
        or _next_kst_monday(resolved_now)
    )

    diagnostic = diagnose_inventory_integrity(db)
    if not diagnostic.is_consistent:
        sample_ids = [
            check.check_id
            for check in diagnostic.checks
            if check.severity == "blocking" and check.count
        ]
        sample_ids.extend(issue.problem_id for issue in diagnostic.issues)
        sample = ", ".join(list(dict.fromkeys(sample_ids))[:5])
        raise InventoryOperationActivationError(
            f"정합성 진단이 통과하지 않아 활성화할 수 없습니다: {sample}"
        )

    report = InventoryOperationActivationReport(
        applied=apply,
        approved_by=approved_by.strip(),
        ledger_starts_at=ledger_start,
        weekly_starts_at=weekly_start,
    )
    if not apply:
        return report

    _upsert_setting(db, CUTOVER_SETTING_KEY, ledger_start)
    _upsert_setting(db, WEEKLY_V2_SETTING_KEY, weekly_start)
    db.add(
        AdminAuditLog(
            actor_pin_role="approved-operator",
            action="inventory_operation_activate",
            target_type="inventory_operation_contract",
            target_id=CUTOVER_SETTING_KEY,
            payload_summary=json.dumps(
                {
                    "approved_by": approved_by.strip(),
                    "ledger_starts_at": ledger_start.isoformat(),
                    "weekly_starts_at": weekly_start.isoformat(),
                },
                ensure_ascii=False,
                sort_keys=True,
            ),
        )
    )
    db.flush()
    return report
