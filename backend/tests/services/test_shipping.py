from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

import pytest
from sqlalchemy import event

from app.models import (
    BOM,
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    IoBatch,
    LocationStatusEnum,
    ShippingAllocation,
    ShippingRequestCompanionLine,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services import shipping as shipping_svc
from app.services import shipping_actions as shipping_actions_svc
from app.services import io as io_svc
from app.services import io_actions as io_actions_svc
from app.schemas.io import IoPreviewTarget, IoSubmitRequest


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


def _shipping_actor(db_session) -> Employee:
    actor = Employee(
        employee_code="SHIPPING-SERVICE-ACTOR",
        name="Shipping service actor",
        role="worker",
        department=DepartmentEnum.SALES.value,
        level=EmployeeLevelEnum.STAFF,
        display_order=0,
        is_active=True,
    )
    db_session.add(actor)
    db_session.flush()
    return actor


def _add_linked_prepare_log(
    db_session,
    *,
    request,
    item,
    quantity: int,
    actor: Employee,
) -> TransactionLog:
    batch = IoBatch(
        batch_id=uuid.uuid4(),
        work_type="process",
        sub_type="produce",
        status="completed",
        requester_employee_id=actor.employee_id,
        requester_name=actor.name,
        requester_department=getattr(actor.department, "value", actor.department),
        requires_approval=False,
        shipping_request_id=request.request_id,
        reference_no=f"SHIP-PREP-{request.request_id.hex[:8]}",
    )
    db_session.add(batch)
    db_session.flush()
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.PRODUCE,
        quantity_change=quantity,
        quantity_before=0,
        quantity_after=quantity,
        operation_batch_id=batch.batch_id,
        shipping_request_id=request.request_id,
        shipping_phase="PREPARE",
        reference_no=batch.reference_no,
        produced_by=actor.name,
        producer_employee_id=actor.employee_id,
        inventory_effect=[],
    )
    db_session.add(log)
    db_session.flush()
    return log


def _submit_linked_final_pf_production(
    db_session,
    *,
    request,
    actor: Employee,
    quantity: int | None = None,
) -> dict:
    final_pf = request.final_pf_item
    assert final_pf is not None
    produced_quantity = quantity or int(request.request_quantity or 1)
    preview = io_svc.preview(
        db_session,
        work_type="process",
        sub_type="produce",
        to_department=DepartmentEnum.SHIPPING.value,
        targets=[
            IoPreviewTarget(
                source_kind="direct_item",
                item_id=final_pf.item_id,
                quantity=produced_quantity,
            )
        ],
    )
    return io_actions_svc.submit(
        db_session,
        IoSubmitRequest(
            requester_employee_id=actor.employee_id,
            work_type="process",
            sub_type="produce",
            to_department=DepartmentEnum.SHIPPING.value,
            shipping_request_id=request.request_id,
            bundles=preview["bundles"],
        ),
    )


def _simulate_legacy_prepare(db_session, request) -> None:
    request_quantity = shipping_svc._request_quantity(request)
    final_pa, final_pf = shipping_svc._require_final_items(db_session, request)
    reference_no = f"SHIP-PREP-{request.request_id.hex[:8]}"
    shipping_svc._backflush_item_location(
        db_session,
        request,
        final_pa,
        request_quantity,
        reference_no,
        "legacy prepare test",
    )
    shipping_svc._produce_pf_to_item_location(
        db_session,
        request,
        final_pf,
        request_quantity,
        reference_no,
    )
    shipping_svc._reserve_companions(db_session, request, reference_no)
    request.status = shipping_svc.ShippingRequestStatusEnum.PREPARED
    request.prepared_at = datetime.utcnow()
    request.updated_at = datetime.utcnow()
    shipping_svc._record_event(db_session, request, "PREPARED", "legacy prepare test")
    db_session.flush()


def test_companion_lines_do_not_map_bom_inclusion_flags():
    column_names = set(ShippingRequestCompanionLine.__table__.columns.keys())

    assert "included" not in column_names
    assert "origin" not in column_names


def test_prepare_without_invoice_keeps_request_and_events_unchanged(db_session, make_item, make_bom):
    af = make_item(name="Invoice guard AF", process_type_code="AF", model_symbol="3", serial_no=1)
    pa = make_item(name="Invoice guard PA", process_type_code="PA", model_symbol="3", serial_no=2)
    pf = make_item(name="Invoice guard PF", process_type_code="PF", model_symbol="3", serial_no=3)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    request = shipping_svc.create_request(db_session, {"base_pf_item_id": pf.item_id})
    shipping_svc.send_to_prep(db_session, request.request_id)
    event_count = len(request.events)

    with pytest.raises(shipping_svc.ShippingError, match="인보이스"):
        shipping_svc.prepare_complete(db_session, request.request_id)

    assert request.status.value == "PREPARING"
    assert len(request.events) == event_count


