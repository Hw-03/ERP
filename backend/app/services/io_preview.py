"""입출고 미리보기 — 라우팅 규칙 + BOM 묶음 전개 + 라인 생성.

순수 미리보기 책임만 담당한다. 실재고 반영/영속화는 하지 않으며,
io_persist / io_dispatch 가 이 모듈의 헬퍼(_enum_value, _new_id, _get_item 등)를 재사용한다.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Optional, Sequence

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    DepartmentEnum,
    InventoryLocation,
    Item,
    LocationStatusEnum,
)
from app.services import bom as bom_svc
from app.services import inventory as inventory_svc
from app.services import stock_math

# 결재 규칙 단일 원천(approval_rules). io.py / io_dispatch / io_persist 가 본 모듈에서
# 이 이름들을 re-export·import 하므로 네임스페이스에 노출한다.
from app.services.approval_rules import APPROVAL_SUB_TYPES, MANUAL_LINE_ORIGINS  # noqa: F401


WORK_TYPES = {"receive", "warehouse_io", "process", "defect"}


def _d(value) -> Decimal:
    return Decimal(str(value or "0"))


def _new_id() -> uuid.UUID:
    return uuid.uuid4()


def _enum_value(value) -> Optional[str]:
    if value is None:
        return None
    return getattr(value, "value", value)


def _get_item(db: Session, item_id: uuid.UUID) -> Item:
    item = db.query(Item).filter(Item.item_id == item_id).first()
    if item is None:
        raise ValueError(f"품목을 찾을 수 없습니다: {item_id}")
    return item


def _has_children(db: Session, item_id: uuid.UUID) -> bool:
    from app.models import BOM

    return (
        db.query(func.count(BOM.bom_id))
        .filter(BOM.parent_item_id == item_id)
        .scalar()
        or 0
    ) > 0


def _bucket_available(
    db: Session,
    *,
    item_id: uuid.UUID,
    bucket: str,
    department: Optional[str],
) -> Decimal:
    if bucket == "warehouse":
        inv = inventory_svc.get_or_create_inventory(db, item_id)
        # 가용 정의(warehouse - pending)는 stock_math 단일 소스를 따른다.
        return stock_math.figures_from_inventory(inv).warehouse_available
    if bucket == "production" and department:
        loc = (
            db.query(InventoryLocation)
            .filter(
                InventoryLocation.item_id == item_id,
                InventoryLocation.department == department,
                InventoryLocation.status == LocationStatusEnum.PRODUCTION,
            )
            .first()
        )
        return _d(loc.quantity) if loc else Decimal("0")
    if bucket == "defective" and department:
        loc = (
            db.query(InventoryLocation)
            .filter(
                InventoryLocation.item_id == item_id,
                InventoryLocation.department == department,
                InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
            )
            .first()
        )
        return _d(loc.quantity) if loc else Decimal("0")
    return Decimal("0")


def _default_production_dept(item: Item, fallback: Optional[str]) -> str:
    if fallback:
        return fallback
    mapped = inventory_svc.dept_for_process_type(item.process_type_code)
    return _enum_value(mapped) or DepartmentEnum.ASSEMBLY.value


def _component_source_dept(item: Item, fallback: Optional[str]) -> str:
    """BOM 부품 차감/복귀 부서 — 부품의 소속 공정 우선(코드 기준), 없으면 작업 부서.
    _default_production_dept 의 역(逆): 결과 라인은 작업 부서 우선, 부품 라인은 소속 공정 우선.
    A/F 접미(생산 중간품, 예: NF 튜닝보드)는 소속 공정으로 매핑되고,
    R 접미(원자재)는 매핑이 없어 작업 부서를 유지한다(기존 동작 보존)."""
    mapped = inventory_svc.dept_for_process_type(item.process_type_code)
    return _enum_value(mapped) or fallback or DepartmentEnum.ASSEMBLY.value


def _line_dict(
    db: Session,
    *,
    item: Item,
    quantity: Decimal,
    direction: str,
    from_bucket: str,
    from_department: Optional[str],
    to_bucket: str,
    to_department: Optional[str],
    origin: str,
    bom_expected: Optional[Decimal] = None,
    included: bool = True,
    edited: bool = False,
    exclusion_note: Optional[str] = None,
) -> dict:
    shortage = Decimal("0")
    if from_bucket != "none":
        available = _bucket_available(
            db,
            item_id=item.item_id,
            bucket=from_bucket,
            department=from_department,
        )
        shortage = max(Decimal("0"), quantity - available)
    return {
        "line_id": _new_id(),
        "item_id": item.item_id,
        "item_name": item.item_name,
        "mes_code": item.mes_code,
        "unit": item.unit,
        "direction": direction,
        "from_bucket": from_bucket,
        "from_department": from_department,
        "to_bucket": to_bucket,
        "to_department": to_department,
        "quantity": quantity,
        "bom_expected": bom_expected,
        "included": included,
        "origin": origin,
        "edited": edited,
        "has_children": _has_children(db, item.item_id),
        "shortage": shortage,
        "exclusion_note": exclusion_note,
    }


def _route_for_sub_type(
    sub_type: str,
    *,
    item: Item,
    from_department: Optional[str],
    to_department: Optional[str],
    role: str = "component",
) -> tuple[str, str, Optional[str], str, Optional[str]]:
    if sub_type == "receive_supplier":
        return ("in", "none", None, "warehouse", None)
    if sub_type == "warehouse_to_dept":
        return ("move", "warehouse", None, "production", to_department)
    if sub_type == "dept_to_warehouse":
        return ("move", "production", from_department, "warehouse", None)
    if sub_type == "produce":
        if role == "result":
            dept = _default_production_dept(item, to_department or from_department)
            return ("in", "none", None, "production", dept)
        # 부품: 작업 부서가 아니라 부품의 소속 공정에서 차감 (튜닝 보드는 튜닝에서).
        dept = _component_source_dept(item, to_department or from_department)
        return ("out", "production", dept, "none", None)
    if sub_type == "disassemble":
        if role == "result":
            dept = _default_production_dept(item, from_department or to_department)
            return ("out", "production", dept, "none", None)
        # 회수 부품: 소속 공정으로 복귀.
        dept = _component_source_dept(item, from_department or to_department)
        return ("in", "none", None, "production", dept)
    if sub_type == "dept_transfer":
        return ("move", "production", from_department, "production", to_department)
    if sub_type == "adjust_in":
        dept = _default_production_dept(item, to_department or from_department)
        return ("adjust", "none", None, "production", dept)
    if sub_type == "adjust_out":
        dept = _default_production_dept(item, to_department or from_department)
        return ("adjust", "production", dept, "none", None)
    if sub_type == "defect_quarantine":
        # 사용자가 Step 2 에서 선택한 부서가 from_department 로 전달됨.
        # "창고" 면 창고 자체 재고를 격리(WAREHOUSE→DEFECTIVE), 그 외 부서면 그 부서 PRODUCTION→DEFECTIVE.
        # stock_requests.create_inventory_request 의 from_dept 기반 결재 분기와 동기 — None/"창고" → 창고 결재.
        source = from_department or to_department
        if source is None or source == "창고":
            return ("defective", "warehouse", None, "defective", "창고")
        return ("defective", "production", source, "defective", source)
    if sub_type == "supplier_return":
        source = from_department or to_department or DepartmentEnum.ASSEMBLY.value
        return ("out", "defective", source, "none", None)
    raise ValueError(f"지원하지 않는 세부 작업입니다: {sub_type}")


# source_kind == "manual" 은 BOM 전개를 건너뛰고 낱개 라인으로 처리한다.
MANUAL_SOURCE_KIND = "manual"
# BOM 전개 대상 세부 작업 — 결과/부품을 함께 펼친다.
EXPAND_SUB_TYPES = frozenset(
    {"warehouse_to_dept", "dept_to_warehouse", "dept_transfer", "produce", "disassemble"}
)
# 회수되지 않은 부품 라인에 붙는 안내 문구.
DISASSEMBLE_EXCLUSION_NOTE = "회수 안 됨"


def _routed_line(
    db: Session,
    *,
    item: Item,
    quantity: Decimal,
    sub_type: str,
    from_department: Optional[str],
    to_department: Optional[str],
    origin: str,
    role: str = "component",
    bom_expected: Optional[Decimal] = None,
    exclusion_note: Optional[str] = None,
) -> dict:
    """라우팅 규칙을 적용해 라인 하나를 생성한다(추출 전 인라인 패턴 보존)."""
    route = _route_for_sub_type(
        sub_type,
        item=item,
        from_department=from_department,
        to_department=to_department,
        role=role,
    )
    return _line_dict(
        db,
        item=item,
        quantity=quantity,
        direction=route[0],
        from_bucket=route[1],
        from_department=route[2],
        to_bucket=route[3],
        to_department=route[4],
        origin=origin,
        bom_expected=bom_expected,
        exclusion_note=exclusion_note,
    )


def _produce_lines(
    db: Session,
    *,
    item: Item,
    quantity: Decimal,
    children: list,
    sub_type: str,
    from_department: Optional[str],
    to_department: Optional[str],
) -> list[dict]:
    """생산: 부품 차감 라인들(bom_auto) → 결과 입고 라인(direct)."""
    lines: list[dict] = []
    for child_id, per_unit_qty in children:
        child = _get_item(db, child_id)
        required = _d(per_unit_qty) * quantity
        lines.append(
            _routed_line(
                db,
                item=child,
                quantity=required,
                sub_type=sub_type,
                from_department=from_department,
                to_department=to_department,
                origin="bom_auto",
                role="component",
                bom_expected=required,
            )
        )
    lines.append(
        _routed_line(
            db,
            item=item,
            quantity=quantity,
            sub_type=sub_type,
            from_department=from_department,
            to_department=to_department,
            origin="direct",
            role="result",
        )
    )
    return lines


def _disassemble_lines(
    db: Session,
    *,
    item: Item,
    quantity: Decimal,
    children: list,
    sub_type: str,
    from_department: Optional[str],
    to_department: Optional[str],
) -> list[dict]:
    """분해: 결과 출고 라인(direct) → 회수 부품 라인들(bom_auto)."""
    lines: list[dict] = [
        _routed_line(
            db,
            item=item,
            quantity=quantity,
            sub_type=sub_type,
            from_department=from_department,
            to_department=to_department,
            origin="direct",
            role="result",
        )
    ]
    for child_id, per_unit_qty in children:
        child = _get_item(db, child_id)
        recovered = _d(per_unit_qty) * quantity
        lines.append(
            _routed_line(
                db,
                item=child,
                quantity=recovered,
                sub_type=sub_type,
                from_department=from_department,
                to_department=to_department,
                origin="bom_auto",
                role="component",
                bom_expected=recovered,
                exclusion_note=DISASSEMBLE_EXCLUSION_NOTE,
            )
        )
    return lines


def _expanded_child_lines(
    db: Session,
    *,
    quantity: Decimal,
    children: list,
    sub_type: str,
    from_department: Optional[str],
    to_department: Optional[str],
) -> list[dict]:
    """BOM 전개: 부품 라인들(bom_auto)만 생성(이동/이송류)."""
    lines: list[dict] = []
    for child_id, per_unit_qty in children:
        child = _get_item(db, child_id)
        required = _d(per_unit_qty) * quantity
        lines.append(
            _routed_line(
                db,
                item=child,
                quantity=required,
                sub_type=sub_type,
                from_department=from_department,
                to_department=to_department,
                origin="bom_auto",
                bom_expected=required,
            )
        )
    return lines


def _single_line(
    db: Session,
    *,
    item: Item,
    quantity: Decimal,
    sub_type: str,
    from_department: Optional[str],
    to_department: Optional[str],
    source_kind: str,
) -> list[dict]:
    """전개 없는 낱개 라인 하나(수동이면 origin=manual, 그 외 direct)."""
    role = "result" if source_kind == MANUAL_SOURCE_KIND and sub_type in {"produce", "disassemble"} else "component"
    return [
        _routed_line(
            db,
            item=item,
            quantity=quantity,
            sub_type=sub_type,
            from_department=from_department,
            to_department=to_department,
            origin="manual" if source_kind == MANUAL_SOURCE_KIND else "direct",
            role=role,
        )
    ]


def _direct_item_bundle(
    db: Session,
    *,
    item: Item,
    quantity: Decimal,
    work_type: str,
    sub_type: str,
    from_department: Optional[str],
    to_department: Optional[str],
    source_kind: str = "direct_item",
) -> dict:
    children = bom_svc.direct_children(db, item.item_id)
    should_expand = (
        source_kind != MANUAL_SOURCE_KIND
        and children
        and sub_type in EXPAND_SUB_TYPES
    )
    bundle = {
        "bundle_id": _new_id(),
        "source_kind": "bom_parent" if should_expand else source_kind,
        "title": item.item_name,
        "source_item_id": item.item_id,
        "source_mes_code": item.mes_code,
        "quantity": quantity,
        "expanded_level": 1,
        "lines": [],
    }

    if source_kind == MANUAL_SOURCE_KIND:
        bundle["lines"] = _single_line(
            db,
            item=item,
            quantity=quantity,
            sub_type=sub_type,
            from_department=from_department,
            to_department=to_department,
            source_kind=source_kind,
        )
    elif sub_type == "produce":
        bundle["lines"] = _produce_lines(
            db,
            item=item,
            quantity=quantity,
            children=children,
            sub_type=sub_type,
            from_department=from_department,
            to_department=to_department,
        )
    elif sub_type == "disassemble":
        bundle["lines"] = _disassemble_lines(
            db,
            item=item,
            quantity=quantity,
            children=children,
            sub_type=sub_type,
            from_department=from_department,
            to_department=to_department,
        )
    elif should_expand:
        bundle["lines"] = _expanded_child_lines(
            db,
            quantity=quantity,
            children=children,
            sub_type=sub_type,
            from_department=from_department,
            to_department=to_department,
        )
    else:
        bundle["lines"] = _single_line(
            db,
            item=item,
            quantity=quantity,
            sub_type=sub_type,
            from_department=from_department,
            to_department=to_department,
            source_kind=source_kind,
        )
    return bundle


def preview(
    db: Session,
    *,
    work_type: str,
    sub_type: str,
    targets: Sequence,
    from_department: Optional[str] = None,
    to_department: Optional[str] = None,
) -> dict:
    if work_type not in WORK_TYPES:
        raise ValueError(f"지원하지 않는 작업 유형입니다: {work_type}")
    bundles: list[dict] = []
    for target in targets:
        source_kind = getattr(target, "source_kind", "direct_item")
        qty = _d(getattr(target, "quantity", Decimal("1")))
        item_id = getattr(target, "item_id", None)
        if item_id is None:
            raise ValueError("품목 선택 정보가 없습니다.")
        item = _get_item(db, item_id)
        bundles.append(
            _direct_item_bundle(
                db,
                item=item,
                quantity=qty,
                work_type=work_type,
                sub_type=sub_type,
                from_department=from_department,
                to_department=to_department,
                source_kind=source_kind,
            )
        )
    return {
        "work_type": work_type,
        "sub_type": sub_type,
        "requires_approval": sub_type in APPROVAL_SUB_TYPES,
        "bundles": bundles,
    }
