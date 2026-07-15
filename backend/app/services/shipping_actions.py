"""출하 HTTP 업무 명령의 트랜잭션 경계."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models import ShippingRequest
from app.services import shipping as shipping_svc
from app.services._tx import transactional


def create_request(db: Session, payload: dict) -> ShippingRequest:
    """출하 요청 생성 전체를 원자적으로 확정한다."""
    with transactional(db):
        return shipping_svc.create_request(db, payload)


def update_request(db: Session, request_id: uuid.UUID, payload: dict) -> ShippingRequest:
    """출하 요청과 구성 변경 전체를 원자적으로 확정한다."""
    with transactional(db):
        return shipping_svc.update_request(db, request_id, payload)


def delete_request(db: Session, request_id: uuid.UUID) -> None:
    """취소 가능한 출하 요청 삭제를 원자적으로 확정한다."""
    with transactional(db):
        shipping_svc.delete_request(db, request_id)


def send_to_prep(db: Session, request_id: uuid.UUID) -> ShippingRequest:
    """준비 전환과 체크리스트·이벤트 변경을 원자적으로 확정한다."""
    with transactional(db):
        return shipping_svc.send_to_prep(db, request_id)


def update_checklist(
    db: Session,
    request_id: uuid.UUID,
    checks: dict[uuid.UUID, bool],
) -> ShippingRequest:
    """체크리스트 변경을 원자적으로 확정한다."""
    with transactional(db):
        return shipping_svc.update_checklist(db, request_id, checks)


def clear_checklist(db: Session, request_id: uuid.UUID) -> ShippingRequest:
    """체크리스트 전체 해제를 원자적으로 확정한다."""
    with transactional(db):
        return shipping_svc.clear_checklist(db, request_id)


def execute_component_change_independent(
    db: Session,
    source_pa_item_id: uuid.UUID,
    target_pa_item_id: uuid.UUID,
    quantity: int,
    memo: str | None = None,
    requested_mode: str | None = "BOM",
    requester_name: str | None = None,
    requester_employee_id: uuid.UUID | None = None,
) -> dict:
    """독립 품목 전환의 재고·원장을 원자적으로 확정한다."""
    with transactional(db):
        return shipping_svc.execute_component_change_independent(
            db,
            source_pa_item_id,
            target_pa_item_id,
            quantity,
            memo,
            requested_mode,
            requester_name=requester_name,
            requester_employee_id=requester_employee_id,
        )


def execute_component_change(
    db: Session,
    request_id: uuid.UUID,
    source_pa_item_id: uuid.UUID,
    quantity: int,
    requested_mode: str | None = "BOM",
    memo: str | None = None,
    requester_name: str | None = None,
    requester_employee_id: uuid.UUID | None = None,
) -> ShippingRequest:
    """요청 품목 전환의 재고·원장·이벤트를 원자적으로 확정한다."""
    with transactional(db):
        return shipping_svc.execute_component_change(
            db,
            request_id,
            source_pa_item_id,
            quantity,
            requested_mode,
            memo,
            requester_name=requester_name,
            requester_employee_id=requester_employee_id,
        )


def prepare_complete(db: Session, request_id: uuid.UUID) -> ShippingRequest:
    """준비 완료의 재고·원장·배정·상태를 원자적으로 확정한다."""
    with transactional(db):
        return shipping_svc.prepare_complete(db, request_id)


def prepare_cancel(
    db: Session,
    request_id: uuid.UUID,
    reason: str | None = None,
) -> ShippingRequest:
    """준비 완료 취소의 재고 원복·원장·상태를 원자적으로 확정한다."""
    with transactional(db):
        return shipping_svc.prepare_cancel(db, request_id, reason)


def pickup_complete(db: Session, request_id: uuid.UUID) -> ShippingRequest:
    """픽업의 재고·원장·배정·상태를 원자적으로 확정한다."""
    with transactional(db):
        return shipping_svc.pickup_complete(db, request_id)
