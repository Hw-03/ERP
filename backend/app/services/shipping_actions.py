"""출하 HTTP 업무 명령의 트랜잭션 경계."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Mapping
import uuid

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models import (
    Employee,
    InventoryOperation,
    InventoryOperationEffect,
    InventoryOperationEffectKindEnum,
    InventoryOperationKindEnum,
    ShippingCommandReceipt,
    ShippingRequest,
    ShippingRequestStatusEnum,
)
from app.services import shipping as shipping_svc
from app.services import command_idempotency
from app.services._tx import transactional


ResponseFactory = Callable[[Session, ShippingRequest], BaseModel | Mapping[str, Any]]


@dataclass(frozen=True)
class ShippingCommandOutcome:
    response_snapshot: dict[str, Any]
    replayed: bool
    legacy_transport: bool


class ShippingIdempotencyConflict(shipping_svc.ShippingConflictError):
    """The transport key was already bound to different shipping semantics."""


class ShippingStateConflict(shipping_svc.ShippingConflictError):
    """The caller's optimistic shipping state no longer matches the database."""

    def __init__(self, current_status: str) -> None:
        super().__init__("출하 요청 상태가 변경되었습니다. 최신 상태를 확인해 주세요.")
        self.current_status = current_status


def _lock_request(db: Session, request_id: uuid.UUID) -> ShippingRequest:
    query = db.query(ShippingRequest).filter(
        ShippingRequest.request_id == request_id
    )
    if db.get_bind().dialect.name != "sqlite":
        query = query.with_for_update()
    request = query.one_or_none()
    if request is None:
        raise shipping_svc.ShippingError("출하 요청을 찾을 수 없습니다.")
    return request


def _lock_receipt(
    db: Session,
    *,
    actor_employee_id: uuid.UUID,
    route: str,
    client_request_id: uuid.UUID,
) -> ShippingCommandReceipt | None:
    query = db.query(ShippingCommandReceipt).filter(
        ShippingCommandReceipt.actor_employee_id == actor_employee_id,
        ShippingCommandReceipt.route == route,
        ShippingCommandReceipt.client_request_id == client_request_id,
    )
    if db.get_bind().dialect.name != "sqlite":
        query = query.with_for_update()
    return query.one_or_none()


def _command_operation(
    db: Session,
    request_id: uuid.UUID,
    *,
    action: str,
    cancellation: bool,
) -> InventoryOperation | None:
    query = (
        db.query(InventoryOperation)
        .join(
            InventoryOperationEffect,
            InventoryOperationEffect.operation_id == InventoryOperation.operation_id,
        )
        .filter(
            InventoryOperation.kind
            == (
                InventoryOperationKindEnum.CANCELLATION
                if cancellation
                else InventoryOperationKindEnum.BUSINESS
            ),
            InventoryOperation.domain == "shipping",
            InventoryOperation.action == action,
            InventoryOperationEffect.effect_kind
            == InventoryOperationEffectKindEnum.WORKFLOW,
            InventoryOperationEffect.subject_type == "ShippingRequest",
            InventoryOperationEffect.subject_id == str(request_id),
        )
        .order_by(
            InventoryOperation.effective_at.desc(),
            InventoryOperation.operation_id.desc(),
        )
    )
    return query.first()


def _snapshot_response(
    response: BaseModel | Mapping[str, Any],
) -> dict[str, Any]:
    if isinstance(response, BaseModel):
        return response.model_dump(mode="json")
    return dict(response)


