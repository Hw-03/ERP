from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app.models import (
    BOM,
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    Item,
    LocationStatusEnum,
    ShippingAllocation,
    ShippingRequest,
    ShippingRequestBomLine,
    ShippingRequestChecklistLine,
    ShippingRequestCompanionLine,
    ShippingRequestEvent,
    ShippingRequestStatusEnum,
    TransactionLog,
)
from app.services import shipping as shipping_svc
from app.services import shipping_actions as shipping_actions_svc
from app.services import io as io_svc
from app.services import io_actions as io_actions_svc
from app.schemas.io import IoPreviewTarget, IoSubmitRequest


def _location_qty(db_session, item_id, department: DepartmentEnum) -> Decimal:
    row = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == department,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .first()
    )
    return row.quantity if row else Decimal("0")


def _active_shipping_actor(db_session) -> Employee:
    actor = Employee(
        employee_code="SHIPPING-ACTIONS-ACTOR",
        name="Shipping actions actor",
        role="worker",
        department=DepartmentEnum.SALES.value,
        level=EmployeeLevelEnum.STAFF,
        display_order=0,
        is_active=True,
    )
    db_session.add(actor)
    db_session.flush()
    return actor


def _submit_final_pf_production(
    db_session,
    *,
    request: ShippingRequest,
    actor: Employee,
) -> None:
    final_pf = request.final_pf_item
    assert final_pf is not None
    preview = io_svc.preview(
        db_session,
        work_type="process",
        sub_type="produce",
        to_department=DepartmentEnum.SHIPPING.value,
        targets=[
            IoPreviewTarget(
                source_kind="direct_item",
                item_id=final_pf.item_id,
                quantity=int(request.request_quantity or 1),
            )
        ],
    )
    io_actions_svc.submit(
        db_session,
        IoSubmitRequest(
            requester_employee_id=actor.employee_id,
            work_type="process",
            sub_type="produce",
            to_department=DepartmentEnum.SHIPPING.value,
            bundles=preview["bundles"],
        ),
    )


def _spec_conversion_case(db_session, make_item, make_bom, make_location):
    requester = Employee(
        employee_code="IO-CONVERT",
        name="품목 전환자",
        role="worker",
        department=DepartmentEnum.ASSEMBLY.value,
        level=EmployeeLevelEnum.STAFF,
        display_order=0,
        is_active=True,
    )
    source = make_item(
        name="전환 소스 AF",
        process_type_code="AF",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=10,
    )
    target = make_item(
        name="전환 대상 AF",
        process_type_code="AF",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=11,
    )
    child = make_item(
        name="전환 공통 부품",
        process_type_code="TR",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=12,
    )
    make_bom(source.item_id, child.item_id, Decimal("1"))
    make_bom(target.item_id, child.item_id, Decimal("1"))
    make_location(source.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("1"))
    db_session.add(requester)
    db_session.commit()
    return requester, source, target


def _count_session_boundaries(db_session, monkeypatch):
    calls = {"commit": 0, "rollback": 0}
    original_commit = db_session.commit
    original_rollback = db_session.rollback

    def counted_commit():
        calls["commit"] += 1
        return original_commit()

    def counted_rollback():
        calls["rollback"] += 1
        return original_rollback()

    monkeypatch.setattr(db_session, "commit", counted_commit)
    monkeypatch.setattr(db_session, "rollback", counted_rollback)
    return calls


def _shipping_row_counts(db: Session) -> dict[str, int]:
    models = (
        Item,
        Inventory,
        BOM,
        ShippingRequest,
        ShippingRequestBomLine,
        ShippingRequestCompanionLine,
        ShippingRequestChecklistLine,
        ShippingAllocation,
        ShippingRequestEvent,
    )
    return {model.__tablename__: db.query(model).count() for model in models}


