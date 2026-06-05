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
from app.services.dept_hierarchy import can_approve_department
from app.services.pin_auth import verify_pin

_FROM_DEPARTMENT = "튜브"


def can_receive(actor: Employee, to_department: str) -> bool:
    """인수 확인 권한 — 받는 부서 소속이거나, 그 부서 결재 권한자."""
    if (actor.department or "").strip() == (to_department or "").strip():
        return True
    return can_approve_department(actor, to_department)


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


def receive_handover(db: Session, doc: HandoverDoc, *, actor: Employee, pin: str) -> HandoverDoc:
    """인수 확인 — PIN + 인수부서 권한 검증 후 재고 이동(튜브→인수부서)."""
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
            )
        )

    doc.status = HandoverStatusEnum.RECEIVED
    doc.received_by_employee_id = actor.employee_id
    doc.received_by_name = actor.name
    doc.received_at = datetime.utcnow()
    db.flush()
    return doc