def _utc_naive(value: datetime | None) -> datetime | None:
    """Normalize API timestamps to the UTC-naive database representation."""

    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _run_shipping_command(
    db: Session,
    *,
    request_id: uuid.UUID,
    actor: Employee,
    route: str,
    command_kind: str,
    expected_status: ShippingRequestStatusEnum | None,
    expected_updated_at: datetime | None,
    client_request_id: uuid.UUID | None,
    semantic_payload: Mapping[str, Any],
    operation_action: str,
    cancellation: bool,
    execute: Callable[[str], ShippingRequest],
    response_factory: ResponseFactory,
) -> ShippingCommandOutcome:
    actor = shipping_svc._require_actor(actor)
    transport_key = client_request_id or uuid.uuid4()
    legacy_transport = client_request_id is None
    expected_value = expected_status.value if expected_status is not None else None
    normalized_expected_updated_at = _utc_naive(expected_updated_at)
    expected_updated_at_value = (
        normalized_expected_updated_at.isoformat()
        if normalized_expected_updated_at is not None
        else None
    )
    fingerprint = command_idempotency.fingerprint_shipping_command(
        actor.employee_id,
        request_id,
        route=route,
        command_kind=command_kind,
        expected_status=expected_value,
        expected_updated_at=expected_updated_at_value,
        payload=semantic_payload,
    )
    advisory_key = f"shipping:{actor.employee_id}:{route}:{transport_key}"
    operation_key = advisory_key

    with transactional(db):
        command_idempotency.lock_idempotency_key(db, advisory_key)
        receipt = _lock_receipt(
            db,
            actor_employee_id=actor.employee_id,
            route=route,
            client_request_id=transport_key,
        )
        if receipt is not None:
            try:
                command_idempotency.require_matching_fingerprint(
                    receipt.semantic_fingerprint,
                    fingerprint,
                )
            except command_idempotency.IdempotencyConflict as exc:
                raise ShippingIdempotencyConflict(
                    "같은 요청 식별자가 다른 출하 명령에 사용되었습니다."
                ) from exc
            return ShippingCommandOutcome(
                response_snapshot=dict(receipt.response_snapshot),
                replayed=True,
                legacy_transport=legacy_transport,
            )

        request = _lock_request(db, request_id)
        current_status = str(getattr(request.status, "value", request.status))
        if expected_value is not None and current_status != expected_value:
            raise ShippingStateConflict(current_status)
        if (
            normalized_expected_updated_at is not None
            and _utc_naive(request.updated_at) != normalized_expected_updated_at
        ):
            raise ShippingStateConflict(current_status)

        request = execute(operation_key)
        db.flush()
        db.expire(request)
        response_snapshot = _snapshot_response(response_factory(db, request))
        operation = _command_operation(
            db,
            request_id,
            action=operation_action,
            cancellation=cancellation,
        )
        result_status = str(getattr(request.status, "value", request.status))
        db.add(
            ShippingCommandReceipt(
                actor_employee_id=actor.employee_id,
                route=route,
                command_kind=command_kind,
                client_request_id=transport_key,
                semantic_fingerprint=fingerprint,
                expected_status=expected_value,
                result_status=result_status,
                operation_id=(operation.operation_id if operation is not None else None),
                response_snapshot=response_snapshot,
            )
        )
        db.flush()
        return ShippingCommandOutcome(
            response_snapshot=response_snapshot,
            replayed=False,
            legacy_transport=legacy_transport,
        )


def create_request(db: Session, payload: dict, actor: Employee) -> ShippingRequest:
    """출하 요청 생성 전체를 원자적으로 확정한다."""
    actor = shipping_svc._require_actor(actor)
    payload = {**payload, "requested_by_name": actor.name}
    with transactional(db):
        return shipping_svc._create_request(db, payload, actor)


def update_request(
    db: Session,
    request_id: uuid.UUID,
    payload: dict,
    actor: Employee,
) -> ShippingRequest:
    """출하 요청과 구성 변경 전체를 원자적으로 확정한다."""
    with transactional(db):
        _lock_request(db, request_id)
        return shipping_svc._update_request(db, request_id, payload, actor)


def delete_request(
    db: Session,
    request_id: uuid.UUID,
    actor: Employee,
) -> None:
    """취소 가능한 출하 요청 삭제를 원자적으로 확정한다."""
    with transactional(db):
        _lock_request(db, request_id)
        shipping_svc._delete_request(db, request_id, actor)


def update_invoice(
    db: Session,
    request_id: uuid.UUID,
    invoice_number: str | None,
    actor: Employee,
) -> ShippingRequest:
    with transactional(db):
        _lock_request(db, request_id)
        return shipping_svc._update_invoice(db, request_id, invoice_number, actor)