def _request_graph_state(
    db: Session,
    request_id,
    final_item_ids: tuple,
) -> dict:
    request = db.query(ShippingRequest).filter_by(request_id=request_id).one()
    return {
        "request": (
            request.status,
            request.request_quantity,
            request.requested_by_name,
            request.custom_pa_name,
            request.custom_pf_name,
            request.notes,
            request.final_pa_item_id,
            request.final_pf_item_id,
            request.updated_at,
        ),
        "request_bom": tuple(
            sorted(
                (
                    line.parent_stage,
                    str(line.child_item_id),
                    int(line.quantity),
                    line.unit,
                    bool(line.included),
                    line.origin,
                    int(line.sort_order),
                )
                for line in db.query(ShippingRequestBomLine)
                .filter_by(request_id=request_id)
                .all()
            )
        ),
        "checklist": tuple(
            sorted(
                (
                    str(line.item_id),
                    line.label_snapshot,
                    int(line.quantity),
                    bool(line.checked),
                    int(line.sort_order),
                )
                for line in db.query(ShippingRequestChecklistLine)
                .filter_by(request_id=request_id)
                .all()
            )
        ),
        "final_item_bom": tuple(
            sorted(
                (str(row.parent_item_id), str(row.child_item_id), int(row.quantity), row.unit)
                for row in db.query(BOM)
                .filter(BOM.parent_item_id.in_(final_item_ids))
                .all()
            )
        ),
        "final_items": tuple(
            sorted(
                (str(row.item_id), row.item_name, row.bom_completed_at)
                for row in db.query(Item).filter(Item.item_id.in_(final_item_ids)).all()
            )
        ),
        "item_ids": tuple(sorted(str(row.item_id) for row in db.query(Item).all())),
        "inventory_item_ids": tuple(
            sorted(str(row.item_id) for row in db.query(Inventory).all())
        ),
        "events": tuple(
            sorted(
                (str(row.event_id), row.event_type, row.message)
                for row in db.query(ShippingRequestEvent)
                .filter_by(request_id=request_id)
                .all()
            )
        ),
    }


def _prepared_request_state(
    db: Session,
    request_id,
    item_ids: tuple,
) -> dict:
    request = db.query(ShippingRequest).filter_by(request_id=request_id).one()
    return {
        "request": (
            request.status,
            request.prepared_at,
            request.picked_up_at,
            request.updated_at,
        ),
        "inventory": tuple(
            sorted(
                (
                    str(row.item_id),
                    row.quantity,
                    row.warehouse_qty,
                    row.pending_quantity,
                    row.updated_at,
                )
                for row in db.query(Inventory).filter(Inventory.item_id.in_(item_ids)).all()
            )
        ),
        "locations": tuple(
            sorted(
                (
                    str(row.item_id),
                    row.department,
                    row.status,
                    row.quantity,
                    row.updated_at,
                )
                for row in db.query(InventoryLocation)
                .filter(InventoryLocation.item_id.in_(item_ids))
                .all()
            )
        ),
        "logs": tuple(
            sorted(
                (
                    str(row.log_id),
                    str(row.item_id),
                    row.shipping_phase,
                    row.transaction_type,
                    row.quantity_change,
                    bool(row.cancelled),
                    row.cancel_reason,
                    row.cancelled_at,
                )
                for row in db.query(TransactionLog)
                .filter_by(shipping_request_id=request_id)
                .all()
            )
        ),
        "allocations": tuple(
            sorted(
                (
                    str(row.allocation_id),
                    str(row.item_id),
                    row.status,
                    row.quantity,
                    row.released_at,
                    row.consumed_at,
                    row.released_reason,
                )
                for row in db.query(ShippingAllocation)
                .filter_by(request_id=request_id)
                .all()
            )
        ),
        "events": tuple(
            sorted(
                (str(row.event_id), row.event_type, row.message)
                for row in db.query(ShippingRequestEvent)
                .filter_by(request_id=request_id)
                .all()
            )
        ),
    }


def _make_prepared_request(
    db_session,
    make_item,
    make_bom,
    make_location,
) -> tuple:
    component = make_item(
        name="Late failure AF",
        process_type_code="AF",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=20,
    )
    companion = make_item(
        name="Late failure companion",
        process_type_code="PR",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=21,
    )
    final_pa = make_item(
        name="Late failure PA",
        process_type_code="PA",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=22,
    )
    final_pf = make_item(
        name="Late failure PF",
        process_type_code="PF",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=23,
    )
    make_bom(final_pa.item_id, component.item_id, Decimal("1"))
    make_bom(final_pf.item_id, final_pa.item_id, Decimal("1"))
    make_location(
        final_pa.item_id,
        department=DepartmentEnum.SHIPPING,
        quantity=Decimal("1"),
    )
    make_location(
        companion.item_id,
        department=DepartmentEnum.SHIPPING,
        quantity=Decimal("2"),
    )
    db_session.commit()

    request = shipping_actions_svc.create_request(
        db_session,
        {
            "base_pf_item_id": final_pf.item_id,
            "requested_by_name": "shipping-user",
            "invoice_number": "ACTIONS-INV-001",
            "companion_lines": [
                {"item_id": companion.item_id, "quantity": 1, "unit": "EA"}
            ],
        },
    )
    _submit_final_pf_production(
        db_session,
        request=request,
        actor=_active_shipping_actor(db_session),
    )
    shipping_actions_svc.prepare_complete(db_session, request.request_id, "SN-001")
    return (
        request.request_id,
        final_pa.item_id,
        final_pf.item_id,
        companion.item_id,
    )


