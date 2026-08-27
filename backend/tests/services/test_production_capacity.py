"""AF 기준 생산 가능 수량 서비스 순수 테스트 (HTTP 불필요).

compute_capacity() 를 직접 호출해 ship_ready / fast_production / total_production
및 bom_status·pf_variants·legacy 보존을 검증한다.

설계 변경(2026-06): 3수량 전부 PF 기준으로 통일.
- fast_production  : 현재 AF 재고와 포장 자재로 PA·PF까지 완성 가능한 수량
- total_production : PF 루트로 BOM 전체 재귀 이론 최대
- ship_ready       : PF 완성 재고만 (즉시 출하 가능)

PF 경로가 없는 AF는 3수량이 모두 0이다.
"""

from __future__ import annotations

from decimal import Decimal

from app.models import BOM, Item
from app.services.production_capacity import compute_capacity


def _af_row(result: dict, af_item_id) -> dict:
    return next(
        r for r in result["af"]["items"] if r["af_item_id"] == str(af_item_id)
    )


def _variants_for(result: dict, af_item_id) -> list[dict]:
    return [
        v for v in result["af"]["pf_variants"] if v["af_item_id"] == str(af_item_id)
    ]


def _item_label(item: Item) -> str:
    return f"{item.item_name} ({item.mes_code})"


def test_auto_representatives_choose_largest_sum_then_stable_tie_breaker():
    """모델별 자동 기준은 세 수량 합계와 확정된 동점 규칙으로 하나만 고른다."""
    from app.services import production_capacity

    select = getattr(production_capacity, "select_auto_representatives", None)
    assert select is not None

    representatives = select(
        [
            {
                "model_symbol": "3",
                "pf_item_id": "pf-low",
                "pf_code": "3-PF-0001",
                "ship_ready": 9,
                "fast_production": 0,
                "total_production": 1,
            },
            {
                "model_symbol": "3",
                "pf_item_id": "pf-best",
                "pf_code": "3-PF-0002",
                "ship_ready": 0,
                "fast_production": 8,
                "total_production": 8,
            },
            {
                "model_symbol": "4",
                "pf_item_id": "pf-code-later",
                "pf_code": "4-PF-0009",
                "ship_ready": 1,
                "fast_production": 2,
                "total_production": 3,
            },
            {
                "model_symbol": "4",
                "pf_item_id": "pf-code-first",
                "pf_code": "4-PF-0002",
                "ship_ready": 1,
                "fast_production": 2,
                "total_production": 3,
            },
        ]
    )

    assert [row["pf_item_id"] for row in representatives] == ["pf-best", "pf-code-first"]


def test_auto_representatives_apply_all_tie_breakers():
    """동점은 총생산, 빠른 생산, PF 코드, 품목 ID 순으로 확정한다."""
    from app.services.production_capacity import select_auto_representatives

    representatives = select_auto_representatives(
        [
            # 합계 동점이면 총생산이 큰 후보.
            {"model_symbol": "3", "pf_item_id": "total-low", "pf_code": "3-PF-0001", "ship_ready": 0, "fast_production": 3, "total_production": 7},
            {"model_symbol": "3", "pf_item_id": "total-high", "pf_code": "3-PF-0002", "ship_ready": 0, "fast_production": 2, "total_production": 8},
            # 합계·총생산 동점이면 빠른 생산이 큰 후보.
            {"model_symbol": "4", "pf_item_id": "fast-low", "pf_code": "4-PF-0001", "ship_ready": 2, "fast_production": 3, "total_production": 5},
            {"model_symbol": "4", "pf_item_id": "fast-high", "pf_code": "4-PF-0002", "ship_ready": 1, "fast_production": 4, "total_production": 5},
            # 네 수량 키가 모두 같으면 PF 코드, 이어서 품목 ID 오름차순.
            {"model_symbol": "5", "pf_item_id": "id-z", "pf_code": "5-PF-0002", "ship_ready": 1, "fast_production": 2, "total_production": 3},
            {"model_symbol": "5", "pf_item_id": "id-b", "pf_code": "5-PF-0001", "ship_ready": 1, "fast_production": 2, "total_production": 3},
            {"model_symbol": "6", "pf_item_id": "id-z", "pf_code": "6-PF-0001", "ship_ready": 1, "fast_production": 2, "total_production": 3},
            {"model_symbol": "6", "pf_item_id": "id-a", "pf_code": "6-PF-0001", "ship_ready": 1, "fast_production": 2, "total_production": 3},
        ]
    )

    assert [row["pf_item_id"] for row in representatives] == [
        "total-high",
        "fast-high",
        "id-b",
        "id-a",
    ]


