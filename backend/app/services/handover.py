"""인수인계서 서비스 — 작성(=제출) / 인수 확인.

작성은 1차 범위에서 작성→제출을 한 번에 처리(status=submitted). 인수 확인 시
PIN 검증 + 인수부서 권한 확인 후, 품목 수량만큼 튜브→인수부서 PRODUCTION 이동
(transfer_between_departments) + TRANSFER_DEPT 로그 + status=received.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import (
    DepartmentEnum,
    Employee,
    HandoverDoc,
    HandoverLine,
    HandoverStatusEnum,
    Item,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services import inventory as inventory_svc
from app.services import inv_effect
from app.services.pin_auth import verify_pin
from app.services._tx import transactional

_FROM_DEPARTMENT = "튜브"


def can_receive(actor: Employee, to_department: str) -> bool:
    """인수 확인 권한 — 받는 부서 소속만(고압/진공). 현장 물리 인수 행위이므로 결재권자는 제외."""
    return (actor.department or "").strip() == (to_department or "").strip()


def _gen_code() -> str:
    now = datetime.utcnow()
    return f"HO-{now:%Y%m%d-%H%M%S}-{uuid.uuid4().hex[:6]}"


def create_handover(db: Session, *, author: Employee, payload) -> HandoverDoc:
    """인수인계서 작성 + 제출(status=submitted)."""
    if not payload.lines:
        raise ValueError("인수인계 품목을 1개 이상 추가하세요.")
    if payload.to_department == _FROM_DEPARTMENT:
        raise ValueError("인수 부서는 튜브가 아니어야 합니다.")

    item_ids = [ln.item_id for ln in payload.lines]
    items = {i.item_id: i for i in db.query(Item).filter(Item.item_id.in_(item_ids)).all()}

    doc = HandoverDoc(
        handover_code=_gen_code(),
        status=HandoverStatusEnum.SUBMITTED,
        author_employee_id=author.employee_id,
        author_name=author.name,
        from_department=_FROM_DEPARTMENT,
        to_department=payload.to_department,
        title=payload.title,
        process_content=payload.process_content,
        product_name=payload.product_name,
        doc_date=payload.doc_date,
        analysis_text=payload.analysis_text,
        notes=payload.notes,
    )
    db.add(doc)
    db.flush()

    for ln in payload.lines:
        item = items.get(ln.item_id)
        if item is None:
            raise ValueError(f"품목을 찾을 수 없습니다: {ln.item_id}")
        db.add(
            HandoverLine(
                handover_id=doc.handover_id,
                item_id=ln.item_id,
                item_name_snapshot=item.item_name,
                mes_code_snapshot=item.mes_code,
                quantity=ln.quantity,
            )
        )
    db.flush()
    db.refresh(doc)
    return doc


def _apply_doc_fields(doc: HandoverDoc, payload) -> None:
    """양식 필드를 문서에 반영 (title 은 NOT NULL — 빈 값이면 임시 라벨)."""
    doc.to_department = payload.to_department
    doc.title = payload.title or "(작성 중)"
    doc.process_content = payload.process_content
    doc.product_name = payload.product_name
    doc.doc_date = payload.doc_date
    doc.analysis_text = payload.analysis_text
    doc.notes = payload.notes


def _replace_lines(db: Session, doc: HandoverDoc, payload_lines) -> None:
    """기존 라인 전부 제거 후 payload 라인으로 재생성 (draft 갱신용)."""
    for ln in list(doc.lines):
        db.delete(ln)
    db.flush()
    if not payload_lines:
        return
    item_ids = [ln.item_id for ln in payload_lines]
    items = {i.item_id: i for i in db.query(Item).filter(Item.item_id.in_(item_ids)).all()}
    for ln in payload_lines:
        item = items.get(ln.item_id)
        if item is None:
            raise ValueError(f"품목을 찾을 수 없습니다: {ln.item_id}")
        db.add(
            HandoverLine(
                handover_id=doc.handover_id,
                item_id=ln.item_id,
                item_name_snapshot=item.item_name,
                mes_code_snapshot=item.mes_code,
                quantity=ln.quantity,
            )
        )


def save_handover_draft(db: Session, *, author: Employee, payload) -> HandoverDoc:
    """인수인계 임시저장 — 신규 draft 생성 또는 본인 기존 draft 갱신(status=DRAFT 유지)."""
    if not payload.to_department:
        raise ValueError("인수 부서를 먼저 선택하세요.")
    if payload.to_department == _FROM_DEPARTMENT:
        raise ValueError("인수 부서는 튜브가 아니어야 합니다.")

    if payload.handover_id is not None:
        doc = (
            db.query(HandoverDoc)
            .filter(HandoverDoc.handover_id == payload.handover_id)
            .first()
        )
        if doc is None:
            raise ValueError("임시저장 문서를 찾을 수 없습니다.")
        if doc.author_employee_id != author.employee_id:
            raise PermissionError("본인이 작성한 임시저장만 수정할 수 있습니다.")
        if doc.status != HandoverStatusEnum.DRAFT:
            raise ValueError("이미 제출된 문서는 임시저장으로 수정할 수 없습니다.")
    else:
        doc = HandoverDoc(
            handover_code=_gen_code(),
            status=HandoverStatusEnum.DRAFT,
            author_employee_id=author.employee_id,
            author_name=author.name,
            from_department=_FROM_DEPARTMENT,
            to_department=payload.to_department,
            title=payload.title or "(작성 중)",
        )
        db.add(doc)
        db.flush()

    _apply_doc_fields(doc, payload)
    _replace_lines(db, doc, payload.lines)
    db.flush()
    db.refresh(doc)
    return doc


def submit_handover(db: Session, doc: HandoverDoc, *, author: Employee) -> HandoverDoc:
    """임시저장(DRAFT) → 제출(SUBMITTED). 제출 필수값 검증."""
    if doc.author_employee_id != author.employee_id:
        raise PermissionError("본인이 작성한 문서만 제출할 수 있습니다.")
    if doc.status == HandoverStatusEnum.SUBMITTED:
        return doc  # 멱등
    if doc.status != HandoverStatusEnum.DRAFT:
        raise ValueError("임시저장 상태만 제출할 수 있습니다.")
    if not doc.lines:
        raise ValueError("인수인계 품목을 1개 이상 추가하세요.")
    if not doc.title or doc.title == "(작성 중)":
        raise ValueError("제목을 입력하세요.")
    doc.status = HandoverStatusEnum.SUBMITTED
    db.flush()
    db.refresh(doc)
    return doc


def _receive_handover(db: Session, doc: HandoverDoc, *, actor: Employee, pin: str) -> HandoverDoc:
    """인수 확인 변경을 현재 트랜잭션에 적용한다."""
    if doc.status == HandoverStatusEnum.RECEIVED:
        return doc  # 멱등 — 이중 이동 방지
    if doc.status != HandoverStatusEnum.SUBMITTED:
        raise ValueError("제출된 인수인계서만 인수할 수 있습니다.")
    if not verify_pin(actor.pin_hash, pin):
        raise PermissionError("PIN이 올바르지 않습니다.")
    if not can_receive(actor, doc.to_department):
        raise PermissionError("해당 부서의 인수 확인 권한이 없습니다.")

    from_dept = DepartmentEnum(doc.from_department)
    to_dept = DepartmentEnum(doc.to_department)

    for line in doc.lines:
        qty = Decimal(line.quantity)
        inv = inventory_svc.get_or_create_inventory(db, line.item_id)
        qty_before = inv.quantity or Decimal("0")
        cells_before = inv_effect.snapshot_cells(db, line.item_id)
        # 튜브 PRODUCTION 부족 시 ValueError → 라우터가 422 변환(상태 불변).
        inventory_svc.transfer_between_departments(db, line.item_id, qty, from_dept, to_dept)
        db.add(
            TransactionLog(
                item_id=line.item_id,
                transaction_type=TransactionTypeEnum.TRANSFER_DEPT,
                quantity_change=Decimal("0"),
                quantity_before=qty_before,
                quantity_after=inv.quantity,
                transfer_qty=qty,
                produced_by=actor.name,
                producer_employee_id=actor.employee_id,
                department=doc.to_department,
                reference_no=doc.handover_code,
                notes=f"인수인계 {doc.from_department}→{doc.to_department}",
                inventory_effect=inv_effect.capture_effect(db, line.item_id, cells_before),
            )
        )

    doc.status = HandoverStatusEnum.RECEIVED
    doc.received_by_employee_id = actor.employee_id
    doc.received_by_name = actor.name
    doc.received_at = datetime.utcnow()
    db.flush()
    return doc


def receive_handover(db: Session, doc: HandoverDoc, *, actor: Employee, pin: str) -> HandoverDoc:
    """PIN 검증, 재고 이동, 원장과 인수 상태를 원자적으로 확정한다."""
    with transactional(db):
        return _receive_handover(db, doc, actor=actor, pin=pin)