def test_create_request_rolls_back_full_graph_when_event_fails(
    db_session,
    make_item,
    make_bom,
    monkeypatch,
) -> None:
    component = make_item(
        name="Create rollback AF",
        process_type_code="AF",
        model_symbol="4",
        serial_no=30,
    )
    extra = make_item(
        name="Create rollback part",
        process_type_code="PR",
        model_symbol="4",
        serial_no=31,
    )
    base_pa = make_item(
        name="Create rollback base PA",
        process_type_code="PA",
        model_symbol="4",
        serial_no=32,
    )
    base_pf = make_item(
        name="Create rollback base PF",
        process_type_code="PF",
        model_symbol="4",
        serial_no=33,
    )
    make_bom(base_pa.item_id, component.item_id, Decimal("1"))
    make_bom(base_pf.item_id, base_pa.item_id, Decimal("1"))
    db_session.commit()

    with Session(bind=db_session.get_bind()) as verify_db:
        before_counts = _shipping_row_counts(verify_db)

    boundaries = _count_session_boundaries(db_session, monkeypatch)

    def fail_event(*_args, **_kwargs):
        raise RuntimeError("create event failure")

    monkeypatch.setattr(shipping_svc, "_record_event", fail_event)

    with pytest.raises(RuntimeError, match="create event failure"):
        shipping_actions_svc.create_request(
            db_session,
            {
                "base_pf_item_id": base_pf.item_id,
                "requested_by_name": "shipping-user",
                "custom_pa_name": "Create rollback custom PA",
                "custom_pf_name": "Create rollback custom PF",
                "bom_lines": [
                    {
                        "parent_stage": "PF",
                        "child_item_id": base_pa.item_id,
                        "quantity": 1,
                        "unit": "EA",
                    },
                    {
                        "parent_stage": "PA",
                        "child_item_id": component.item_id,
                        "quantity": 1,
                        "unit": "EA",
                    },
                    {
                        "parent_stage": "PA",
                        "child_item_id": extra.item_id,
                        "quantity": 1,
                        "unit": "EA",
                    },
                ],
                },
            )

    db_session.expire_all()
    with Session(bind=db_session.get_bind()) as verify_db:
        assert _shipping_row_counts(verify_db) == before_counts
        assert (
            verify_db.query(Item)
            .filter(
                Item.item_name.in_(
                    ["Create rollback custom PA", "Create rollback custom PF"]
                )
            )
            .count()
            == 0
        )
        assert verify_db.query(ShippingRequest).count() == 0
    assert boundaries == {"commit": 0, "rollback": 1}


