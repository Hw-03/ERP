"""services/dept_adjustment.py 단위 테스트."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.models import DepartmentEnum, DeptAdjSubTypeEnum, LocationStatusEnum, TransactionTypeEnum
from app.services import dept_adjustment as svc
from app.services import inventory as inv_svc

D = Decimal
ASSEMBLY = DepartmentEnum.ASSEMBLY


# ──────────────────────────── helpers ────────────────────────────

def _prod_qty(db_session, item_id, dept=ASSEMBLY) -> Decimal:
    from app.models import InventoryLocation
    loc = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == dept,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .first()
    )
    return loc.quantity if loc else D("0")


def _defective_qty(db_session, item_id, dept=ASSEMBLY) -> Decimal:
    from app.models import InventoryLocation
    loc = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == dept,
            InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
        )
        .first()
    )
    return loc.quantity if loc else D("0")


def _tx_types(db_session) -> list[str]:
    from app.models import TransactionLog
    return [r.transaction_type.value for r in db_session.query(TransactionLog).all()]


# ──────────────────────────── 템플릿 빌더 ────────────────────────────

def test_production_template_basic(make_item, make_bom, db_session):
    parent = make_item(name="AF", process_type_code="AF")
    child_b = make_item(name="AR", process_type_code="AR")
    child_c = make_item(name="AA", process_type_code="AA")
    make_bom(parent.item_id, child_b.item_id, D("2"))
    make_bom(parent.item_id, child_c.item_id, D("1"))

    lines = svc.build_production_template(db_session, parent.item_id, D("3"))

    # 구성품 out, 결과품 in
    out_lines = [l for l in lines if l.direction == "out"]
    in_lines = [l for l in lines if l.direction == "in"]
    assert len(out_lines) == 2
    assert len(in_lines) == 1
    assert in_lines[0].item_id == parent.item_id
    assert in_lines[0].quantity == D("3")

    qty_map = {l.item_id: l.quantity for l in out_lines}
    assert qty_map[child_b.item_id] == D("6")
    assert qty_map[child_c.item_id] == D("3")


def test_production_template_no_bom(make_item, db_session):
    item = make_item(name="X")
    lines = svc.build_production_template(db_session, item.item_id, D("1"))
    # BOM 없어도 결과품 in 라인은 생성됨
    assert len(lines) == 1
    assert lines[0].direction == "in"
    assert lines[0].item_id == item.item_id


def test_disassembly_template_basic(make_item, make_bom, db_session):
    parent = make_item(name="AF")
    child = make_item(name="AR")
    make_bom(parent.item_id, child.item_id, D("3"))

    lines = svc.build_disassembly_template(db_session, parent.item_id, D("2"))

    out_lines = [l for l in lines if l.direction == "out"]
    in_lines = [l for l in lines if l.direction == "in"]
    assert len(out_lines) == 1
    assert out_lines[0].item_id == parent.item_id
    assert out_lines[0].quantity == D("2")
    assert len(in_lines) == 1
    assert in_lines[0].quantity == D("6")
    assert in_lines[0].bom_expected == D("6")


def test_expand_component(make_item, make_bom, db_session):
    """2단계 BOM: A→B, B→C. B를 전개하면 C 라인 반환."""
    a = make_item(name="A")
    b = make_item(name="B")
    c = make_item(name="C")
    make_bom(a.item_id, b.item_id, D("1"))
    make_bom(b.item_id, c.item_id, D("4"))

    lines = svc.expand_component(db_session, b.item_id, D("2"), ASSEMBLY, direction="out")
    assert len(lines) == 1
    assert lines[0].item_id == c.item_id
    assert lines[0].quantity == D("8")
    assert lines[0].direction == "out"


def test_expand_component_no_children_raises(make_item, db_session):
    item = make_item(name="leaf")
    with pytest.raises(ValueError):
        svc.expand_component(db_session, item.item_id, D("1"), ASSEMBLY)


# ──────────────────────────── submit 처리 ────────────────────────────

def test_submit_production(make_item, make_location, db_session):
    """생산: 결과품 +, 구성품 -, TransactionLog 확인."""
    result = make_item(name="AF", process_type_code="AF")
    comp_b = make_item(name="AR", process_type_code="AR")
    comp_c = make_item(name="AA", process_type_code="AA")

    make_location(comp_b.item_id, department=ASSEMBLY, quantity=D("10"))
    make_location(comp_c.item_id, department=ASSEMBLY, quantity=D("5"))

    lines = [
        svc.AdjLine(item_id=comp_b.item_id, direction="out", quantity=D("4"), department=ASSEMBLY),
        svc.AdjLine(item_id=comp_c.item_id, direction="out", quantity=D("2"), department=ASSEMBLY),
        svc.AdjLine(item_id=result.item_id, direction="in",  quantity=D("1"), department=ASSEMBLY),
    ]

    log_ids = svc.submit_adjustment(
        db_session, DeptAdjSubTypeEnum.PRODUCTION, lines, operator_name="홍길동"
    )
    db_session.commit()

    assert len(log_ids) == 3
    assert _prod_qty(db_session, comp_b.item_id) == D("6")
    assert _prod_qty(db_session, comp_c.item_id) == D("3")
    assert _prod_qty(db_session, result.item_id) == D("1")

    types = _tx_types(db_session)
    assert types.count("BACKFLUSH") == 2
    assert types.count("PRODUCE") == 1


def test_submit_production_manual_edit(make_item, make_location, db_session):
    """BOM 기대값과 다른 수량으로 제출 시 실입력 기준으로 처리됨."""
    comp = make_item(name="AR")
    result = make_item(name="AF")
    make_location(comp.item_id, department=ASSEMBLY, quantity=D("10"))

    lines = [
        svc.AdjLine(
            item_id=comp.item_id, direction="out", quantity=D("7"),  # bom 기대 2와 다름
            department=ASSEMBLY, bom_expected=D("2")
        ),
        svc.AdjLine(item_id=result.item_id, direction="in", quantity=D("1"), department=ASSEMBLY),
    ]
    svc.submit_adjustment(db_session, DeptAdjSubTypeEnum.PRODUCTION, lines)
    db_session.commit()

    assert _prod_qty(db_session, comp.item_id) == D("3")  # 10 - 7


def test_submit_disassembly_mixed(make_item, make_location, db_session):
    """분해: out + in + defective 혼합."""
    target = make_item(name="AF")
    b = make_item(name="AR1")
    c = make_item(name="AR2")

    make_location(target.item_id, department=ASSEMBLY, quantity=D("5"))
    make_location(b.item_id, department=ASSEMBLY, quantity=D("0"))
    make_location(c.item_id, department=ASSEMBLY, quantity=D("2"))

    lines = [
        svc.AdjLine(item_id=target.item_id, direction="out",      quantity=D("1"), department=ASSEMBLY),
        svc.AdjLine(item_id=b.item_id,      direction="in",       quantity=D("2"), department=ASSEMBLY),
        svc.AdjLine(item_id=c.item_id,      direction="defective", quantity=D("1"), department=ASSEMBLY),
    ]

    log_ids = svc.submit_adjustment(
        db_session, DeptAdjSubTypeEnum.DISASSEMBLY, lines, operator_name="작업자"
    )
    db_session.commit()

    assert len(log_ids) == 3
    assert _prod_qty(db_session, target.item_id) == D("4")   # 5 - 1
    assert _prod_qty(db_session, b.item_id)      == D("2")   # 0 + 2
    assert _defective_qty(db_session, c.item_id) == D("1")

    types = _tx_types(db_session)
    assert "DISASSEMBLE" in types
    assert "RECEIVE" in types
    assert "MARK_DEFECTIVE" in types


def test_submit_correction_in_out(make_item, make_location, db_session):
    """수량 보정: 양방향 ADJUST."""
    item_a = make_item(name="A")
    item_b = make_item(name="B")
    make_location(item_b.item_id, department=ASSEMBLY, quantity=D("5"))

    lines = [
        svc.AdjLine(item_id=item_a.item_id, direction="in",  quantity=D("3"), department=ASSEMBLY, reason="발견"),
        svc.AdjLine(item_id=item_b.item_id, direction="out", quantity=D("2"), department=ASSEMBLY, reason="누락 확인"),
    ]
    svc.submit_adjustment(db_session, DeptAdjSubTypeEnum.CORRECTION, lines)
    db_session.commit()

    assert _prod_qty(db_session, item_a.item_id) == D("3")
    assert _prod_qty(db_session, item_b.item_id) == D("3")  # 5 - 2

    types = _tx_types(db_session)
    assert types.count("ADJUST") == 2


def test_submit_insufficient_stock_raises(make_item, make_location, db_session):
    """부서 재고 부족 시 ValueError."""
    item = make_item(name="X")
    make_location(item.item_id, department=ASSEMBLY, quantity=D("2"))

    lines = [
        svc.AdjLine(item_id=item.item_id, direction="out", quantity=D("5"), department=ASSEMBLY),
    ]
    with pytest.raises(ValueError, match="재고 부족"):
        svc.submit_adjustment(db_session, DeptAdjSubTypeEnum.CORRECTION, lines)


def test_submit_atomicity(make_item, make_location, db_session):
    """2번째 라인 부족 → 전체 롤백: 1번째 품목 재고 원복."""
    item_a = make_item(name="A")
    item_b = make_item(name="B")
    make_location(item_a.item_id, department=ASSEMBLY, quantity=D("10"))
    make_location(item_b.item_id, department=ASSEMBLY, quantity=D("1"))  # 부족
    db_session.commit()  # setup 데이터 커밋 (이후 rollback이 여기까지만 되돌림)

    lines = [
        svc.AdjLine(item_id=item_a.item_id, direction="out", quantity=D("5"), department=ASSEMBLY),
        svc.AdjLine(item_id=item_b.item_id, direction="out", quantity=D("5"), department=ASSEMBLY),
    ]

    with pytest.raises(ValueError):
        svc.submit_adjustment(db_session, DeptAdjSubTypeEnum.CORRECTION, lines)

    db_session.rollback()

    # item_a 재고 원복 확인 (5로 줄었다가 rollback으로 10 복원)
    assert _prod_qty(db_session, item_a.item_id) == D("10")


def test_submit_empty_lines_raises(db_session):
    with pytest.raises(ValueError, match="라인"):
        svc.submit_adjustment(db_session, DeptAdjSubTypeEnum.CORRECTION, [])
