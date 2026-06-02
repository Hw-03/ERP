"""부서 재고 조정 서비스 — 생산/조립·분해/회수·수량 보정.

처리 정책:
- 부서 PRODUCTION 재고끼리만 움직임 (즉시 처리, 창고 승인 불필요).
- 원자성: db.flush()만 사용, commit은 라우터에서. ValueError 발생 시 라우터가 rollback.
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
    item = db.query(Item).filter(Item.item_id == item_id).first()
    if item is None:
        raise ValueError(f"품목을 찾을 수 없습니다: {item_id}")

    result_dept = base_dept or _dept_for_item(item)
    bom_rows = db.query(BOM).filter(BOM.parent_item_id == item_id).all()

    lines: list[AdjLine] = []
    for row in bom_rows:
        child = db.query(Item).filter(Item.item_id == row.child_item_id).first()
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
    item = db.query(Item).filter(Item.item_id == item_id).first()
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
        child = db.query(Item).filter(Item.item_id == row.child_item_id).first()
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


def submit_adjustment(
    db: Session,
    sub_type: DeptAdjSubTypeEnum,
    lines: list[AdjLine],
    *,
    operator_name: Optional[str] = None,
    reference_no: Optional[str] = None,
    notes: Optional[str] = None,
) -> list[uuid.UUID]:
    """부서 재고 조정 원자 처리. 생성된 TransactionLog ID 목록 반환.

    처리 순서: out → defective → in  (소비 먼저, 입고 마지막).
    db.flush()만 사용 — commit은 라우터에서.
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
                source="production",
                source_dept=dept_enum,
                target_dept=dept_enum,
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
            notes=log_notes or None,
        )
        db.add(log)
        db.flush()
        log_ids.append(log.log_id)

    return log_ids


# ---------------------------------------------------------------------------
# 불량 분해 처리
# ---------------------------------------------------------------------------


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
) -> dict:
    """격리(DEFECTIVE) 품목 분해 처리 — 재귀 트리 + 수량 분할 지원.

    child_decisions 형식 (재귀):
        leaf:    {"item_id": uuid, "qty": Decimal, "keep_qty": Decimal, "reason_memo": str|None}
        nested:  {"item_id": uuid, "qty": Decimal, "children": [<재귀>]}
        호환(legacy 1-depth): {"item_id": uuid, "action": "keep"|"scrap", "qty": Decimal, ...}

    의미:
    - leaf 노드: keep_qty 만큼 부서 PRODUCTION 입고 (RECEIVE), 나머지 (qty - keep_qty) 폐기 (DEFECT_SCRAP)
    - children 있는 노드: 자기 자체 정상/폐기 처리 안 함(분해됨), 자식들 재귀 처리

    처리 결과:
        - 부모: DEFECTIVE 차감 (DISASSEMBLE 트랜잭션)
        - 각 leaf 의 keep_qty>0 → RECEIVE 로그 + 재고 입고
        - 각 leaf 의 scrap_qty>0 → DEFECT_SCRAP 로그 (재고 변동 없음 — 부모에 내재)
        - 중간 노드(children 보유) → 트랜잭션 로그 없음, 자식만 처리

    모든 TransactionLog 에 동일 batch_ref 공유.
    """
    if parent_qty <= 0:
        raise ValueError("분해 수량은 0보다 커야 합니다.")
    if not reason_category:
        raise ValueError("reason_category 는 필수입니다.")
    if not child_decisions:
        raise ValueError("자식 결정이 비어 있습니다.")

    batch_id = uuid.uuid4()
    # TransactionLog.operation_batch_id 는 io_batches FK — 직접 사용 불가.
    # 대신 reference_no 에 batch_id 를 기록해 그룹 식별자로 활용한다.
    batch_ref = f"defect-disassemble:{batch_id}"

    # 1) 부모 DEFECTIVE 차감
    parent_inv = inventory_svc.scrap_defective(
        db, parent_item_id, parent_qty, parent_dept,
        reason_category=reason_category,
        reason_memo=reason_memo,
        actor=actor,
    )
    qty_before_parent = (parent_inv.quantity or Decimal("0")) + parent_qty

    parent_log = TransactionLog(
        item_id=parent_item_id,
        transaction_type=TransactionTypeEnum.DISASSEMBLE,
        quantity_change=-parent_qty,
        quantity_before=qty_before_parent,
        quantity_after=parent_inv.quantity,
        produced_by=actor,
        notes=None,
        reason_category=reason_category,
        reason_memo=reason_memo,
        reference_no=batch_ref,
        department=str(parent_dept),
    )
    db.add(parent_log)
    db.flush()

    child_log_ids: list[uuid.UUID] = []
    _MAX_DEPTH = 10  # explode_bom 과 동일

    def process(decision: dict, depth: int) -> None:
        if depth > _MAX_DEPTH:
            raise ValueError(f"분해 트리 깊이 한도 초과(>{_MAX_DEPTH}): {decision.get('item_id')}")
        item_id = uuid.UUID(str(decision["item_id"]))
        qty = Decimal(str(decision.get("qty", parent_qty)))
        children = decision.get("children")
        if children:
            # 중간 노드 — 자기 자체 처리 skip, 자식 재귀
            for child in children:
                process(child, depth + 1)
            return

        # leaf — keep_qty / scrap_qty 분리 처리. legacy action 호환.
        if "keep_qty" in decision:
            keep_qty = Decimal(str(decision["keep_qty"]))
        elif decision.get("action") == "keep":
            keep_qty = qty
        elif decision.get("action") == "scrap":
            keep_qty = Decimal("0")
        else:
            raise ValueError(
                f"자식 결정에 keep_qty 또는 action 이 필요합니다: {decision}"
            )
        if keep_qty < 0 or keep_qty > qty:
            raise ValueError(
                f"keep_qty({keep_qty}) 가 범위(0..{qty}) 를 벗어났습니다: item_id={item_id}"
            )
        scrap_qty = qty - keep_qty
        child_note = decision.get("reason_memo") or reason_memo or ""

        if keep_qty > 0:
            child_inv = inventory_svc.receive_confirmed(
                db, item_id, keep_qty,
                bucket="production",
                dept=parent_dept,
            )
            qty_before_child = (child_inv.quantity or Decimal("0")) - keep_qty
            log = TransactionLog(
                item_id=item_id,
                transaction_type=TransactionTypeEnum.RECEIVE,
                quantity_change=keep_qty,
                quantity_before=qty_before_child,
                quantity_after=child_inv.quantity,
                produced_by=actor,
                notes=None,
                reason_category=reason_category,
                reason_memo=child_note or None,
                reference_no=batch_ref,
                department=str(parent_dept),
            )
            db.add(log)
            db.flush()
            child_log_ids.append(log.log_id)

        if scrap_qty > 0:
            scrap_inv = inventory_svc.get_or_create_inventory(db, item_id)
            log = TransactionLog(
                item_id=item_id,
                transaction_type=TransactionTypeEnum.DEFECT_SCRAP,
                quantity_change=-scrap_qty,
                quantity_before=scrap_inv.quantity,
                quantity_after=scrap_inv.quantity,
                produced_by=actor,
                notes=None,
                reason_category=reason_category,
                reason_memo=child_note or None,
                reference_no=batch_ref,
                department=str(parent_dept),
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