def test_af_capacity_exposes_zero_quantity_pf_as_auto_representative(
    db_session, make_item, make_bom
):
    """PF 경로가 있으면 수량이 모두 0이어도 모델 자동 기준으로 반환한다."""
    af_with_pf = make_item(
        name="자동 기준 대상 AF",
        process_type_code="AF",
        model_symbol="3",
        serial_no=1,
    )
    zero_pf = make_item(
        name="자동 기준 대상 PF",
        process_type_code="PF",
        model_symbol="3",
        serial_no=2,
    )
    af_without_pf = make_item(
        name="출하 경로 없는 AF",
        process_type_code="AF",
        model_symbol="4",
        serial_no=1,
    )
    make_bom(zero_pf.item_id, af_with_pf.item_id, Decimal("1"))
    db_session.commit()

    result = compute_capacity(db_session)
    representatives = result["af"].get("auto_representatives")

    assert representatives == [
        {
            **next(
                variant
                for variant in result["af"]["pf_variants"]
                if variant["pf_item_id"] == str(zero_pf.item_id)
            ),
        }
    ]
    assert representatives[0]["model_symbol"] == "3"
    assert all(representatives[0][key] == 0 for key in ("ship_ready", "fast_production", "total_production"))
    assert all(row["model_symbol"] != af_without_pf.model_symbol for row in representatives)


def test_af_without_children_included_as_incomplete(
    db_session, make_item, make_bom
):
    """① 직계 자식 없는 AF 도 items[] 에 포함되고 incomplete. PF 경로 없으면 수량 0."""
    af = make_item(name="조립완제품", process_type_code="AF", warehouse_qty=Decimal("3"))
    db_session.commit()

    result = compute_capacity(db_session)
    row = _af_row(result, af.item_id)

    assert row["has_direct_children"] is False
    assert row["bom_status"] == "incomplete"
    assert row["has_pf_path"] is False
    # PF 경로 없음 → 3수량 모두 0
    assert row["fast_production"] == 0
    assert row["total_production"] == 0
    assert row["ship_ready"] == 0

    # 모든 AF 가 미등록 → bom_not_registered
    assert result["af"]["status"] == "bom_not_registered"


def test_fast_production_requires_existing_af_stock(db_session, make_item, make_bom):
    """② AF 직계 자재가 있어도 현재 AF 재고가 없으면 빠른 생산은 0이다."""
    af = make_item(name="조립완제품", process_type_code="AF", warehouse_qty=Decimal("0"))
    nf = make_item(name="튜닝완료품", process_type_code="NF", warehouse_qty=Decimal("2"))
    aa = make_item(name="조립중간품", process_type_code="AA", warehouse_qty=Decimal("10"))
    make_bom(af.item_id, nf.item_id, Decimal("1"))
    make_bom(af.item_id, aa.item_id, Decimal("1"))
    pf = make_item(name="출하완제품", process_type_code="PF", warehouse_qty=Decimal("0"))
    make_bom(pf.item_id, af.item_id, Decimal("1"))
    db_session.commit()

    result = compute_capacity(db_session)
    row = _af_row(result, af.item_id)

    assert row["fast_production"] == 0
    assert row["fast_production_limiting_item"] == _item_label(af)
    assert row["total_production"] == 2  # NF=2 가 여전히 제한
    assert row["bom_status"] == "complete"
    assert result["af"]["status"] == "producible"


def test_fast_production_starts_from_existing_af_stock_only(db_session, make_item, make_bom):
    """③ 빠른 생산은 AF 직계 부품으로 AF를 추가 조립하지 않는다."""
    af = make_item(name="조립완제품", process_type_code="AF", warehouse_qty=Decimal("5"))
    child = make_item(name="조립자재", process_type_code="AA", warehouse_qty=Decimal("3"))
    make_bom(af.item_id, child.item_id, Decimal("1"))
    pf = make_item(name="출하완제품", process_type_code="PF", warehouse_qty=Decimal("0"))
    make_bom(pf.item_id, af.item_id, Decimal("1"))
    db_session.commit()

    result = compute_capacity(db_session)
    row = _af_row(result, af.item_id)

    assert row["fast_production"] == 5  # 현재 AF 재고만 빠른 생산의 시작점
    assert row["total_production"] == 8


def test_fast_production_builds_pa_from_packing_materials(db_session, make_item, make_bom):
    """PA 재고가 없어도 AF와 포장 자재가 있으면 빠른 생산을 계산한다."""
    af = make_item(name="테스트 완료 AF", process_type_code="AF", warehouse_qty=Decimal("5"))
    pa = make_item(name="포장 완료품", process_type_code="PA", warehouse_qty=Decimal("0"))
    packing = make_item(name="포장 자재", process_type_code="PR", warehouse_qty=Decimal("3"))
    pf = make_item(name="출하 완제품", process_type_code="PF", warehouse_qty=Decimal("0"))
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pa.item_id, packing.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    db_session.commit()

    result = compute_capacity(db_session)
    row = _af_row(result, af.item_id)

    assert row["fast_production"] == 3
    assert row["fast_production_limiting_item"] == _item_label(packing)


