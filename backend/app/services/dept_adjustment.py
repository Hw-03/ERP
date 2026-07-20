"""부서 재고 조정 서비스 — 생산/조립·분해/회수·수량 보정.

처리 정책:
- 부서 PRODUCTION 재고끼리만 움직임 (즉시 처리, 창고 승인 불필요).
- 원자성: 공개 업무 명령이 commit/rollback하고, 내부 재고 primitive는 flush만 수행.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Literal, Optional

from sqlalchemy.orm import Session

from app.models import (
    BOM,
    DepartmentEnum,
    DeptAdjSubTypeEnum,
    Inventory,
    Item,
    LocationStatusEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.database import _is_sqlite
from app.services import inventory as inventory_svc
from app.services import inv_effect
from app.services._tx import transactional
from app.repositories import item_repository

AdjDirection = Literal["in", "out", "defective"]


@dataclass
class AdjLine:
    item_id: uuid.UUID
    direction: AdjDirection
    quantity: Decimal
    department: DepartmentEnum
    reason: Optional[str] = None
    bom_expected: Optional[Decimal] = None
    has_children: bool = False
    item_name: str = ""
    mes_code: Optional[str] = None
    process_type_code: Optional[str] = None
    unit: str = "EA"


def _dept_for_item(item: Item) -> DepartmentEnum:
    """품목의 process_type_code로 기본 부서 결정. None이면 조립 폴백."""
    dept = inventory_svc.dept_for_process_type(item.process_type_code)
    return dept if dept is not None else DepartmentEnum.ASSEMBLY


def _has_bom_children(db: Session, item_id: uuid.UUID) -> bool:
    return db.query(BOM).filter(BOM.parent_item_id == item_id).limit(1).first() is not None


def _enrich(db: Session, lines: list[AdjLine]) -> list[AdjLine]:
    """Item 정보를 lines에 채운다."""
    if not lines:
        return lines
    ids = list({ln.item_id for ln in lines})
    items_map: dict[uuid.UUID, Item] = {
        i.item_id: i
        for i in db.query(Item).filter(Item.item_id.in_(ids)).all()
    }
    for ln in lines:
        item = items_map.get(ln.item_id)
        if item:
            ln.item_name = item.item_name
            ln.mes_code = item.mes_code
            ln.process_type_code = item.process_type_code
            ln.unit = item.unit
            ln.has_children = _has_bom_children(db, ln.item_id)
    return lines


# ---------------------------------------------------------------------------
# BOM 템플릿 빌더
# ---------------------------------------------------------------------------


def build_production_template(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    *,
    base_dept: Optional[DepartmentEnum] = None,
) -> list[AdjLine]:
    """생산/조립용 초기 라인 세트 반환.

    결과품: direction="in", 마지막 라인.
    BOM 직계 구성품: direction="out".
    """
    item = item_repository.get(db, item_id)
    if item is None:
        raise ValueError(f"품목을 찾을 수 없습니다: {item_id}")

    result_dept = base_dept or _dept_for_item(item)
    bom_rows = db.query(BOM).filter(BOM.parent_item_id == item_id).all()

    lines: list[AdjLine] = []
    for row in bom_rows:
        child = item_repository.get(db, row.child_item_id)
        child_dept = base_dept or (_dept_for_item(child) if child else result_dept)
        lines.append(AdjLine(
            item_id=row.child_item_id,
            direction="out",
            quantity=Decimal(str(row.quantity)) * qty,
            department=child_dept,
            bom_expected=Decimal(str(row.quantity)) * qty,
        ))

    lines.append(AdjLine(
        item_id=item_id,
        direction="in",
        quantity=qty,
        department=result_dept,
    ))

    return _enrich(db, lines)


def build_disassembly_template(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    *,
    base_dept: Optional[DepartmentEnum] = None,
) -> list[AdjLine]:
    """분해/회수용 초기 라인 세트 반환.

    분해 대상품: direction="out".
    BOM 직계 구성품: direction="in" (사용자가 in/defective/scrap으로 변경 가능).
    """
    item = item_repository.get(db, item_id)
    if item is None:
        raise ValueError(f"품목을 찾을 수 없습니다: {item_id}")

    target_dept = base_dept or _dept_for_item(item)
    bom_rows = db.query(BOM).filter(BOM.parent_item_id == item_id).all()

    lines: list[AdjLine] = [
        AdjLine(
            item_id=item_id,
            direction="out",
            quantity=qty,
            department=target_dept,
        )
    ]

    for row in bom_rows:
        child = item_repository.get(db, row.child_item_id)
        child_dept = base_dept or (_dept_for_item(child) if child else target_dept)
        lines.append(AdjLine(
            item_id=row.child_item_id,
            direction="in",
            quantity=Decimal(str(row.quantity)) * qty,
            department=child_dept,
            bom_expected=Decimal(str(row.quantity)) * qty,
        ))

    return _enrich(db, lines)


def expand_component(
    db: Session,
    item_id: uuid.UUID,
    qty: Decimal,
    department: DepartmentEnum,
    direction: Literal["in", "out"] = "out",
) -> list[AdjLine]:
    """중간공정품 1단계 선택 전개 — 직계 자식 라인 반환."""
    bom_rows = db.query(BOM).filter(BOM.parent_item_id == item_id).all()
    if not bom_rows:
        raise ValueError(f"BOM 구성품이 없는 품목입니다.")

    lines = [
        AdjLine(
            item_id=row.child_item_id,
            direction=direction,
            quantity=Decimal(str(row.quantity)) * qty,
            department=department,
            bom_expected=Decimal(str(row.quantity)) * qty,
        )
        for row in bom_rows
    ]
    return _enrich(db, lines)


# ---------------------------------------------------------------------------
# 제출 처리
# ---------------------------------------------------------------------------

_TRANSACTION_TYPE_MAP: dict[tuple[AdjDirection, str], TransactionTypeEnum] = {
    ("out", "production"):  TransactionTypeEnum.BACKFLUSH,
    ("out", "disassembly"): TransactionTypeEnum.DISASSEMBLE,
    ("out", "correction"):  TransactionTypeEnum.ADJUST,
    ("in",  "production"):  TransactionTypeEnum.PRODUCE,
    ("in",  "disassembly"): TransactionTypeEnum.RECEIVE,
    ("in",  "correction"):  TransactionTypeEnum.ADJUST,
    ("defective", "production"):  TransactionTypeEnum.MARK_DEFECTIVE,
    ("defective", "disassembly"): TransactionTypeEnum.MARK_DEFECTIVE,
    ("defective", "correction"):  TransactionTypeEnum.MARK_DEFECTIVE,
}


def _apply_adjustment(
    db: Session,
    sub_type: DeptAdjSubTypeEnum,
    lines: list[AdjLine],
    *,
    operator_name: Optional[str] = None,
    producer_employee_id: Optional[uuid.UUID] = None,
    reference_no: Optional[str] = None,
    notes: Optional[str] = None,
) -> list[uuid.UUID]:
    """부서 재고 조정과 원장 생성을 현재 트랜잭션에 적용한다.

    처리 순서: out → defective → in  (소비 먼저, 입고 마지막).
    """
    if not lines:
        raise ValueError("처리할 라인이 없습니다.")

    # 정렬된 순서로 모든 아이템 선락 → 교착 방지
    if not _is_sqlite:
        all_item_ids = sorted({ln.item_id for ln in lines})
        inventory_svc.lock_inventories(db, all_item_ids)

    sub_str = sub_type.value
    ordered = (
        [ln for ln in lines if ln.direction == "out"]
        + [ln for ln in lines if ln.direction == "defective"]
        + [ln for ln in lines if ln.direction == "in"]
    )

    log_ids: list[uuid.UUID] = []

    for ln in ordered:
        dept_enum = ln.department
        qty = ln.quantity
        tag = f"[dept_adj:{sub_str}]"
        op_str = operator_name or ""
        reason_str = ln.reason or notes or ""
        log_notes = f"{tag} {op_str}: {reason_str}".strip(": ").strip()

        tx_type = _TRANSACTION_TYPE_MAP[(ln.direction, sub_str)]
        cells_before = inv_effect.snapshot_cells(db, ln.item_id)

        if ln.direction == "out":
            inv = inventory_svc.consume_from_department(db, ln.item_id, qty, dept_enum)
            qty_before = (inv.quantity or Decimal("0")) + qty

        elif ln.direction == "in":
            inv = inventory_svc.receive_confirmed(
                db, ln.item_id, qty, bucket="production", dept=dept_enum
            )
            qty_before = (inv.quantity or Decimal("0")) - qty

        elif ln.direction == "defective":
            inv = inventory_svc.mark_defective(
                db, ln.item_id, qty,
                inventory_svc.DefectSource(
                    kind="production",
                    source_dept=dept_enum,
                    target_dept=dept_enum,
                ),
            )
            qty_before = inv.quantity or Decimal("0")

        log = TransactionLog(
            item_id=ln.item_id,
            transaction_type=tx_type,
            quantity_change=(qty if ln.direction == "in" else -qty),
            quantity_before=qty_before,
            quantity_after=inv.quantity,
            reference_no=reference_no,
            produced_by=operator_name,
            producer_employee_id=producer_employee_id,
            notes=log_notes or None,
            department=dept_enum.value,
            inventory_effect=inv_effect.capture_effect(db, ln.item_id, cells_before),
        )
        db.add(log)
        db.flush()
        log_ids.append(log.log_id)

    return log_ids


def submit_adjustment(
    db: Session,
    sub_type: DeptAdjSubTypeEnum,
    lines: list[AdjLine],
    *,
    operator_name: Optional[str] = None,
    producer_employee_id: Optional[uuid.UUID] = None,
    reference_no: Optional[str] = None,
    notes: Optional[str] = None,
) -> list[uuid.UUID]:
    """부서 재고 조정과 원장을 하나의 업무 트랜잭션으로 확정한다."""
    with transactional(db):
        return _apply_adjustment(
            db,
            sub_type,
            lines,
            operator_name=operator_name,
            producer_employee_id=producer_employee_id,
            reference_no=reference_no,
            notes=notes,
        )


# ---------------------------------------------------------------------------
# 불량 분해 처리
# ---------------------------------------------------------------------------


def _rework_dept_for_item(db: Session, item_id: uuid.UUID, fallback: DepartmentEnum) -> DepartmentEnum:
    item = db.query(Item).filter(Item.item_id == item_id).first()
    code = (item.process_type_code or "").strip().upper() if item else ""
    prefix_map = {
        "T": DepartmentEnum.TUBE,
        "H": DepartmentEnum.HIGH_VOLTAGE,
        "V": DepartmentEnum.VACUUM,
        "N": DepartmentEnum.TUNING,
        "A": DepartmentEnum.ASSEMBLY,
        "P": DepartmentEnum.SHIPPING,
    }
    return prefix_map.get(code[:1], fallback)


def _split_rework_quantities(decision: dict, qty: Decimal) -> tuple[Decimal, Decimal, Decimal]:
    has_three_way = any(k in decision for k in ("normal_qty", "defective_qty", "scrap_qty"))
    if has_three_way:
        normal_qty = Decimal(str(decision.get("normal_qty", "0") or "0"))
        defective_qty = Decimal(str(decision.get("defective_qty", "0") or "0"))
        scrap_qty = Decimal(str(decision.get("scrap_qty", "0") or "0"))
    elif "keep_qty" in decision:
        normal_qty = Decimal(str(decision["keep_qty"] or "0"))
        defective_qty = qty - normal_qty
        scrap_qty = Decimal("0")
    elif decision.get("action") == "keep":
        normal_qty = qty
        defective_qty = Decimal("0")
        scrap_qty = Decimal("0")
    elif decision.get("action") == "scrap":
        normal_qty = Decimal("0")
        defective_qty = qty
        scrap_qty = Decimal("0")
    else:
        raise ValueError(f"자식 결정에 normal_qty/defective_qty/scrap_qty 또는 keep_qty/action 이 필요합니다: {decision}")

    if normal_qty < 0 or defective_qty < 0 or scrap_qty < 0:
        raise ValueError(f"재작업 수량은 음수일 수 없습니다: {decision}")
    if normal_qty + defective_qty + scrap_qty != qty:
        raise ValueError(
            f"재작업 수량 합계({normal_qty + defective_qty + scrap_qty})가 총 수량({qty})과 다릅니다: {decision}"
        )
    return normal_qty, defective_qty, scrap_qty


def _submit_rework_disassemble(
    db: Session,
    parent_item_id: uuid.UUID,
    parent_qty: Decimal,
    parent_dept: DepartmentEnum,
    child_decisions: list[dict],
    *,
    parent_source: str,
    normal_source_kind: str | None = None,
    reason_category: str,
    reason_memo: str,
    actor: str,
    actor_employee_id: Optional[uuid.UUID] = None,
) -> dict:
    if parent_qty <= 0:
        raise ValueError("재작업 수량은 0보다 커야 합니다.")
    if not child_decisions:
        raise ValueError("자식 결정이 비어 있습니다.")

    batch_id = uuid.uuid4()
    batch_ref = f"defect-disassemble:{batch_id}"
    parent_dept_value = getattr(parent_dept, "value", parent_dept)
    reason = inventory_svc.ReasonContext(
        category=reason_category,
        memo=reason_memo,
        actor=actor,
    )

    parent_cells_before = inv_effect.snapshot_cells(db, parent_item_id)
    if parent_source == "defective":
        parent_inv = inventory_svc.scrap_defective(
            db, parent_item_id, parent_qty, parent_dept, reason
        )
    elif parent_source == "normal":
        source_kind = normal_source_kind or "production"
        parent_inv = inventory_svc.scrap_normal(
            db,
            parent_item_id,
            parent_qty,
            inventory_svc.NormalSource(kind=source_kind, dept_or_warehouse=parent_dept),
            reason,
        )
    else:
        raise ValueError(f"알 수 없는 재작업 부모 출처: {parent_source}")

    qty_before_parent = (parent_inv.quantity or Decimal("0")) + parent_qty
    parent_note = "[rework:normal]" if parent_source == "normal" else "[rework:defective]"
    if reason_memo:
        parent_note += f" {reason_memo}"
    parent_log = TransactionLog(
        item_id=parent_item_id,
        transaction_type=TransactionTypeEnum.DISASSEMBLE,
        quantity_change=-parent_qty,
        quantity_before=qty_before_parent,
        quantity_after=parent_inv.quantity,
        produced_by=actor,
        producer_employee_id=actor_employee_id,
        notes=parent_note,
        reason_category=reason_category,
        reason_memo=reason_memo,
        reference_no=batch_ref,
        department=parent_dept_value,
        inventory_effect=inv_effect.capture_effect(db, parent_item_id, parent_cells_before),
    )
    db.add(parent_log)
    db.flush()

    child_log_ids: list[uuid.UUID] = []
    _MAX_DEPTH = 10

    def process(decision: dict, depth: int) -> None:
        if depth > _MAX_DEPTH:
            raise ValueError(f"분해 트리 깊이 한도 초과(>{_MAX_DEPTH}): {decision.get('item_id')}")
        item_id = uuid.UUID(str(decision["item_id"]))
        qty = Decimal(str(decision.get("qty", parent_qty)))
        children = decision.get("children")
        if children:
            for child in children:
                process(child, depth + 1)
            return

        normal_qty, defective_qty, scrap_qty = _split_rework_quantities(decision, qty)
        child_dept = _rework_dept_for_item(db, item_id, parent_dept)
        child_dept_value = getattr(child_dept, "value", child_dept)
        child_note = decision.get("reason_memo") or reason_memo or ""

        if normal_qty > 0:
            cells_before = inv_effect.snapshot_cells(db, item_id)
            child_inv = inventory_svc.receive_confirmed(
                db, item_id, normal_qty,
                bucket="production",
                dept=child_dept,
            )
            qty_before_child = (child_inv.quantity or Decimal("0")) - normal_qty
            log = TransactionLog(
                item_id=item_id,
                transaction_type=TransactionTypeEnum.RECEIVE,
                quantity_change=normal_qty,
                quantity_before=qty_before_child,
                quantity_after=child_inv.quantity,
                produced_by=actor,
                producer_employee_id=actor_employee_id,
                notes="[rework:normal_child]",
                reason_category=reason_category,
                reason_memo=child_note or None,
                reference_no=batch_ref,
                department=child_dept_value,
                inventory_effect=inv_effect.capture_effect(db, item_id, cells_before),
            )
            db.add(log)
            db.flush()
            child_log_ids.append(log.log_id)

        if defective_qty > 0:
            cells_before = inv_effect.snapshot_cells(db, item_id)
            child_inv = inventory_svc.receive_defective(
                db,
                item_id,
                defective_qty,
                child_dept,
                inventory_svc.ReasonContext(
                    category=reason_category,
                    memo=child_note or reason_memo,
                    actor=actor,
                ),
            )
            qty_before_child = (child_inv.quantity or Decimal("0")) - defective_qty
            log = TransactionLog(
                item_id=item_id,
                transaction_type=TransactionTypeEnum.MARK_DEFECTIVE,
                quantity_change=defective_qty,
                quantity_before=qty_before_child,
                quantity_after=child_inv.quantity,
                produced_by=actor,
                producer_employee_id=actor_employee_id,
                notes="[rework:defective_child]",
                reason_category=reason_category,
                reason_memo=child_note or None,
                reference_no=batch_ref,
                department=child_dept_value,
                inventory_effect=inv_effect.capture_effect(db, item_id, cells_before),
            )
            db.add(log)
            db.flush()
            child_log_ids.append(log.log_id)

        if scrap_qty > 0:
            cells_before = inv_effect.snapshot_cells(db, item_id)
            child_inv = inventory_svc.get_or_create_inventory(db, item_id)
            log = TransactionLog(
                item_id=item_id,
                transaction_type=TransactionTypeEnum.DEFECT_SCRAP,
                quantity_change=-scrap_qty,
                quantity_before=(child_inv.quantity or Decimal("0")) + scrap_qty,
                quantity_after=child_inv.quantity,
                produced_by=actor,
                producer_employee_id=actor_employee_id,
                notes="[rework:scrap_child]",
                reason_category=reason_category,
                reason_memo=child_note or None,
                reference_no=batch_ref,
                department=child_dept_value,
                inventory_effect=inv_effect.capture_effect(db, item_id, cells_before),
            )
            db.add(log)
            db.flush()
            child_log_ids.append(log.log_id)

    for decision in child_decisions:
        process(decision, depth=1)

    return {
        "batch_id": str(batch_id),
        "batch_ref": batch_ref,
        "parent_log_id": parent_log.log_id,
        "child_log_ids": child_log_ids,
    }


def submit_defective_disassemble(
    db: Session,
    parent_item_id: uuid.UUID,
    parent_qty: Decimal,
    parent_dept: DepartmentEnum,
    child_decisions: list[dict],
    *,
    reason_category: str,
    reason_memo: str,
    actor: str,
    actor_employee_id: Optional[uuid.UUID] = None,
) -> dict:
    """격리 품목 재작업: 부모 DEFECTIVE 차감 후 하위 정상/격리/폐기 3분할."""
    return _submit_rework_disassemble(
        db,
        parent_item_id,
        parent_qty,
        parent_dept,
        child_decisions,
        parent_source="defective",
        reason_category=reason_category,
        reason_memo=reason_memo,
        actor=actor,
        actor_employee_id=actor_employee_id,
    )


def submit_normal_disassemble(
    db: Session,
    parent_item_id: uuid.UUID,
    parent_qty: Decimal,
    source_kind: str,
    source_dept: DepartmentEnum,
    child_decisions: list[dict],
    *,
    reason_category: str,
    reason_memo: str,
    actor: str,
    actor_employee_id: Optional[uuid.UUID] = None,
) -> dict:
    """정상 품목 바로 재작업: 부모 정상 재고 차감 후 하위 정상/격리/폐기 3분할."""
    return _submit_rework_disassemble(
        db,
        parent_item_id,
        parent_qty,
        source_dept,
        child_decisions,
        parent_source="normal",
        normal_source_kind=source_kind,
        reason_category=reason_category,
        reason_memo=reason_memo,
        actor=actor,
        actor_employee_id=actor_employee_id,
    )
