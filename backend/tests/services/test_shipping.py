from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import event

from app.models import (
    BOM,
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryOperation,
    InventoryOperationEffect,
    InventoryOperationEffectKindEnum,
    InventoryOperationRoleEnum,
    InventoryLocation,
    IoBatch,
    Item,
    LocationStatusEnum,
    ShippingAllocation,
    ShippingFinalizationModeEnum,
    ShippingRequest,
    ShippingRequestBomLine,
    ShippingRequestCompanionLine,
    ShippingRequestStatusEnum,
    SystemSetting,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services import shipping as shipping_svc
from app.services import shipping_actions as shipping_actions_svc
from app.services import io as io_svc
from app.services import io_actions as io_actions_svc
from app.services import inventory_operation_cancellation as cancellation_svc
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


def test_pickup_consumption_prelocks_sorted_unique_inventories(
    db_session, monkeypatch
):
    request_id = uuid.uuid4()
    first = SimpleNamespace(item_id=uuid.UUID(int=1), item_name="first")
    second = SimpleNamespace(item_id=uuid.UUID(int=2), item_name="second")
    final_pf = SimpleNamespace(item_id=uuid.UUID(int=3), item_name="final")
    request = SimpleNamespace(request_id=request_id, companion_lines=[])
    actor = SimpleNamespace(
        employee_id=uuid.UUID(int=4),
        employee_code="PICKER",
        name="Picker",
    )
    allocations = [
        SimpleNamespace(
            item=second,
            item_id=second.item_id,
            quantity=1,
            reference_no="companion-second",
            status="RESERVED",
            consumed_at=None,
        ),
        SimpleNamespace(
            item=first,
            item_id=first.item_id,
            quantity=1,
            reference_no="companion-first",
            status="RESERVED",
            consumed_at=None,
        ),
    ]
    events = []

    monkeypatch.setattr(
        shipping_svc,
        "_active_allocations_for_request",
        lambda *_args: allocations,
    )
    monkeypatch.setattr(
        shipping_svc.inventory_svc,
        "_get_or_create_inventory",
        lambda *_args: None,
    )
    monkeypatch.setattr(
        shipping_svc.inventory_svc,
        "lock_inventories",
        lambda _db, item_ids: events.append(("lock", item_ids))
        or {item_id: object() for item_id in item_ids},
    )
    monkeypatch.setattr(
        shipping_svc,
        "_ship_from_item_location",
        lambda _db, _req, item, _qty, _notes, _actor, **_kwargs: events.append(
            ("ship", item.item_id)
        ),
    )

    shipping_svc._consume_pickup_allocations(db_session, request, final_pf, 1, actor)

    assert events[0] == (
        "lock",
        sorted({first.item_id, second.item_id, final_pf.item_id}),
    )


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
    existing = (
        db_session.query(Employee)
        .filter(Employee.employee_code == "SHIPPING-SERVICE-ACTOR")
        .first()
    )
    if existing is not None:
        return existing
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


def _create_request(db_session, payload: dict, actor: Employee | None = None):
    return shipping_actions_svc.create_request(
        db_session,
        payload,
        actor or _shipping_actor(db_session),
    )


def _unfinalized_preparing_request(db_session, make_item, make_bom):
    component = make_item(name="unfinalized component", process_type_code="AF")
    source_pa = make_item(name="unfinalized source PA", process_type_code="PA")
    base_pf = make_item(name="unfinalized base PF", process_type_code="PF")
    make_bom(source_pa.item_id, component.item_id, Decimal("1"))
    make_bom(base_pf.item_id, source_pa.item_id, Decimal("1"))
    request = ShippingRequest(
        status=ShippingRequestStatusEnum.PREPARING,
        base_pf_item_id=base_pf.item_id,
        finalization_mode=ShippingFinalizationModeEnum.CREATE_NEW,
        custom_pa_name="lazy-created final PA",
        custom_pf_name="lazy-created final PF",
        requested_by_name="shipping-user",
    )
    request.bom_lines = [
        ShippingRequestBomLine(
            parent_stage="PA",
            child_item_id=component.item_id,
            quantity=1,
            unit="EA",
            included=True,
            origin="DEFAULT",
            sort_order=0,
        ),
        ShippingRequestBomLine(
            parent_stage="PF",
            child_item_id=source_pa.item_id,
            quantity=1,
            unit="EA",
            included=True,
            origin="DEFAULT",
            sort_order=1,
        ),
    ]
    db_session.add(request)
    db_session.flush()
    return request, source_pa


def _update_checklist(db_session, request_id, checks, actor: Employee | None = None):
    return shipping_actions_svc.update_checklist(
        db_session,
        request_id,
        checks,
        actor or _shipping_actor(db_session),
    )


def _clear_checklist(db_session, request_id, actor: Employee | None = None):
    return shipping_actions_svc.clear_checklist(
        db_session,
        request_id,
        actor or _shipping_actor(db_session),
    )


def _execute_component_change_independent(
    db_session,
    source_pa_item_id,
    target_pa_item_id,
    quantity,
    memo=None,
    requested_mode="BOM",
    *,
    actor: Employee | None = None,
):
    return shipping_actions_svc.execute_component_change_independent(
        db_session,
        source_pa_item_id,
        target_pa_item_id,
        quantity,
        memo,
        requested_mode,
        actor=actor or _shipping_actor(db_session),
    )


def _execute_component_change(
    db_session,
    request_id,
    source_pa_item_id,
    quantity,
    requested_mode="BOM",
    memo=None,
    *,
    actor: Employee | None = None,
):
    return shipping_actions_svc.execute_component_change(
        db_session,
        request_id,
        source_pa_item_id,
        quantity,
        requested_mode,
        memo,
        actor=actor or _shipping_actor(db_session),
    )


def _prepare_complete(
    db_session,
    request_id,
    serial_numbers,
    *,
    actor: Employee | None = None,
):
    return shipping_actions_svc.prepare_complete(
        db_session,
        request_id,
        serial_numbers,
        actor=actor or _shipping_actor(db_session),
    )


def _prepare_cancel(
    db_session,
    request_id,
    reason=None,
    *,
    actor: Employee | None = None,
):
    return shipping_actions_svc.prepare_cancel(
        db_session,
        request_id,
        reason,
        actor=actor or _shipping_actor(db_session),
    )


def _pickup_complete(db_session, request_id, actor: Employee | None = None):
    return shipping_actions_svc.pickup_complete(
        db_session,
        request_id,
        actor or _shipping_actor(db_session),
    )


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


def _submit_final_pf_production(
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
            bundles=preview["bundles"],
        ),
        requester=actor,
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
    shipping_svc._reserve_pickup_items(
        db_session,
        request,
        final_pf,
        request_quantity,
        reference_no,
    )
    request.status = shipping_svc.ShippingRequestStatusEnum.PREPARED
    request.prepared_at = datetime.utcnow()
    request.updated_at = datetime.utcnow()
    shipping_svc._record_event(
        db_session,
        request,
        "PREPARED",
        "legacy prepare test",
        actor=_shipping_actor(db_session),
    )
    db_session.flush()


def test_companion_lines_do_not_map_bom_inclusion_flags():
    column_names = set(ShippingRequestCompanionLine.__table__.columns.keys())

    assert "included" not in column_names
    assert "origin" not in column_names


def test_create_request_starts_preparing_with_checklist_and_creation_event(
    db_session, make_item, make_bom
):
    af = make_item(name="Immediate prep AF", process_type_code="AF", model_symbol="3", serial_no=20)
    pa = make_item(name="Immediate prep PA", process_type_code="PA", model_symbol="3", serial_no=21)
    pf = make_item(name="Immediate prep PF", process_type_code="PF", model_symbol="3", serial_no=22)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))

    request = _create_request(db_session, {"base_pf_item_id": pf.item_id})

    assert not hasattr(ShippingRequestStatusEnum, "REQUESTED")
    assert request.status is ShippingRequestStatusEnum.PREPARING
    assert [line.item_id for line in request.checklist_lines] == [pa.item_id]
    assert request.events[-1].event_type == "REQUEST_CREATED"
    assert request.events[-1].message == "출하 요청 생성 및 준비 시작"


