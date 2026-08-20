"""services/io_preview.py 단위 테스트 — 라우팅 규칙 + BOM 전개.

preview()/_route_for_sub_type 를 DB 세션 직접 호출로 검증(HTTP 불필요).
targets 는 .item_id/.quantity/.source_kind 만 읽으므로 SimpleNamespace 로 대체.
"""
from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.models import DepartmentEnum, LocationStatusEnum
from app.services import io_preview as iop

D = Decimal


def _target(item_id, quantity="1", source_kind="direct_item", source_location=None):
    return SimpleNamespace(
        item_id=item_id,
        quantity=D(quantity),
        source_kind=source_kind,
        source_location=source_location,
    )


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


def test_route_disassemble_result_prefers_selected_to_department(make_item):
    route = iop._route_for_sub_type(
        "disassemble",
        item=make_item(),
        from_department="출하",
        to_department="조립",
        role="result",
    )

    assert route == ("out", "production", "조립", "none", None)


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


def test_preview_internal_use_expands_bom_parent(db_session, make_item, make_bom):
    parent = make_item(name="사내 사용 BOM 부모", process_type_code="AF")
    child = make_item(name="사내 사용 BOM 구성품", process_type_code="AR")
    make_bom(parent.item_id, child.item_id, D("2"))
    db_session.commit()

    result = iop.preview(
        db_session,
        work_type="internal_use",
        sub_type="internal_use_out",
        targets=[_target(parent.item_id, "3")],
        to_department="AS",
    )

    bundle = result["bundles"][0]
    assert bundle["source_kind"] == "bom_parent"
    assert bundle["lines"] == [
        {
            **bundle["lines"][0],
            "item_id": child.item_id,
            "origin": "bom_auto",
            "quantity": D("6"),
            "direction": "out",
            "from_bucket": "warehouse",
            "to_bucket": "none",
            "to_department": "AS",
        }
    ]


def test_preview_internal_use_manual_from_code_department(db_session, make_item):
    item = make_item(name="고압 부서 사용품", process_type_code="HF")

    result = iop.preview(
        db_session,
        work_type="internal_use",
        sub_type="internal_use_out",
        targets=[_target(item.item_id, source_kind="manual", source_location="department")],
        to_department="AS",
    )

    line = result["bundles"][0]["lines"][0]
    assert line["from_bucket"] == "production"
    assert line["from_department"] == "고압"
    assert line["to_bucket"] == "none"
    assert line["to_department"] == "AS"


def test_preview_internal_use_department_bom_routes_each_child_by_code(
    db_session, make_item, make_bom
):
    parent = make_item(name="연구 사용 BOM", process_type_code="AF")
    tube_child = make_item(name="튜브 구성품", process_type_code="TF")
    high_voltage_child = make_item(name="고압 구성품", process_type_code="HF")
    make_bom(parent.item_id, tube_child.item_id, D("2"))
    make_bom(parent.item_id, high_voltage_child.item_id, D("3"))
    db_session.commit()

    result = iop.preview(
        db_session,
        work_type="internal_use",
        sub_type="internal_use_out",
        targets=[_target(parent.item_id, "4", source_location="department")],
        to_department="연구",
    )

    lines_by_item_id = {
        line["item_id"]: line for line in result["bundles"][0]["lines"]
    }
    assert lines_by_item_id[tube_child.item_id]["from_bucket"] == "production"
    assert lines_by_item_id[tube_child.item_id]["from_department"] == "튜브"
    assert lines_by_item_id[tube_child.item_id]["quantity"] == D("8")
    assert lines_by_item_id[high_voltage_child.item_id]["from_bucket"] == "production"
    assert lines_by_item_id[high_voltage_child.item_id]["from_department"] == "고압"
    assert lines_by_item_id[high_voltage_child.item_id]["quantity"] == D("12")


def test_preview_internal_use_department_falls_back_to_assembly(db_session, make_item):
    item = make_item(name="공정 미매핑 사용품", process_type_code="AR")

    result = iop.preview(
        db_session,
        work_type="internal_use",
        sub_type="internal_use_out",
        targets=[_target(item.item_id, source_kind="manual", source_location="department")],
        to_department="AS",
    )

    line = result["bundles"][0]["lines"][0]
    assert line["from_bucket"] == "production"
    assert line["from_department"] == "조립"


