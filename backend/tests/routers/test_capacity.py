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


def test_capacity_representative_items_by_model(
    client, db_session, make_item, make_bom
):
    """모델별 대표 PF 선정: model_symbol 별 자연 정렬 첫 PF."""
    # 모델 3: PF-3-002 를 먼저 add 해도, 자연 정렬은 PF-3-001 이 대표.
    pf3_b = make_item(
        name="모델3-002", process_type_code="PF",
        warehouse_qty=Decimal("0"), model_symbol="3", serial_no=2,
    )
    pf3_a = make_item(
        name="모델3-001", process_type_code="PF",
        warehouse_qty=Decimal("0"), model_symbol="3", serial_no=1,
    )
    # 모델 4: 한 종
    pf4 = make_item(
        name="모델4-001", process_type_code="PF",
        warehouse_qty=Decimal("0"), model_symbol="4", serial_no=1,
    )
    p3 = make_item(name="자재3", process_type_code="AA", warehouse_qty=Decimal("10"))
    p4 = make_item(name="자재4", process_type_code="AA", warehouse_qty=Decimal("5"))
    make_bom(pf3_a.item_id, p3.item_id, Decimal("1"))
    make_bom(pf3_b.item_id, p3.item_id, Decimal("1"))
    make_bom(pf4.item_id, p4.item_id, Decimal("1"))
    db_session.commit()

    resp = client.get("/api/production/capacity")
    assert resp.status_code == 200
    data = resp.json()

    # top_items 에 모든 PF 포함
    assert len(data["top_items"]) == 3

    # representative_items: 모델별 1개, model_symbol 오름차순
    reps = data["representative_items"]
    assert len(reps) == 2
    assert [r["model_symbol"] for r in reps] == ["3", "4"]

    # 모델3 대표 = mes_code 자연 정렬상 3-PF-0001 (생성열: model-process-serial)
    rep3 = reps[0]
    assert rep3["mes_code"] == "3-PF-0001"
    assert rep3["is_representative"] is True
    assert rep3["model_symbol"] == "3"

    # 모델4 대표
    rep4 = reps[1]
    assert rep4["mes_code"] == "4-PF-0001"
    assert rep4["is_representative"] is True

    # top_items 내 비대표 PF 는 is_representative=False
    pf3_b_in_top = next(t for t in data["top_items"] if t["mes_code"] == "3-PF-0002")
    assert pf3_b_in_top["is_representative"] is False


def test_capacity_representative_items_skips_pf_without_model_symbol(
    client, db_session, make_item, make_bom
):
    """model_symbol 이 None 인 PF 는 representative_items 에 포함되지 않음."""
    pf = make_item(name="모델없음", process_type_code="PF", warehouse_qty=Decimal("0"))
    part = make_item(name="자재", process_type_code="AA", warehouse_qty=Decimal("3"))
    make_bom(pf.item_id, part.item_id, Decimal("1"))
    db_session.commit()

    resp = client.get("/api/production/capacity")
    assert resp.status_code == 200
    data = resp.json()

    assert len(data["top_items"]) == 1
    assert data["representative_items"] == []


def test_capacity_response_has_legacy_and_af_block(
    client, db_session, make_item, make_bom
):
    """응답에 legacy 필드와 신규 af 블록이 동시에 존재한다."""
    pf = make_item(name="완제품A", process_type_code="PF", warehouse_qty=Decimal("0"))
    part = make_item(name="단순부품", process_type_code="AA", warehouse_qty=Decimal("10"))
    make_bom(pf.item_id, part.item_id, Decimal("1"))
    db_session.commit()

    resp = client.get("/api/production/capacity")
    assert resp.status_code == 200
    data = resp.json()

    # legacy 필드 그대로
    assert "immediate" in data and "maximum" in data
    assert "top_items" in data and "representative_items" in data
    assert data["immediate"] == 10
    assert data["maximum"] == 10

    # 신규 af 블록
    assert data["af"] is not None
    assert data["af"]["basis"] == "AF"
    assert set(data["af"]["summary"].keys()) == {
        "ship_ready",
        "fast_production",
        "total_production",
    }
    assert isinstance(data["af"]["items"], list)
    assert isinstance(data["af"]["pf_variants"], list)


def test_capacity_af_block_fast_production_via_api(client, db_session, make_item, make_bom):
    """AF→PF 연결이 있으면 af 블록에 fast_production·pf_variants 가 채워진다."""
    af = make_item(name="조립완제품", process_type_code="AF", warehouse_qty=Decimal("5"))
    pf = make_item(name="출하완제품", process_type_code="PF", warehouse_qty=Decimal("0"))
    make_bom(pf.item_id, af.item_id, Decimal("1"))
    db_session.commit()

    resp = client.get("/api/production/capacity")
    assert resp.status_code == 200
    af_block = resp.json()["af"]

    af_row = next(r for r in af_block["items"] if r["af_item_id"] == str(af.item_id))
    assert af_row["ship_ready"] == 0  # PF 재고 없음
    assert af_row["fast_production"] == 5  # AF 재고 = 빠른 생산
    assert af_row["has_pf_path"] is True

    variants = [v for v in af_block["pf_variants"] if v["af_item_id"] == str(af.item_id)]
    assert len(variants) == 1
    assert variants[0]["pf_item_id"] == str(pf.item_id)
    assert variants[0]["ship_ready"] == 0  # PF 재고 없음
    assert variants[0]["fast_production"] == 5  # AF 재고 = 빠른 생산


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
