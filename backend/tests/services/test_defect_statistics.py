from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest

from app.models import (
    DefectQuarantineRecord,
    DefectQuarantineReconstruction,
    InventoryOperation,
    InventoryOperationKindEnum,
    InventoryOperationRoleEnum,
    InventoryOperationStatusEnum,
    ProcessType,
    ProductSymbol,
    TransactionLog,
    TransactionTypeEnum,
)
from app.schemas.defect_statistics import DefectStatisticsFilters
from app.services.defect_statistics import (
    calculate_statistics_period,
    get_defect_statistics,
)


KST = ZoneInfo("Asia/Seoul")


def test_disused_filter_preserves_total_and_intersects_process(db_session, make_item) -> None:
    normal = make_item(name="일반", process_type_code="TR")
    disused = make_item(name="불용", process_type_code="TR")
    disused.legacy_item_type = "불용"
    for item in (normal, disused):
        _add_record(db_session, item, quantity=2, at=_kst_naive(2026, 9, 2))
    for steps, expected in [((), 4), (("DISUSED",), 2), (("DISUSED", "R"), 2), (("DISUSED", "F"), 0)]:
        result = get_defect_statistics(db_session, period="month", anchor=date(2026, 9, 2), filters=DefectStatisticsFilters(process_steps=steps))
        assert result.summary.quantity == expected


def _kst_naive(year: int, month: int, day: int, hour: int = 0, minute: int = 0) -> datetime:
    return (
        datetime(year, month, day, hour, minute, tzinfo=KST)
        .astimezone(UTC)
        .replace(tzinfo=None)
    )


def _add_record(
    db_session,
    item,
    *,
    quantity: int,
    at: datetime,
    department: str = "조립",
    reason: str | None = "외관",
    is_legacy: bool = False,
    management_category: str = "DEFECT",
) -> DefectQuarantineRecord:
    record = DefectQuarantineRecord(
        item_id=item.item_id,
        department=department,
        original_quantity=Decimal(quantity),
        remaining_quantity=Decimal(quantity),
        quarantined_at=at,
        quarantined_by_name="통계 테스트",
        reason_category=reason,
        current_memo="테스트",
        is_legacy=is_legacy,
        management_category=management_category,
    )
    db_session.add(record)
    db_session.flush()
    return record


def test_statistics_excludes_current_b_grade_and_includes_record_after_defect_return(
    db_session, make_item
) -> None:
    item = make_item(name="B급 통계 제외", process_type_code="TR")
    record = _add_record(
        db_session, item, quantity=4, at=_kst_naive(2026, 9, 2),
        management_category="B_GRADE",
    )

    excluded = get_defect_statistics(
        db_session, period="month", anchor=date(2026, 9, 10),
    )
    record.management_category = "DEFECT"
    db_session.flush()
    included = get_defect_statistics(
        db_session, period="month", anchor=date(2026, 9, 10),
    )

    assert excluded.summary.quantity == 0
    assert included.summary.quantity == 4


def _add_operation(
    db_session,
    *,
    action: str,
    at: datetime,
    domain: str = "stock_request",
) -> InventoryOperation:
    operation = InventoryOperation(
        kind=InventoryOperationKindEnum.BUSINESS,
        domain=domain,
        action=action,
        status=InventoryOperationStatusEnum.COMMITTED,
        display_label=action,
        actor_name="통계 테스트",
        effective_at=at,
    )
    db_session.add(operation)
    db_session.flush()
    return operation


def _add_log(
    db_session,
    item,
    operation: InventoryOperation,
    *,
    tx_type: TransactionTypeEnum,
    role: InventoryOperationRoleEnum,
    quantity: int,
    department: str = "조립",
    reason: str | None = "기능",
    record_id=None,
) -> TransactionLog:
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=tx_type,
        quantity_change=Decimal(quantity),
        quantity_before=Decimal("10"),
        quantity_after=Decimal("10") + Decimal(quantity),
        operation_id=operation.operation_id,
        operation_role=role,
        defect_quarantine_record_id=record_id,
        department=department,
        reason_category=reason,
        created_at=operation.effective_at,
    )
    db_session.add(log)
    db_session.flush()
    return log


