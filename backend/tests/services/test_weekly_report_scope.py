"""주간보고 품목 범위의 순수·SQL 판정 동등성 테스트."""

from __future__ import annotations

from app.models import Item


def test_weekly_report_item_sort_key_places_a_process_items_before_finished_items():
    """상세에서는 포함된 A 공정을 기존 완료품보다 먼저 표시한다."""
    from app.services.weekly_report_scope import weekly_report_item_sort_key

    rows = [
        ("VF", "3-VF-0001", "기존 진공 완료품"),
        ("VA", "9-VA-0024", "발생부 (진공) [VELO]"),
        ("VA", "3-VA-0012", "발생부 (진공) [DX3000]"),
    ]

    assert sorted(rows, key=lambda row: weekly_report_item_sort_key(*row)) == [
        ("VA", "3-VA-0012", "발생부 (진공) [DX3000]"),
        ("VA", "9-VA-0024", "발생부 (진공) [VELO]"),
        ("VF", "3-VF-0001", "기존 진공 완료품"),
    ]

    high_voltage_rows = [
        ("HF", "8-HF-0014", "발생부 고압 최종 작업완료"),
        ("HA", "3468-HA-0006", "세라믹튜브 70KV 하우징"),
    ]
    assert sorted(high_voltage_rows, key=lambda row: weekly_report_item_sort_key(*row)) == [
        ("HA", "3468-HA-0006", "세라믹튜브 70KV 하우징"),
        ("HF", "8-HF-0014", "발생부 고압 최종 작업완료"),
    ]


def test_weekly_report_sql_clause_matches_pure_item_scope(db_session, make_item):
    """SQL 대상과 순수 판정은 완료품 및 승인된 VA·HA 예외에서 일치한다."""
    from app.services.weekly_report_scope import (
        FINISHED_PROCESS_CODES,
        is_weekly_report_item,
        weekly_report_item_clause,
    )

    finished_items = [
        make_item(name=f"{process_code} 완료품", process_type_code=process_code)
        for process_code in FINISHED_PROCESS_CODES
    ]
    vacuum_10p = make_item(
        name="발생부 (10P) (진공) [DX3000]",
        process_type_code="VA",
    )
    leading_space = make_item(name=" 발생부 (진공) [DX3000]", process_type_code="VA")
    without_vacuum_token = make_item(name="발생부 (10P) [DX3000]", process_type_code="VA")
    other_va = make_item(name="신주 케이스 작업완료 [DX3000]", process_type_code="VA")
    other_process = make_item(name="발생부 (진공) 원자재", process_type_code="VR")
    ceramic_housing = make_item(
        name="세라믹튜브 70KV 하우징 [DXDR-070] [DX3000, ADX4000W, ADX6000, SOLO]",
        process_type_code="HA",
        model_symbol="3468",
        serial_no=6,
    )
    other_ha = make_item(
        name="다른 고압 중간품",
        process_type_code="HA",
        model_symbol="3468",
        serial_no=7,
    )
    all_items = [
        *finished_items,
        vacuum_10p,
        leading_space,
        without_vacuum_token,
        other_va,
        other_process,
        ceramic_housing,
        other_ha,
    ]
    db_session.flush()

    pure_item_ids = {
        str(item.item_id)
        for item in all_items
        if is_weekly_report_item(item.process_type_code, item.item_name, item.mes_code)
    }
    sql_item_ids = {
        str(item.item_id)
        for item in db_session.query(Item).filter(weekly_report_item_clause(Item)).all()
    }

    assert pure_item_ids == sql_item_ids
    assert pure_item_ids == {
        str(item.item_id)
        for item in [*finished_items, vacuum_10p, ceramic_housing]
    }

    from app.services.weekly_report_scope import weekly_report_group_code

    assert weekly_report_group_code(
        ceramic_housing.process_type_code,
        ceramic_housing.item_name,
        ceramic_housing.mes_code,
    ) == "HF"