def test_preview_rejects_source_location_outside_internal_use(db_session, make_item):
    with pytest.raises(ValueError, match="AS·연구 사용출고"):
        iop.preview(
            db_session,
            work_type="receive",
            sub_type="receive_supplier",
            targets=[_target(make_item().item_id, source_location="department")],
        )


def test_preview_rejects_unknown_internal_use_source_location(db_session, make_item):
    with pytest.raises(ValueError, match="warehouse 또는 department"):
        iop.preview(
            db_session,
            work_type="internal_use",
            sub_type="internal_use_out",
            targets=[_target(make_item().item_id, source_location="defective")],
            to_department="AS",
        )


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


def test_preview_excludes_flagged_bom_child_from_inventory(db_session, make_item, make_bom):
    parent = make_item(name="BOM 부모", process_type_code="AF")
    child = make_item(name="롤 단위 자재", process_type_code="AR")
    child.bom_stock_exempt = True
    make_bom(parent.item_id, child.item_id, D("2"))
    db_session.commit()

    out = iop.preview(
        db_session,
        work_type="process",
        sub_type="produce",
        targets=[_target(parent.item_id, "3")],
        to_department="조립",
    )

    component = next(line for line in out["bundles"][0]["lines"] if line["origin"] == "bom_auto")
    assert component["quantity"] == D("6")
    assert component["bom_stock_exempt"] is True
    assert component["included"] is False
    assert component["shortage"] == D("0")
    assert component["exclusion_note"] == "BOM 재고 미반영"
    assert isinstance(component["bom_auto_token"], str)
    assert len(component["bom_auto_token"]) == 64


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
    assert recovered["from_bucket"] == "none"
    assert recovered["shortage"] == D("0")
    assert recovered["exclusion_note"] == iop.DISASSEMBLE_EXCLUSION_NOTE


def test_preview_disassemble_uses_selected_department_for_parent_shortage(
    db_session, make_item, make_location
):
    parent = make_item(name="Disassemble Parent", process_type_code="AF")
    make_location(parent.item_id, department=DepartmentEnum.ASSEMBLY, quantity=D("6"))

    out = iop.preview(
        db_session,
        work_type="process",
        sub_type="disassemble",
        targets=[_target(parent.item_id, "13")],
        from_department=DepartmentEnum.SHIPPING.value,
        to_department=DepartmentEnum.ASSEMBLY.value,
    )

    result = out["bundles"][0]["lines"][0]
    assert result["from_bucket"] == "production"
    assert result["from_department"] == DepartmentEnum.ASSEMBLY.value
    assert result["shortage"] == D("7")


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


@pytest.mark.parametrize(
    ("bucket", "status"),
    [
        ("production", LocationStatusEnum.PRODUCTION),
        ("defective", LocationStatusEnum.DEFECTIVE),
    ],
)
def test_bucket_available_excludes_location_pending(
    db_session, make_item, make_location, bucket, status
):
    item = make_item(name=f"{bucket}-available")
    location = make_location(
        item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        status=status,
        quantity=D("10"),
    )
    location.pending_quantity = D("3")
    db_session.flush()

    available = iop._bucket_available(
        db_session,
        item_id=item.item_id,
        bucket=bucket,
        department=DepartmentEnum.ASSEMBLY.value,
    )

    assert available == D("7")


def test_preview_department_source_shortage_excludes_pending(
    db_session, make_item, make_location
):
    item = make_item(name="production-preview-pending")
    location = make_location(
        item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        quantity=D("10"),
    )
    location.pending_quantity = D("3")
    db_session.flush()

    out = iop.preview(
        db_session,
        work_type="warehouse_io",
        sub_type="dept_to_warehouse",
        targets=[_target(item.item_id, "8")],
        from_department=DepartmentEnum.ASSEMBLY.value,
    )

    assert out["bundles"][0]["lines"][0]["shortage"] == D("1")


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