def _add_reconstructed_legacy_record(
    db_session,
    item,
    *,
    quantity: int,
    at: datetime,
    remaining_quantity: int | None = None,
    department: str = "조립",
    cancelled: bool = False,
    source_record_id=None,
    source_at: datetime | None = None,
    source_department: str | None = None,
    source_quantity: int | None = None,
    source_item=None,
) -> tuple[DefectQuarantineRecord, DefectQuarantineRecord, TransactionLog]:
    parent = _add_record(
        db_session,
        item,
        quantity=99,
        at=_kst_naive(2026, 8, 1),
        department=department,
        is_legacy=True,
    )
    child = _add_record(
        db_session,
        item,
        quantity=quantity,
        at=at,
        department=department,
        is_legacy=True,
    )
    child.remaining_quantity = Decimal(
        quantity if remaining_quantity is None else remaining_quantity
    )
    operation = _add_operation(
        db_session,
        action="legacy_mark_defective",
        at=source_at or at,
        domain="defect",
    )
    source = _add_log(
        db_session,
        source_item or item,
        operation,
        tx_type=TransactionTypeEnum.MARK_DEFECTIVE,
        role=InventoryOperationRoleEnum.PRIMARY,
        quantity=-quantity,
        department=source_department or department,
        record_id=source_record_id if source_record_id is not None else child.record_id,
    )
    source.cancelled = cancelled
    source.inventory_effect = [
        {
            "scope": "location",
            "department": source_department or department,
            "status": "DEFECTIVE",
            "delta": source_quantity if source_quantity is not None else quantity,
        }
    ]
    db_session.add(
        DefectQuarantineReconstruction(
            child_record_id=child.record_id,
            parent_record_id=parent.record_id,
            source_transaction_log_id=source.log_id,
        )
    )
    db_session.flush()
    return parent, child, source


def test_statistics_includes_verified_reconstructed_legacy_children_only(
    db_session,
    make_item,
) -> None:
    item = make_item(name="복원 품목", process_type_code="TR")
    _add_reconstructed_legacy_record(
        db_session,
        item,
        quantity=4,
        remaining_quantity=0,
        at=_kst_naive(2026, 9, 2),
    )
    _, _, cancelled_source = _add_reconstructed_legacy_record(
        db_session,
        item,
        quantity=3,
        at=_kst_naive(2026, 9, 3),
        cancelled=True,
    )
    _, _, mismatched_source = _add_reconstructed_legacy_record(
        db_session,
        item,
        quantity=2,
        at=_kst_naive(2026, 9, 4),
        source_quantity=1,
    )

    result = get_defect_statistics(
        db_session,
        period="week",
        anchor=date(2026, 9, 4),
    )

    assert cancelled_source.cancelled is True
    assert mismatched_source.inventory_effect[0]["delta"] == 1
    assert result.summary.record_count == 1
    assert result.summary.quantity == 4
    assert result.timeline[2].quantity == 4
    assert result.excluded_legacy_count == 2