@pytest.mark.parametrize(
    "status",
    [
        ShippingRequestStatusEnum.PREPARED,
        ShippingRequestStatusEnum.PICKED_UP,
        ShippingRequestStatusEnum.CANCELLED,
    ],
)
def test_update_request_rejects_every_non_preparing_status_with_exact_message(
    db_session, make_item, make_bom, status
):
    af = make_item(name=f"Update guard {status.value} AF", process_type_code="AF", model_symbol="3")
    pa = make_item(name=f"Update guard {status.value} PA", process_type_code="PA", model_symbol="3")
    pf = make_item(name=f"Update guard {status.value} PF", process_type_code="PF", model_symbol="3")
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    request = _create_request(db_session, {"base_pf_item_id": pf.item_id})
    request.status = status
    actor = _shipping_actor(db_session)

    with pytest.raises(shipping_svc.ShippingError) as exc_info:
        shipping_actions_svc.update_request(
            db_session,
            request.request_id,
            {"notes": "blocked"},
            actor,
        )

    assert str(exc_info.value) == "준비 중 상태에서만 출하 요청을 수정할 수 있습니다."


def test_prepare_without_invoice_keeps_request_and_events_unchanged(db_session, make_item, make_bom):
    af = make_item(name="Invoice guard AF", process_type_code="AF", model_symbol="3", serial_no=1)
    pa = make_item(name="Invoice guard PA", process_type_code="PA", model_symbol="3", serial_no=2)
    pf = make_item(name="Invoice guard PF", process_type_code="PF", model_symbol="3", serial_no=3)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    request = _create_request(db_session, {"base_pf_item_id": pf.item_id})
    event_count = len(request.events)

    with pytest.raises(shipping_svc.ShippingError, match="인보이스"):
        _prepare_complete(db_session, request.request_id, "SN-001")

    assert request.status.value == "PREPARING"
    assert len(request.events) == event_count


