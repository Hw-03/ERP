"""입출고 미리보기 — 라우팅 규칙 + BOM 묶음 전개 + 라인 생성.

순수 미리보기 책임만 담당한다. 실재고 반영/영속화는 하지 않으며,
io_persist / io_dispatch 가 이 모듈의 헬퍼(_enum_value, _new_id, _get_item 등)를 재사용한다.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Iterable, Optional, Sequence

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    DepartmentEnum,
    Employee,
    Inventory,
    InventoryLocation,
    Item,
    LocationStatusEnum,
)
from app.services import bom as bom_svc
from app.services import inventory as inventory_svc
from app.services import stock_math
from app.services.bom_stock_policy import (
    BOM_AUTO_ORIGIN,
    BOM_STOCK_EXEMPT_NOTE,
    is_bom_generated_line,
    io_bom_auto_claims,
    _issue_bom_auto_token,
    should_skip_bom_inventory,
)

# 결재 규칙 단일 원천(approval_rules). io.py / io_dispatch / io_persist 가 본 모듈에서
# 이 이름들을 re-export·import 하므로 네임스페이스에 노출한다.
from app.services.approval_rules import APPROVAL_SUB_TYPES, MANUAL_LINE_ORIGINS  # noqa: F401


WORK_TYPES = {
    "receive",
    "warehouse_io",
    "warehouse_adjust",
    "process",
    "defect",
    "internal_use",
}
INTERNAL_USE_WORK_TYPE = "internal_use"
INTERNAL_USE_SUB_TYPE = "internal_use_out"
INTERNAL_USE_SOURCE_LOCATIONS = frozenset({"warehouse", "department"})
INTERNAL_USE_BOM_MODES = frozenset({"parent_and_children", "children_only"})
INTERNAL_USE_RETURN_NOTE = "소속 부서 재입고"
INTERNAL_USE_NO_CHANGE_NOTE = "변동 없음"
INTERNAL_USE_DEPARTMENTS = frozenset(
    {DepartmentEnum.AS.value, DepartmentEnum.RESEARCH.value}
)
WAREHOUSE_ADJUST_WORK_TYPE = "warehouse_adjust"
WAREHOUSE_ADJUST_SUB_TYPES = frozenset(
    {"warehouse_adjust_in", "warehouse_adjust_out"}
)
WAREHOUSE_MANAGER_ROLES = frozenset({"primary", "deputy"})


def validate_internal_use_operation(
    *,
    work_type: str,
    sub_type: str,
    to_department: Optional[str],
    lines: Iterable[object] = (),
    db: Optional[Session] = None,
) -> None:
    """사내 사용 라인의 창고 또는 품목 코드 기반 부서 원본을 검증한다."""
    is_internal = work_type == INTERNAL_USE_WORK_TYPE or sub_type == INTERNAL_USE_SUB_TYPE
    if not is_internal:
        return
    if (work_type, sub_type) != (INTERNAL_USE_WORK_TYPE, INTERNAL_USE_SUB_TYPE):
        raise ValueError("internal_use 작업은 internal_use_out 세부 작업만 허용됩니다.")
    if to_department not in INTERNAL_USE_DEPARTMENTS:
        raise ValueError("사내 사용 반출 부서는 AS 또는 연구만 선택할 수 있습니다.")
    for line in lines:
        direction = getattr(line, "direction")
        from_bucket = getattr(line, "from_bucket")
        from_department = getattr(line, "from_department")
        line_to_bucket = getattr(line, "to_bucket")
        line_to_department = getattr(line, "to_department")
        if direction == "in":
            if (
                getattr(line, "origin", None) != BOM_AUTO_ORIGIN
                or from_bucket != "none"
                or from_department is not None
                or line_to_bucket != "production"
                or db is None
            ):
                raise ValueError("사내 사용 라인 구성이 올바르지 않습니다.")
            item = _get_item(db, getattr(line, "item_id"))
            if line_to_department != _component_source_dept(item, None):
                raise ValueError("사내 사용 라인 구성이 올바르지 않습니다.")
            continue

        common_route = (
            direction,
            line_to_bucket,
            line_to_department,
        )
        if common_route != ("out", "none", to_department):
            raise ValueError("사내 사용 라인 구성이 올바르지 않습니다.")

        if from_bucket == "warehouse" and from_department is None:
            continue
        if from_bucket != "production" or db is None:
            raise ValueError("사내 사용 라인 구성이 올바르지 않습니다.")

        item = _get_item(db, getattr(line, "item_id"))
        expected_department = _component_source_dept(item, None)
        if from_department != expected_department:
            raise ValueError("사내 사용 라인 구성이 올바르지 않습니다.")


def validate_internal_use_requester(
    requester: Employee,
    *,
    work_type: str,
    sub_type: str,
) -> None:
    """AS·연구 직원 또는 창고 정/부 담당자만 사내 사용 작업을 허용한다."""
    if (work_type, sub_type) != (INTERNAL_USE_WORK_TYPE, INTERNAL_USE_SUB_TYPE):
        return
    department = _enum_value(requester.department)
    warehouse_role = (requester.warehouse_role or "none").lower()
    if department not in INTERNAL_USE_DEPARTMENTS and warehouse_role not in {
        "primary",
        "deputy",
    }:
        raise PermissionError("AS·연구 직원 또는 창고 정/부 담당자만 사내 사용 반출이 가능합니다.")


def validate_internal_use_bundles(
    *,
    work_type: str,
    sub_type: str,
    bundles: Iterable[object],
    require_bom_mode: bool = False,
    db: Optional[Session] = None,
) -> None:
    """같은 부모 품목의 중복과 BOM 차감 방식 누락을 막는다."""
    if (work_type, sub_type) != (INTERNAL_USE_WORK_TYPE, INTERNAL_USE_SUB_TYPE):
        return
    source_item_ids: set[uuid.UUID] = set()
    for bundle in bundles:
        source_item_id = getattr(bundle, "source_item_id", None)
        if source_item_id is None:
            raise ValueError("AS·연구 사용출고에는 원본 품목이 필요합니다.")
        if source_item_id in source_item_ids:
            raise ValueError("같은 품목에는 한 원본과 한 방식만 선택할 수 있습니다.")
        source_item_ids.add(source_item_id)
        mode = getattr(bundle, "internal_use_bom_mode", None)
        is_bom_bundle = getattr(bundle, "source_kind", None) == "bom_parent"
        if not is_bom_bundle and mode is not None:
            raise ValueError("BOM 차감 방식은 BOM 묶음에만 사용할 수 있습니다.")
        if mode is not None and mode not in INTERNAL_USE_BOM_MODES:
            raise ValueError("지원하지 않는 사용출고 BOM 차감 방식입니다.")
        if require_bom_mode and is_bom_bundle and mode is None:
            raise ValueError("사용출고 BOM 차감 방식을 선택해 주세요.")
        if is_bom_bundle and db is not None:
            _validate_internal_use_bom_bundle(db, bundle=bundle, mode=mode)


def _validate_internal_use_bom_bundle(
    db: Session,
    *,
    bundle: object,
    mode: Optional[str],
) -> None:
    """서버 미리보기가 발급한 BOM 구성과 선택 모드가 일치하는지 검증한다."""
    source_location = getattr(bundle, "source_location", None)
    if source_location not in INTERNAL_USE_SOURCE_LOCATIONS:
        raise ValueError("사용출고 BOM 재고 원본이 올바르지 않습니다.")

    source_item_id = getattr(bundle, "source_item_id")
    children = dict(bom_svc.direct_children(db, source_item_id))
    if not children:
        raise ValueError("사용출고 BOM 구성이 현재 BOM과 일치하지 않습니다.")

    parent_lines: list[object] = []
    child_lines: dict[uuid.UUID, object] = {}
    for line in getattr(bundle, "lines", ()):  # payload와 ORM 묶음 모두 지원
        item_id = getattr(line, "item_id")
        if getattr(line, "origin", None) == BOM_AUTO_ORIGIN:
            if item_id in child_lines:
                raise ValueError("사용출고 BOM 하위 자재가 중복되었습니다.")
            if not is_bom_generated_line(
                db,
                bundle_id=getattr(bundle, "bundle_id"),
                line_id=getattr(line, "line_id"),
                source_kind=getattr(bundle, "source_kind"),
                source_item_id=source_item_id,
                item_id=item_id,
                work_type=INTERNAL_USE_WORK_TYPE,
                sub_type=INTERNAL_USE_SUB_TYPE,
                direction=getattr(line, "direction"),
                from_bucket=getattr(line, "from_bucket"),
                from_department=getattr(line, "from_department"),
                to_bucket=getattr(line, "to_bucket"),
                to_department=getattr(line, "to_department"),
                bom_auto_token=getattr(line, "bom_auto_token", None),
            ):
                raise ValueError("사용출고 BOM 검증 정보가 올바르지 않습니다.")
            child_lines[item_id] = line
            continue
        if item_id == source_item_id and getattr(line, "origin", None) == "direct":
            parent_lines.append(line)
            continue
        raise ValueError("사용출고 BOM에 허용되지 않은 자재가 포함되었습니다.")

    if set(child_lines) != set(children):
        raise ValueError("사용출고 BOM 구성이 현재 BOM과 일치하지 않습니다.")
    expected_parent_count = 1 if mode == "parent_and_children" else 0
    if len(parent_lines) != expected_parent_count:
        raise ValueError("사용출고 BOM 차감 방식과 상위 자재 구성이 일치하지 않습니다.")

    for line in parent_lines:
        parent_item = _get_item(db, source_item_id)
        if _d(getattr(line, "quantity", None)) != _d(getattr(bundle, "quantity", None)):
            raise ValueError("사용출고 BOM 상위 자재 수량이 묶음 기준수량과 일치하지 않습니다.")
        expected_source = (
            ("warehouse", None)
            if source_location == "warehouse"
            else ("production", _component_source_dept(parent_item, None))
        )
        if (
            getattr(line, "direction"),
            getattr(line, "from_bucket"),
            getattr(line, "from_department"),
            getattr(line, "to_bucket"),
            bool(getattr(line, "included")),
            bool(getattr(line, "selected", True)),
        ) != ("out", expected_source[0], expected_source[1], "none", True, True):
            raise ValueError("사용출고 상위 자재 구성이 올바르지 않습니다.")

    for item_id, line in child_lines.items():
        item = _get_item(db, item_id)
        selected = bool(getattr(line, "selected", True))
        included = bool(getattr(line, "included"))
        stock_exempt = bool(getattr(line, "bom_stock_exempt", False))
        bom_expected = _d(children[item_id]) * _d(getattr(bundle, "quantity", 0))
        expected_quantity = (
            Decimal("0")
            if mode != "parent_and_children" and not selected and not stock_exempt
            else bom_expected
        )
        if _d(getattr(line, "quantity", None)) != expected_quantity:
            raise ValueError("사용출고 BOM 하위 자재 수량이 기준수량과 일치하지 않습니다.")
        if (
            getattr(line, "bom_expected", None) is None
            or _d(getattr(line, "bom_expected", None)) != bom_expected
        ):
            raise ValueError("사용출고 BOM 하위 자재 기준수량이 현재 BOM과 일치하지 않습니다.")
        if stock_exempt:
            if included or selected:
                raise ValueError("재고 미반영 BOM 하위 자재는 재고에 반영할 수 없습니다.")
            continue
        if mode == "parent_and_children" and not selected:
            expected_route = (
                "in",
                "none",
                None,
                "production",
                _component_source_dept(item, None),
            )
            expected_included = not stock_exempt
        else:
            expected_source = (
                ("warehouse", None)
                if source_location == "warehouse"
                else ("production", _component_source_dept(item, None))
            )
            expected_route = (
                "out",
                expected_source[0],
                expected_source[1],
                "none",
                getattr(line, "to_department"),
            )
            expected_included = selected and not stock_exempt
        actual_route = (
            getattr(line, "direction"),
            getattr(line, "from_bucket"),
            getattr(line, "from_department"),
            getattr(line, "to_bucket"),
            getattr(line, "to_department"),
        )
        if actual_route != expected_route or included != expected_included:
            raise ValueError("사용출고 BOM 하위 자재 구성이 올바르지 않습니다.")


def _is_warehouse_adjust(work_type: str, sub_type: str) -> bool:
    return (
        work_type == WAREHOUSE_ADJUST_WORK_TYPE
        or sub_type in WAREHOUSE_ADJUST_SUB_TYPES
    )


def validate_warehouse_adjust_requester(
    requester: Employee,
    *,
    work_type: str,
    sub_type: str,
) -> None:
    """창고 정·부 담당자만 창고 수량보정 경로를 사용할 수 있다."""
    if not _is_warehouse_adjust(work_type, sub_type):
        return
    if work_type != WAREHOUSE_ADJUST_WORK_TYPE or sub_type not in WAREHOUSE_ADJUST_SUB_TYPES:
        raise ValueError("창고 수량보정 작업 유형과 세부 유형 조합이 올바르지 않습니다.")
    warehouse_role = (requester.warehouse_role or "none").lower()
    if warehouse_role not in WAREHOUSE_MANAGER_ROLES:
        raise PermissionError("창고 정·부 담당자만 창고 수량보정을 할 수 있습니다.")


def validate_warehouse_adjust_operation(
    *,
    work_type: str,
    sub_type: str,
    from_department: Optional[str],
    to_department: Optional[str],
    lines: Iterable[object] = (),
) -> None:
    """창고 보정은 부서 없이 단품 창고 증감 라인으로만 처리한다."""
    if not _is_warehouse_adjust(work_type, sub_type):
        return
    if work_type != WAREHOUSE_ADJUST_WORK_TYPE or sub_type not in WAREHOUSE_ADJUST_SUB_TYPES:
        raise ValueError("창고 수량보정 작업 유형과 세부 유형 조합이 올바르지 않습니다.")
    if from_department is not None or to_department is not None:
        raise ValueError("창고 수량보정에는 부서를 지정할 수 없습니다.")

    expected = (
        ("adjust", "none", None, "warehouse", None, "direct")
        if sub_type == "warehouse_adjust_in"
        else ("adjust", "warehouse", None, "none", None, "direct")
    )
    for line in lines:
        actual = (
            getattr(line, "direction"),
            getattr(line, "from_bucket"),
            getattr(line, "from_department"),
            getattr(line, "to_bucket"),
            getattr(line, "to_department"),
            getattr(line, "origin"),
        )
        if actual != expected:
            raise ValueError("창고 수량보정 라인 구성이 올바르지 않습니다.")


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
        inv = db.query(Inventory).filter(Inventory.item_id == item_id).first()
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
        return (
            _d(loc.quantity) - _d(loc.pending_quantity)
            if loc
            else Decimal("0")
        )
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
        return (
            _d(loc.quantity) - _d(loc.pending_quantity)
            if loc
            else Decimal("0")
        )
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
    selected: Optional[bool] = None,
    edited: bool = False,
    exclusion_note: Optional[str] = None,
) -> dict:
    bom_stock_exempt = should_skip_bom_inventory(
        item,
        bom_generated=origin == "bom_auto",
    )
    if bom_stock_exempt:
        included = False
        selected = False
        exclusion_note = BOM_STOCK_EXEMPT_NOTE
    if selected is None:
        selected = included
    shortage = Decimal("0")
    if included and from_bucket != "none":
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
        "bom_stock_exempt": bom_stock_exempt,
        "bom_auto_token": None,
        "included": included,
        "selected": selected,
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
    source_location: str = "warehouse",
) -> tuple[str, str, Optional[str], str, Optional[str]]:
    if sub_type == "receive_supplier":
        return ("in", "none", None, "warehouse", None)
    if sub_type == "warehouse_to_dept":
        return ("move", "warehouse", None, "production", to_department)
    if sub_type == "dept_to_warehouse":
        return ("move", "production", from_department, "warehouse", None)
    if sub_type == INTERNAL_USE_SUB_TYPE:
        if source_location == "department":
            source_department = _component_source_dept(item, None)
            return ("out", "production", source_department, "none", to_department)
        return ("out", "warehouse", None, "none", to_department)
    if sub_type == "produce":
        if role == "result":
            dept = _default_production_dept(item, to_department or from_department)
            return ("in", "none", None, "production", dept)
        # 부품: 작업 부서가 아니라 부품의 소속 공정에서 차감 (튜닝 보드는 튜닝에서).
        dept = _component_source_dept(item, to_department or from_department)
        return ("out", "production", dept, "none", None)
    if sub_type == "disassemble":
        if role == "result":
            dept = _default_production_dept(item, to_department or from_department)
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
    if sub_type == "warehouse_adjust_in":
        return ("adjust", "none", None, "warehouse", None)
    if sub_type == "warehouse_adjust_out":
        return ("adjust", "warehouse", None, "none", None)
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


def validate_operation_sources(sub_type: str, source_kinds: Iterable[str]) -> None:
    """낱개 증가는 생산이 아닌 수량보정으로만 기록되도록 강제한다."""
    kinds = tuple(source_kinds)
    if sub_type == "produce" and MANUAL_SOURCE_KIND in kinds:
        raise ValueError("낱개 품목 입고는 생산이 아니라 수량보정 입고로 처리하세요.")
    if sub_type in WAREHOUSE_ADJUST_SUB_TYPES and any(
        source_kind != "direct_item" for source_kind in kinds
    ):
        raise ValueError("창고 수량보정은 단품 품목만 처리할 수 있습니다.")


def _target_source_location(target: object, *, sub_type: str) -> str:
    """AS·연구 사용출고의 재고 원본을 정규화하고 다른 흐름의 사용을 막는다."""
    requested = getattr(target, "source_location", None)
    if sub_type != INTERNAL_USE_SUB_TYPE:
        if requested is not None:
            raise ValueError("재고 원본 선택은 AS·연구 사용출고에서만 사용할 수 있습니다.")
        return "warehouse"
    source_location = requested or "warehouse"
    if source_location not in INTERNAL_USE_SOURCE_LOCATIONS:
        raise ValueError("재고 원본은 warehouse 또는 department만 허용됩니다.")
    return source_location


# BOM 전개 대상 세부 작업 — 결과/부품을 함께 펼친다.
EXPAND_SUB_TYPES = frozenset(
    {"warehouse_to_dept", "dept_to_warehouse", "dept_transfer", "produce", "disassemble", "internal_use_out"}
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
    source_location: str = "warehouse",
    bom_expected: Optional[Decimal] = None,
    included: bool = True,
    selected: Optional[bool] = None,
    exclusion_note: Optional[str] = None,
) -> dict:
    """라우팅 규칙을 적용해 라인 하나를 생성한다(추출 전 인라인 패턴 보존)."""
    route = _route_for_sub_type(
        sub_type,
        item=item,
        from_department=from_department,
        to_department=to_department,
        role=role,
        source_location=source_location,
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
        included=included,
        selected=selected,
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
    source_location: str = "warehouse",
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
                source_location=source_location,
                bom_expected=required,
            )
        )
    return lines


def _internal_use_component_selection_map(
    children: list,
    component_selections: Iterable[object],
) -> dict[object, bool]:
    """클라이언트의 하위 체크 상태만 현재 직계 BOM 품목에 적용한다."""
    child_ids = {child_id for child_id, _ in children}
    selected_by_item: dict[object, bool] = {}
    for selection in component_selections:
        item_id = getattr(selection, "item_id", None)
        if item_id not in child_ids:
            raise ValueError("현재 BOM에 없는 하위 자재 선택입니다.")
        if item_id in selected_by_item:
            raise ValueError("같은 하위 자재 선택이 중복되었습니다.")
        selected_by_item[item_id] = bool(getattr(selection, "selected", True))
    return selected_by_item


def _internal_use_bom_lines(
    db: Session,
    *,
    item: Item,
    quantity: Decimal,
    children: list,
    from_department: Optional[str],
    to_department: Optional[str],
    source_location: str,
    mode: Optional[str],
    component_selections: Iterable[object],
) -> list[dict]:
    """사용출고 BOM 모드와 하위 체크 상태를 실제 재고 반영 라인으로 만든다."""
    if mode is not None and mode not in INTERNAL_USE_BOM_MODES:
        raise ValueError("지원하지 않는 사용출고 BOM 차감 방식입니다.")
    selected_by_item = _internal_use_component_selection_map(children, component_selections)
    lines: list[dict] = []
    if mode == "parent_and_children":
        lines.append(
            _routed_line(
                db,
                item=item,
                quantity=quantity,
                sub_type=INTERNAL_USE_SUB_TYPE,
                from_department=from_department,
                to_department=to_department,
                origin="direct",
                source_location=source_location,
                selected=True,
            )
        )

    for child_id, per_unit_qty in children:
        child = _get_item(db, child_id)
        expected = _d(per_unit_qty) * quantity
        selected = selected_by_item.get(child_id, True)
        if mode == "parent_and_children" and not selected:
            lines.append(
                _line_dict(
                    db,
                    item=child,
                    quantity=expected,
                    direction="in",
                    from_bucket="none",
                    from_department=None,
                    to_bucket="production",
                    to_department=_component_source_dept(child, None),
                    origin="bom_auto",
                    bom_expected=expected,
                    included=True,
                    selected=False,
                    edited=False,
                    exclusion_note=INTERNAL_USE_RETURN_NOTE,
                )
            )
            continue
        lines.append(
            _routed_line(
                db,
                item=child,
                quantity=(
                    Decimal("0")
                    if mode != "parent_and_children" and not selected
                    else expected
                ),
                sub_type=INTERNAL_USE_SUB_TYPE,
                from_department=from_department,
                to_department=to_department,
                origin="bom_auto",
                source_location=source_location,
                bom_expected=expected,
                included=selected,
                selected=selected,
                exclusion_note=None if selected else INTERNAL_USE_NO_CHANGE_NOTE,
            )
        )
        lines[-1]["edited"] = False
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
    source_location: str = "warehouse",
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
            source_location=source_location,
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
    source_location: str = "warehouse",
    internal_use_bom_mode: Optional[str] = None,
    component_selections: Iterable[object] = (),
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
        "internal_use_bom_mode": internal_use_bom_mode if sub_type == INTERNAL_USE_SUB_TYPE and should_expand else None,
        "source_location": source_location if sub_type == INTERNAL_USE_SUB_TYPE else None,
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
            source_location=source_location,
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
    elif should_expand and sub_type == INTERNAL_USE_SUB_TYPE:
        bundle["lines"] = _internal_use_bom_lines(
            db,
            item=item,
            quantity=quantity,
            children=children,
            from_department=from_department,
            to_department=to_department,
            source_location=source_location,
            mode=internal_use_bom_mode,
            component_selections=component_selections,
        )
    elif should_expand:
        bundle["lines"] = _expanded_child_lines(
            db,
            quantity=quantity,
            children=children,
            sub_type=sub_type,
            from_department=from_department,
            to_department=to_department,
            source_location=source_location,
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
            source_location=source_location,
        )
    return bundle


def _issue_bundle_bom_auto_tokens(
    db: Session,
    bundle: dict,
    *,
    work_type: str,
    sub_type: str,
) -> None:
    """미리보기에서 생성한 자동 BOM 자식에만 서버 근거 토큰을 붙인다."""
    for line in bundle["lines"]:
        if line["origin"] != BOM_AUTO_ORIGIN:
            continue
        line["bom_auto_token"] = _issue_bom_auto_token(
            db,
            flow="io",
            claims=io_bom_auto_claims(
                bundle_id=bundle["bundle_id"],
                line_id=line["line_id"],
                source_kind=bundle["source_kind"],
                source_item_id=bundle["source_item_id"],
                item_id=line["item_id"],
                work_type=work_type,
                sub_type=sub_type,
                direction=line["direction"],
                from_bucket=line["from_bucket"],
                from_department=line["from_department"],
                to_bucket=line["to_bucket"],
                to_department=line["to_department"],
            ),
        )


def preview(
    db: Session,
    *,
    work_type: str,
    sub_type: str,
    targets: Sequence,
    from_department: Optional[str] = None,
    to_department: Optional[str] = None,
) -> dict:
    validate_internal_use_operation(
        work_type=work_type,
        sub_type=sub_type,
        to_department=to_department,
    )
    validate_warehouse_adjust_operation(
        work_type=work_type,
        sub_type=sub_type,
        from_department=from_department,
        to_department=to_department,
    )
    if work_type not in WORK_TYPES:
        raise ValueError(f"지원하지 않는 작업 유형입니다: {work_type}")
    validate_operation_sources(
        sub_type,
        (getattr(target, "source_kind", "direct_item") for target in targets),
    )
    bundles: list[dict] = []
    for target in targets:
        source_kind = getattr(target, "source_kind", "direct_item")
        source_location = _target_source_location(target, sub_type=sub_type)
        internal_use_bom_mode = getattr(target, "internal_use_bom_mode", None)
        component_selections = getattr(target, "component_selections", ())
        qty = _d(getattr(target, "quantity", Decimal("1")))
        item_id = getattr(target, "item_id", None)
        if item_id is None:
            raise ValueError("품목 선택 정보가 없습니다.")
        item = _get_item(db, item_id)
        bundle = _direct_item_bundle(
            db,
            item=item,
            quantity=qty,
            work_type=work_type,
            sub_type=sub_type,
            from_department=from_department,
            to_department=to_department,
            source_kind=source_kind,
            source_location=source_location,
            internal_use_bom_mode=internal_use_bom_mode,
            component_selections=component_selections,
        )
        _issue_bundle_bom_auto_tokens(
            db,
            bundle,
            work_type=work_type,
            sub_type=sub_type,
        )
        bundles.append(bundle)
    return {
        "work_type": work_type,
        "sub_type": sub_type,
        "requires_approval": sub_type in APPROVAL_SUB_TYPES,
        "bundles": bundles,
    }
