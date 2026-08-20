"""출하 HTTP 업무 명령의 트랜잭션 경계."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models import Employee, ShippingRequest
from app.services import shipping as shipping_svc
from app.services._tx import transactional


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
        return shipping_svc._update_request(db, request_id, payload, actor)


def delete_request(
    db: Session,
    request_id: uuid.UUID,
    actor: Employee,
) -> None:
    """취소 가능한 출하 요청 삭제를 원자적으로 확정한다."""
    with transactional(db):
        shipping_svc._delete_request(db, request_id, actor)


def update_invoice(
    db: Session,
    request_id: uuid.UUID,
    invoice_number: str | None,
    actor: Employee,
) -> ShippingRequest:
    with transactional(db):
        return shipping_svc._update_invoice(db, request_id, invoice_number, actor)


def send_to_prep(db: Session, request_id: uuid.UUID, actor: Employee) -> ShippingRequest:
    """준비 전환과 체크리스트·이벤트 변경을 원자적으로 확정한다."""
    with transactional(db):
        actor = shipping_svc._require_actor(actor)
        return shipping_svc._send_to_prep(db, request_id, actor)


def update_checklist(
    db: Session,
    request_id: uuid.UUID,
    checks: dict[uuid.UUID, bool],
    actor: Employee,
) -> ShippingRequest:
    """체크리스트 변경을 원자적으로 확정한다."""
    with transactional(db):
        shipping_svc._require_actor(actor)
        return shipping_svc._update_checklist(db, request_id, checks)


def clear_checklist(db: Session, request_id: uuid.UUID, actor: Employee) -> ShippingRequest:
    """체크리스트 전체 해제를 원자적으로 확정한다."""
    with transactional(db):
        shipping_svc._require_actor(actor)
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
        return shipping_svc._prepare_cancel(db, request_id, reason, actor=actor)


def pickup_complete(db: Session, request_id: uuid.UUID, actor: Employee) -> ShippingRequest:
    """픽업의 재고·원장·배정·상태를 원자적으로 확정한다."""
    with transactional(db):
        actor = shipping_svc._require_actor(actor)
        return shipping_svc._pickup_complete(db, request_id, actor)


def pickup_cancel(db: Session, request_id: uuid.UUID, actor: Employee) -> ShippingRequest:
    """픽업 완료를 재고·원장·배정까지 원자적으로 되돌린다."""
    with transactional(db):
        actor = shipping_svc._require_actor(actor)
        return shipping_svc._pickup_cancel(db, request_id, actor)