def test_fast_production_keeps_af_stock_cap_when_total_can_build_more(db_session, make_item, make_bom):
    """직원 서버와 같은 PA 경로에서 빠른 생산은 AF 43, 총생산은 106이다."""
    af = make_item(name="직원 서버 AF", process_type_code="AF", warehouse_qty=Decimal("43"))
    af_part = make_item(name="AF 추가 조립 부품", process_type_code="AA", warehouse_qty=Decimal("83"))
    pa = make_item(name="직원 서버 PA", process_type_code="PA", warehouse_qty=Decimal("0"))
    packing = make_item(name="포장 내부폼", process_type_code="PR", warehouse_qty=Decimal("106"))
    pf = make_item(name="직원 서버 PF", process_type_code="PF", warehouse_qty=Decimal("0"))
    make_bom(af.item_id, af_part.item_id, Decimal("1"))
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pa.item_id, packing.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    db_session.commit()

    result = compute_capacity(db_session)
    row = _af_row(result, af.item_id)

    assert row["fast_production"] == 43
    assert row["fast_production_limiting_item"] == _item_label(af)
    assert row["total_production"] == 106


def test_license_label_is_ignored_for_af_capacity_calculation(
    db_session, make_item, make_bom
):
    """OS 라이센스 라벨 재고는 AF 기반 생산 가능 수량을 제한하지 않는다."""
    af = make_item(
        name="ADX4000W 조립 완제품",
        process_type_code="AF",
        warehouse_qty=Decimal("3"),
        model_symbol="4",
        serial_no=1,
    )
    required_part = make_item(
        name="필수 조립 부품",
        process_type_code="AR",
        warehouse_qty=Decimal("3"),
        model_symbol="4",
        serial_no=2,
    )
    license_label = make_item(
        name="OS라이센스 라벨",
        process_type_code="PR",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=58,
    )
    pf = make_item(
        name="ADX4000W 포장 완제품",
        process_type_code="PF",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=3,
    )
    make_bom(af.item_id, required_part.item_id, Decimal("1"))
    make_bom(pf.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, license_label.item_id, Decimal("1"))
    db_session.commit()

    assert license_label.mes_code == "4-PR-0058"

    result = compute_capacity(db_session)
    row = _af_row(result, af.item_id)

    license_label_bom = (
        db_session.query(BOM)
        .filter(
            BOM.parent_item_id == pf.item_id,
            BOM.child_item_id == license_label.item_id,
        )
        .one()
    )
    assert license_label_bom.quantity == 1
    assert result["maximum"] == 0
    assert row["ship_ready"] == 0
    assert row["fast_production"] == 3
    assert row["total_production"] == 6


def test_license_label_only_bom_preserves_af_metadata(
    db_session, make_item, make_bom
):
    """AF 계산에서 제외해도 원본 BOM 기준 완결 메타데이터는 유지한다."""
    af = make_item(
        name="라이센스 라벨 전용 조립 완제품",
        process_type_code="AF",
        model_symbol="4",
        serial_no=1,
    )
    license_label = make_item(
        name="OS라이센스 라벨",
        process_type_code="PR",
        model_symbol="4",
        serial_no=58,
    )
    pf = make_item(
        name="라이센스 라벨 전용 포장 완제품",
        process_type_code="PF",
        model_symbol="4",
        serial_no=3,
    )
    make_bom(af.item_id, license_label.item_id, Decimal("1"))
    make_bom(pf.item_id, af.item_id, Decimal("1"))
    db_session.commit()

    result = compute_capacity(db_session)
    row = _af_row(result, af.item_id)
    variant = _variants_for(result, af.item_id)[0]

    assert license_label.mes_code == "4-PR-0058"
    assert row["has_direct_children"] is True
    assert row["bom_status"] == "complete"
    assert variant["bom_status"] == "complete"


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