def test_prepare_complete_requires_linked_final_pf_output_without_new_inventory_logs(
    db_session, make_item, make_bom
):
    af = make_item(name="Linked prepare AF", process_type_code="AF", model_symbol="8", serial_no=1)
    pa = make_item(name="Linked prepare PA", process_type_code="PA", model_symbol="8", serial_no=1)
    pf = make_item(name="Linked prepare PF", process_type_code="PF", model_symbol="8", serial_no=2)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    request = shipping_svc.create_request(
        db_session,
        {
            "base_pf_item_id": pf.item_id,
            "invoice_number": "LINKED-PREPARE-001",
            "request_quantity": 2,
        },
    )
    shipping_svc.send_to_prep(db_session, request.request_id)
    actor = _shipping_actor(db_session)
    _add_linked_prepare_log(
        db_session,
        request=request,
        item=pf,
        quantity=2,
        actor=actor,
    )
    before_log_count = db_session.query(TransactionLog).count()

    prepared = shipping_svc.prepare_complete(db_session, request.request_id)

    assert prepared.status.value == "PREPARED"
    assert db_session.query(TransactionLog).count() == before_log_count


def test_prepare_complete_rejects_insufficient_linked_final_pf_output(
    db_session, make_item, make_bom
):
    af = make_item(name="Insufficient prepare AF", process_type_code="AF", model_symbol="8", serial_no=3)
    pa = make_item(name="Insufficient prepare PA", process_type_code="PA", model_symbol="8", serial_no=3)
    pf = make_item(name="Insufficient prepare PF", process_type_code="PF", model_symbol="8", serial_no=4)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    request = shipping_svc.create_request(
        db_session,
        {
            "base_pf_item_id": pf.item_id,
            "invoice_number": "LINKED-PREPARE-002",
            "request_quantity": 2,
        },
    )
    shipping_svc.send_to_prep(db_session, request.request_id)
    _add_linked_prepare_log(
        db_session,
        request=request,
        item=pf,
        quantity=1,
        actor=_shipping_actor(db_session),
    )

    with pytest.raises(shipping_svc.ShippingError, match="최종 PF"):
        shipping_svc.prepare_complete(db_session, request.request_id)

    assert request.status.value == "PREPARING"


def test_prepare_cancel_keeps_linked_io_inventory_log_active(db_session, make_item, make_bom):
    af = make_item(name="Linked cancel AF", process_type_code="AF", model_symbol="8", serial_no=5)
    pa = make_item(name="Linked cancel PA", process_type_code="PA", model_symbol="8", serial_no=5)
    pf = make_item(name="Linked cancel PF", process_type_code="PF", model_symbol="8", serial_no=6)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    request = shipping_svc.create_request(
        db_session,
        {
            "base_pf_item_id": pf.item_id,
            "invoice_number": "LINKED-CANCEL-001",
        },
    )
    shipping_svc.send_to_prep(db_session, request.request_id)
    linked_log = _add_linked_prepare_log(
        db_session,
        request=request,
        item=pf,
        quantity=1,
        actor=_shipping_actor(db_session),
    )
    shipping_svc.prepare_complete(db_session, request.request_id)

    shipping_svc.prepare_cancel(db_session, request.request_id, reason="retry")

    assert request.status.value == "PREPARING"
    assert linked_log.cancelled is False


def test_default_shipping_bom_lines_use_standard_child_order(db_session, make_item, make_bom):
    af = make_item(name="AF", process_type_code="AF", model_symbol="3", serial_no=1)
    aa = make_item(name="AA", process_type_code="AA", model_symbol="3", serial_no=1)
    ar = make_item(name="AR", process_type_code="AR", model_symbol="3", serial_no=1)
    pa = make_item(name="PA", process_type_code="PA", model_symbol="3", serial_no=1)
    pr = make_item(name="PR", process_type_code="PR", model_symbol="3", serial_no=1)
    pf = make_item(name="PF", process_type_code="PF", model_symbol="3", serial_no=1)

    for child in [pr, pa]:
        make_bom(pf.item_id, child.item_id, Decimal("1"))
    for child in [ar, aa, af]:
        make_bom(pa.item_id, child.item_id, Decimal("1"))
    db_session.commit()

    request = shipping_svc.create_request(
        db_session,
        {"base_pf_item_id": pf.item_id, "requested_by_name": "shipping-user"},
    )

    assert [line.child_item_id for line in request.bom_lines if line.parent_stage == "PF"] == [
        pa.item_id,
        pr.item_id,
    ]
    assert [line.child_item_id for line in request.bom_lines if line.parent_stage == "PA"] == [
        af.item_id,
        aa.item_id,
        ar.item_id,
    ]


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