def test_statistics_excludes_reconstructed_legacy_children_with_mismatched_source_fields(
    db_session,
    make_item,
) -> None:
    item = make_item(name="검증 대상", process_type_code="TR")
    other_item = make_item(name="다른 품목", process_type_code="TR")
    _add_reconstructed_legacy_record(
        db_session,
        item,
        quantity=2,
        at=_kst_naive(2026, 9, 2),
        source_at=_kst_naive(2026, 9, 3),
    )
    _add_reconstructed_legacy_record(
        db_session,
        item,
        quantity=2,
        at=_kst_naive(2026, 9, 3),
        source_department="창고",
    )
    unrelated_record = _add_record(
        db_session,
        item,
        quantity=1,
        at=_kst_naive(2026, 8, 1),
    )
    _add_reconstructed_legacy_record(
        db_session,
        item,
        quantity=2,
        at=_kst_naive(2026, 9, 4),
        source_record_id=unrelated_record.record_id,
    )
    _add_reconstructed_legacy_record(
        db_session,
        item,
        quantity=2,
        at=_kst_naive(2026, 9, 5),
        source_item=other_item,
    )

    result = get_defect_statistics(
        db_session,
        period="week",
        anchor=date(2026, 9, 4),
    )

    assert result.summary.record_count == 0
    assert result.summary.quantity == 0
    assert result.excluded_legacy_count == 4


@pytest.mark.parametrize(
    ("kind", "anchor", "expected_start", "expected_end"),
    [
        ("week", date(2026, 9, 4), date(2026, 8, 31), date(2026, 9, 6)),
        ("month", date(2024, 2, 15), date(2024, 2, 1), date(2024, 2, 29)),
        ("year", date(2026, 9, 4), date(2026, 1, 1), date(2026, 12, 31)),
    ],
)
def test_calculate_statistics_period_uses_calendar_boundaries(
    kind: str,
    anchor: date,
    expected_start: date,
    expected_end: date,
) -> None:
    period = calculate_statistics_period(kind, anchor)

    assert period.kind == kind
    assert period.anchor == anchor
    assert period.start_date == expected_start
    assert period.end_date == expected_end


def test_statistics_uses_kst_inclusive_start_exclusive_end_and_zero_day_buckets(
    db_session,
    make_item,
) -> None:
    item = make_item(name="경계 품목", model_symbol="3", process_type_code="AF")
    _add_record(
        db_session,
        item,
        quantity=99,
        at=_kst_naive(2026, 8, 30, 23, 59),
    )
    _add_record(
        db_session,
        item,
        quantity=2,
        at=_kst_naive(2026, 8, 31),
    )
    _add_record(
        db_session,
        item,
        quantity=3,
        at=_kst_naive(2026, 9, 6, 23, 59),
    )
    _add_record(
        db_session,
        item,
        quantity=77,
        at=_kst_naive(2026, 9, 7),
    )
    _add_record(
        db_session,
        item,
        quantity=11,
        at=_kst_naive(2026, 9, 2),
        is_legacy=True,
    )

    result = get_defect_statistics(
        db_session,
        period="week",
        anchor=date(2026, 9, 4),
    )

    assert result.summary.record_count == 2
    assert result.summary.quantity == 5
    assert result.excluded_legacy_count == 1
    assert [entry.bucket for entry in result.timeline] == [
        "2026-08-31",
        "2026-09-01",
        "2026-09-02",
        "2026-09-03",
        "2026-09-04",
        "2026-09-05",
        "2026-09-06",
    ]
    assert [entry.quantity for entry in result.timeline] == [2, 0, 0, 0, 0, 0, 3]
    assert [entry.record_count for entry in result.timeline] == [1, 0, 0, 0, 0, 0, 1]
    assert [(entry.label, entry.quantity) for entry in result.items] == [("경계 품목", 5)]
    assert [(entry.label, entry.quantity) for entry in result.reasons] == [("외관", 5)]
    assert [(entry.label, entry.quantity) for entry in result.departments] == [("조립", 5)]
    assert result.summary.top_item == result.items[0]
    assert result.summary.top_reason == result.reasons[0]