def test_fast_production_is_max_over_variants_with_packaging(db_session, make_item, make_bom):
    """⑤ 포장 부족 PF 변형은 낮은 fast_production, AF 요약은 변형 중 최대값."""
    af = make_item(name="조립완제품", process_type_code="AF", warehouse_qty=Decimal("10"))
    # 변형1: 포장재1 부족(2) → fast_production = min(AF=10, 포장재1=2) = 2
    pf1 = make_item(name="출하변형1", process_type_code="PF", warehouse_qty=Decimal("0"))
    pr1 = make_item(name="포장재1", process_type_code="PR", warehouse_qty=Decimal("2"))
    make_bom(pf1.item_id, af.item_id, Decimal("1"))
    make_bom(pf1.item_id, pr1.item_id, Decimal("1"))
    # 변형2: 포장재2 여유(8) → fast_production = min(AF=10, 포장재2=8) = 8
    pf2 = make_item(name="출하변형2", process_type_code="PF", warehouse_qty=Decimal("0"))
    pr2 = make_item(name="포장재2", process_type_code="PR", warehouse_qty=Decimal("8"))
    make_bom(pf2.item_id, af.item_id, Decimal("1"))
    make_bom(pf2.item_id, pr2.item_id, Decimal("1"))
    db_session.commit()

    result = compute_capacity(db_session)
    variants = {v["pf_item_id"]: v for v in _variants_for(result, af.item_id)}

    v1 = variants[str(pf1.item_id)]
    v2 = variants[str(pf2.item_id)]
    assert v1["ship_ready"] == 0  # PF 재고 없음
    assert v1["fast_production"] == 2
    assert v1["fast_production_limiting_item"] == _item_label(pr1)
    assert v2["ship_ready"] == 0  # PF 재고 없음
    assert v2["fast_production"] == 8

    row = _af_row(result, af.item_id)
    assert row["fast_production"] == 8  # 변형 중 최대
    assert row["fast_production_limiting_item"] == _item_label(pr2)


def test_fast_production_capped_by_af_stock(db_session, make_item, make_bom):
    """fast_production 은 AF 재고로 cap 된다 (포장 충분해도 AF 가 한계)."""
    af = make_item(name="조립완제품", process_type_code="AF", warehouse_qty=Decimal("3"))
    pf = make_item(name="출하완제품", process_type_code="PF", warehouse_qty=Decimal("0"))
    pr = make_item(name="포장재", process_type_code="PR", warehouse_qty=Decimal("999"))
    make_bom(pf.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pr.item_id, Decimal("1"))
    db_session.commit()

    result = compute_capacity(db_session)
    row = _af_row(result, af.item_id)

    assert row["ship_ready"] == 0  # PF 재고 없음
    assert row["fast_production"] == 3  # AF 재고가 cap
    assert row["fast_production_limiting_item"] == _item_label(af)


def test_fast_production_uses_existing_sibling_af_stock_only(db_session, make_item, make_bom):
    """⑦ 형제 AF의 하위 자재가 아니라 현재 AF 재고만 빠른 생산에 반영한다."""
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

    # AF1·AF2 재고가 각각 5이므로 AF1 기준 PF 완성 가능 수량은 5.
    assert row1["fast_production"] == 5
    assert row1["fast_production_limiting_item"] != _item_label(y)


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
    pf = make_item(name="출하완제품", process_type_code="PF", warehouse_qty=Decimal("0"))
    make_bom(pf.item_id, af.item_id, Decimal("1"))
    db_session.commit()

    result = compute_capacity(db_session)
    row = _af_row(result, af.item_id)

    # PF당 AF 1개 필요. AF 1개당 Z 를 양쪽 가지에서 2개 소비 → Z=10 → 최대 5 (과대계산 방지)
    assert row["total_production"] == 5
    assert row["total_production_limiting_item"] == _item_label(shared)


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
    pf = make_item(name="출하완제품", process_type_code="PF", warehouse_qty=Decimal("0"))
    make_bom(pf.item_id, af.item_id, Decimal("1"))
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
    pf = make_item(name="출하완제품", process_type_code="PF", warehouse_qty=Decimal("0"))
    make_bom(pf.item_id, af.item_id, Decimal("1"))
    db_session.commit()

    result = compute_capacity(db_session)
    row = _af_row(result, af.item_id)

    # 중간 보유 3 + 원자재로 추가 floor(10/2)=5 → 중간 8 → PF 8
    assert row["total_production"] == 8


def test_fast_production_floors_packaging_material_per_unit(db_session, make_item, make_bom):
    """⑪ 포장 자재 소요량이 3이면 재고 7은 빠른 생산 2대로 절삭한다."""
    af = make_item(name="조립완제품", process_type_code="AF", warehouse_qty=Decimal("100"))
    packing = make_item(name="포장 자재", process_type_code="PR", warehouse_qty=Decimal("7"))
    pf = make_item(name="출하완제품", process_type_code="PF", warehouse_qty=Decimal("0"))
    make_bom(pf.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, packing.item_id, Decimal("3"))
    db_session.commit()

    result = compute_capacity(db_session)
    row = _af_row(result, af.item_id)

    assert row["fast_production"] == 2
    assert row["fast_production_limiting_item"] == _item_label(packing)


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
