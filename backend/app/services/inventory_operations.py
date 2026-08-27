"""공통 재고 작업 원장의 생성·연결 규칙."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Optional
import uuid

from sqlalchemy.orm import Session

from app.models import (
    DefectInventoryMovement,
    InventoryOperation,
    InventoryOperationEffect,
    InventoryOperationEffectKindEnum,
    InventoryOperationKindEnum,
    InventoryOperationRoleEnum,
    InventoryOperationStatusEnum,
    SystemSetting,
    TransactionLog,
)


CUTOVER_SETTING_KEY = "inventory_operation_cutover_at"


class OperationCutoverConfigurationError(RuntimeError):
    """원장 활성화 시각이 손상되어 신규 쓰기를 안전하게 판정할 수 없음."""


def cutover_at(db: Session) -> Optional[datetime]:
    """저장된 UTC-naive 전향 적용 시각을 반환하고 잘못된 값은 실패 폐쇄한다."""
    setting = db.get(SystemSetting, CUTOVER_SETTING_KEY)
    if setting is None:
        return None
    try:
        parsed = datetime.fromisoformat(setting.setting_value)
    except ValueError as exc:
        raise OperationCutoverConfigurationError(
            "재고 작업 원장 활성화 시각이 올바르지 않습니다."
        ) from exc
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(UTC).replace(tzinfo=None)
    return parsed


def is_ledger_active(db: Session, *, at: Optional[datetime] = None) -> bool:
    """명시적 전향 설정 이후에만 신규 작업 원장을 필수로 사용한다."""
    configured = cutover_at(db)
    return configured is not None and (at or datetime.utcnow()) >= configured


def _create_business_operation(
    db: Session,
    *,
    domain: str,
    action: str,
    display_label: str,
    actor_name: str,
    actor_employee_id: Optional[uuid.UUID],
    department: Optional[str] = None,
    reason: Optional[str] = None,
    idempotency_key: Optional[str] = None,
    effective_at: Optional[datetime] = None,
) -> Optional[InventoryOperation]:
    """활성화 이후 작업만 생성하며 호출자의 트랜잭션과 함께 커밋한다."""
    occurred_at = effective_at or datetime.utcnow()
    if not is_ledger_active(db, at=occurred_at):
        return None
    operation = InventoryOperation(
        kind=InventoryOperationKindEnum.BUSINESS,
        domain=domain,
        action=action,
        status=InventoryOperationStatusEnum.COMMITTED,
        display_label=display_label,
        actor_employee_id=actor_employee_id,
        actor_name=actor_name,
        department=department,
        reason=reason,
        idempotency_key=idempotency_key,
        effective_at=occurred_at,
        contract_version=1,
    )
    db.add(operation)
    db.flush()
    return operation


def _adopt_legacy_business_operation(
    db: Session,
    *,
    domain: str,
    action: str,
    display_label: str,
    actor_name: str,
    actor_employee_id: Optional[uuid.UUID],
    department: Optional[str],
    reason: Optional[str],
    idempotency_key: str,
    effective_at: datetime,
    adopted_at: Optional[datetime] = None,
) -> InventoryOperation:
    """활성화 뒤 안전 검증된 과거 로그를 원래 시각의 원 작업으로 편입한다.

    일반 생성기는 전향 적용 시각 이전의 ``effective_at``을 의도적으로 거부한다.
    취소 직전 편입은 현재 원장이 활성화됐는지를 별도로 확인한 뒤 원래 작업
    시각을 보존해야 하므로 전용 진입점을 사용한다.
    """
    if not is_ledger_active(db, at=adopted_at or datetime.utcnow()):
        raise OperationCutoverConfigurationError(
            "재고 작업 원장이 활성화되지 않아 레거시 작업을 편입할 수 없습니다."
        )
    operation = InventoryOperation(
        kind=InventoryOperationKindEnum.BUSINESS,
        domain=domain,
        action=action,
        status=InventoryOperationStatusEnum.COMMITTED,
        display_label=display_label,
        actor_employee_id=actor_employee_id,
        actor_name=actor_name,
        department=department,
        reason=reason,
        idempotency_key=idempotency_key,
        effective_at=effective_at,
        contract_version=1,
    )
    db.add(operation)
    db.flush()
    return operation


def _create_cancellation_operation(
    db: Session,
    *,
    original: InventoryOperation,
    actor_name: str,
    actor_employee_id: Optional[uuid.UUID],
    reason: str,
    effective_at: Optional[datetime] = None,
) -> InventoryOperation:
    """원 작업을 수정하지 않고 고유한 별도 역전 작업을 생성한다."""
    operation = InventoryOperation(
        kind=InventoryOperationKindEnum.CANCELLATION,
        domain=original.domain,
        action=original.action,
        status=InventoryOperationStatusEnum.COMMITTED,
        display_label=f"{original.display_label} 취소",
        actor_employee_id=actor_employee_id,
        actor_name=actor_name,
        department=original.department,
        reason=reason,
        effective_at=effective_at or datetime.utcnow(),
        contract_version=original.contract_version,
        reverses_operation_id=original.operation_id,
    )
    db.add(operation)
    db.flush()
    return operation


def _attach_transaction(
    log: TransactionLog,
    operation: Optional[InventoryOperation],
    role: InventoryOperationRoleEnum,
) -> TransactionLog:
    """신규 작업의 품목 로그에 원장과 명시적 역할을 연결한다."""
    if operation is not None:
        log.operation_id = operation.operation_id
        log.operation_role = role
    return log


def _record_effect(
    db: Session,
    *,
    operation: Optional[InventoryOperation],
    effect_kind: InventoryOperationEffectKindEnum,
    subject_type: str,
    subject_id: object,
    role: str,
    before_state: dict,
    after_state: dict,
) -> Optional[InventoryOperationEffect]:
    """활성 작업의 비재고 효과를 불변 전후 스냅샷으로 기록한다."""
    if operation is None:
        return None
    effect = InventoryOperationEffect(
        operation_id=operation.operation_id,
        effect_kind=effect_kind,
        subject_type=subject_type,
        subject_id=str(subject_id),
        role=role,
        before_state=before_state,
        after_state=after_state,
    )
    db.add(effect)
    return effect


def _record_defect_movement(
    db: Session,
    *,
    operation: Optional[InventoryOperation],
    record_id: uuid.UUID,
    item_id: uuid.UUID,
    department: str,
    movement_type: str,
    quantity_delta: object,
    role: str,
    actor_name: str,
    actor_employee_id: Optional[uuid.UUID],
) -> Optional[DefectInventoryMovement]:
    """활성 작업이 바꾼 격리 건 잔량을 append-only 이동으로 남긴다."""
    if operation is None:
        return None
    movement = DefectInventoryMovement(
        operation_id=operation.operation_id,
        record_id=record_id,
        item_id=item_id,
        department=department,
        movement_type=movement_type,
        quantity_delta=quantity_delta,
        role=role,
        actor_employee_id=actor_employee_id,
        actor_name=actor_name,
        effective_at=operation.effective_at,
    )
    db.add(movement)
    return movement