def test_match_bom_previews_unreserved_codes_for_new_pa_and_pf(db_session, make_item, make_bom):
    af = make_item(name="AF body", process_type_code="AF", model_symbol="4", serial_no=1)
    bracket = make_item(name="Bracket", process_type_code="PR", model_symbol="4", serial_no=2)
    base_pa = make_item(name="Base PA", process_type_code="PA", model_symbol="4", serial_no=6)
    base_pf = make_item(name="Base PF", process_type_code="PF", model_symbol="4", serial_no=9)
    make_bom(base_pa.item_id, af.item_id, Decimal("1"))
    make_bom(base_pf.item_id, base_pa.item_id, Decimal("1"))
    db_session.commit()

    match = shipping_svc.match_bom(
        db_session,
        bom_lines=[
            _bom_line(base_pa, stage="PF", origin="DEFAULT"),
            _bom_line(af, stage="PA", origin="DEFAULT"),
            _bom_line(bracket, stage="PA"),
        ],
        base_pf_item_id=base_pf.item_id,
    )

    assert match["matched_pa_item_id"] is None
    assert match["matched_pf_item_id"] is None
    assert match["preview_pa_mes_code"] == "4-PA-0007"
    assert match["preview_pf_mes_code"] == "4-PF-0010"



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
            "invoice_number": "SERVICE-INV-001",
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

    _submit_linked_final_pf_production(
        db_session,
        request=req,
        actor=_shipping_actor(db_session),
    )
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
            "invoice_number": "SERVICE-INV-002",
            "companion_lines": [{"item_id": carton.item_id, "quantity": 1, "unit": "EA"}],
        },
    )
    assert req.final_pa_item_id == base_pa.item_id
    assert req.final_pf_item_id == base_pf.item_id
    shipping_svc.send_to_prep(db_session, req.request_id)
    _simulate_legacy_prepare(db_session, req)

    with pytest.raises(shipping_svc.ShippingError):
        shipping_svc.update_checklist(db_session, req.request_id, {})
    with pytest.raises(shipping_svc.ShippingError):
        shipping_svc.clear_checklist(db_session, req.request_id)

    assert _location_qty(db_session, base_pa, DepartmentEnum.SHIPPING) == 0
    assert _location_qty(db_session, base_pf, DepartmentEnum.SHIPPING) == 1
    assert _active_allocation_qty(db_session, req.request_id, carton) == 1

    shipping_svc.prepare_cancel(db_session, req.request_id, reason="change")

    actor = _shipping_actor(db_session)
    with pytest.raises(shipping_svc.ShippingError, match="인보이스"):
        shipping_svc.update_request(db_session, req.request_id, {"invoice_number": None}, actor)
    with pytest.raises(shipping_svc.ShippingError, match="인보이스"):
        shipping_svc.update_invoice(db_session, req.request_id, None, actor)
    assert req.invoice_number == "SERVICE-INV-002"

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


def test_request_mutations_require_actor_before_writing(db_session, make_item):
    af = make_item(name="Actor guard AF", process_type_code="AF", model_symbol="4", serial_no=1)
    pa = make_item(name="Actor guard PA", process_type_code="PA", model_symbol="4", serial_no=2)
    pf = make_item(name="Actor guard PF", process_type_code="PF", model_symbol="4", serial_no=3)
    db_session.add(BOM(parent_item_id=pa.item_id, child_item_id=af.item_id, quantity=1, unit="EA"))
    db_session.add(BOM(parent_item_id=pf.item_id, child_item_id=pa.item_id, quantity=1, unit="EA"))
    db_session.commit()
    request = shipping_svc.create_request(db_session, {"base_pf_item_id": pf.item_id})
    event_count = len(request.events)

    with pytest.raises(shipping_svc.ShippingError, match="작업자"):
        shipping_svc.update_request(db_session, request.request_id, {"notes": "no actor"}, None)
    with pytest.raises(shipping_svc.ShippingError, match="작업자"):
        shipping_actions_svc.update_invoice(db_session, request.request_id, "ACTOR-INV", None)
    with pytest.raises(shipping_svc.ShippingError, match="작업자"):
        shipping_svc.delete_request(db_session, request.request_id, None)
    inactive_actor = _shipping_actor(db_session)
    inactive_actor.is_active = False
    with pytest.raises(shipping_svc.ShippingError, match="비활성"):
        shipping_svc.update_invoice(db_session, request.request_id, "INACTIVE-INV", inactive_actor)

    assert request.notes is None
    assert request.invoice_number is None
    assert request.status.value == "REQUESTED"
    assert len(request.events) == event_count