def test_update_request_restores_graph_and_owned_item_boms_when_event_fails(
    db_session,
    make_item,
    make_bom,
    monkeypatch,
) -> None:
    component = make_item(
        name="Update rollback AF",
        process_type_code="AF",
        model_symbol="4",
        serial_no=40,
    )
    old_part = make_item(
        name="Update rollback old part",
        process_type_code="PR",
        model_symbol="4",
        serial_no=41,
    )
    new_part = make_item(
        name="Update rollback new part",
        process_type_code="PR",
        model_symbol="4",
        serial_no=42,
    )
    base_pa = make_item(
        name="Update rollback base PA",
        process_type_code="PA",
        model_symbol="4",
        serial_no=43,
    )
    base_pf = make_item(
        name="Update rollback base PF",
        process_type_code="PF",
        model_symbol="4",
        serial_no=44,
    )
    make_bom(base_pa.item_id, component.item_id, Decimal("1"))
    make_bom(base_pf.item_id, base_pa.item_id, Decimal("1"))
    db_session.commit()

    request = shipping_actions_svc.create_request(
        db_session,
        {
            "base_pf_item_id": base_pf.item_id,
            "requested_by_name": "shipping-user",
            "custom_pa_name": "Update rollback custom PA",
            "custom_pf_name": "Update rollback custom PF",
            "notes": "before",
            "bom_lines": [
                {
                    "parent_stage": "PF",
                    "child_item_id": base_pa.item_id,
                    "quantity": 1,
                    "unit": "EA",
                },
                {
                    "parent_stage": "PA",
                    "child_item_id": component.item_id,
                    "quantity": 1,
                    "unit": "EA",
                },
                {
                    "parent_stage": "PA",
                    "child_item_id": old_part.item_id,
                    "quantity": 1,
                    "unit": "EA",
                },
            ],
        },
    )
    request_id = request.request_id
    final_item_ids = (request.final_pa_item_id, request.final_pf_item_id)
    with Session(bind=db_session.get_bind()) as verify_db:
        before = _request_graph_state(verify_db, request_id, final_item_ids)

    boundaries = _count_session_boundaries(db_session, monkeypatch)

    actor = _active_shipping_actor(db_session)

    def fail_event(*_args, **_kwargs):
        raise RuntimeError("update event failure")

    monkeypatch.setattr(shipping_svc, "_record_event", fail_event)

    with pytest.raises(RuntimeError, match="update event failure"):
        shipping_actions_svc.update_request(
            db_session,
            request_id,
            {
                "notes": "after",
                "bom_lines": [
                    {
                        "parent_stage": "PF",
                        "child_item_id": base_pa.item_id,
                        "quantity": 1,
                        "unit": "EA",
                    },
                    {
                        "parent_stage": "PA",
                        "child_item_id": component.item_id,
                        "quantity": 1,
                        "unit": "EA",
                    },
                    {
                        "parent_stage": "PA",
                        "child_item_id": new_part.item_id,
                        "quantity": 2,
                        "unit": "EA",
                    },
                ],
            },
            actor,
        )

    db_session.expire_all()
    with Session(bind=db_session.get_bind()) as verify_db:
        assert _request_graph_state(verify_db, request_id, final_item_ids) == before
    assert boundaries == {"commit": 0, "rollback": 1}


def test_prepare_cancel_restores_inventory_logs_allocation_and_status_when_event_fails(
    db_session,
    make_item,
    make_bom,
    make_location,
    monkeypatch,
) -> None:
    request_id, final_pa_id, final_pf_id, companion_id = _make_prepared_request(
        db_session,
        make_item,
        make_bom,
        make_location,
    )
    item_ids = (final_pa_id, final_pf_id, companion_id)
    with Session(bind=db_session.get_bind()) as verify_db:
        before = _prepared_request_state(verify_db, request_id, item_ids)
    assert before["request"][0] == ShippingRequestStatusEnum.PREPARED
    assert all(not row[5] for row in before["logs"])
    assert {row[2] for row in before["allocations"]} == {"RESERVED"}

    boundaries = _count_session_boundaries(db_session, monkeypatch)

    def fail_event(*_args, **_kwargs):
        raise RuntimeError("prepare cancel event failure")

    monkeypatch.setattr(shipping_svc, "_record_event", fail_event)

    with pytest.raises(RuntimeError, match="prepare cancel event failure"):
        shipping_actions_svc.prepare_cancel(db_session, request_id, "late failure")

    db_session.expire_all()
    with Session(bind=db_session.get_bind()) as verify_db:
        assert _prepared_request_state(verify_db, request_id, item_ids) == before
    assert boundaries == {"commit": 0, "rollback": 1}


