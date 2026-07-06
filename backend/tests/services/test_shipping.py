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
    ShippingAllocation,
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


def _active_allocation_qty(db_session, request_id, item):
    rows = (
        db_session.query(ShippingAllocation)
        .filter(
            ShippingAllocation.request_id == request_id,
            ShippingAllocation.item_id == item.item_id,
            ShippingAllocation.status == "RESERVED",
        )
        .all()
    )
    return sum(int(row.quantity or 0) for row in rows)


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



def test_component_change_then_prepare_and_pickup_reserves_companions(
    db_session, make_item, make_bom, make_location
):
    af = make_item(name="AF body", process_type_code="AF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=1)
    cable = make_item(name="Cable", process_type_code="PR", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=2)
    carton = make_item(name="Carton", process_type_code="PR", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    source_pa = make_item(name="Source PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    base_pf = make_item(name="Base PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=5)
    make_bom(source_pa.item_id, af.item_id, Decimal("1"))
    make_bom(base_pf.item_id, source_pa.item_id, Decimal("1"))
    make_location(source_pa.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    make_location(cable.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("2"))
    make_location(carton.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("5"))
    db_session.commit()

    req = shipping_svc.create_request(
        db_session,
        {
            "base_pf_item_id": base_pf.item_id,
            "requested_by_name": "shipping-user",
            "custom_pa_name": "Target PA with Cable",
            "custom_pf_name": "Target PF with Cable",
            "bom_lines": [_line(af), _line(cable)],
            "companion_lines": [{"item_id": carton.item_id, "quantity": 1, "unit": "EA"}],
        },
    )

    assert req.final_pa_item is not None
    assert req.final_pf_item is not None
    assert req.final_pa_item.item_name == "Target PA with Cable"
    assert req.final_pf_item.item_name == "Target PF with Cable"
    assert db_session.query(TransactionLog).filter(TransactionLog.shipping_request_id == req.request_id).count() == 0

    shipping_svc.send_to_prep(db_session, req.request_id)
    preview = shipping_svc.component_change_preview(db_session, req.request_id, source_pa.item_id, 1)
    assert preview["source_item_id"] == source_pa.item_id
    assert preview["target_item_id"] == req.final_pa_item_id
    added = [line for line in preview["lines"] if line["item_id"] == cable.item_id][0]
    assert added["delta_per_unit"] == 1
    assert added["total_delta"] == 1
    assert added["available_quantity"] == 2

    changed = shipping_svc.execute_component_change(
        db_session,
        req.request_id,
        source_pa.item_id,
        1,
        memo="출하 요청 구성 전환",
    )
    final_pa = changed.final_pa_item
    final_pf = changed.final_pf_item
    assert _location_qty(db_session, source_pa, DepartmentEnum.SHIPPING) == 0
    assert _location_qty(db_session, final_pa, DepartmentEnum.SHIPPING) == 1
    assert _location_qty(db_session, cable, DepartmentEnum.SHIPPING) == 1

    component_logs = (
        db_session.query(TransactionLog)
        .filter(TransactionLog.shipping_request_id == req.request_id)
        .filter(TransactionLog.shipping_phase == "COMPONENT_CHANGE")
        .all()
    )
    assert {log.item_id for log in component_logs} == {source_pa.item_id, final_pa.item_id, cable.item_id}
    assert any(log.item_id == source_pa.item_id and log.quantity_change == -1 for log in component_logs)
    assert any(log.item_id == final_pa.item_id and log.quantity_change == 1 for log in component_logs)
    assert any(log.item_id == cable.item_id and log.quantity_change == -1 for log in component_logs)

    prepared = shipping_svc.prepare_complete(db_session, req.request_id)

    assert prepared.final_pa_item_id == final_pa.item_id
    assert prepared.final_pf_item_id == final_pf.item_id
    assert _location_qty(db_session, final_pa, DepartmentEnum.SHIPPING) == 0
    assert _location_qty(db_session, final_pf, DepartmentEnum.SHIPPING) == 1
    assert _location_qty(db_session, carton, DepartmentEnum.SHIPPING) == 5
    assert _active_allocation_qty(db_session, req.request_id, carton) == 1

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
    assert {log.item_id for log in prepare_logs} == {final_pa.item_id, final_pf.item_id}
    assert all(_effect_scopes(log) <= {"location"} for log in prepare_logs)

    shipping_svc.pickup_complete(db_session, req.request_id)

    assert _location_qty(db_session, final_pf, DepartmentEnum.SHIPPING) == 0
    assert _location_qty(db_session, carton, DepartmentEnum.SHIPPING) == 4
    assert _active_allocation_qty(db_session, req.request_id, carton) == 0
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



def test_independent_component_change_rejects_invalid_pairs_and_shortages(
    db_session, make_item, make_bom, make_location
):
    af = make_item(name="AF body", process_type_code="AF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=1)
    cable = make_item(name="Cable", process_type_code="PR", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=2)
    source_pa = make_item(name="Source PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    same_bom_pa = make_item(name="Same BOM PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    target_pa = make_item(name="Target PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=5)
    make_bom(source_pa.item_id, af.item_id, Decimal("1"))
    make_bom(same_bom_pa.item_id, af.item_id, Decimal("1"))
    make_bom(target_pa.item_id, af.item_id, Decimal("1"))
    make_bom(target_pa.item_id, cable.item_id, Decimal("1"))
    make_location(source_pa.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    db_session.commit()

    with pytest.raises(shipping_svc.ShippingError):
        shipping_svc.component_change_preview_independent(db_session, source_pa.item_id, source_pa.item_id, 1)

    same_bom_preview = shipping_svc.component_change_preview_independent(
        db_session,
        source_pa.item_id,
        same_bom_pa.item_id,
        1,
        "SPEC",
    )
    assert same_bom_preview["resolved_mode"] == "SPEC"
    assert same_bom_preview["lines"] == []

    with pytest.raises(shipping_svc.ShippingError):
        shipping_svc.execute_component_change_independent(db_session, source_pa.item_id, target_pa.item_id, 2)

    with pytest.raises(shipping_svc.ShippingError):
        shipping_svc.execute_component_change_independent(db_session, source_pa.item_id, target_pa.item_id, 1)

def test_prepare_cancel_reverses_prepare_logs_and_releases_allocations(db_session, make_item, make_bom, make_location):
    af = make_item(name="AF body", process_type_code="AF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=1)
    carton = make_item(name="Carton", process_type_code="PR", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=2)
    base_pa = make_item(name="Base PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    base_pf = make_item(name="Base PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    make_bom(base_pa.item_id, af.item_id, Decimal("1"))
    make_bom(base_pf.item_id, base_pa.item_id, Decimal("1"))
    make_location(base_pa.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    make_location(carton.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    db_session.commit()

    req = shipping_svc.create_request(
        db_session,
        {
            "base_pf_item_id": base_pf.item_id,
            "requested_by_name": "shipping-user",
            "companion_lines": [{"item_id": carton.item_id, "quantity": 1, "unit": "EA"}],
        },
    )
    assert req.final_pa_item_id == base_pa.item_id
    assert req.final_pf_item_id == base_pf.item_id
    shipping_svc.send_to_prep(db_session, req.request_id)
    shipping_svc.prepare_complete(db_session, req.request_id)

    with pytest.raises(shipping_svc.ShippingError):
        shipping_svc.update_checklist(db_session, req.request_id, {})
    with pytest.raises(shipping_svc.ShippingError):
        shipping_svc.clear_checklist(db_session, req.request_id)

    assert _location_qty(db_session, base_pa, DepartmentEnum.SHIPPING) == 0
    assert _location_qty(db_session, base_pf, DepartmentEnum.SHIPPING) == 1
    assert _active_allocation_qty(db_session, req.request_id, carton) == 1

    shipping_svc.prepare_cancel(db_session, req.request_id, reason="change")

    assert req.final_pa_item_id == base_pa.item_id
    assert req.final_pf_item_id == base_pf.item_id
    assert _location_qty(db_session, base_pa, DepartmentEnum.SHIPPING) == 1
    assert _location_qty(db_session, base_pf, DepartmentEnum.SHIPPING) == 0
    assert _active_allocation_qty(db_session, req.request_id, carton) == 0
    cancelled = (
        db_session.query(TransactionLog)
        .filter(TransactionLog.shipping_request_id == req.request_id)
        .filter(TransactionLog.shipping_phase == "PREPARE")
        .all()
    )
    assert cancelled
    assert all(log.cancelled for log in cancelled)


def test_same_bom_is_resolved_on_request_and_companion_lines_do_not_create_transaction_logs(
    db_session, make_item, make_bom, make_location
):
    af = make_item(name="AF body", process_type_code="AF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=1)
    carton = make_item(name="Carton", process_type_code="PR", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=2)
    pa = make_item(name="Existing PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    pf = make_item(name="Existing PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    make_location(pa.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    make_location(carton.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    db_session.commit()

    req = shipping_svc.create_request(
        db_session,
        {
            "base_pf_item_id": pf.item_id,
            "requested_by_name": "shipping-user",
            "bom_lines": [_line(af)],
            "companion_lines": [{"item_id": carton.item_id, "quantity": 1, "unit": "EA"}],
        },
    )

    assert req.final_pa_item_id == pa.item_id
    assert req.final_pf_item_id == pf.item_id
    assert db_session.query(TransactionLog).filter(TransactionLog.item_id == carton.item_id).count() == 0

    shipping_svc.send_to_prep(db_session, req.request_id)
    shipping_svc.prepare_complete(db_session, req.request_id)

    assert db_session.query(TransactionLog).filter(TransactionLog.item_id == carton.item_id).count() == 0
    assert _active_allocation_qty(db_session, req.request_id, carton) == 1


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
    make_location(pa.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("3"))
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
    assert _active_allocation_qty(db_session, req.request_id, carton) == 2
    prepare_logs = (
        db_session.query(TransactionLog)
        .filter(TransactionLog.shipping_request_id == req.request_id)
        .filter(TransactionLog.shipping_phase == "PREPARE")
        .all()
    )
    assert any(log.item_id == pa.item_id and log.quantity_change == -3 for log in prepare_logs)
    assert any(log.item_id == pf.item_id and log.quantity_change == 3 for log in prepare_logs)
    assert all(log.item_id not in {af.item_id, pouch.item_id, carton.item_id} for log in prepare_logs)

    shipping_svc.prepare_cancel(db_session, req.request_id, reason="change")
    assert req.status.value == "PREPARING"
    assert len(req.companion_lines) == 1
    assert _location_qty(db_session, pa, DepartmentEnum.SHIPPING) == 3
    assert _location_qty(db_session, pf, DepartmentEnum.SHIPPING) == 0
    assert _active_allocation_qty(db_session, req.request_id, carton) == 0

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


def test_custom_bom_requires_names_at_request_time_when_no_existing_match(db_session, make_item, make_bom):
    af = make_item(name="AF body", process_type_code="AF", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=1)
    cable = make_item(name="Cable", process_type_code="PR", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=2)
    base_pa = make_item(name="Base PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    base_pf = make_item(name="Base PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    make_bom(base_pa.item_id, af.item_id, Decimal("1"))
    make_bom(base_pf.item_id, base_pa.item_id, Decimal("1"))
    db_session.commit()

    with pytest.raises(shipping_svc.ShippingError):
        shipping_svc.create_request(
            db_session,
            {
                "base_pf_item_id": base_pf.item_id,
                "requested_by_name": "shipping-user",
                "bom_lines": [_line(af), _line(cable)],
            },
        )


def test_excluded_default_bom_line_is_saved_but_ignored_by_checklist_and_prepare(
    db_session, make_item, make_bom, make_location
):
    af = make_item(name="AF body", process_type_code="AF", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=1)
    cable = make_item(name="Base Cable", process_type_code="PR", warehouse_qty=Decimal("3"), model_symbol="4", serial_no=2)
    pa = make_item(name="Existing PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    pf = make_item(name="Existing PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pa.item_id, cable.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    db_session.commit()

    req = shipping_svc.create_request(
        db_session,
        {
            "base_pf_item_id": pf.item_id,
            "requested_by_name": "shipping-user",
            "custom_pa_name": "Cable excluded PA",
            "custom_pf_name": "Cable excluded PF",
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
    make_location(req.final_pa_item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))

    shipping_svc.send_to_prep(db_session, req.request_id)
    prepared = shipping_svc.prepare_complete(db_session, req.request_id)

    assert prepared.final_pa_item.item_name == "Cable excluded PA"
    assert _warehouse_qty(db_session, af) == 1
    assert _warehouse_qty(db_session, cable) == 3
    assert _location_qty(db_session, af, DepartmentEnum.ASSEMBLY) == 0
    assert _location_qty(db_session, cable, DepartmentEnum.SHIPPING) == 0


def test_pa_match_reuses_existing_pa_and_requires_only_new_pf_name_when_pf_differs(
    db_session, make_item, make_bom, make_location
):
    af = make_item(name="AF body", process_type_code="AF", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=1)
    bracket = make_item(name="Bracket", process_type_code="PR", warehouse_qty=Decimal("1"), model_symbol="4", serial_no=2)
    pa = make_item(name="Shared PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    pf = make_item(name="Base PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    make_location(pa.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
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
            "requested_by_name": "shipping-user",
            "custom_pf_name": "Bracket PF",
            "bom_lines": bom_lines,
        },
    )
    assert req.final_pa_item_id == pa.item_id
    assert req.final_pf_item.item_name == "Bracket PF"

    shipping_svc.send_to_prep(db_session, req.request_id)
    prepared = shipping_svc.prepare_complete(db_session, req.request_id)

    assert prepared.final_pa_item_id == pa.item_id
    assert prepared.final_pf_item.item_name == "Bracket PF"
    assert db_session.query(BOM).filter(BOM.parent_item_id == prepared.final_pf_item_id).count() == 2