def update_checklist(
    db: Session,
    request_id: uuid.UUID,
    checks: dict[uuid.UUID, bool],
    actor: Employee,
) -> ShippingRequest:
    """체크리스트 변경을 원자적으로 확정한다."""
    with transactional(db):
        shipping_svc._require_actor(actor)
        _lock_request(db, request_id)
        return shipping_svc._update_checklist(db, request_id, checks)


def clear_checklist(db: Session, request_id: uuid.UUID, actor: Employee) -> ShippingRequest:
    """체크리스트 전체 해제를 원자적으로 확정한다."""
    with transactional(db):
        shipping_svc._require_actor(actor)
        _lock_request(db, request_id)
        return shipping_svc._clear_checklist(db, request_id)


def component_change_preview(
    db: Session,
    request_id: uuid.UUID,
    source_pa_item_id: uuid.UUID,
    quantity: int,
    requested_mode: str | None = "BOM",
    *,
    actor: Employee,
) -> dict:
    """요청 구성품 preview가 검증된 현재 작업자만 통과하도록 한다."""
    shipping_svc._require_actor(actor)
    return shipping_svc._component_change_preview(
        db,
        request_id,
        source_pa_item_id,
        quantity,
        requested_mode,
    )


def execute_component_change_independent(
    db: Session,
    source_pa_item_id: uuid.UUID,
    target_pa_item_id: uuid.UUID,
    quantity: int,
    memo: str | None = None,
    requested_mode: str | None = "BOM",
    *,
    actor: Employee,
) -> dict:
    """독립 품목 전환의 재고·원장을 원자적으로 확정한다."""
    with transactional(db):
        actor = shipping_svc._require_actor(actor)
        return shipping_svc._execute_component_change_independent(
            db,
            source_pa_item_id,
            target_pa_item_id,
            quantity,
            memo,
            requested_mode,
            requester_name=actor.name,
            requester_employee_id=actor.employee_id,
        )


def execute_component_change(
    db: Session,
    request_id: uuid.UUID,
    source_pa_item_id: uuid.UUID,
    quantity: int,
    requested_mode: str | None = "BOM",
    memo: str | None = None,
    *,
    actor: Employee,
) -> ShippingRequest:
    """요청 품목 전환의 재고·원장·이벤트를 원자적으로 확정한다."""
    with transactional(db):
        actor = shipping_svc._require_actor(actor)
        _lock_request(db, request_id)
        return shipping_svc._execute_component_change(
            db,
            request_id,
            source_pa_item_id,
            quantity,
            requested_mode,
            memo,
            actor=actor,
        )


def prepare_complete(
    db: Session,
    request_id: uuid.UUID,
    serial_numbers: str,
    *,
    actor: Employee,
) -> ShippingRequest:
    """준비 완료의 재고·원장·배정·상태를 원자적으로 확정한다."""
    with transactional(db):
        actor = shipping_svc._require_actor(actor)
        _lock_request(db, request_id)
        return shipping_svc._prepare_complete(
            db,
            request_id,
            serial_numbers,
            actor=actor,
        )


def prepare_cancel(
    db: Session,
    request_id: uuid.UUID,
    reason: str | None = None,
    *,
    actor: Employee,
) -> ShippingRequest:
    """준비 완료 취소의 재고 원복·원장·상태를 원자적으로 확정한다."""
    with transactional(db):
        actor = shipping_svc._require_actor(actor)
        _lock_request(db, request_id)
        return shipping_svc._prepare_cancel(db, request_id, reason, actor=actor)


def pickup_complete(db: Session, request_id: uuid.UUID, actor: Employee) -> ShippingRequest:
    """픽업의 재고·원장·배정·상태를 원자적으로 확정한다."""
    with transactional(db):
        actor = shipping_svc._require_actor(actor)
        _lock_request(db, request_id)
        return shipping_svc._pickup_complete(db, request_id, actor)


def pickup_cancel(db: Session, request_id: uuid.UUID, actor: Employee) -> ShippingRequest:
    """픽업 완료를 재고·원장·배정까지 원자적으로 되돌린다."""
    with transactional(db):
        actor = shipping_svc._require_actor(actor)
        _lock_request(db, request_id)
        return shipping_svc._pickup_cancel(db, request_id, actor=actor)


