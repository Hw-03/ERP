"""AF 기준 생산 가능 수량 서비스 순수 테스트 (HTTP 불필요).

compute_capacity() 를 직접 호출해 ship_ready / fast_assembly / total_production
및 bom_status·pf_variants·legacy 보존을 검증한다.
"""

from __future__ import annotations

from decimal import Decimal

from app.services.production_capacity import compute_capacity


def _af_row(result: dict, af_item_id) -> dict:
    return next(
        r for r in result["af"]["items"] if r["af_item_id"] == str(af_item_id)
    )


def _variants_for(result: dict, af_item_id) -> list[dict]:
    return [
        v for v in result["af"]["pf_variants"] if v["af_item_id"] == str(af_item_id)
    ]


def test_af_without_children_included_as_incomplete(
    db_session, make_item, make_bom
):
    """① 직계 자식 없는 AF 도 items[] 에 포함되고 incomplete."""
    af = make_item(name="조립완제품", process_type_code="AF", warehouse_qty=Decimal("3"))
    db_session.commit()

    result = compute_capacity(db_session)
    row = _af_row(result, af.item_id)

    assert row["has_direct_children"] is False
    assert row["bom_status"] == "incomplete"
    assert row["has_pf_path"] is False
    # 직계 자식 없음 → 자기 보유 재고만
    assert row["fast_assembly"] == 3
    assert row["total_production"] == 3
    assert row["ship_ready"] == 0  # PF 변형 없음

    # 모든 AF 가 미등록 → bom_not_registered
    assert result["af"]["status"] == "bom_not_registered"


def test_fast_assembly_limited_by_direct_nf_shortage(db_session, make_item, make_bom):
    """② AF 직계 NF 재고 부족 시 fast_assembly 가 제한되고 병목이 그 NF."""
    af = make_item(name="조립완제품", process_type_code="AF", warehouse_qty=Decimal("0"))
    nf = make_item(name="튜닝완료품", process_type_code="NF", warehouse_qty=Decimal("2"))
    aa = make_item(name="조립중간품", process_type_code="AA", warehouse_qty=Decimal("10"))
    make_bom(af.item_id, nf.item_id, Decimal("1"))
    make_bom(af.item_id, aa.item_id, Decimal("1"))
    db_session.commit()

    result = compute_capacity(db_session)
    row = _af_row(result, af.item_id)

    # own(0) + min(floor(2/1), floor(10/1)) = 2, 병목 NF
    assert row["fast_assembly"] == 2
    assert row["fast_assembly_limiting_item"] == "튜닝완료품"
    assert row["total_production"] == 2  # NF=2 가 여전히 제한
    assert row["bom_status"] == "complete"
    assert result["af"]["status"] == "producible"


def test_fast_assembly_includes_existing_af_stock(db_session, make_item, make_bom):
    """③ fast_assembly 는 기존 AF 재고를 포함한 총 대응량 (5 + 3 = 8)."""
    af = make_item(name="조립완제품", process_type_code="AF", warehouse_qty=Decimal("5"))
    child = make_item(name="조립자재", process_type_code="AA", warehouse_qty=Decimal("3"))
    make_bom(af.item_id, child.item_id, Decimal("1"))
    db_session.commit()

    result = compute_capacity(db_session)
    row = _af_row(result, af.item_id)

    assert row["fast_assembly"] == 8  # 기존 5 + 추가 3
    assert row["total_production"] == 8


def test_multiple_pf_variants_listed(db_session, make_item, make_bom):
    """④ 한 AF 에 여러 PF 변형이 연결되면 pf_variants[] 에 각각 출력."""
    af = make_item(name="조립완제품", process_type_code="AF", warehouse_qty=Decimal("10"))
    pf1 = make_item(name="출하변형1", process_type_code="PF", warehouse_qty=Decimal("0"))
    pf2 = make_item(name="출하변형2", process_type_code="PF", warehouse_qty=Decimal("0"))
    make_bom(pf1.item_id, af.item_id, Decimal("1"))
    make_bom(pf2.item_id, af.item_id, Decimal("1"))
    db_session.commit()

    result = compute_capacity(db_session)
    variants = _variants_for(result, af.item_id)

    assert len(variants) == 2
    assert {v["pf_item_id"] for v in variants} == {str(pf1.item_id), str(pf2.item_id)}

    row = _af_row(result, af.item_id)
    assert row["has_pf_path"] is True