def test_statistics_adds_only_unlinked_direct_scrap_and_rework_parent_once(
    db_session,
    make_item,
) -> None:
    quarantined_item = make_item(name="격리 발생", process_type_code="TR")
    direct_scrap_item = make_item(name="바로 폐기", process_type_code="HR")
    direct_rework_item = make_item(name="바로 재작업", process_type_code="PF")
    child_item = make_item(name="재작업 자식", process_type_code="VR")
    record = _add_record(
        db_session,
        quarantined_item,
        quantity=5,
        at=_kst_naive(2026, 9, 2),
        reason="치수",
    )

    followup = _add_operation(
        db_session,
        action="defect_scrap",
        at=_kst_naive(2026, 9, 3),
        domain="defect",
    )
    _add_log(
        db_session,
        quarantined_item,
        followup,
        tx_type=TransactionTypeEnum.DEFECT_SCRAP,
        role=InventoryOperationRoleEnum.PRIMARY,
        quantity=-5,
        record_id=record.record_id,
    )

    direct_scrap = _add_operation(
        db_session,
        action="scrap_normal",
        at=_kst_naive(2026, 8, 31),
    )
    _add_log(
        db_session,
        direct_scrap_item,
        direct_scrap,
        tx_type=TransactionTypeEnum.DEFECT_SCRAP,
        role=InventoryOperationRoleEnum.PRIMARY,
        quantity=-2,
        reason="기능",
    )
    _add_log(
        db_session,
        direct_scrap_item,
        direct_scrap,
        tx_type=TransactionTypeEnum.DEFECT_SCRAP,
        role=InventoryOperationRoleEnum.PRIMARY,
        quantity=-2,
        reason="기능",
    )

    direct_rework = _add_operation(
        db_session,
        action="rework_normal",
        at=_kst_naive(2026, 9, 4),
    )
    _add_log(
        db_session,
        direct_rework_item,
        direct_rework,
        tx_type=TransactionTypeEnum.DISASSEMBLE,
        role=InventoryOperationRoleEnum.REWORK_PARENT_NORMAL,
        quantity=-3,
        reason="조립",
    )
    _add_log(
        db_session,
        child_item,
        direct_rework,
        tx_type=TransactionTypeEnum.RECEIVE,
        role=InventoryOperationRoleEnum.REWORK_CHILD_NORMAL,
        quantity=3,
        reason="조립",
    )

    linked_normal_action = _add_operation(
        db_session,
        action="scrap_normal",
        at=_kst_naive(2026, 9, 5),
    )
    _add_log(
        db_session,
        quarantined_item,
        linked_normal_action,
        tx_type=TransactionTypeEnum.DEFECT_SCRAP,
        role=InventoryOperationRoleEnum.PRIMARY,
        quantity=-5,
        record_id=record.record_id,
    )

    end_exclusive = _add_operation(
        db_session,
        action="scrap_normal",
        at=_kst_naive(2026, 9, 7),
    )
    _add_log(
        db_session,
        direct_scrap_item,
        end_exclusive,
        tx_type=TransactionTypeEnum.DEFECT_SCRAP,
        role=InventoryOperationRoleEnum.PRIMARY,
        quantity=-99,
        reason="기간 밖",
    )

    result = get_defect_statistics(
        db_session,
        period="week",
        anchor=date(2026, 9, 4),
    )

    assert result.summary.record_count == 3
    assert result.summary.quantity == 10
    assert {entry.label: entry.quantity for entry in result.items} == {
        "격리 발생": 5,
        "바로 폐기": 2,
        "바로 재작업": 3,
    }
    assert {entry.label: entry.quantity for entry in result.reasons} == {
        "치수": 5,
        "기능": 2,
        "조립": 3,
    }