def test_prepare_complete_rejects_blank_serial_numbers_before_state_or_events(
    db_session, make_item, make_bom
):
    af = make_item(name="SN guard AF", process_type_code="AF", model_symbol="3", serial_no=4)
    pa = make_item(name="SN guard PA", process_type_code="PA", model_symbol="3", serial_no=5)
    pf = make_item(name="SN guard PF", process_type_code="PF", model_symbol="3", serial_no=6)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    request = _create_request(
        db_session,
        {"base_pf_item_id": pf.item_id, "invoice_number": "SN-GUARD-001"},
    )
    event_count = len(request.events)

    with pytest.raises(shipping_svc.ShippingError, match="SN"):
        _prepare_complete(db_session, request.request_id, " \n\t ")

    assert request.status.value == "PREPARING"
    assert len(request.events) == event_count
    assert request.serial_numbers is None


def test_prepare_complete_stores_trimmed_multiline_serial_numbers_and_overwrites_after_cancel(
    db_session, make_item, make_bom, make_location
):
    af = make_item(name="SN store AF", process_type_code="AF", model_symbol="3", serial_no=7)
    pa = make_item(name="SN store PA", process_type_code="PA", model_symbol="3", serial_no=8)
    pf = make_item(name="SN store PF", process_type_code="PF", model_symbol="3", serial_no=9)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    request = _create_request(
        db_session,
        {"base_pf_item_id": pf.item_id, "invoice_number": "SN-STORE-001"},
    )
    make_location(pf.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))

    prepared = _prepare_complete(
        db_session,
        request.request_id,
        "  SN-001\nSN-002  ",
    )

    assert prepared.serial_numbers == "SN-001\nSN-002"
    db_session.expire_all()
    reloaded = shipping_svc._get_request(db_session, request.request_id)
    assert reloaded.serial_numbers == "SN-001\nSN-002"

    cancelled = _prepare_cancel(db_session, request.request_id, reason="retry")
    assert cancelled.serial_numbers == "SN-001\nSN-002"
    prepared_again = _prepare_complete(db_session, request.request_id, "SN-003")
    assert prepared_again.serial_numbers == "SN-003"


def test_prepare_complete_reserves_final_pf_from_shipping_stock_without_linked_output(
    db_session, make_item, make_bom, make_location
):
    af = make_item(name="Linked prepare AF", process_type_code="AF", model_symbol="8", serial_no=1)
    pa = make_item(name="Linked prepare PA", process_type_code="PA", model_symbol="8", serial_no=1)
    pf = make_item(name="Linked prepare PF", process_type_code="PF", model_symbol="8", serial_no=2)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    request = _create_request(
        db_session,
        {
            "base_pf_item_id": pf.item_id,
            "invoice_number": "LINKED-PREPARE-001",
            "request_quantity": 2,
        },
    )
    make_location(pf.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("2"))
    before_log_count = db_session.query(TransactionLog).count()

    prepared = _prepare_complete(db_session, request.request_id, "SN-001")

    assert prepared.status.value == "PREPARED"
    assert db_session.query(TransactionLog).count() == before_log_count
    assert _active_allocation_qty(db_session, request.request_id, pf) == 2


def test_prepare_complete_rejects_insufficient_shipping_pf_stock_even_with_linked_output(
    db_session, make_item, make_bom, make_location
):
    af = make_item(name="Insufficient prepare AF", process_type_code="AF", model_symbol="8", serial_no=3)
    pa = make_item(name="Insufficient prepare PA", process_type_code="PA", model_symbol="8", serial_no=3)
    pf = make_item(
        name="Insufficient prepare PF",
        process_type_code="PF",
        warehouse_qty=Decimal("50"),
        model_symbol="8",
        serial_no=4,
    )
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    request = _create_request(
        db_session,
        {
            "base_pf_item_id": pf.item_id,
            "invoice_number": "LINKED-PREPARE-002",
            "request_quantity": 2,
        },
    )
    make_location(pf.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    _add_linked_prepare_log(
        db_session,
        request=request,
        item=pf,
        quantity=2,
        actor=_shipping_actor(db_session),
    )

    with pytest.raises(shipping_svc.ShippingError, match="출하 준비 재고 부족"):
        _prepare_complete(db_session, request.request_id, "SN-001")

    assert request.status.value == "PREPARING"
    assert request.serial_numbers is None
    assert _active_allocation_qty(db_session, request.request_id, pf) == 0


def test_prepare_complete_reserves_final_pf_against_another_prepared_request(
    db_session, make_item, make_bom, make_location
):
    af = make_item(name="Reserved PF AF", process_type_code="AF", model_symbol="8", serial_no=7)
    pa = make_item(name="Reserved PF PA", process_type_code="PA", model_symbol="8", serial_no=7)
    pf = make_item(name="Reserved PF", process_type_code="PF", model_symbol="8", serial_no=8)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    make_location(pf.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))

    first = _create_request(
        db_session,
        {"base_pf_item_id": pf.item_id, "invoice_number": "RESERVED-PF-001"},
    )
    second = _create_request(
        db_session,
        {"base_pf_item_id": pf.item_id, "invoice_number": "RESERVED-PF-002"},
    )
    _prepare_complete(db_session, first.request_id, "SN-001")

    with pytest.raises(shipping_svc.ShippingError, match="출하 준비 재고 부족"):
        _prepare_complete(db_session, second.request_id, "SN-002")

    assert _active_allocation_qty(db_session, first.request_id, pf) == 1
    assert second.status.value == "PREPARING"


