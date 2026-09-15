"""PF 출하 완료 공통 집계의 원장 필터 계약."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from app.models import ShippingRequest, TransactionLog, TransactionTypeEnum
from app.services.pf_shipping_completion import list_pf_shipping_completions


WINDOW_START = datetime(2026, 9, 1)
WINDOW_END = datetime(2026, 10, 1)


def _request(db_session, final_pf):
    request = ShippingRequest(
        base_pf_item_id=final_pf.item_id,
        final_pf_item_id=final_pf.item_id,
        request_quantity=1,
    )
    db_session.add(request)
    db_session.flush()
    return request


def _pickup_log(db_session, *, request, item, quantity: int, created_at: datetime) -> TransactionLog:
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.SHIP,
        quantity_change=Decimal(str(-quantity)),
        quantity_before=Decimal(str(quantity)),
        quantity_after=Decimal("0"),
        shipping_request_id=request.request_id if request is not None else None,
        shipping_phase="PICKUP",
        created_at=created_at,
    )
    db_session.add(log)
    db_session.flush()
    return log


def test_lists_only_active_final_pf_pickups(db_session, make_item):
    final_pf = make_item(name="최종 PF", process_type_code="PF", model_symbol="8")
    companion_pf = make_item(name="동반 PF", process_type_code="PF", model_symbol="8")
    request = _request(db_session, final_pf)
    _pickup_log(
        db_session,
        request=request,
        item=final_pf,
        quantity=3,
        created_at=datetime(2026, 9, 8, 10, 0),
    )
    _pickup_log(
        db_session,
        request=request,
        item=companion_pf,
        quantity=2,
        created_at=datetime(2026, 9, 8, 10, 1),
    )
    _pickup_log(
        db_session,
        request=None,
        item=final_pf,
        quantity=7,
        created_at=datetime(2026, 9, 8, 10, 2),
    )

    completions = list_pf_shipping_completions(
        db_session,
        start_at=WINDOW_START,
        end_at=WINDOW_END,
    )

    assert [(row.item_id, row.model_symbol, row.quantity, row.completed_at) for row in completions] == [
        (final_pf.item_id, "8", Decimal("3"), datetime(2026, 9, 8, 10, 0)),
    ]


def test_respects_legacy_cancellation_at_the_requested_point_in_time(db_session, make_item):
    final_pf = make_item(name="취소 PF", process_type_code="PF", model_symbol="3")
    request = _request(db_session, final_pf)
    log = _pickup_log(
        db_session,
        request=request,
        item=final_pf,
        quantity=1,
        created_at=datetime(2026, 9, 8, 10, 0),
    )
    log.cancelled = True
    log.cancelled_at = datetime(2026, 9, 9, 10, 0)
    db_session.flush()

    before_cancel = list_pf_shipping_completions(
        db_session,
        start_at=WINDOW_START,
        end_at=WINDOW_END,
        cancellation_as_of=datetime(2026, 9, 8, 23, 59),
    )
    after_cancel = list_pf_shipping_completions(
        db_session,
        start_at=WINDOW_START,
        end_at=WINDOW_END,
        cancellation_as_of=datetime(2026, 9, 9, 10, 0),
    )

    assert [row.quantity for row in before_cancel] == [Decimal("1")]
    assert after_cancel == []


def test_excludes_legacy_cancelled_pickup_without_a_cancellation_time(db_session, make_item):
    final_pf = make_item(name="취소 시각 없는 PF", process_type_code="PF", model_symbol="3")
    request = _request(db_session, final_pf)
    log = _pickup_log(
        db_session,
        request=request,
        item=final_pf,
        quantity=1,
        created_at=datetime(2026, 9, 8, 10, 0),
    )
    log.cancelled = True
    db_session.flush()

    current = list_pf_shipping_completions(
        db_session,
        start_at=WINDOW_START,
        end_at=WINDOW_END,
    )
    before_cancel = list_pf_shipping_completions(
        db_session,
        start_at=WINDOW_START,
        end_at=WINDOW_END,
        cancellation_as_of=datetime(2026, 9, 8, 9, 0),
    )
    after_cancel = list_pf_shipping_completions(
        db_session,
        start_at=WINDOW_START,
        end_at=WINDOW_END,
        cancellation_as_of=datetime(2026, 9, 9, 10, 0),
    )

    assert current == before_cancel == after_cancel == []


def test_respects_reversal_at_the_requested_point_in_time(db_session, make_item):
    final_pf = make_item(name="역전 PF", process_type_code="PF", model_symbol="4")
    request = _request(db_session, final_pf)
    original = _pickup_log(
        db_session,
        request=request,
        item=final_pf,
        quantity=2,
        created_at=datetime(2026, 9, 8, 10, 0),
    )
    db_session.add(
        TransactionLog(
            item_id=final_pf.item_id,
            transaction_type=TransactionTypeEnum.SHIP,
            quantity_change=Decimal("2"),
            quantity_before=Decimal("0"),
            quantity_after=Decimal("2"),
            shipping_request_id=request.request_id,
            shipping_phase="PICKUP",
            reverses_log_id=original.log_id,
            created_at=datetime(2026, 9, 9, 10, 0),
        )
    )
    db_session.flush()

    before_reversal = list_pf_shipping_completions(
        db_session,
        start_at=WINDOW_START,
        end_at=WINDOW_END,
        cancellation_as_of=datetime(2026, 9, 8, 23, 59),
    )
    after_reversal = list_pf_shipping_completions(
        db_session,
        start_at=WINDOW_START,
        end_at=WINDOW_END,
        cancellation_as_of=datetime(2026, 9, 9, 10, 0),
    )

    assert [row.quantity for row in before_reversal] == [Decimal("2")]
    assert after_reversal == []


def test_excludes_reversed_pickup_and_counts_the_later_repickup(db_session, make_item):
    final_pf = make_item(name="재픽업 PF", process_type_code="PF", model_symbol="4")
    request = _request(db_session, final_pf)
    original = _pickup_log(
        db_session,
        request=request,
        item=final_pf,
        quantity=2,
        created_at=datetime(2026, 9, 8, 10, 0),
    )
    db_session.add(
        TransactionLog(
            item_id=final_pf.item_id,
            transaction_type=TransactionTypeEnum.SHIP,
            quantity_change=Decimal("2"),
            quantity_before=Decimal("0"),
            quantity_after=Decimal("2"),
            shipping_request_id=request.request_id,
            shipping_phase="PICKUP",
            reverses_log_id=original.log_id,
            created_at=datetime(2026, 9, 9, 10, 0),
        )
    )
    _pickup_log(
        db_session,
        request=request,
        item=final_pf,
        quantity=2,
        created_at=datetime(2026, 9, 10, 10, 0),
    )
    db_session.flush()

    completions = list_pf_shipping_completions(
        db_session,
        start_at=WINDOW_START,
        end_at=WINDOW_END,
    )

    assert [(row.quantity, row.completed_at) for row in completions] == [
        (Decimal("2"), datetime(2026, 9, 10, 10, 0)),
    ]