def test_pickup_complete_restores_inventory_logs_allocation_and_status_when_event_fails(
    db_session,
    make_item,
    make_bom,
    make_location,
    monkeypatch,
) -> None:
    request_id, final_pa_id, final_pf_id, companion_id = _make_prepared_request(
        db_session,
        make_item,
        make_bom,
        make_location,
    )
    item_ids = (final_pa_id, final_pf_id, companion_id)
    with Session(bind=db_session.get_bind()) as verify_db:
        before = _prepared_request_state(verify_db, request_id, item_ids)
    assert before["request"][0] == ShippingRequestStatusEnum.PREPARED
    assert not before["logs"]
    assert {row[2] for row in before["allocations"]} == {"RESERVED"}

    boundaries = _count_session_boundaries(db_session, monkeypatch)

    def fail_event(*_args, **_kwargs):
        raise RuntimeError("pickup event failure")

    monkeypatch.setattr(shipping_svc, "_record_event", fail_event)

    with pytest.raises(RuntimeError, match="pickup event failure"):
        shipping_actions_svc.pickup_complete(db_session, request_id)

    db_session.expire_all()
    with Session(bind=db_session.get_bind()) as verify_db:
        assert _prepared_request_state(verify_db, request_id, item_ids) == before
    assert boundaries == {"commit": 0, "rollback": 1}