def test_ship_ready_is_max_over_variants_with_packaging(db_session, make_item, make_bom):
    """⑤ 포장 부족 PF 변형은 낮은 ship_ready, AF 요약은 변형 중 최대값."""
    af = make_item(name="조립완제품", process_type_code="AF", warehouse_qty=Decimal("10"))
    # 변형1: 포장재1 부족(2) → ship_ready = min(10, 2) = 2
    pf1 = make_item(name="출하변형1", process_type_code="PF", warehouse_qty=Decimal("0"))
    pr1 = make_item(name="포장재1", process_type_code="PR", warehouse_qty=Decimal("2"))
    make_bom(pf1.item_id, af.item_id, Decimal("1"))
    make_bom(pf1.item_id, pr1.item_id, Decimal("1"))
    # 변형2: 포장재2 여유(8) → ship_ready = min(10, 8) = 8
    pf2 = make_item(name="출하변형2", process_type_code="PF", warehouse_qty=Decimal("0"))
    pr2 = make_item(name="포장재2", process_type_code="PR", warehouse_qty=Decimal("8"))
    make_bom(pf2.item_id, af.item_id, Decimal("1"))
    make_bom(pf2.item_id, pr2.item_id, Decimal("1"))
    db_session.commit()

    result = compute_capacity(db_session)
    variants = {v["pf_item_id"]: v for v in _variants_for(result, af.item_id)}

    v1 = variants[str(pf1.item_id)]
    v2 = variants[str(pf2.item_id)]
    assert v1["ship_ready"] == 2
    assert v1["limiting_item"] == "포장재1"
    assert v2["ship_ready"] == 8

    row = _af_row(result, af.item_id)
    assert row["ship_ready"] == 8  # 변형 중 최대
    assert row["ship_ready_limiting_item"] == "포장재2"


def test_ship_ready_never_exceeds_af_stock(db_session, make_item, make_bom):
    """ship_ready 는 AF 재고를 절대 넘지 않는다 (포장 충분해도 AF 가 cap)."""
    af = make_item(name="조립완제품", process_type_code="AF", warehouse_qty=Decimal("3"))
    pf = make_item(name="출하완제품", process_type_code="PF", warehouse_qty=Decimal("0"))
    pr = make_item(name="포장재", process_type_code="PR", warehouse_qty=Decimal("999"))
    make_bom(pf.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pr.item_id, Decimal("1"))
    db_session.commit()

    result = compute_capacity(db_session)
    row = _af_row(result, af.item_id)

    assert row["ship_ready"] == 3  # AF 재고 cap
    assert row["ship_ready_limiting_item"] == "조립완제품"


