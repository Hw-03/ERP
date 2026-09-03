"""정합성 확인 뒤 신규 취소 원장과 주간 기준을 전향 활성화한다."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    AdminAuditLog,
    DefectInventoryMovement,
    DefectQuarantineRecord,
    InventoryOperation,
    InventoryOperationKindEnum,
    InventoryOperationStatusEnum,
    SystemSetting,
)
from app.services.inventory_integrity import diagnose_inventory_integrity
from app.services.inventory_operations import CUTOVER_SETTING_KEY
from app.services.weekly_report_contract import WEEKLY_V2_SETTING_KEY


KST = ZoneInfo("Asia/Seoul")
DEFECT_BASELINE_ACTION = "defect_cutover_baseline"
DEFECT_BASELINE_MOVEMENT_TYPE = "CUTOVER_BASELINE"
DEFECT_BASELINE_ROLE = "OPENING_BALANCE"


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


def _utc_naive(value: datetime) -> datetime:
    """DB의 UTC-naive DateTime과 안전하게 비교할 시각으로 정규화한다."""
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


def _seed_defect_cutover_baselines(
    db: Session,
    *,
    ledger_start: datetime,
) -> int:
    """전환 전 격리 건의 시작 잔량을 재고 변경 없는 감사 이동으로 보강한다."""
    records = (
        db.query(DefectQuarantineRecord)
        .filter(DefectQuarantineRecord.quarantined_at < _utc_naive(ledger_start))
        .order_by(DefectQuarantineRecord.record_id)
        .all()
    )
    if not records:
        return 0

    record_ids = [record.record_id for record in records]
    movement_totals = dict(
        db.query(
            DefectInventoryMovement.record_id,
            func.sum(DefectInventoryMovement.quantity_delta),
        )
        .filter(DefectInventoryMovement.record_id.in_(record_ids))
        .group_by(DefectInventoryMovement.record_id)
        .all()
    )
    baseline_counts = dict(
        db.query(
            DefectInventoryMovement.record_id,
            func.count(DefectInventoryMovement.movement_id),
        )
        .filter(
            DefectInventoryMovement.record_id.in_(record_ids),
            DefectInventoryMovement.movement_type == DEFECT_BASELINE_MOVEMENT_TYPE,
        )
        .group_by(DefectInventoryMovement.record_id)
        .all()
    )

    candidates: list[tuple[DefectQuarantineRecord, int]] = []
    for record in records:
        movement_total = int(movement_totals.get(record.record_id) or 0)
        opening_balance = int(record.remaining_quantity) - movement_total
        baseline_count = int(baseline_counts.get(record.record_id) or 0)
        if baseline_count > 1 or (baseline_count and opening_balance != 0):
            raise InventoryOperationActivationError(
                f"불량 기준선이 중복되었거나 손상되었습니다: {record.record_id}"
            )
        if opening_balance < 0 or opening_balance > int(record.original_quantity):
            raise InventoryOperationActivationError(
                f"불량 opening balance 범위가 올바르지 않습니다: {record.record_id}"
            )
        if opening_balance > 0:
            candidates.append((record, opening_balance))

    if not candidates:
        return 0

    idempotency_key = f"defect-cutover-baseline:{ledger_start.isoformat()}"
    operation = (
        db.query(InventoryOperation)
        .filter(InventoryOperation.idempotency_key == idempotency_key)
        .one_or_none()
    )
    if operation is None:
        operation = InventoryOperation(
            kind=InventoryOperationKindEnum.BUSINESS,
            domain="inventory_integrity",
            action=DEFECT_BASELINE_ACTION,
            status=InventoryOperationStatusEnum.COMMITTED,
            display_label="불량 원장 전환 기준선",
            actor_name="시스템 전환",
            reason="전환 전 격리 기록의 감사 원장 시작 잔량",
            idempotency_key=idempotency_key,
            effective_at=_utc_naive(ledger_start),
            contract_version=1,
        )
        db.add(operation)
        db.flush()
    elif operation.action != DEFECT_BASELINE_ACTION:
        raise InventoryOperationActivationError("불량 기준선 멱등 키가 다른 작업에 사용 중입니다.")

    for record, opening_balance in candidates:
        db.add(
            DefectInventoryMovement(
                operation_id=operation.operation_id,
                record_id=record.record_id,
                item_id=record.item_id,
                department=record.department,
                movement_type=DEFECT_BASELINE_MOVEMENT_TYPE,
                quantity_delta=opening_balance,
                role=DEFECT_BASELINE_ROLE,
                actor_name="시스템 전환",
                effective_at=_utc_naive(ledger_start),
            )
        )
    db.flush()
    return len(candidates)


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

    report = InventoryOperationActivationReport(
        applied=apply,
        approved_by=approved_by.strip(),
        ledger_starts_at=ledger_start,
        weekly_starts_at=weekly_start,
    )
    savepoint = db.begin_nested()
    try:
        _seed_defect_cutover_baselines(db, ledger_start=ledger_start)
        diagnostic = diagnose_inventory_integrity(db)
        if not diagnostic.is_consistent:
            sample = ", ".join(issue.problem_id for issue in diagnostic.issues[:5])
            raise InventoryOperationActivationError(
                f"정합성 진단이 통과하지 않아 활성화할 수 없습니다: {sample}"
            )

        if not apply:
            savepoint.rollback()
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
        savepoint.commit()
    except Exception:
        if savepoint.is_active:
            savepoint.rollback()
        raise
    return report
