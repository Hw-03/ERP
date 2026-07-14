"""services/io_preview.py 단위 테스트 — 라우팅 규칙 + BOM 전개.

preview()/_route_for_sub_type 를 DB 세션 직접 호출로 검증(HTTP 불필요).
targets 는 .item_id/.quantity/.source_kind 만 읽으므로 SimpleNamespace 로 대체.
"""
from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.services import io_preview as iop

D = Decimal


def _target(item_id, quantity="1", source_kind="direct_item"):
    return SimpleNamespace(item_id=item_id, quantity=D(quantity), source_kind=source_kind)


# ──────────────────── _route_for_sub_type (순수 라우팅 규칙) ────────────────────

def test_route_receive_supplier(make_item):
    route = iop._route_for_sub_type("receive_supplier", item=make_item(),
                                    from_department=None, to_department=None)
    assert route == ("in", "none", None, "warehouse", None)


def test_route_warehouse_to_dept(make_item):
    route = iop._route_for_sub_type("warehouse_to_dept", item=make_item(),
                                    from_department=None, to_department="조립")
    assert route == ("move", "warehouse", None, "production", "조립")


def test_route_dept_to_warehouse(make_item):
    route = iop._route_for_sub_type("dept_to_warehouse", item=make_item(),
                                    from_department="조립", to_department=None)
    assert route == ("move", "production", "조립", "warehouse", None)


def test_route_internal_use_out_from_warehouse(make_item):
    route = iop._route_for_sub_type(
        "internal_use_out",
        item=make_item(),
        from_department=None,
        to_department="AS",
    )
    assert route == ("out", "warehouse", None, "none", "AS")


def test_preview_internal_use_requires_warehouse_approval(db_session, make_item):
    item = make_item()

    result = iop.preview(
        db_session,
        work_type="internal_use",
        sub_type="internal_use_out",
        targets=[_target(item.item_id)],
        to_department="AS",
    )

    assert result["requires_approval"] is True


def test_route_defect_quarantine_warehouse_source(make_item):
    route = iop._route_for_sub_type("defect_quarantine", item=make_item(),
                                    from_department="창고", to_department=None)
    assert route == ("defective", "warehouse", None, "defective", "창고")


def test_route_defect_quarantine_dept_source(make_item):
    route = iop._route_for_sub_type("defect_quarantine", item=make_item(),
                                    from_department="조립", to_department=None)
    assert route == ("defective", "production", "조립", "defective", "조립")


def test_route_unknown_sub_type_raises(make_item):
    with pytest.raises(ValueError):
        iop._route_for_sub_type("nope", item=make_item(),
                                from_department=None, to_department=None)


# ──────────────────── preview (BOM 전개 + 묶음) ────────────────────

def test_preview_invalid_work_type(db_session, make_item):
    with pytest.raises(ValueError):
        iop.preview(db_session, work_type="bogus", sub_type="receive_supplier",
                    targets=[_target(make_item().item_id)])


@pytest.mark.parametrize(
    ("work_type", "sub_type"),
    [("internal_use", "receive_supplier"), ("receive", "internal_use_out")],
)
def test_preview_rejects_internal_use_work_sub_type_mismatch(
    db_session, make_item, work_type, sub_type
):
    with pytest.raises(ValueError, match="internal_use"):
        iop.preview(
            db_session,
            work_type=work_type,
            sub_type=sub_type,
            to_department="AS",
            targets=[_target(make_item().item_id)],
        )


def test_preview_receive_single_line(db_session, make_item):
    item = make_item()
    out = iop.preview(db_session, work_type="receive", sub_type="receive_supplier",
                      targets=[_target(item.item_id, "5")])
    assert out["requires_approval"] is False
    lines = out["bundles"][0]["lines"]
    assert len(lines) == 1
    assert lines[0]["direction"] == "in"
    assert lines[0]["to_bucket"] == "warehouse"
    assert lines[0]["quantity"] == D("5")


def test_preview_produce_expands_bom(db_session, make_item, make_bom):
    parent = make_item(name="완제품", process_type_code="AF")
    child = make_item(name="부품", process_type_code="AR")
    make_bom(parent.item_id, child.item_id, D("2"))
    db_session.commit()

    out = iop.preview(db_session, work_type="process", sub_type="produce",
                      targets=[_target(parent.item_id, "3")], to_department="조립")
    bundle = out["bundles"][0]
    assert bundle["source_kind"] == "bom_parent"
    comp = [l for l in bundle["lines"] if l["origin"] == "bom_auto"]
    result = [l for l in bundle["lines"] if l["origin"] == "direct"]
    assert len(comp) == 1 and len(result) == 1
    assert comp[0]["direction"] == "out" and comp[0]["quantity"] == D("6")  # 2*3
    assert result[0]["direction"] == "in" and result[0]["item_id"] == parent.item_id


def test_preview_disassemble_recovers_children(db_session, make_item, make_bom):
    parent = make_item(name="완제품", process_type_code="AF")
    child = make_item(name="부품", process_type_code="AR")
    make_bom(parent.item_id, child.item_id, D("4"))
    db_session.commit()

    out = iop.preview(db_session, work_type="process", sub_type="disassemble",
                      targets=[_target(parent.item_id, "2")], from_department="조립")
    lines = out["bundles"][0]["lines"]
    result = [l for l in lines if l["origin"] == "direct"][0]
    recovered = [l for l in lines if l["origin"] == "bom_auto"][0]
    assert result["direction"] == "out"
    assert recovered["direction"] == "in" and recovered["quantity"] == D("8")  # 4*2
    assert recovered["exclusion_note"] == iop.DISASSEMBLE_EXCLUSION_NOTE


def test_preview_manual_skips_bom_expansion(db_session, make_item, make_bom):
    parent = make_item(name="완제품", process_type_code="AF")
    child = make_item(name="부품", process_type_code="AR")
    make_bom(parent.item_id, child.item_id, D("2"))
    db_session.commit()

    out = iop.preview(db_session, work_type="warehouse_io", sub_type="warehouse_to_dept",
                      targets=[_target(parent.item_id, "1", source_kind="manual")],
                      to_department="조립")
    bundle = out["bundles"][0]
    assert bundle["source_kind"] == "manual"
    assert len(bundle["lines"]) == 1
    assert bundle["lines"][0]["origin"] == "manual"


def test_preview_process_manual_requires_adjustment_instead_of_produce(db_session, make_item, make_bom):
    parent = make_item(name="Manual Process Parent", process_type_code="AF")
    child = make_item(name="Manual Process Child", process_type_code="AR")
    make_bom(parent.item_id, child.item_id, D("2"))
    db_session.commit()

    with pytest.raises(ValueError, match="수량보정 입고"):
        iop.preview(
            db_session,
            work_type="process",
            sub_type="produce",
            targets=[_target(parent.item_id, "1", source_kind="manual")],
            to_department="조립",
        )
