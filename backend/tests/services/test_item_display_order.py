"""품목 공통 표시 순서 서비스 계약 테스트."""

from __future__ import annotations

from app.models import Item
from app.services.item_display_order import (
    _apply_default_item_display_order,
    _insert_item_at_process_end,
)


def _ordered_items(db_session):
    return (
        db_session.query(Item)
        .filter(Item.deleted_at.is_(None))
        .order_by(Item.sort_order, Item.mes_code)
        .all()
    )


def test_apply_default_item_display_order_uses_process_then_serial(db_session, make_item):
    tf = make_item(name="tube-finished", process_type_code="TF", serial_no=2)
    hr_late = make_item(name="high-voltage-late", process_type_code="HR", serial_no=9)
    tr_late = make_item(name="tube-raw-late", process_type_code="TR", serial_no=3)
    ha = make_item(name="high-voltage-assembly", process_type_code="HA", serial_no=1)
    tr_early = make_item(name="tube-raw-early", process_type_code="TR", serial_no=1)

    _apply_default_item_display_order(db_session)
    db_session.flush()

    assert [item.item_id for item in _ordered_items(db_session)] == [
        tr_early.item_id,
        tr_late.item_id,
        tf.item_id,
        hr_late.item_id,
        ha.item_id,
    ]
    assert [item.sort_order for item in _ordered_items(db_session)] == list(range(5))


def test_insert_item_at_process_end_ignores_new_item_serial_and_preserves_custom_order(
    db_session, make_item
):
    hf = make_item(name="high-voltage-finished", process_type_code="HF", serial_no=1)
    hr_first = make_item(name="high-voltage-first", process_type_code="HR", serial_no=1)
    hr_last = make_item(name="high-voltage-last", process_type_code="HR", serial_no=9)
    tr = make_item(name="tube-raw", process_type_code="TR", serial_no=1)
    new_hr = make_item(name="high-voltage-new", process_type_code="HR", serial_no=0)
    hf.sort_order, hr_first.sort_order, hr_last.sort_order, tr.sort_order = 0, 1, 2, 3
    db_session.flush()

    _insert_item_at_process_end(db_session, new_hr)
    db_session.flush()

    assert [item.item_id for item in _ordered_items(db_session)] == [
        hf.item_id,
        hr_first.item_id,
        hr_last.item_id,
        new_hr.item_id,
        tr.item_id,
    ]
    assert [item.sort_order for item in _ordered_items(db_session)] == list(range(5))


def test_insert_item_at_process_end_places_empty_known_code_between_neighboring_codes(
    db_session, make_item
):
    tr = make_item(name="tube-raw", process_type_code="TR", serial_no=1)
    tf = make_item(name="tube-finished", process_type_code="TF", serial_no=1)
    hr = make_item(name="high-voltage-raw", process_type_code="HR", serial_no=1)
    new_ta = make_item(name="tube-assembly", process_type_code="TA", serial_no=1)
    tr.sort_order, tf.sort_order, hr.sort_order = 0, 1, 2
    db_session.flush()

    _insert_item_at_process_end(db_session, new_ta)
    db_session.flush()

    assert [(item.item_name, item.sort_order) for item in _ordered_items(db_session)] == [
        (tr.item_name, 0),
        (new_ta.item_name, 1),
        (tf.item_name, 2),
        (hr.item_name, 3),
    ]
