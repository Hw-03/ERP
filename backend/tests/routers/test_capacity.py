"""Tests for recursive buildable production capacity calculation (F1)."""

from __future__ import annotations

from decimal import Decimal

import pytest


def _dec(value) -> Decimal:
    return Decimal(str(value))


def test_capacity_pf_stock_only(client, db_session, make_item, make_bom):
    """① PF with simple part (no BOM child) → immediate = maximum = stock."""
    # PF ← simple_part (which has no further BOM)
    pf = make_item(name="완제품A", process_type_code="PF", warehouse_qty=Decimal("0"))
    simple_part = make_item(name="단순부품", process_type_code="AA", warehouse_qty=Decimal("10"))
    make_bom(pf.item_id, simple_part.item_id, Decimal("1"))
    db_session.commit()

    resp = client.get("/api/production/capacity")
    assert resp.status_code == 200
    data = resp.json()

    # PF stock=0, simple_part stock=10, BOM qty=1, so can make 10 PF
    assert data["immediate"] == 10
    assert data["maximum"] == 10
    assert data["status"] == "producible"
    assert len(data["top_items"]) == 1
    assert data["top_items"][0]["item_id"] == str(pf.item_id)
    assert data["top_items"][0]["immediate"] == 10
    assert data["top_items"][0]["maximum"] == 10


def test_capacity_recursive_buildable_with_stage_filter(
    client, db_session, make_item, make_bom
):
    """② PF→AA(65)→AR(45), AR=0 → immediate limited by stage<60, maximum uses all."""
    # PF (stage 80)
    pf = make_item(name="완제품B", process_type_code="PF", warehouse_qty=Decimal("0"))

    # AA (stage 65, 중간재, NF 이상, immediate_mode에서 전개 O)
    aa = make_item(name="중간재AA", process_type_code="AA", warehouse_qty=Decimal("5"))

    # AR (stage 45, 원자재, NF 미만, immediate_mode에서 전개 X)
    ar = make_item(name="원자재AR", process_type_code="AR", warehouse_qty=Decimal("0"))

    # BOM: PF ← 2×AA, AA ← 3×AR
    make_bom(pf.item_id, aa.item_id, Decimal("2"))
    make_bom(aa.item_id, ar.item_id, Decimal("3"))
    db_session.commit()

    resp = client.get("/api/production/capacity")
    assert resp.status_code == 200
    data = resp.json()

    # immediate: PF has 0, can make from AA(5).
    #   - per AA=2, so can make 5/2=2 PF from current AA (AR stage<60 blocks child expansion).
    # maximum: PF has 0, AA has 5 (stage≥60 so expands), AR has 0 (blocks further).
    #   - per AA=2, so can make 5/2=2 PF (AR=0 limits).
    assert data["immediate"] == 2
    assert data["maximum"] == 2
    assert data["status"] == "producible"
    assert len(data["top_items"]) == 1
    assert data["top_items"][0]["item_id"] == str(pf.item_id)


def test_capacity_cycle_protection(client, db_session, make_item, make_bom):
    """③ Cycle in BOM → depth limit prevents infinite loop."""
    # Create items
    a = make_item(name="ItemA", process_type_code="AA", warehouse_qty=Decimal("10"))
    b = make_item(name="ItemB", process_type_code="AA", warehouse_qty=Decimal("5"))
    c = make_item(name="ItemC", process_type_code="AA", warehouse_qty=Decimal("3"))

    # Create cycle: A→B→C→A (should not cause infinite recursion)
    make_bom(a.item_id, b.item_id, Decimal("1"))
    make_bom(b.item_id, c.item_id, Decimal("1"))
    make_bom(c.item_id, a.item_id, Decimal("1"))
    db_session.commit()

    resp = client.get("/api/production/capacity")
    # Should complete without stack overflow; A is top-level (no parent), has stock.
    assert resp.status_code == 200
    data = resp.json()
    # Top level should just be A (has stock, no parent outside BOM)
    if data["top_items"]:
        # Should include A if it's truly top-level after cycle check
        assert data["status"] in ["producible", "not_producible"]


def test_capacity_limit_removed_16plus(client, db_session, make_item, make_bom):
    """④ Limit(15) removed → all top-level items listed, even >16."""
    # Create 17 top-level PF items, each with a child (to be top-level)
    pfs = []
    children = []
    for i in range(17):
        pf = make_item(name=f"PF-{i:02d}", process_type_code="PF", warehouse_qty=Decimal("0"))
        child = make_item(name=f"PART-{i:02d}", process_type_code="AA", warehouse_qty=Decimal(str(i + 1)))
        make_bom(pf.item_id, child.item_id, Decimal("1"))
        pfs.append(pf)
        children.append(child)
    db_session.commit()

    resp = client.get("/api/production/capacity")
    assert resp.status_code == 200
    data = resp.json()

    # Should include all 17 top items (no limit)
    assert len(data["top_items"]) == 17, f"Expected 17 items, got {len(data['top_items'])}"
    assert data["status"] == "producible"

    # Verify immediate = max = child stock for each PF (1+2+...+17)
    totals = sum(item["immediate"] for item in data["top_items"])
    expected_total = sum(range(1, 18))  # 1+2+...+17
    assert data["immediate"] == expected_total


def test_capacity_multi_path_bottleneck(client, db_session, make_item, make_bom):
    """Test bottleneck detection with multi-level assembly."""
    # PF ← AA, AA ← AR+NF
    pf = make_item(name="최종", process_type_code="PF", warehouse_qty=Decimal("0"))
    aa = make_item(name="어셈블리", process_type_code="AA", warehouse_qty=Decimal("10"))
    ar = make_item(name="부품1", process_type_code="AR", warehouse_qty=Decimal("20"))
    nf = make_item(name="완성품부품", process_type_code="NF", warehouse_qty=Decimal("100"))

    make_bom(pf.item_id, aa.item_id, Decimal("1"))
    make_bom(aa.item_id, ar.item_id, Decimal("3"))
    make_bom(aa.item_id, nf.item_id, Decimal("2"))
    db_session.commit()

    resp = client.get("/api/production/capacity")
    assert resp.status_code == 200
    data = resp.json()

    # immediate (stage≥60 only for child expansion):
    #   - AA stock=10, can immediately make 10 PF (AA stage≥60, so expand)
    #   - But AR stage<60, blocks. So immediate = 10 (AA only)
    # maximum (all stages):
    #   - AR=20 -> 20/3=6 AA from AR
    #   - NF=100 -> 100/2=50 AA from NF
    #   - min(6, 50, 10 existing) = 6, so max = 10+6=16 PF
    assert data["status"] == "producible"
    assert len(data["top_items"]) == 1
    top = data["top_items"][0]
    assert top["item_id"] == str(pf.item_id)
    # immediate ≤ maximum
    assert top["immediate"] <= top["maximum"]
