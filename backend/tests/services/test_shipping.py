from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy import event

from app.models import (
    BOM,
    DepartmentEnum,
    Inventory,
    InventoryLocation,
    LocationStatusEnum,
    ShippingRequestCompanionLine,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services import shipping as shipping_svc


def _stock(db_session, item):
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    return int(inv.quantity or 0), int(inv.warehouse_qty or 0)


def _warehouse_qty(db_session, item):
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    return int(inv.warehouse_qty or 0)


def _location_qty(db_session, item, dept):
    loc = db_session.query(InventoryLocation).filter(
        InventoryLocation.item_id == item.item_id,
        InventoryLocation.department == dept,
        InventoryLocation.status == LocationStatusEnum.PRODUCTION,
    ).first()
    return int(loc.quantity or 0) if loc else 0


def _effect_scopes(log):
    return {entry.get("scope") for entry in (log.inventory_effect or [])}


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
    db_session, make_item, make_bom, make_location
):
    af = make_item(name="AF 蹂몄껜", process_type_code="AF", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=1)
    cable = make_item(name="耳?대툝", process_type_code="PR", warehouse_qty=Decimal("2"), model_symbol="4", serial_no=2)
    carton = make_item(name="移댄넠", process_type_code="PR", warehouse_qty=Decimal("5"), model_symbol="4", serial_no=3)
    base_pa = make_item(name="湲곕낯 媛諛??ъ옣 ?꾨즺", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    base_pf = make_item(name="湲곕낯 PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=5)
    make_bom(base_pa.item_id, af.item_id, Decimal("1"))
    make_bom(base_pf.item_id, base_pa.item_id, Decimal("1"))
    make_location(af.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("1"))
    make_location(cable.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("2"))
    make_location(carton.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("5"))
    db_session.commit()

    req = shipping_svc.create_request(
        db_session,
        {
            "base_pf_item_id": base_pf.item_id,
            "requested_by_name": "異쒗븯?대떦",
            "custom_pa_name": "湲곕낯 PF [耳?대툝 異붽?]_媛諛??ъ옣 ?꾨즺",
            "custom_pf_name": "湲곕낯 PF [耳?대툝 異붽?]",
            "bom_lines": [_line(af), _line(cable)],
            "companion_lines": [{"item_id": carton.item_id, "quantity": 1, "unit": "EA"}],
        },
    )
    shipping_svc.send_to_prep(db_session, req.request_id)

    prepared = shipping_svc.prepare_complete(db_session, req.request_id)

    final_pa = prepared.final_pa_item
    final_pf = prepared.final_pf_item
    assert final_pa is not None
    assert final_pf is not None
    assert final_pa.item_name == "湲곕낯 PF [耳?대툝 異붽?]_媛諛??ъ옣 ?꾨즺"
    assert final_pf.item_name == "湲곕낯 PF [耳?대툝 異붽?]"
    assert db_session.query(BOM).filter(BOM.parent_item_id == final_pa.item_id).count() == 2
    assert db_session.query(BOM).filter(BOM.parent_item_id == final_pf.item_id).count() == 1
    assert _warehouse_qty(db_session, af) == 1
    assert _warehouse_qty(db_session, cable) == 2
    assert _warehouse_qty(db_session, carton) == 5
    assert _location_qty(db_session, af, DepartmentEnum.ASSEMBLY) == 0
    assert _location_qty(db_session, cable, DepartmentEnum.SHIPPING) == 1
    assert _location_qty(db_session, final_pa, DepartmentEnum.SHIPPING) == 0
    assert _location_qty(db_session, final_pf, DepartmentEnum.SHIPPING) == 1
    assert _location_qty(db_session, carton, DepartmentEnum.SHIPPING) == 5

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
    assert all(_effect_scopes(log) <= {"location"} for log in prepare_logs)

    shipping_svc.pickup_complete(db_session, req.request_id)

    assert _warehouse_qty(db_session, final_pf) == 0
    assert _warehouse_qty(db_session, carton) == 5
    assert _location_qty(db_session, final_pf, DepartmentEnum.SHIPPING) == 0
    assert _location_qty(db_session, carton, DepartmentEnum.SHIPPING) == 4
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


def test_prepare_cancel_reverses_prepare_logs(db_session, make_item, make_bom, make_location):
    af = make_item(name="AF 蹂몄껜", process_type_code="AF", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=1)
    base_pa = make_item(name="湲곕낯 PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=2)
    base_pf = make_item(name="湲곕낯 PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    make_bom(base_pa.item_id, af.item_id, Decimal("1"))
    make_bom(base_pf.item_id, base_pa.item_id, Decimal("1"))
    make_location(af.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("1"))
    db_session.commit()

    req = shipping_svc.create_request(
        db_session,
        {
            "base_pf_item_id": base_pf.item_id,
            "requested_by_name": "異쒗븯?대떦",
        },
    )
    shipping_svc.send_to_prep(db_session, req.request_id)
    shipping_svc.prepare_complete(db_session, req.request_id)

    with pytest.raises(shipping_svc.ShippingError):
        shipping_svc.update_checklist(db_session, req.request_id, {})
    with pytest.raises(shipping_svc.ShippingError):
        shipping_svc.clear_checklist(db_session, req.request_id)

    assert _warehouse_qty(db_session, af) == 1
    assert _warehouse_qty(db_session, base_pf) == 0
    assert _location_qty(db_session, af, DepartmentEnum.ASSEMBLY) == 0
    assert _location_qty(db_session, base_pf, DepartmentEnum.SHIPPING) == 1

    shipping_svc.prepare_cancel(db_session, req.request_id, reason="change")

    assert _warehouse_qty(db_session, af) == 1
    assert _warehouse_qty(db_session, base_pa) == 0
    assert _warehouse_qty(db_session, base_pf) == 0
    assert _location_qty(db_session, af, DepartmentEnum.ASSEMBLY) == 1
    assert _location_qty(db_session, base_pa, DepartmentEnum.SHIPPING) == 0
    assert _location_qty(db_session, base_pf, DepartmentEnum.SHIPPING) == 0
    cancelled = (
        db_session.query(TransactionLog)
        .filter(TransactionLog.shipping_request_id == req.request_id)
        .filter(TransactionLog.shipping_phase == "PREPARE")
        .all()
    )
    assert cancelled
    assert all(log.cancelled for log in cancelled)


def test_same_bom_is_reused_and_companion_lines_do_not_create_new_items(
    db_session, make_item, make_bom, make_location
):
    af = make_item(name="AF 蹂몄껜", process_type_code="AF", warehouse_qty=Decimal("2"), model_symbol="4", serial_no=1)
    carton = make_item(name="移댄넠", process_type_code="PR", warehouse_qty=Decimal("2"), model_symbol="4", serial_no=2)
    pa = make_item(name="湲곗〈 PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    pf = make_item(name="湲곗〈 PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    make_location(af.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("1"))
    db_session.commit()

    req = shipping_svc.create_request(
        db_session,
        {
            "base_pf_item_id": pf.item_id,
            "requested_by_name": "異쒗븯?대떦",
            "bom_lines": [_line(af)],
            "companion_lines": [{"item_id": carton.item_id, "quantity": 1, "unit": "EA"}],
        },
    )
    shipping_svc.send_to_prep(db_session, req.request_id)
    prepared = shipping_svc.prepare_complete(db_session, req.request_id)

    assert prepared.final_pa_item_id == pa.item_id
    assert prepared.final_pf_item_id == pf.item_id
    assert db_session.query(TransactionLog).filter(TransactionLog.item_id == carton.item_id).count() == 0



def test_request_quantity_multiplies_prepare_and_pickup_and_preserves_companions(
    db_session, make_item, make_bom, make_location
):
    af = make_item(name="AF Main", process_type_code="AF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=1)
    pouch = make_item(name="Pouch", process_type_code="PR", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=2)
    carton = make_item(name="Carton", process_type_code="PR", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    pa = make_item(name="Base PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    pf = make_item(name="Base PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=5)
    make_bom(pa.item_id, af.item_id, Decimal("2"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    make_bom(pf.item_id, pouch.item_id, Decimal("1"))
    make_location(af.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("6"))
    make_location(pouch.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("3"))
    make_location(carton.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("2"))
    db_session.commit()

    req = shipping_svc.create_request(
        db_session,
        {
            "base_pf_item_id": pf.item_id,
            "requested_by_name": "shipping-user",
            "request_quantity": 3,
            "companion_lines": [{"item_id": carton.item_id, "quantity": 2, "unit": "EA"}],
        },
    )
    shipping_svc.send_to_prep(db_session, req.request_id)

    prepared = shipping_svc.prepare_complete(db_session, req.request_id)

    assert prepared.request_quantity == 3
    assert len(prepared.companion_lines) == 1
    assert _location_qty(db_session, af, DepartmentEnum.ASSEMBLY) == 0
    assert _location_qty(db_session, pouch, DepartmentEnum.SHIPPING) == 0
    assert _location_qty(db_session, pa, DepartmentEnum.SHIPPING) == 0
    assert _location_qty(db_session, pf, DepartmentEnum.SHIPPING) == 3
    assert _location_qty(db_session, carton, DepartmentEnum.SHIPPING) == 2
    prepare_logs = (
        db_session.query(TransactionLog)
        .filter(TransactionLog.shipping_request_id == req.request_id)
        .filter(TransactionLog.shipping_phase == "PREPARE")
        .all()
    )
    assert any(log.item_id == af.item_id and log.quantity_change == -6 for log in prepare_logs)
    assert any(log.item_id == pouch.item_id and log.quantity_change == -3 for log in prepare_logs)
    assert any(log.item_id == pa.item_id and log.quantity_change == 3 for log in prepare_logs)
    assert any(log.item_id == pa.item_id and log.quantity_change == -3 for log in prepare_logs)
    assert any(log.item_id == pf.item_id and log.quantity_change == 3 for log in prepare_logs)

    shipping_svc.prepare_cancel(db_session, req.request_id, reason="change")
    assert req.status.value == "PREPARING"
    assert len(req.companion_lines) == 1
    assert _location_qty(db_session, af, DepartmentEnum.ASSEMBLY) == 6
    assert _location_qty(db_session, pouch, DepartmentEnum.SHIPPING) == 3
    assert _location_qty(db_session, pf, DepartmentEnum.SHIPPING) == 0

    shipping_svc.prepare_complete(db_session, req.request_id)
    shipping_svc.pickup_complete(db_session, req.request_id)

    assert _location_qty(db_session, pf, DepartmentEnum.SHIPPING) == 0
    assert _location_qty(db_session, carton, DepartmentEnum.SHIPPING) == 0
    pickup_logs = (
        db_session.query(TransactionLog)
        .filter(TransactionLog.shipping_request_id == req.request_id)
        .filter(TransactionLog.shipping_phase == "PICKUP")
        .all()
    )
    assert any(log.item_id == pf.item_id and log.quantity_change == -3 for log in pickup_logs)
    assert any(log.item_id == carton.item_id and log.quantity_change == -2 for log in pickup_logs)

def test_custom_bom_requires_names_when_no_existing_match(db_session, make_item, make_bom):
    af = make_item(name="AF 蹂몄껜", process_type_code="AF", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=1)
    cable = make_item(name="耳?대툝", process_type_code="PR", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=2)
    base_pa = make_item(name="湲곕낯 PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    base_pf = make_item(name="湲곕낯 PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    make_bom(base_pa.item_id, af.item_id, Decimal("1"))
    make_bom(base_pf.item_id, base_pa.item_id, Decimal("1"))
    db_session.commit()

    req = shipping_svc.create_request(
        db_session,
        {
            "base_pf_item_id": base_pf.item_id,
            "requested_by_name": "異쒗븯?대떦",
            "bom_lines": [_line(af), _line(cable)],
        },
    )
    shipping_svc.send_to_prep(db_session, req.request_id)

    with pytest.raises(shipping_svc.ShippingError):
        shipping_svc.prepare_complete(db_session, req.request_id)

def test_excluded_default_bom_line_is_saved_but_ignored_by_checklist_and_prepare(
    db_session, make_item, make_bom, make_location
):
    af = make_item(name="AF 蹂몄껜", process_type_code="AF", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=1)
    cable = make_item(name="湲곕낯 耳?대툝", process_type_code="PR", warehouse_qty=Decimal("3"), model_symbol="4", serial_no=2)
    pa = make_item(name="湲곗〈 PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    pf = make_item(name="湲곗〈 PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pa.item_id, cable.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    make_location(af.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("1"))
    db_session.commit()

    req = shipping_svc.create_request(
        db_session,
        {
            "base_pf_item_id": pf.item_id,
            "requested_by_name": "異쒗븯?대떦",
            "custom_pa_name": "耳?대툝 ?쒖쇅 PA",
            "custom_pf_name": "耳?대툝 ?쒖쇅 PF",
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
    prepared = shipping_svc.prepare_complete(db_session, req.request_id)

    assert prepared.final_pa_item.item_name == "耳?대툝 ?쒖쇅 PA"
    assert _warehouse_qty(db_session, af) == 1
    assert _warehouse_qty(db_session, cable) == 3
    assert _location_qty(db_session, af, DepartmentEnum.ASSEMBLY) == 0
    assert _location_qty(db_session, cable, DepartmentEnum.SHIPPING) == 0


def test_pa_match_reuses_existing_pa_and_requires_only_new_pf_name_when_pf_differs(
    db_session, make_item, make_bom, make_location
):
    af = make_item(name="AF 蹂몄껜", process_type_code="AF", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=1)
    bracket = make_item(name="Bracket", process_type_code="PR", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=2)
    pa = make_item(name="怨듭슜 PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    pf = make_item(name="湲곕낯 PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    make_location(af.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("1"))
    make_location(bracket.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
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
            "requested_by_name": "異쒗븯?대떦",
            "custom_pf_name": "Bracket PF",
            "bom_lines": bom_lines,
        },
    )
    shipping_svc.send_to_prep(db_session, req.request_id)
    prepared = shipping_svc.prepare_complete(db_session, req.request_id)

    assert prepared.final_pa_item_id == pa.item_id
    assert prepared.final_pf_item.item_name == "Bracket PF"
    assert db_session.query(BOM).filter(BOM.parent_item_id == prepared.final_pf_item_id).count() == 2