def prepare_complete_command(
    db: Session,
    request_id: uuid.UUID,
    serial_numbers: str,
    _legacy_companion_lines: list[dict[str, Any]],
    *,
    actor: Employee,
    client_request_id: uuid.UUID | None,
    expected_status: ShippingRequestStatusEnum | None,
    response_factory: ResponseFactory,
    expected_updated_at: datetime | None = None,
) -> ShippingCommandOutcome:
    normalized_serial_numbers = serial_numbers.strip()
    return _run_shipping_command(
        db,
        request_id=request_id,
        actor=actor,
        route=command_idempotency.SHIPPING_PREPARE_COMPLETE_ROUTE,
        command_kind="PREPARE_COMPLETE",
        expected_status=expected_status,
        expected_updated_at=expected_updated_at,
        client_request_id=client_request_id,
        semantic_payload={"serial_numbers": normalized_serial_numbers},
        operation_action="prepare",
        cancellation=False,
        execute=lambda operation_key: shipping_svc._prepare_complete(
            db,
            request_id,
            normalized_serial_numbers,
            actor=actor,
            command_idempotency_key=operation_key,
        ),
        response_factory=response_factory,
    )


def prepare_cancel_command(
    db: Session,
    request_id: uuid.UUID,
    reason: str | None,
    *,
    actor: Employee,
    client_request_id: uuid.UUID | None,
    expected_status: ShippingRequestStatusEnum | None,
    response_factory: ResponseFactory,
    expected_updated_at: datetime | None = None,
) -> ShippingCommandOutcome:
    normalized_reason = (reason or "").strip() or None
    return _run_shipping_command(
        db,
        request_id=request_id,
        actor=actor,
        route=command_idempotency.SHIPPING_PREPARE_CANCEL_ROUTE,
        command_kind="PREPARE_CANCEL",
        expected_status=expected_status,
        expected_updated_at=expected_updated_at,
        client_request_id=client_request_id,
        semantic_payload={"reason": normalized_reason},
        operation_action="prepare",
        cancellation=True,
        execute=lambda _operation_key: shipping_svc._prepare_cancel(
            db,
            request_id,
            normalized_reason,
            actor=actor,
        ),
        response_factory=response_factory,
    )


def pickup_complete_command(
    db: Session,
    request_id: uuid.UUID,
    *,
    actor: Employee,
    client_request_id: uuid.UUID | None,
    expected_status: ShippingRequestStatusEnum | None,
    response_factory: ResponseFactory,
    expected_updated_at: datetime | None = None,
) -> ShippingCommandOutcome:
    return _run_shipping_command(
        db,
        request_id=request_id,
        actor=actor,
        route=command_idempotency.SHIPPING_PICKUP_COMPLETE_ROUTE,
        command_kind="PICKUP_COMPLETE",
        expected_status=expected_status,
        expected_updated_at=expected_updated_at,
        client_request_id=client_request_id,
        semantic_payload={},
        operation_action="pickup",
        cancellation=False,
        execute=lambda operation_key: shipping_svc._pickup_complete(
            db,
            request_id,
            actor,
            command_idempotency_key=operation_key,
        ),
        response_factory=response_factory,
    )


def pickup_cancel_command(
    db: Session,
    request_id: uuid.UUID,
    *,
    actor: Employee,
    client_request_id: uuid.UUID | None,
    expected_status: ShippingRequestStatusEnum | None,
    response_factory: ResponseFactory,
    expected_updated_at: datetime | None = None,
) -> ShippingCommandOutcome:
    return _run_shipping_command(
        db,
        request_id=request_id,
        actor=actor,
        route=command_idempotency.SHIPPING_PICKUP_CANCEL_ROUTE,
        command_kind="PICKUP_CANCEL",
        expected_status=expected_status,
        expected_updated_at=expected_updated_at,
        client_request_id=client_request_id,
        semantic_payload={},
        operation_action="pickup",
        cancellation=True,
        execute=lambda _operation_key: shipping_svc._pickup_cancel(
            db,
            request_id,
            actor=actor,
        ),
        response_factory=response_factory,
    )