def test_ship_ready_ignores_sibling_af_materials(db_session, make_item, make_bom):
    """⑦ 한 PF/PA 아래 형제 AF 가 있어도, 형제 AF 하위 자재는 대상 AF ship_ready 에 영향 없음."""
    pf = make_item(name="출하완제품", process_type_code="PF", warehouse_qty=Decimal("0"))
    pa = make_item(name="출하중간품", process_type_code="PA", warehouse_qty=Decimal("100"))
    af1 = make_item(name="조립A", process_type_code="AF", warehouse_qty=Decimal("5"))
    af2 = make_item(name="조립B", process_type_code="AF", warehouse_qty=Decimal("5"))
    x = make_item(name="자재X", process_type_code="AR", warehouse_qty=Decimal("10"))
    y = make_item(name="자재Y", process_type_code="AR", warehouse_qty=Decimal("0"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    make_bom(pa.item_id, af1.item_id, Decimal("1"))
    make_bom(pa.item_id, af2.item_id, Decimal("1"))
    make_bom(af1.item_id, x.item_id, Decimal("1"))
    make_bom(af2.item_id, y.item_id, Decimal("1"))
    db_session.commit()

    result = compute_capacity(db_session)
    row1 = _af_row(result, af1.item_id)

    # AF1 ship_ready = AF1 재고(5) cap. 형제 AF2 의 자재Y(0) 가 throttle 하면 안 됨.
    assert row1["ship_ready"] == 5
    assert row1["ship_ready_limiting_item"] != "자재Y"


def test_total_production_shared_subcomponent_no_overcount(
    db_session, make_item, make_bom
):
    """⑧ 한 AF 내부 형제 가지가 공유하는 하위 자재는 합산 배분 — 과대 계산 없음."""
    af = make_item(name="조립완제품", process_type_code="AF", warehouse_qty=Decimal("0"))
    branch_l = make_item(name="가지L", process_type_code="AA", warehouse_qty=Decimal("0"))
    branch_r = make_item(name="가지R", process_type_code="AA", warehouse_qty=Decimal("0"))
    shared = make_item(name="공유자재Z", process_type_code="AR", warehouse_qty=Decimal("10"))
    make_bom(af.item_id, branch_l.item_id, Decimal("1"))
    make_bom(af.item_id, branch_r.item_id, Decimal("1"))
    make_bom(branch_l.item_id, shared.item_id, Decimal("1"))
    make_bom(branch_r.item_id, shared.item_id, Decimal("1"))
    db_session.commit()

    result = compute_capacity(db_session)
    row = _af_row(result, af.item_id)

    # AF 1개당 Z 를 양쪽 가지에서 2개 소비 → Z=10 → 최대 5 (단순 재귀였다면 10 으로 과대)
    assert row["total_production"] == 5
    assert row["total_production_limiting_item"] == "공유자재Z"


def test_total_production_shared_asymmetric_per_unit(db_session, make_item, make_bom):
    """⑨ 공유 자재 비대칭 소요(L 2개·R 3개)도 경로배수 합산으로 정확."""
    af = make_item(name="조립완제품", process_type_code="AF", warehouse_qty=Decimal("0"))
    branch_l = make_item(name="가지L", process_type_code="AA", warehouse_qty=Decimal("0"))
    branch_r = make_item(name="가지R", process_type_code="AA", warehouse_qty=Decimal("0"))
    shared = make_item(name="공유자재Z", process_type_code="AR", warehouse_qty=Decimal("60"))
    make_bom(af.item_id, branch_l.item_id, Decimal("2"))
    make_bom(af.item_id, branch_r.item_id, Decimal("3"))
    make_bom(branch_l.item_id, shared.item_id, Decimal("1"))
    make_bom(branch_r.item_id, shared.item_id, Decimal("1"))
    db_session.commit()

    result = compute_capacity(db_session)
    row = _af_row(result, af.item_id)

    # AF당 Z = 2+3 = 5 → floor(60/5) = 12
    assert row["total_production"] == 12


def test_total_production_preserves_intermediate_stock(db_session, make_item, make_bom):
    """⑩ total_production 은 중간 노드 자체 재고를 보존(leaf 로 깎지 않음)."""
    af = make_item(name="조립완제품", process_type_code="AF", warehouse_qty=Decimal("0"))
    mid = make_item(name="중간조립", process_type_code="AA", warehouse_qty=Decimal("3"))
    raw = make_item(name="원자재", process_type_code="AR", warehouse_qty=Decimal("10"))
    make_bom(af.item_id, mid.item_id, Decimal("1"))
    make_bom(mid.item_id, raw.item_id, Decimal("2"))  # 중간 1개당 원자재 2개
    db_session.commit()

    result = compute_capacity(db_session)
    row = _af_row(result, af.item_id)

    # 중간 보유 3 + 원자재로 추가 floor(10/2)=5 → 중간 8 → AF 8
    assert row["total_production"] == 8


def test_fast_assembly_floor_and_bottleneck_ordering(db_session, make_item, make_bom):
    """⑪ fast_assembly per_unit>1 floor 절삭 + 병목이 후순위 자식이어도 정확."""
    af = make_item(name="조립완제품", process_type_code="AF", warehouse_qty=Decimal("0"))
    plenty = make_item(name="여유자재", process_type_code="AA", warehouse_qty=Decimal("100"))
    tight = make_item(name="빠듯자재", process_type_code="AA", warehouse_qty=Decimal("7"))
    make_bom(af.item_id, plenty.item_id, Decimal("1"))
    make_bom(af.item_id, tight.item_id, Decimal("3"))  # 후순위 자식이 병목
    db_session.commit()

    result = compute_capacity(db_session)
    row = _af_row(result, af.item_id)

    # own(0) + min(floor(100/1), floor(7/3)=2) = 2, 병목 빠듯자재
    assert row["fast_assembly"] == 2
    assert row["fast_assembly_limiting_item"] == "빠듯자재"


def test_legacy_fields_preserved(db_session, make_item, make_bom):
    """⑥ legacy(PF 합산) 필드는 기존과 같은 값을 유지."""
    # 기존 test_capacity_pf_stock_only 와 동일 시나리오
    pf = make_item(name="완제품A", process_type_code="PF", warehouse_qty=Decimal("0"))
    simple_part = make_item(
        name="단순부품", process_type_code="AA", warehouse_qty=Decimal("10")
    )
    make_bom(pf.item_id, simple_part.item_id, Decimal("1"))
    db_session.commit()

    result = compute_capacity(db_session)

    assert result["immediate"] == 10
    assert result["maximum"] == 10
    assert result["status"] == "producible"
    assert len(result["top_items"]) == 1
    assert result["top_items"][0]["item_id"] == str(pf.item_id)
    # af 블록도 함께 존재 (이 시나리오엔 AF 품목 없음)
    assert result["af"]["basis"] == "AF"
    assert result["af"]["status"] == "no_target"