def test_cancelled_without_history_can_clear_but_legacy_picked_up_cannot(db_session, make_item, make_bom):
    af = make_item(name="Cancel clear AF", process_type_code="AF", model_symbol="4", serial_no=1)
    pa = make_item(name="Cancel clear PA", process_type_code="PA", model_symbol="4", serial_no=2)
    pf = make_item(name="Cancel clear PF", process_type_code="PF", model_symbol="4", serial_no=3)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    actor = _shipping_actor(db_session)
    request = shipping_svc.create_request(
        db_session,
        {"base_pf_item_id": pf.item_id, "invoice_number": "CANCEL-CLEAR"},
    )

    shipping_svc.delete_request(db_session, request.request_id, actor)
    updated = shipping_svc.update_invoice(db_session, request.request_id, None, actor)

    assert updated.status.value == "CANCELLED"
    assert updated.invoice_number is None

    shipping_svc.update_invoice(db_session, request.request_id, "PICKED-LEGACY", actor)
    request.status = shipping_svc.ShippingRequestStatusEnum.PICKED_UP
    request.prepared_at = None
    with pytest.raises(shipping_svc.ShippingError, match="인보이스"):
        shipping_svc.update_invoice(db_session, request.request_id, None, actor)
    assert request.invoice_number == "PICKED-LEGACY"


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
            "invoice_number": "SERVICE-INV-003",
            "bom_lines": [_line(af)],
            "companion_lines": [{"item_id": carton.item_id, "quantity": 1, "unit": "EA"}],
        },
    )

    assert req.final_pa_item_id == pa.item_id
    assert req.final_pf_item_id == pf.item_id
    assert db_session.query(TransactionLog).filter(TransactionLog.item_id == carton.item_id).count() == 0

    shipping_svc.send_to_prep(db_session, req.request_id)
    _submit_linked_final_pf_production(
        db_session,
        request=req,
        actor=_shipping_actor(db_session),
    )
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
    make_location(pouch.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("3"))
    make_location(carton.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("2"))
    db_session.commit()

    req = shipping_svc.create_request(
        db_session,
        {
            "base_pf_item_id": pf.item_id,
            "requested_by_name": "shipping-user",
            "invoice_number": "SERVICE-INV-004",
            "request_quantity": 3,
            "companion_lines": [{"item_id": carton.item_id, "quantity": 2, "unit": "EA"}],
        },
    )
    shipping_svc.send_to_prep(db_session, req.request_id)
    _submit_linked_final_pf_production(
        db_session,
        request=req,
        actor=_shipping_actor(db_session),
    )

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
    assert any(log.item_id == pouch.item_id and log.quantity_change == -3 for log in prepare_logs)
    assert all(log.item_id != carton.item_id for log in prepare_logs)

    shipping_svc.prepare_cancel(db_session, req.request_id, reason="change")
    assert req.status.value == "PREPARING"
    assert len(req.companion_lines) == 1
    assert _location_qty(db_session, pa, DepartmentEnum.SHIPPING) == 0
    assert _location_qty(db_session, pf, DepartmentEnum.SHIPPING) == 3
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
            "invoice_number": "SERVICE-INV-005",
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
    _submit_linked_final_pf_production(
        db_session,
        request=req,
        actor=_shipping_actor(db_session),
    )
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
            "invoice_number": "SERVICE-INV-006",
            "custom_pf_name": "Bracket PF",
            "bom_lines": bom_lines,
        },
    )
    assert req.final_pa_item_id == pa.item_id
    assert req.final_pf_item.item_name == "Bracket PF"

    shipping_svc.send_to_prep(db_session, req.request_id)
    _submit_linked_final_pf_production(
        db_session,
        request=req,
        actor=_shipping_actor(db_session),
    )
    prepared = shipping_svc.prepare_complete(db_session, req.request_id)

    assert prepared.final_pa_item_id == pa.item_id
    assert prepared.final_pf_item.item_name == "Bracket PF"
    assert db_session.query(BOM).filter(BOM.parent_item_id == prepared.final_pf_item_id).count() == 2