def test_pickup_cancel_restores_inventory_allocations_and_prepared_state(
    db_session,
    make_item,
    make_bom,
    make_location,
    monkeypatch,
) -> None:
    request_id, _final_pa_id, final_pf_id, companion_id = _make_prepared_request(
        db_session,
        make_item,
        make_bom,
        make_location,
    )
    final_pf = db_session.get(Item, final_pf_id)
    companion = db_session.get(Item, companion_id)
    assert final_pf is not None
    assert companion is not None
    prepared_final_pf_qty = _location_qty(db_session, final_pf_id, DepartmentEnum.SHIPPING)
    prepared_companion_qty = _location_qty(db_session, companion_id, DepartmentEnum.SHIPPING)

    shipping_actions_svc.pickup_complete(db_session, request_id)
    pickup_item_ids = sorted(
        {
            log.item_id
            for log in db_session.query(TransactionLog)
            .filter_by(shipping_request_id=request_id, shipping_phase="PICKUP")
            .all()
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
    cancelled = shipping_actions_svc.pickup_cancel(db_session, request_id)

    assert lock_calls == [pickup_item_ids]
    assert cancelled.status == ShippingRequestStatusEnum.PREPARED
    assert cancelled.picked_up_at is None
    assert cancelled.serial_numbers == "SN-001"
    assert _location_qty(db_session, final_pf_id, DepartmentEnum.SHIPPING) == prepared_final_pf_qty
    assert _location_qty(db_session, companion_id, DepartmentEnum.SHIPPING) == prepared_companion_qty
    allocations = db_session.query(ShippingAllocation).filter_by(request_id=request_id).all()
    assert allocations
    assert {row.status for row in allocations} == {"RESERVED"}
    assert all(row.consumed_at is None for row in allocations)
    pickup_logs = (
        db_session.query(TransactionLog)
        .filter_by(shipping_request_id=request_id, shipping_phase="PICKUP")
        .all()
    )
    assert pickup_logs
    assert all(row.cancelled for row in pickup_logs)
    assert {row.cancel_reason for row in pickup_logs} == {"픽업 완료 취소"}
    assert any(event.event_type == "PICKUP_CANCELLED" for event in cancelled.events)


def test_pickup_cancel_rolls_back_when_event_recording_fails(
    db_session,
    make_item,
    make_bom,
    make_location,
    monkeypatch,
) -> None:
    request_id, final_pa_id, final_pf_id, companion_id = _make_prepared_request(
        db_session,
        make_item,
        make_bom,
        make_location,
    )
    item_ids = (final_pa_id, final_pf_id, companion_id)
    shipping_actions_svc.pickup_complete(db_session, request_id)
    with Session(bind=db_session.get_bind()) as verify_db:
        before = _prepared_request_state(verify_db, request_id, item_ids)
    assert before["request"][0] == ShippingRequestStatusEnum.PICKED_UP
    assert {row[2] for row in before["allocations"]} == {"CONSUMED"}

    boundaries = _count_session_boundaries(db_session, monkeypatch)

    def fail_event(*_args, **_kwargs):
        raise RuntimeError("pickup cancel event failure")

    monkeypatch.setattr(shipping_svc, "_record_event", fail_event)

    with pytest.raises(RuntimeError, match="pickup cancel event failure"):
        shipping_actions_svc.pickup_cancel(db_session, request_id)

    db_session.expire_all()
    with Session(bind=db_session.get_bind()) as verify_db:
        assert _prepared_request_state(verify_db, request_id, item_ids) == before
    assert boundaries == {"commit": 0, "rollback": 1}


def test_independent_component_change_wrapper_rolls_back_inventory_and_logs_on_late_failure(
    db_session, make_item, make_bom, make_location, monkeypatch
) -> None:
    _requester, source, target = _spec_conversion_case(
        db_session, make_item, make_bom, make_location
    )
    boundaries = _count_session_boundaries(db_session, monkeypatch)

    def fail_receive(*_args, **_kwargs):
        raise RuntimeError("component receive failure")

    monkeypatch.setattr(shipping_svc, "_receive_component_location", fail_receive)

    with pytest.raises(RuntimeError, match="component receive failure"):
        shipping_actions_svc.execute_component_change_independent(
            db_session,
            source.item_id,
            target.item_id,
            1,
            requested_mode="SPEC",
        )

    db_session.expire_all()
    assert _location_qty(db_session, source.item_id, DepartmentEnum.ASSEMBLY) == Decimal("1")
    assert db_session.query(TransactionLog).count() == 0
    assert boundaries == {"commit": 0, "rollback": 1}


def test_requested_component_change_rolls_back_inventory_logs_request_and_events_when_event_fails(
    db_session, make_item, make_bom, make_location, monkeypatch
) -> None:
    common = make_item(
        name="Requested change AF",
        process_type_code="AF",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=70,
    )
    extra = make_item(
        name="Requested change extra",
        process_type_code="PR",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=71,
    )
    source = make_item(
        name="Requested change source PA",
        process_type_code="PA",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=72,
    )
    base_pf = make_item(
        name="Requested change base PF",
        process_type_code="PF",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=73,
    )
    make_bom(source.item_id, common.item_id, Decimal("1"))
    make_bom(base_pf.item_id, source.item_id, Decimal("1"))
    make_location(
        source.item_id,
        department=DepartmentEnum.SHIPPING,
        quantity=Decimal("1"),
    )
    make_location(
        extra.item_id,
        department=DepartmentEnum.SHIPPING,
        quantity=Decimal("1"),
    )
    db_session.commit()

    request = shipping_actions_svc.create_request(
        db_session,
        {
            "base_pf_item_id": base_pf.item_id,
            "requested_by_name": "shipping-user",
            "custom_pa_name": "Requested change target PA",
            "custom_pf_name": "Requested change target PF",
            "bom_lines": [
                {
                    "parent_stage": "PA",
                    "child_item_id": common.item_id,
                    "quantity": 1,
                    "unit": "EA",
                },
                {
                    "parent_stage": "PA",
                    "child_item_id": extra.item_id,
                    "quantity": 1,
                    "unit": "EA",
                },
            ],
        },
    )
    request_id = request.request_id
    target_id = request.final_pa_item_id
    source_id = source.item_id
    extra_id = extra.item_id
    item_ids = (source_id, target_id, extra_id)
    with Session(bind=db_session.get_bind()) as verify_db:
        before = _prepared_request_state(verify_db, request_id, item_ids)
    assert before["request"][0] == ShippingRequestStatusEnum.PREPARING
    assert before["logs"] == ()

    boundaries = _count_session_boundaries(db_session, monkeypatch)
    late_state: dict[str, object] = {}
    original_record_event = shipping_svc._record_event

    def fail_event(active_db, *args, **kwargs):
        original_record_event(active_db, *args, **kwargs)
        active_db.flush()
        late_state["source_qty"] = _location_qty(
            active_db, source_id, DepartmentEnum.SHIPPING
        )
        late_state["target_qty"] = _location_qty(
            active_db, target_id, DepartmentEnum.SHIPPING
        )
        late_state["component_logs"] = (
            active_db.query(TransactionLog)
            .filter(
                TransactionLog.shipping_request_id == request_id,
                TransactionLog.shipping_phase == "COMPONENT_CHANGE",
            )
            .count()
        )
        late_state["events"] = (
            active_db.query(ShippingRequestEvent)
            .filter(ShippingRequestEvent.request_id == request_id)
            .count()
        )
        raise RuntimeError("requested component event failure")

    monkeypatch.setattr(shipping_svc, "_record_event", fail_event)

    with pytest.raises(RuntimeError, match="requested component event failure"):
        shipping_actions_svc.execute_component_change(
            db_session,
            request_id,
            source_id,
            1,
            memo="requested component rollback",
        )

    assert late_state == {
        "source_qty": Decimal("0"),
        "target_qty": Decimal("1"),
        "component_logs": 3,
        "events": len(before["events"]) + 1,
    }
    db_session.expire_all()
    with Session(bind=db_session.get_bind()) as verify_db:
        assert _prepared_request_state(verify_db, request_id, item_ids) == before
    assert boundaries == {"commit": 0, "rollback": 1}


def test_io_item_conversion_delegates_to_wrapper_and_commits_once(
    client, db_session, make_item, make_bom, make_location, monkeypatch
) -> None:
    requester, source, target = _spec_conversion_case(
        db_session, make_item, make_bom, make_location
    )
    boundaries = _count_session_boundaries(db_session, monkeypatch)
    calls = 0
    original_execute = shipping_actions_svc.execute_component_change_independent

    def counted_execute(*args, **kwargs):
        nonlocal calls
        calls += 1
        return original_execute(*args, **kwargs)

    monkeypatch.setattr(
        shipping_actions_svc,
        "execute_component_change_independent",
        counted_execute,
    )

    response = client.post(
        "/api/io/item-conversion",
        json={
            "source_item_id": str(source.item_id),
            "target_item_id": str(target.item_id),
            "requester_employee_id": str(requester.employee_id),
            "quantity": 1,
            "requested_mode": "SPEC",
        },
    )

    assert response.status_code == 200, response.text
    assert calls == 1
    assert len(response.json()["transactions"]) == 2
    assert boundaries == {"commit": 1, "rollback": 0}


def test_prepare_complete_rolls_back_inventory_logs_and_status_when_event_fails(
    client, db_session, make_item, make_bom, make_location, monkeypatch
) -> None:
    component = make_item(
        name="출하 원자성 AF",
        process_type_code="AF",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=1,
    )
    final_pa = make_item(
        name="출하 원자성 PA",
        process_type_code="PA",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=2,
    )
    final_pf = make_item(
        name="출하 원자성 PF",
        process_type_code="PF",
        warehouse_qty=Decimal("0"),
        model_symbol="4",
        serial_no=3,
    )
    make_bom(final_pa.item_id, component.item_id, Decimal("1"))
    make_bom(final_pf.item_id, final_pa.item_id, Decimal("1"))
    make_location(final_pa.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("1"))
    actor = Employee(
        employee_code="SHIPPING-ATOMIC",
        name="Shipping atomic",
        role="worker",
        department=DepartmentEnum.ASSEMBLY.value,
        level=EmployeeLevelEnum.STAFF,
        display_order=0,
        is_active=True,
    )
    db_session.add(actor)
    db_session.commit()

    request = shipping_svc.create_request(
        db_session,
        {
            "base_pf_item_id": final_pf.item_id,
            "requested_by_name": "shipping-user",
            "invoice_number": "ACTIONS-INV-ATOMIC",
        },
    )
    db_session.commit()

    _submit_final_pf_production(
        db_session,
        request=request,
        actor=actor,
    )

    def fail_event(*_args, **_kwargs):
        raise RuntimeError("shipping event failure")

    monkeypatch.setattr(shipping_svc, "_record_event", fail_event)
    client.headers["X-MES-Employee-Code"] = actor.employee_code

    with pytest.raises(RuntimeError, match="shipping event failure"):
        client.post(
            f"/api/shipping/requests/{request.request_id}/prepare-complete",
            json={"serial_numbers": "SN-001", "companion_lines": []},
        )

    db_session.expire_all()
    assert _location_qty(db_session, final_pa.item_id, DepartmentEnum.SHIPPING) == Decimal("0")
    assert _location_qty(db_session, final_pf.item_id, DepartmentEnum.SHIPPING) == Decimal("1")
    assert (
        db_session.query(TransactionLog)
        .filter(TransactionLog.shipping_request_id == request.request_id)
        .count()
        == 0
    )
    refreshed = (
        db_session.query(ShippingRequest)
        .filter(ShippingRequest.request_id == request.request_id)
        .one()
    )
    assert refreshed.status == ShippingRequestStatusEnum.PREPARING
    assert refreshed.prepared_at is None
    assert refreshed.prepared_by_employee_id is None
    assert refreshed.prepared_by_name is None
