"""주간보고 품목 범위의 순수·SQL 판정 동등성 테스트."""

from __future__ import annotations

from app.models import Item


def test_weekly_report_item_sort_key_places_va_before_vf():
    """VF 상세에서는 발생부 VA를 먼저 표시하고 기존 VF를 뒤에 표시한다."""
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


def test_weekly_report_sql_clause_matches_pure_item_scope(db_session, make_item):
    """SQL 대상과 순수 판정은 완료품 6개 및 VA 발생부 진공 예외에서 일치한다."""
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
    all_items = [
        *finished_items,
        vacuum_10p,
        leading_space,
        without_vacuum_token,
        other_va,
        other_process,
    ]
    db_session.flush()

    pure_item_ids = {
        str(item.item_id)
        for item in all_items
        if is_weekly_report_item(item.process_type_code, item.item_name)
    }
    sql_item_ids = {
        str(item.item_id)
        for item in db_session.query(Item).filter(weekly_report_item_clause(Item)).all()
    }

    assert pure_item_ids == sql_item_ids
    assert pure_item_ids == {str(item.item_id) for item in [*finished_items, vacuum_10p]}