def test_prepare_cancel_keeps_linked_io_inventory_log_active(db_session, make_item, make_bom, make_location):
    af = make_item(name="Linked cancel AF", process_type_code="AF", model_symbol="8", serial_no=5)
    pa = make_item(name="Linked cancel PA", process_type_code="PA", model_symbol="8", serial_no=5)
    pf = make_item(name="Linked cancel PF", process_type_code="PF", model_symbol="8", serial_no=6)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    request = _create_request(
        db_session,
        {
            "base_pf_item_id": pf.item_id,
            "invoice_number": "LINKED-CANCEL-001",
        },
    )
    linked_log = _add_linked_prepare_log(
        db_session,
        request=request,
        item=pf,
        quantity=1,
        actor=_shipping_actor(db_session),
    )
    make_location(pf.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    _prepare_complete(db_session, request.request_id, "SN-001")

    _prepare_cancel(db_session, request.request_id, reason="retry")

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

    request = _create_request(
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


def test_match_bom_lists_all_exact_pf_candidates_without_auto_selection(db_session, make_item, make_bom):
    base_component = make_item(name="Base component", process_type_code="AF", model_symbol="4", serial_no=1)
    requested_component = make_item(name="Requested component", process_type_code="AF", model_symbol="4", serial_no=2)
    base_pa = make_item(name="Vector PA", process_type_code="PA", model_symbol="4", serial_no=3)
    base_pf = make_item(name="Vector PF", process_type_code="PF", model_symbol="4", serial_no=4)
    candidate_a_pa = make_item(name="Global PA", process_type_code="PA", model_symbol="4", serial_no=5)
    candidate_a_pf = make_item(name="Global PF", process_type_code="PF", model_symbol="4", serial_no=6)
    candidate_b_pa = make_item(name="Dealer PA", process_type_code="PA", model_symbol="4", serial_no=7)
    candidate_b_pf = make_item(name="Dealer PF", process_type_code="PF", model_symbol="4", serial_no=8)

    make_bom(base_pa.item_id, base_component.item_id, Decimal("1"))
    make_bom(base_pf.item_id, base_pa.item_id, Decimal("1"))
    for pa, pf in ((candidate_a_pa, candidate_a_pf), (candidate_b_pa, candidate_b_pf)):
        make_bom(pa.item_id, requested_component.item_id, Decimal("1"))
        make_bom(pf.item_id, pa.item_id, Decimal("1"))
    db_session.commit()

    match = shipping_svc.match_bom(
        db_session,
        bom_lines=[
            _bom_line(base_pa, stage="PF", origin="DEFAULT"),
            _bom_line(requested_component, stage="PA"),
        ],
        base_pf_item_id=base_pf.item_id,
    )

    assert match["base_pf_matches"] is False
    assert [candidate["pf_item_id"] for candidate in match["pf_candidates"]] == [
        candidate_a_pf.item_id,
        candidate_b_pf.item_id,
    ]
    assert match["pf_candidates"][0]["pa_item_id"] == candidate_a_pa.item_id
    assert match["pf_candidates"][1]["pa_item_id"] == candidate_b_pa.item_id


def test_request_finalization_uses_only_the_explicitly_selected_pf_candidate(db_session, make_item, make_bom):
    base_component = make_item(name="Base component", process_type_code="AF", model_symbol="4", serial_no=1)
    requested_component = make_item(name="Requested component", process_type_code="AF", model_symbol="4", serial_no=2)
    base_pa = make_item(name="Vector PA", process_type_code="PA", model_symbol="4", serial_no=3)
    base_pf = make_item(name="Vector PF", process_type_code="PF", model_symbol="4", serial_no=4)
    candidate_a_pa = make_item(name="Global PA", process_type_code="PA", model_symbol="4", serial_no=5)
    candidate_a_pf = make_item(name="Global PF", process_type_code="PF", model_symbol="4", serial_no=6)
    candidate_b_pa = make_item(name="Dealer PA", process_type_code="PA", model_symbol="4", serial_no=7)
    candidate_b_pf = make_item(name="Dealer PF", process_type_code="PF", model_symbol="4", serial_no=8)

    make_bom(base_pa.item_id, base_component.item_id, Decimal("1"))
    make_bom(base_pf.item_id, base_pa.item_id, Decimal("1"))
    for pa, pf in ((candidate_a_pa, candidate_a_pf), (candidate_b_pa, candidate_b_pf)):
        make_bom(pa.item_id, requested_component.item_id, Decimal("1"))
        make_bom(pf.item_id, pa.item_id, Decimal("1"))
    db_session.commit()

    bom_lines = [
        _bom_line(base_pa, stage="PF", origin="DEFAULT"),
        _bom_line(requested_component, stage="PA"),
    ]
    reused = _create_request(
        db_session,
        {
            "base_pf_item_id": base_pf.item_id,
            "finalization_mode": "REUSE_CANDIDATE",
            "reuse_pf_item_id": candidate_b_pf.item_id,
            "bom_lines": bom_lines,
        },
    )
    created = _create_request(
        db_session,
        {
            "base_pf_item_id": base_pf.item_id,
            "finalization_mode": "CREATE_NEW",
            "custom_pa_name": "Vector updated PA",
            "custom_pf_name": "Vector updated PF",
            "bom_lines": bom_lines,
        },
    )

    assert reused.finalization_mode.value == "REUSE_CANDIDATE"
    assert reused.final_pf_item_id == candidate_b_pf.item_id
    assert reused.final_pa_item_id == candidate_b_pa.item_id
    assert created.finalization_mode.value == "CREATE_NEW"
    assert created.final_pf_item_id not in {candidate_a_pf.item_id, candidate_b_pf.item_id}



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

    req = _create_request(
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

    preview = shipping_actions_svc.component_change_preview(
        db_session,
        req.request_id,
        source_pa.item_id,
        1,
        actor=_shipping_actor(db_session),
    )
    assert preview["source_item_id"] == source_pa.item_id
    assert preview["target_item_id"] == req.final_pa_item_id
    added = [line for line in preview["lines"] if line["item_id"] == cable.item_id][0]
    assert added["delta_per_unit"] == 1
    assert added["total_delta"] == 1
    assert added["available_quantity"] == 2
    db_session.add(
        SystemSetting(
            setting_key="inventory_operation_cutover_at",
            setting_value="2026-01-01T00:00:00",
        )
    )
    db_session.commit()

    changed = _execute_component_change(
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
    component_operation = (
        db_session.query(InventoryOperation)
        .filter(
            InventoryOperation.domain == "shipping",
            InventoryOperation.action == "component_change",
        )
        .one()
    )
    assert {log.operation_id for log in component_logs} == {
        component_operation.operation_id
    }

    shipping_actor = _shipping_actor(db_session)
    _submit_final_pf_production(
        db_session,
        request=req,
        actor=shipping_actor,
    )
    prepared = _prepare_complete(db_session, req.request_id, "SN-001")

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
    assert prepare_logs == []

    _pickup_complete(db_session, req.request_id)

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
    actor = _shipping_actor(db_session)
    assert {log.produced_by for log in pickup_logs} == {actor.name}
    assert {log.producer_employee_id for log in pickup_logs} == {actor.employee_id}
    pickup_operation = (
        db_session.query(InventoryOperation)
        .filter(
            InventoryOperation.domain == "shipping",
            InventoryOperation.action == "pickup",
        )
        .one()
    )
    assert {log.operation_id for log in pickup_logs} == {pickup_operation.operation_id}
    assert {log.operation_role for log in pickup_logs} == {
        InventoryOperationRoleEnum.PRIMARY
    }
    workflow_effects = (
        db_session.query(InventoryOperationEffect)
        .filter(InventoryOperationEffect.effect_kind == InventoryOperationEffectKindEnum.WORKFLOW)
        .all()
    )
    assert {(effect.before_state["status"], effect.after_state["status"]) for effect in workflow_effects} >= {
        ("PREPARING", "PREPARED"),
        ("PREPARED", "PICKED_UP"),
    }
    preview = cancellation_svc.preview_cancellation(
        db_session,
        pickup_operation.operation_id,
    )
    cancellation_svc.cancel_operation(
        db_session,
        operation_id=pickup_operation.operation_id,
        canceller=shipping_actor,
        reason="픽업 처리 취소",
        plan_hash=preview.plan_hash,
    )
    db_session.refresh(req)
    assert req.status == ShippingRequestStatusEnum.CANCELLED
    assert _location_qty(db_session, final_pf, DepartmentEnum.SHIPPING) == 1
    assert _location_qty(db_session, carton, DepartmentEnum.SHIPPING) == 5
    assert {
        allocation.status
        for allocation in db_session.query(ShippingAllocation)
        .filter(ShippingAllocation.request_id == req.request_id)
        .all()
    } == {"RELEASED"}


def test_component_change_preview_does_not_lazy_create_final_items(
    db_session, make_item, make_bom
):
    request, source_pa = _unfinalized_preparing_request(
        db_session,
        make_item,
        make_bom,
    )
    before = (
        db_session.query(Item).count(),
        db_session.query(BOM).count(),
        db_session.query(Inventory).count(),
    )
    with pytest.raises(shipping_svc.ShippingError, match="최종 출하 품목"):
        shipping_actions_svc.component_change_preview(
            db_session,
            request.request_id,
            source_pa.item_id,
            1,
            actor=_shipping_actor(db_session),
        )

    assert request.final_pa_item_id is None
    assert request.final_pf_item_id is None
    assert (
        db_session.query(Item).count(),
        db_session.query(BOM).count(),
        db_session.query(Inventory).count(),
    ) == before


def test_prepare_stock_shortages_does_not_lazy_create_final_items(
    db_session, make_item, make_bom
):
    request, _source_pa = _unfinalized_preparing_request(
        db_session,
        make_item,
        make_bom,
    )
    before = (
        db_session.query(Item).count(),
        db_session.query(BOM).count(),
        db_session.query(Inventory).count(),
    )
    assert shipping_svc._prepare_stock_shortages(db_session, request) == []
    assert request.final_pa_item_id is None
    assert request.final_pf_item_id is None
    assert (
        db_session.query(Item).count(),
        db_session.query(BOM).count(),
        db_session.query(Inventory).count(),
    ) == before


def test_shipping_bom_stock_exempt_child_is_skipped_in_prepare_and_component_change(
    db_session, make_item, make_bom, make_location
):
    common = make_item(name="shipping-exempt-common", process_type_code="AF")
    exempt = make_item(name="shipping-exempt-cable", process_type_code="PR")
    source_pa = make_item(name="shipping-exempt-source", process_type_code="PA")
    target_pa = make_item(name="shipping-exempt-target", process_type_code="PA")
    base_pf = make_item(name="shipping-exempt-pf", process_type_code="PF")
    exempt.bom_stock_exempt = True
    make_bom(source_pa.item_id, common.item_id, Decimal("1"))
    make_bom(target_pa.item_id, common.item_id, Decimal("1"))
    make_bom(target_pa.item_id, exempt.item_id, Decimal("1"))
    make_bom(base_pf.item_id, target_pa.item_id, Decimal("1"))
    make_location(source_pa.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    make_location(target_pa.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    make_location(common.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    db_session.commit()

    request = _create_request(
        db_session,
        {"base_pf_item_id": base_pf.item_id, "requested_by_name": "shipping-user"},
    )
    stocked_items = {
        request.final_pa_item_id: request.final_pa_item,
        **{
            line.child_item_id: line.child_item
            for line in request.bom_lines
            if line.child_item_id != exempt.item_id
        },
    }
    for item_id, item in stocked_items.items():
        department = shipping_svc.inventory_svc.department_for_item(item)
        location = db_session.query(InventoryLocation).filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == department,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        ).first()
        if location is None:
            make_location(item_id, department=department, quantity=Decimal("10"))
        else:
            location.quantity = Decimal("10")
    prepare_shortages = shipping_svc._prepare_stock_shortages(db_session, request)
    assert prepare_shortages == [], {row["item_name"] for row in prepare_shortages}

    preview = shipping_svc.component_change_preview_independent(
        db_session,
        source_pa.item_id,
        target_pa.item_id,
        1,
    )
    exempt_line = next(line for line in preview["lines"] if line["item_id"] == exempt.item_id)
    assert preview["executable"] is True
    assert exempt_line["bom_stock_exempt"] is True
    assert exempt_line["shortage_quantity"] == 0

    result = _execute_component_change_independent(
        db_session,
        source_pa.item_id,
        target_pa.item_id,
        1,
        memo="BOM 재고 미반영 구성품",
    )

    assert _location_qty(db_session, exempt, DepartmentEnum.SHIPPING) == 0
    assert {log.item_id for log in result["transactions"]} == {source_pa.item_id, target_pa.item_id}


def test_shipping_prepare_keeps_custom_flagged_bom_line_in_shortage_check(
    db_session, make_item, make_bom, make_location
):
    """사용자가 추가한 CUSTOM 구성품은 품목 면제 설정과 무관하게 재고를 확인한다."""
    default_component = make_item(name="출하 기본 구성품", process_type_code="AF")
    custom_component = make_item(name="출하 수동 구성품", process_type_code="PR")
    base_pa = make_item(name="출하 기본 PA", process_type_code="PA")
    base_pf = make_item(name="출하 기본 PF", process_type_code="PF")
    custom_component.bom_stock_exempt = True
    make_bom(base_pa.item_id, default_component.item_id, Decimal("1"))
    make_bom(base_pf.item_id, base_pa.item_id, Decimal("1"))
    db_session.flush()

    request = _create_request(
        db_session,
        {
            "base_pf_item_id": base_pf.item_id,
            "finalization_mode": "CREATE_NEW",
            "custom_pa_name": "수동 구성 출하 PA",
            "custom_pf_name": "수동 구성 출하 PF",
            "bom_lines": [
                _bom_line(base_pa, stage="PF", origin="DEFAULT"),
                _bom_line(default_component, stage="PA", origin="DEFAULT"),
                _bom_line(custom_component, stage="PA", origin="DEFAULT"),
            ],
        },
    )
    for item in (request.final_pa_item, base_pa, default_component):
        make_location(item.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    shortages = shipping_svc._prepare_stock_shortages(db_session, request)

    custom_line = next(line for line in request.bom_lines if line.child_item_id == custom_component.item_id)
    assert custom_line.origin == "CUSTOM"
    custom_shortage = next(row for row in shortages if row["item_id"] == custom_component.item_id)
    assert custom_shortage["shortage_quantity"] == 1


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
        _execute_component_change_independent(db_session, source_pa.item_id, target_pa.item_id, 2)

    with pytest.raises(shipping_svc.ShippingError):
        _execute_component_change_independent(db_session, source_pa.item_id, target_pa.item_id, 1)


def test_component_change_prelocks_all_mutated_items_in_sorted_order(
    db_session, make_item, make_bom, make_location, monkeypatch
):
    common = make_item(name="component-lock-common", process_type_code="AF")
    added = make_item(name="component-lock-added", process_type_code="PR")
    source_pa = make_item(name="component-lock-source", process_type_code="PA")
    target_pa = make_item(name="component-lock-target", process_type_code="PA")
    make_bom(source_pa.item_id, common.item_id, Decimal("1"))
    make_bom(target_pa.item_id, common.item_id, Decimal("1"))
    make_bom(target_pa.item_id, added.item_id, Decimal("1"))
    make_location(source_pa.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    make_location(added.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    events = []
    real_lock = shipping_svc.inventory_svc.lock_inventories

    def lock_inventories(db, item_ids):
        events.append(item_ids)
        return real_lock(db, item_ids)

    monkeypatch.setattr(
        shipping_svc.inventory_svc,
        "lock_inventories",
        lock_inventories,
    )

    _execute_component_change_independent(
        db_session,
        source_pa.item_id,
        target_pa.item_id,
        1,
        memo="lock order",
    )

    assert events[0] == sorted({source_pa.item_id, target_pa.item_id, added.item_id})

def test_prepare_cancel_reverses_prepare_logs_and_releases_allocations(
    db_session, make_item, make_bom, make_location, monkeypatch
):
    af = make_item(name="AF body", process_type_code="AF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=1)
    carton = make_item(name="Carton", process_type_code="PR", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=2)
    base_pa = make_item(name="Base PA", process_type_code="PA", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=3)
    base_pf = make_item(name="Base PF", process_type_code="PF", warehouse_qty=Decimal("0"), model_symbol="4", serial_no=4)
    make_bom(base_pa.item_id, af.item_id, Decimal("1"))
    make_bom(base_pf.item_id, base_pa.item_id, Decimal("1"))
    make_location(base_pa.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    make_location(carton.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    db_session.commit()

    req = _create_request(
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
    _simulate_legacy_prepare(db_session, req)
    db_session.commit()

    with pytest.raises(shipping_svc.ShippingError):
        _update_checklist(db_session, req.request_id, {})
    with pytest.raises(shipping_svc.ShippingError):
        _clear_checklist(db_session, req.request_id)

    assert _location_qty(db_session, base_pa, DepartmentEnum.SHIPPING) == 0
    assert _location_qty(db_session, base_pf, DepartmentEnum.SHIPPING) == 1
    assert _active_allocation_qty(db_session, req.request_id, carton) == 1

    legacy_item_ids = sorted(
        {
            log.item_id
            for log in db_session.query(TransactionLog)
            .filter_by(shipping_request_id=req.request_id, shipping_phase="PREPARE")
            .all()
            if log.operation_batch_id is None
        }
    )
    lock_calls = []
    real_lock = shipping_svc.inventory_svc.lock_inventories

    def lock_inventories(db, item_ids):
        lock_calls.append(item_ids)
        return real_lock(db, item_ids)

    monkeypatch.setattr(
        shipping_svc.inventory_svc,
        "lock_inventories",
        lock_inventories,
    )

    actor = _shipping_actor(db_session)
    _prepare_cancel(db_session, req.request_id, reason="change", actor=actor)

    assert lock_calls == [legacy_item_ids]

    actor = _shipping_actor(db_session)
    with pytest.raises(shipping_svc.ShippingError, match="인보이스"):
        shipping_actions_svc.update_request(db_session, req.request_id, {"invoice_number": None}, actor)
    with pytest.raises(shipping_svc.ShippingError, match="인보이스"):
        shipping_actions_svc.update_invoice(db_session, req.request_id, None, actor)
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
    assert {log.cancelled_by for log in cancelled} == {actor.employee_id}


def test_request_mutations_require_actor_before_writing(db_session, make_item):
    af = make_item(name="Actor guard AF", process_type_code="AF", model_symbol="4", serial_no=1)
    pa = make_item(name="Actor guard PA", process_type_code="PA", model_symbol="4", serial_no=2)
    pf = make_item(name="Actor guard PF", process_type_code="PF", model_symbol="4", serial_no=3)
    db_session.add(BOM(parent_item_id=pa.item_id, child_item_id=af.item_id, quantity=1, unit="EA"))
    db_session.add(BOM(parent_item_id=pf.item_id, child_item_id=pa.item_id, quantity=1, unit="EA"))
    db_session.commit()
    request = _create_request(db_session, {"base_pf_item_id": pf.item_id})
    event_count = len(request.events)

    with pytest.raises(shipping_svc.ShippingError, match="작업자"):
        shipping_actions_svc.update_request(db_session, request.request_id, {"notes": "no actor"}, None)
    with pytest.raises(shipping_svc.ShippingError, match="작업자"):
        shipping_actions_svc.update_invoice(db_session, request.request_id, "ACTOR-INV", None)
    with pytest.raises(shipping_svc.ShippingError, match="작업자"):
        shipping_actions_svc.delete_request(db_session, request.request_id, None)
    with pytest.raises(TypeError, match="Employee"):
        shipping_actions_svc.update_invoice(
            db_session,
            request.request_id,
            "FAKE-ACTOR-INV",
            object(),
        )
    inactive_actor = _shipping_actor(db_session)
    inactive_actor.is_active = False
    with pytest.raises(shipping_svc.ShippingError, match="비활성"):
        shipping_actions_svc.update_invoice(db_session, request.request_id, "INACTIVE-INV", inactive_actor)

    assert request.notes is None
    assert request.invoice_number is None
    assert request.status.value == "PREPARING"
    assert len(request.events) == event_count


def test_cancelled_without_history_can_clear_but_legacy_picked_up_cannot(db_session, make_item, make_bom):
    af = make_item(name="Cancel clear AF", process_type_code="AF", model_symbol="4", serial_no=1)
    pa = make_item(name="Cancel clear PA", process_type_code="PA", model_symbol="4", serial_no=2)
    pf = make_item(name="Cancel clear PF", process_type_code="PF", model_symbol="4", serial_no=3)
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    actor = _shipping_actor(db_session)
    request = _create_request(
        db_session,
        {"base_pf_item_id": pf.item_id, "invoice_number": "CANCEL-CLEAR"},
    )

    shipping_actions_svc.delete_request(db_session, request.request_id, actor)
    updated = shipping_actions_svc.update_invoice(db_session, request.request_id, None, actor)

    assert updated.status.value == "CANCELLED"
    assert updated.invoice_number is None

    shipping_actions_svc.update_invoice(db_session, request.request_id, "PICKED-LEGACY", actor)
    request.status = shipping_svc.ShippingRequestStatusEnum.PICKED_UP
    request.prepared_at = None
    with pytest.raises(shipping_svc.ShippingError, match="인보이스"):
        shipping_actions_svc.update_invoice(db_session, request.request_id, None, actor)
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

    req = _create_request(
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

    _submit_final_pf_production(
        db_session,
        request=req,
        actor=_shipping_actor(db_session),
    )
    _prepare_complete(db_session, req.request_id, "SN-001")

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

    req = _create_request(
        db_session,
        {
            "base_pf_item_id": pf.item_id,
            "requested_by_name": "shipping-user",
            "invoice_number": "SERVICE-INV-004",
            "request_quantity": 3,
            "companion_lines": [{"item_id": carton.item_id, "quantity": 2, "unit": "EA"}],
        },
    )
    _submit_final_pf_production(
        db_session,
        request=req,
        actor=_shipping_actor(db_session),
    )

    prepared = _prepare_complete(db_session, req.request_id, "SN-001")

    assert prepared.request_quantity == 3
    assert len(prepared.companion_lines) == 1
    assert _location_qty(db_session, af, DepartmentEnum.ASSEMBLY) == 0
    assert _location_qty(db_session, pouch, DepartmentEnum.SHIPPING) == 0
    assert _location_qty(db_session, pa, DepartmentEnum.SHIPPING) == 0
    assert _location_qty(db_session, pf, DepartmentEnum.SHIPPING) == 3
    assert _location_qty(db_session, carton, DepartmentEnum.SHIPPING) == 2
    assert _active_allocation_qty(db_session, req.request_id, pf) == 3
    assert _active_allocation_qty(db_session, req.request_id, carton) == 2
    prepare_logs = (
        db_session.query(TransactionLog)
        .filter(TransactionLog.shipping_request_id == req.request_id)
        .filter(TransactionLog.shipping_phase == "PREPARE")
        .all()
    )
    assert prepare_logs == []

    _prepare_cancel(db_session, req.request_id, reason="change")
    assert req.status.value == "PREPARING"
    assert len(req.companion_lines) == 1
    assert _location_qty(db_session, pa, DepartmentEnum.SHIPPING) == 0
    assert _location_qty(db_session, pf, DepartmentEnum.SHIPPING) == 3
    assert _active_allocation_qty(db_session, req.request_id, pf) == 0
    assert _active_allocation_qty(db_session, req.request_id, carton) == 0

    _prepare_complete(db_session, req.request_id, "SN-001")
    _pickup_complete(db_session, req.request_id)

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
        _create_request(
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

    req = _create_request(
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

    _submit_final_pf_production(
        db_session,
        request=req,
        actor=_shipping_actor(db_session),
    )
    prepared = _prepare_complete(db_session, req.request_id, "SN-001")

    assert prepared.final_pa_item.item_name == "Cable excluded PA"
    assert _warehouse_qty(db_session, af) == 1
    assert _warehouse_qty(db_session, cable) == 3
    assert _location_qty(db_session, af, DepartmentEnum.ASSEMBLY) == 0
    assert _location_qty(db_session, cable, DepartmentEnum.SHIPPING) == 0


def test_changed_bom_creates_a_new_pa_and_pf_when_no_existing_pf_candidate_is_selected(
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
    assert match["base_pf_matches"] is False
    assert match["pf_candidates"] == []
    assert match["requires_pa_name"] is False
    assert match["requires_pf_name"] is True

    req = _create_request(
        db_session,
        {
            "base_pf_item_id": pf.item_id,
            "requested_by_name": "shipping-user",
            "invoice_number": "SERVICE-INV-006",
            "finalization_mode": "CREATE_NEW",
            "custom_pa_name": "Bracket PA",
            "custom_pf_name": "Bracket PF",
            "bom_lines": bom_lines,
        },
    )
    assert req.final_pa_item_id != pa.item_id
    assert req.final_pa_item.item_name == "Bracket PA"
    assert req.final_pf_item.item_name == "Bracket PF"
    make_location(req.final_pa_item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))

    _submit_final_pf_production(
        db_session,
        request=req,
        actor=_shipping_actor(db_session),
    )
    prepared = _prepare_complete(db_session, req.request_id, "SN-001")

    assert prepared.final_pa_item_id == req.final_pa_item_id
    assert prepared.final_pf_item.item_name == "Bracket PF"
    assert db_session.query(BOM).filter(BOM.parent_item_id == prepared.final_pf_item_id).count() == 2