def test_direct_operation_keeps_distinct_item_lines_as_distinct_occurrences(
    db_session,
    make_item,
) -> None:
    first_item = make_item(name="다중 폐기 A", process_type_code="TR")
    second_item = make_item(name="다중 폐기 B", process_type_code="HR")
    operation = _add_operation(
        db_session,
        action="scrap_normal",
        at=_kst_naive(2026, 9, 3),
    )
    _add_log(
        db_session,
        first_item,
        operation,
        tx_type=TransactionTypeEnum.DEFECT_SCRAP,
        role=InventoryOperationRoleEnum.PRIMARY,
        quantity=-2,
    )
    _add_log(
        db_session,
        second_item,
        operation,
        tx_type=TransactionTypeEnum.DEFECT_SCRAP,
        role=InventoryOperationRoleEnum.PRIMARY,
        quantity=-3,
    )

    result = get_defect_statistics(
        db_session,
        period="week",
        anchor=date(2026, 9, 4),
    )

    assert result.summary.record_count == 2
    assert result.summary.quantity == 5
    assert {entry.label: entry.quantity for entry in result.items} == {
        "다중 폐기 A": 2,
        "다중 폐기 B": 3,
    }


def test_direct_rework_in_defect_domain_is_counted(
    db_session,
    make_item,
) -> None:
    item = make_item(name="defect 도메인 재작업", process_type_code="PF")
    operation = _add_operation(
        db_session,
        action="rework_normal",
        at=_kst_naive(2026, 9, 3),
        domain="defect",
    )
    _add_log(
        db_session,
        item,
        operation,
        tx_type=TransactionTypeEnum.DISASSEMBLE,
        role=InventoryOperationRoleEnum.REWORK_PARENT_NORMAL,
        quantity=-4,
    )

    result = get_defect_statistics(
        db_session,
        period="week",
        anchor=date(2026, 9, 4),
    )

    assert result.summary.record_count == 1
    assert result.summary.quantity == 4
    assert result.items[0].label == "defect 도메인 재작업"


def test_statistics_department_filter_is_independent(
    db_session,
    make_item,
) -> None:
    item = make_item(name="부서 필터 품목", model_symbol="3", process_type_code="AF")
    _add_record(
        db_session,
        item,
        quantity=4,
        at=_kst_naive(2026, 9, 2),
        department="조립",
    )
    _add_record(
        db_session,
        item,
        quantity=7,
        at=_kst_naive(2026, 9, 2),
        department="진공",
    )

    result = get_defect_statistics(
        db_session,
        period="month",
        anchor=date(2026, 9, 20),
        filters=DefectStatisticsFilters(departments=("조립",)),
    )

    assert result.summary.record_count == 1
    assert result.summary.quantity == 4
    assert [entry.label for entry in result.departments] == ["조립"]


def test_statistics_model_filter_uses_inventory_symbol_membership_independently(
    db_session,
    make_item,
) -> None:
    db_session.add_all(
        [
            ProductSymbol(slot=1, symbol="3", model_name="DENTAL"),
            ProductSymbol(slot=2, symbol="4", model_name="PORTABLE"),
        ]
    )
    shared_model_item = make_item(
        name="공용 완제품",
        model_symbol="34",
        process_type_code="AF",
    )
    other_item = make_item(
        name="다른 원자재",
        model_symbol="4",
        process_type_code="TR",
    )
    _add_record(
        db_session,
        shared_model_item,
        quantity=4,
        at=_kst_naive(2026, 9, 2),
    )
    _add_record(
        db_session,
        other_item,
        quantity=7,
        at=_kst_naive(2026, 9, 2),
    )

    result = get_defect_statistics(
        db_session,
        period="month",
        anchor=date(2026, 9, 20),
        filters=DefectStatisticsFilters(models=("DENTAL",)),
    )

    assert result.summary.record_count == 1
    assert result.summary.quantity == 4
    assert [entry.label for entry in result.items] == ["공용 완제품"]


def test_statistics_process_step_filter_uses_code_suffix_independently(
    db_session,
    make_item,
) -> None:
    finished_item = make_item(name="완제품", model_symbol="3", process_type_code="AF")
    raw_item = make_item(name="원자재", model_symbol="3", process_type_code="TR")
    _add_record(
        db_session,
        finished_item,
        quantity=4,
        at=_kst_naive(2026, 9, 2),
    )
    _add_record(
        db_session,
        raw_item,
        quantity=7,
        at=_kst_naive(2026, 9, 2),
    )

    result = get_defect_statistics(
        db_session,
        period="month",
        anchor=date(2026, 9, 20),
        filters=DefectStatisticsFilters(process_steps=("F",)),
    )

    assert result.summary.record_count == 1
    assert result.summary.quantity == 4
    assert [entry.label for entry in result.items] == ["완제품"]


