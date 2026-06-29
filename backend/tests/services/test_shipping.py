from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy import event

from app.models import BOM, Inventory, ShippingRequestCompanionLine, TransactionLog, TransactionTypeEnum
from app.services import shipping as shipping_svc


def _stock(db_session, item):
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    return int(inv.quantity or 0), int(inv.warehouse_qty or 0)


def _line(item, qty=1, stage="PA"):
    return {
        "parent_stage": stage,
        "child_item_id": item.item_id,
        "quantity": qty,
        "unit": "EA",
    }


def _bom_line(item, qty=1, stage="PA", *, included=True, origin="CUSTOM"):
    return {
        "parent_stage": stage,
        "child_item_id": item.item_id,
        "quantity": qty,
        "unit": "EA",
        "included": included,
        "origin": origin,
    }


def test_companion_lines_do_not_map_bom_inclusion_flags():
    column_names = set(ShippingRequestCompanionLine.__table__.columns.keys())

    assert "included" not in column_names
    assert "origin" not in column_names


def test_match_bom_does_not_write_temporary_shipping_rows(db_session, make_item, make_bom):
    af = make_item(name="AF body", process_type_code="AF", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=1)
    pa = make_item(name="Reusable PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=2)
    pf = make_item(name="Reusable PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    db_session.commit()

    write_statements: list[str] = []

    def capture_shipping_writes(conn, cursor, statement, parameters, context, executemany):
        sql = " ".join(statement.lower().split())
        touches_shipping_request = any(
            table in sql
            for table in (
                "shipping_requests",
                "shipping_request_bom_lines",
                "shipping_request_checklist_lines",
                "shipping_request_events",
            )
        )
        if touches_shipping_request and sql.startswith(("insert", "update", "delete")):
            write_statements.append(sql)

    bind = db_session.get_bind()
    event.listen(bind, "before_cursor_execute", capture_shipping_writes)
    try:
        match = shipping_svc.match_bom(
            db_session,
            bom_lines=[
                _bom_line(pa, stage="PF", origin="DEFAULT"),
                _bom_line(af, stage="PA", origin="DEFAULT"),
            ],
            base_pf_item_id=pf.item_id,
        )
    finally:
        event.remove(bind, "before_cursor_execute", capture_shipping_writes)

    assert match["matched_pa_item_id"] == pa.item_id
    assert match["matched_pf_item_id"] == pf.item_id
    assert write_statements == []


def test_prepare_complete_creates_custom_pa_pf_and_pickup_ships_companions(
    db_session, make_item, make_bom
):
    af = make_item(name="AF 본체", process_type_code="AF", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=1)
    cable = make_item(name="케이블", process_type_code="PR", warehouse_qty=Decimal("2"), model_symbol="4", serial_no=2)
    carton = make_item(name="카톤", process_type_code="PR", warehouse_qty=Decimal("5"), model_symbol="4", serial_no=3)
    base_pa = make_item(name="기본 가방 포장 완료", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    base_pf = make_item(name="기본 PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=5)
    make_bom(base_pa.item_id, af.item_id, Decimal("1"))
    make_bom(base_pf.item_id, base_pa.item_id, Decimal("1"))
    db_session.commit()

    req = shipping_svc.create_request(
        db_session,
        {
            "base_pf_item_id": base_pf.item_id,
            "requested_by_name": "출하담당",
            "custom_pa_name": "기본 PF [케이블 추가]_가방 포장 완료",
            "custom_pf_name": "기본 PF [케이블 추가]",
            "bom_lines": [_line(af), _line(cable)],
        },
    )
    shipping_svc.send_to_prep(db_session, req.request_id)

    prepared = shipping_svc.prepare_complete(
        db_session,
        req.request_id,
        companion_lines=[{"item_id": carton.item_id, "quantity": 1, "unit": "EA"}],
    )

    final_pa = prepared.final_pa_item
    final_pf = prepared.final_pf_item
    assert final_pa is not None
    assert final_pf is not None
    assert final_pa.item_name == "기본 PF [케이블 추가]_가방 포장 완료"
    assert final_pf.item_name == "기본 PF [케이블 추가]"
    assert db_session.query(BOM).filter(BOM.parent_item_id == final_pa.item_id).count() == 2
    assert db_session.query(BOM).filter(BOM.parent_item_id == final_pf.item_id).count() == 1
    assert _stock(db_session, af) == (0, 0)
    assert _stock(db_session, cable) == (1, 1)
    assert _stock(db_session, final_pa) == (0, 0)
    assert _stock(db_session, final_pf) == (1, 1)
    assert _stock(db_session, carton) == (5, 5)

    prepare_logs = (
        db_session.query(TransactionLog)
        .filter(TransactionLog.shipping_request_id == req.request_id)
        .filter(TransactionLog.shipping_phase == "PREPARE")
        .all()
    )
    assert {log.transaction_type for log in prepare_logs} == {
        TransactionTypeEnum.BACKFLUSH,
        TransactionTypeEnum.PRODUCE,
    }
    assert all(log.inventory_effect for log in prepare_logs)

    shipping_svc.pickup_complete(db_session, req.request_id)

    assert _stock(db_session, final_pf) == (0, 0)
    assert _stock(db_session, carton) == (4, 4)
    pickup_logs = (
        db_session.query(TransactionLog)
        .filter(TransactionLog.shipping_request_id == req.request_id)
        .filter(TransactionLog.shipping_phase == "PICKUP")
        .all()
    )
    assert [log.transaction_type for log in pickup_logs] == [
        TransactionTypeEnum.SHIP,
        TransactionTypeEnum.SHIP,
    ]


def test_prepare_cancel_reverses_prepare_logs(db_session, make_item, make_bom):
    af = make_item(name="AF 본체", process_type_code="AF", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=1)
    base_pa = make_item(name="기본 PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=2)
    base_pf = make_item(name="기본 PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    make_bom(base_pa.item_id, af.item_id, Decimal("1"))
    make_bom(base_pf.item_id, base_pa.item_id, Decimal("1"))
    db_session.commit()

    req = shipping_svc.create_request(
        db_session,
        {
            "base_pf_item_id": base_pf.item_id,
            "requested_by_name": "출하담당",
        },
    )
    shipping_svc.send_to_prep(db_session, req.request_id)
    shipping_svc.prepare_complete(db_session, req.request_id, companion_lines=[])

    with pytest.raises(shipping_svc.ShippingError):
        shipping_svc.update_checklist(db_session, req.request_id, {})
    with pytest.raises(shipping_svc.ShippingError):
        shipping_svc.clear_checklist(db_session, req.request_id)

    assert _stock(db_session, af) == (0, 0)
    assert _stock(db_session, base_pf) == (1, 1)

    shipping_svc.prepare_cancel(db_session, req.request_id, reason="구성 변경")

    assert _stock(db_session, af) == (1, 1)
    assert _stock(db_session, base_pa) == (0, 0)
    assert _stock(db_session, base_pf) == (0, 0)
    cancelled = (
        db_session.query(TransactionLog)
        .filter(TransactionLog.shipping_request_id == req.request_id)
        .filter(TransactionLog.shipping_phase == "PREPARE")
        .all()
    )
    assert cancelled
    assert all(log.cancelled for log in cancelled)


def test_same_bom_is_reused_and_companion_lines_do_not_create_new_items(
    db_session, make_item, make_bom
):
    af = make_item(name="AF 본체", process_type_code="AF", warehouse_qty=Decimal("2"), model_symbol="4", serial_no=1)
    carton = make_item(name="카톤", process_type_code="PR", warehouse_qty=Decimal("2"), model_symbol="4", serial_no=2)
    pa = make_item(name="기존 PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    pf = make_item(name="기존 PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    db_session.commit()

    req = shipping_svc.create_request(
        db_session,
        {
            "base_pf_item_id": pf.item_id,
            "requested_by_name": "출하담당",
            "bom_lines": [_line(af)],
        },
    )
    shipping_svc.send_to_prep(db_session, req.request_id)
    prepared = shipping_svc.prepare_complete(
        db_session,
        req.request_id,
        companion_lines=[{"item_id": carton.item_id, "quantity": 1, "unit": "EA"}],
    )

    assert prepared.final_pa_item_id == pa.item_id
    assert prepared.final_pf_item_id == pf.item_id
    assert db_session.query(TransactionLog).filter(TransactionLog.item_id == carton.item_id).count() == 0


def test_custom_bom_requires_names_when_no_existing_match(db_session, make_item, make_bom):
    af = make_item(name="AF 본체", process_type_code="AF", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=1)
    cable = make_item(name="케이블", process_type_code="PR", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=2)
    base_pa = make_item(name="기본 PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    base_pf = make_item(name="기본 PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    make_bom(base_pa.item_id, af.item_id, Decimal("1"))
    make_bom(base_pf.item_id, base_pa.item_id, Decimal("1"))
    db_session.commit()

    req = shipping_svc.create_request(
        db_session,
        {
            "base_pf_item_id": base_pf.item_id,
            "requested_by_name": "출하담당",
            "bom_lines": [_line(af), _line(cable)],
        },
    )
    shipping_svc.send_to_prep(db_session, req.request_id)

    with pytest.raises(shipping_svc.ShippingError, match="새 PA/PF 이름"):
        shipping_svc.prepare_complete(db_session, req.request_id, companion_lines=[])

def test_excluded_default_bom_line_is_saved_but_ignored_by_checklist_and_prepare(
    db_session, make_item, make_bom
):
    af = make_item(name="AF 본체", process_type_code="AF", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=1)
    cable = make_item(name="기본 케이블", process_type_code="PR", warehouse_qty=Decimal("3"), model_symbol="4", serial_no=2)
    pa = make_item(name="기존 PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    pf = make_item(name="기존 PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pa.item_id, cable.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    db_session.commit()

    req = shipping_svc.create_request(
        db_session,
        {
            "base_pf_item_id": pf.item_id,
            "requested_by_name": "출하담당",
            "custom_pa_name": "케이블 제외 PA",
            "custom_pf_name": "케이블 제외 PF",
            "bom_lines": [
                _bom_line(pa, stage="PF", origin="DEFAULT"),
                _bom_line(af, stage="PA", origin="DEFAULT"),
                _bom_line(cable, stage="PA", included=False, origin="DEFAULT"),
            ],
        },
    )

    excluded = [line for line in req.bom_lines if line.child_item_id == cable.item_id][0]
    assert excluded.included is False
    assert excluded.origin == "DEFAULT"
    assert all(line.item_id != cable.item_id for line in req.checklist_lines)

    shipping_svc.send_to_prep(db_session, req.request_id)
    prepared = shipping_svc.prepare_complete(db_session, req.request_id, companion_lines=[])

    assert prepared.final_pa_item.item_name == "케이블 제외 PA"
    assert _stock(db_session, af) == (0, 0)
    assert _stock(db_session, cable) == (3, 3)


def test_pa_match_reuses_existing_pa_and_requires_only_new_pf_name_when_pf_differs(
    db_session, make_item, make_bom
):
    af = make_item(name="AF 본체", process_type_code="AF", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=1)
    bracket = make_item(name="브라켓", process_type_code="PR", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=2)
    pa = make_item(name="공용 PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    pf = make_item(name="기본 PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    db_session.commit()

    bom_lines = [
        _bom_line(pa, stage="PF", origin="DEFAULT"),
        _bom_line(bracket, stage="PF"),
        _bom_line(af, stage="PA", origin="DEFAULT"),
    ]
    match = shipping_svc.match_bom(db_session, bom_lines=bom_lines, base_pf_item_id=pf.item_id)

    assert match["matched_pa_item_id"] == pa.item_id
    assert match["matched_pf_item_id"] is None
    assert match["requires_pa_name"] is False
    assert match["requires_pf_name"] is True

    req = shipping_svc.create_request(
        db_session,
        {
            "base_pf_item_id": pf.item_id,
            "requested_by_name": "출하담당",
            "custom_pf_name": "브라켓 포함 PF",
            "bom_lines": bom_lines,
        },
    )
    shipping_svc.send_to_prep(db_session, req.request_id)
    prepared = shipping_svc.prepare_complete(db_session, req.request_id, companion_lines=[])

    assert prepared.final_pa_item_id == pa.item_id
    assert prepared.final_pf_item.item_name == "브라켓 포함 PF"
    assert db_session.query(BOM).filter(BOM.parent_item_id == prepared.final_pf_item_id).count() == 2