@pytest.mark.parametrize("unclassified", ["미분류", "UNCLASSIFIED"])
def test_statistics_model_filter_matches_missing_model_symbol(
    db_session,
    make_item,
    unclassified: str,
) -> None:
    missing_model = make_item(name="모델 없음", model_symbol="3", process_type_code="TR")
    classified = make_item(name="모델 있음", model_symbol="4", process_type_code="TR")
    missing_model.model_symbol = ""
    db_session.flush()
    _add_record(
        db_session,
        missing_model,
        quantity=2,
        at=_kst_naive(2026, 9, 2),
    )
    _add_record(
        db_session,
        classified,
        quantity=5,
        at=_kst_naive(2026, 9, 2),
    )

    result = get_defect_statistics(
        db_session,
        period="month",
        anchor=date(2026, 9, 20),
        filters=DefectStatisticsFilters(models=(unclassified,)),
    )

    assert result.summary.record_count == 1
    assert result.summary.quantity == 2
    assert [entry.label for entry in result.items] == ["모델 없음"]


@pytest.mark.parametrize("unclassified", ["미분류", "UNCLASSIFIED"])
def test_statistics_process_filter_matches_missing_process_code(
    db_session,
    make_item,
    unclassified: str,
) -> None:
    db_session.add(ProcessType(code="", prefix="", suffix="", stage_order=999))
    missing_process = make_item(name="공정 없음", process_type_code="")
    classified = make_item(name="공정 있음", process_type_code="TR")
    _add_record(
        db_session,
        missing_process,
        quantity=2,
        at=_kst_naive(2026, 9, 2),
    )
    _add_record(
        db_session,
        classified,
        quantity=5,
        at=_kst_naive(2026, 9, 2),
    )

    result = get_defect_statistics(
        db_session,
        period="month",
        anchor=date(2026, 9, 20),
        filters=DefectStatisticsFilters(process_steps=(unclassified,)),
    )

    assert result.summary.record_count == 1
    assert result.summary.quantity == 2
    assert [entry.label for entry in result.items] == ["공정 없음"]


def test_empty_year_contains_all_twelve_zero_months(db_session) -> None:
    result = get_defect_statistics(
        db_session,
        period="year",
        anchor=date(2026, 6, 15),
    )

    assert [entry.bucket for entry in result.timeline] == [
        f"2026-{month:02d}" for month in range(1, 13)
    ]
    assert all(entry.record_count == 0 and entry.quantity == 0 for entry in result.timeline)
    assert result.summary.record_count == 0
    assert result.summary.quantity == 0
    assert result.summary.top_item is None
    assert result.summary.top_reason is None


def test_leap_month_includes_february_29_and_excludes_march_1(
    db_session,
    make_item,
) -> None:
    item = make_item(name="윤년 경계 품목", process_type_code="TR")
    _add_record(
        db_session,
        item,
        quantity=2,
        at=_kst_naive(2024, 2, 29, 23, 59),
    )
    _add_record(
        db_session,
        item,
        quantity=5,
        at=_kst_naive(2024, 3, 1),
    )

    result = get_defect_statistics(
        db_session,
        period="month",
        anchor=date(2024, 2, 15),
    )

    assert result.summary.record_count == 1
    assert result.summary.quantity == 2
    assert len(result.timeline) == 29
    assert result.timeline[-1].bucket == "2024-02-29"
    assert result.timeline[-1].record_count == 1
    assert result.timeline[-1].quantity == 2
