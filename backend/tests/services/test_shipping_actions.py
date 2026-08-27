from __future__ import annotations

import ast
from decimal import Decimal
import inspect
from typing import get_type_hints

import pytest
from sqlalchemy.orm import Session

from app.models import (
    BOM,
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    InventoryOperation,
    Item,
    LocationStatusEnum,
    ShippingAllocation,
    ShippingRequest,
    ShippingRequestBomLine,
    ShippingRequestChecklistLine,
    ShippingRequestCompanionLine,
    ShippingRequestEvent,
    ShippingRequestStatusEnum,
    SystemSetting,
    TransactionLog,
)
from app.services import shipping as shipping_svc
from app.services import shipping_actions as shipping_actions_svc
from app.services import io as io_svc
from app.services import io_actions as io_actions_svc
from app.schemas.io import IoPreviewTarget, IoSubmitRequest


EXPECTED_ACTOR_EVENT_TYPES = {
    "CANCELLED",
    "COMPONENT_CHANGED",
    "INVOICE_UPDATED",
    "PICKED_UP",
    "PICKUP_CANCELLED",
    "PREPARED",
    "PREPARE_CANCELLED",
    "REQUEST_CREATED",
    "REQUEST_UPDATED",
}


def test_component_change_preview_public_boundary_requires_actor() -> None:
    assert not hasattr(shipping_svc, "component_change_preview")
    facade = getattr(shipping_actions_svc, "component_change_preview", None)
    assert facade is not None
    signature = inspect.signature(facade)
    assert signature.parameters["actor"].kind is inspect.Parameter.KEYWORD_ONLY
    assert get_type_hints(facade)["actor"] is Employee
    with pytest.raises(TypeError):
        signature.bind(object(), object(), object(), 1)


def test_shipping_event_actor_columns_are_nullable_for_legacy_rows() -> None:
    columns = ShippingRequestEvent.__table__.columns

    assert columns["actor_employee_id"].nullable is True
    assert columns["actor_employee_code"].nullable is True
    assert columns["actor_name"].nullable is True
    actor_fk = next(iter(columns["actor_employee_id"].foreign_keys))
    assert actor_fk.target_fullname == "employees.employee_id"
    assert actor_fk.ondelete == "SET NULL"


def test_every_shipping_mutation_event_passes_required_employee_actor() -> None:
    signature = inspect.signature(shipping_svc._record_event)
    with pytest.raises(TypeError):
        signature.bind(object(), object(), "EVENT")

    tree = ast.parse(inspect.getsource(shipping_svc))
    calls = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "_record_event"
    ]
    event_types = {
        node.args[2].value
        for node in calls
        if len(node.args) >= 3
        and isinstance(node.args[2], ast.Constant)
        and isinstance(node.args[2].value, str)
    }

    assert event_types == EXPECTED_ACTOR_EVENT_TYPES
    for node in calls:
        actor_keywords = [kw for kw in node.keywords if kw.arg == "actor"]
        assert len(actor_keywords) == 1
        assert isinstance(actor_keywords[0].value, ast.Name)
        assert actor_keywords[0].value.id == "actor"


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
    existing = (
        db_session.query(Employee)
        .filter(Employee.employee_code == "SHIPPING-ACTIONS-ACTOR")
        .first()
    )
    if existing is not None:
        return existing
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
        requester=actor,
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
    db_session.add(
        SystemSetting(
            setting_key="inventory_operation_cutover_at",
            setting_value="2026-01-01T00:00:00",
        )
    )
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
    actor = _active_shipping_actor(db_session)

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
        actor,
    )
    _submit_final_pf_production(
        db_session,
        request=request,
        actor=actor,
    )
    shipping_actions_svc.prepare_complete(
        db_session,
        request.request_id,
        "SN-001",
        actor=actor,
    )
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
    actor = _active_shipping_actor(db_session)

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
                actor,
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
    actor = _active_shipping_actor(db_session)

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
        actor,
    )
    request_id = request.request_id
    final_item_ids = (request.final_pa_item_id, request.final_pf_item_id)
    with Session(bind=db_session.get_bind()) as verify_db:
        before = _request_graph_state(verify_db, request_id, final_item_ids)

    boundaries = _count_session_boundaries(db_session, monkeypatch)

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
    actor = _active_shipping_actor(db_session)
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
        shipping_actions_svc.prepare_cancel(
            db_session,
            request_id,
            "late failure",
            actor=actor,
        )

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
    actor = _active_shipping_actor(db_session)
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
        shipping_actions_svc.pickup_complete(db_session, request_id, actor)

    db_session.expire_all()
    with Session(bind=db_session.get_bind()) as verify_db:
        assert _prepared_request_state(verify_db, request_id, item_ids) == before
    assert boundaries == {"commit": 0, "rollback": 1}


def test_pickup_cancel_creates_reversal_operation_and_closes_request(
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
    actor = _active_shipping_actor(db_session)
    prepared_final_pf_qty = _location_qty(db_session, final_pf_id, DepartmentEnum.SHIPPING)
    prepared_companion_qty = _location_qty(db_session, companion_id, DepartmentEnum.SHIPPING)

    shipping_actions_svc.pickup_complete(db_session, request_id, actor)
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
    cancelled = shipping_actions_svc.pickup_cancel(db_session, request_id, actor)

    assert lock_calls == [pickup_item_ids]
    assert cancelled.status == ShippingRequestStatusEnum.CANCELLED
    assert cancelled.picked_up_at is not None
    assert cancelled.serial_numbers == "SN-001"
    assert _location_qty(db_session, final_pf_id, DepartmentEnum.SHIPPING) == prepared_final_pf_qty
    assert _location_qty(db_session, companion_id, DepartmentEnum.SHIPPING) == prepared_companion_qty
    allocations = db_session.query(ShippingAllocation).filter_by(request_id=request_id).all()
    assert allocations
    assert {row.status for row in allocations} == {"RELEASED"}
    pickup_logs = (
        db_session.query(TransactionLog)
        .filter_by(shipping_request_id=request_id, shipping_phase="PICKUP")
        .all()
    )
    original_logs = [row for row in pickup_logs if row.reverses_log_id is None]
    reversal_logs = [row for row in pickup_logs if row.reverses_log_id is not None]
    assert original_logs
    assert all(row.cancelled is False for row in original_logs)
    assert len(reversal_logs) == len(original_logs)
    assert {row.reverses_log_id for row in reversal_logs} == {row.log_id for row in original_logs}
    cancellation_operations = (
        db_session.query(InventoryOperation)
        .filter(InventoryOperation.reverses_operation_id.isnot(None))
        .all()
    )
    assert len(cancellation_operations) == 1
    assert any(event.event_type == "PICKUP_CANCELLED" for event in cancelled.events)


def test_pickup_and_cancel_logs_use_current_actor_not_preparer(
    db_session,
    make_item,
    make_bom,
    make_location,
) -> None:
    request_id, _final_pa_id, _final_pf_id, _companion_id = _make_prepared_request(
        db_session,
        make_item,
        make_bom,
        make_location,
    )
    preparer = _active_shipping_actor(db_session)
    picker = Employee(
        employee_code="SHIPPING-PICKER-B",
        name="Shipping picker B",
        role="worker",
        department=DepartmentEnum.SHIPPING.value,
        level=EmployeeLevelEnum.STAFF,
        display_order=0,
        is_active=True,
    )
    db_session.add(picker)
    db_session.commit()
    request = db_session.get(ShippingRequest, request_id)
    assert request is not None

    with pytest.raises(TypeError):
        shipping_actions_svc.pickup_complete(
            db_session,
            request_id,
            actor=picker,
            prepared_by_name="spoofed primitive",
        )
    with pytest.raises(TypeError, match="Employee"):
        shipping_svc._record_event(
            db_session,
            request,
            "SPOOFED_EVENT",
            actor=object(),
        )

    shipping_actions_svc.pickup_complete(db_session, request_id, picker)
    pickup_logs = (
        db_session.query(TransactionLog)
        .filter_by(shipping_request_id=request_id, shipping_phase="PICKUP")
        .all()
    )
    assert pickup_logs
    assert {row.producer_employee_id for row in pickup_logs} == {picker.employee_id}
    assert {row.produced_by for row in pickup_logs} == {picker.name}
    assert preparer.employee_id not in {row.producer_employee_id for row in pickup_logs}
    logged_picker = db_session.get(Employee, pickup_logs[0].producer_employee_id)
    assert logged_picker is not None
    assert (logged_picker.employee_code, logged_picker.name) == (
        picker.employee_code,
        picker.name,
    )

    pickup_operation = (
        db_session.query(InventoryOperation)
        .filter(
            InventoryOperation.domain == "shipping",
            InventoryOperation.action == "pickup",
            InventoryOperation.reverses_operation_id.is_(None),
        )
        .one()
    )
    assert pickup_operation.actor_employee_id == picker.employee_id
    assert pickup_operation.actor_name == picker.name

    shipping_actions_svc.pickup_cancel(db_session, request_id, picker)
    cancellation_operation = (
        db_session.query(InventoryOperation)
        .filter(
            InventoryOperation.reverses_operation_id == pickup_operation.operation_id
        )
        .one()
    )
    assert cancellation_operation.actor_employee_id == picker.employee_id
    assert cancellation_operation.actor_name == picker.name
    reversal_logs = (
        db_session.query(TransactionLog)
        .filter(TransactionLog.operation_id == cancellation_operation.operation_id)
        .all()
    )
    assert reversal_logs
    assert {row.producer_employee_id for row in reversal_logs} == {picker.employee_id}
    assert {row.produced_by for row in reversal_logs} == {picker.name}
    pickup_event = next(
        event for event in request.events if event.event_type == "PICKED_UP"
    )
    cancel_event = next(
        event for event in request.events if event.event_type == "PICKUP_CANCELLED"
    )
    for event in (pickup_event, cancel_event):
        assert event.actor_employee_id == picker.employee_id
        assert event.actor_employee_code == picker.employee_code
        assert event.actor_name == picker.name

    legacy_event = ShippingRequestEvent(
        request_id=request_id,
        event_type="LEGACY_EVENT",
        message="pre-CP3 compatible",
    )
    db_session.add(legacy_event)
    db_session.commit()
    assert legacy_event.actor_employee_id is None
    assert legacy_event.actor_employee_code is None
    assert legacy_event.actor_name is None


def test_prepare_cancel_closes_request_and_releases_allocations(
    db_session,
    make_item,
    make_bom,
    make_location,
) -> None:
    request_id, _final_pa_id, _final_pf_id, _companion_id = _make_prepared_request(
        db_session,
        make_item,
        make_bom,
        make_location,
    )
    actor = _active_shipping_actor(db_session)

    cancelled = shipping_actions_svc.prepare_cancel(
        db_session,
        request_id,
        "구성 변경",
        actor=actor,
    )

    assert cancelled.status == ShippingRequestStatusEnum.CANCELLED
    assert cancelled.prepared_at is not None
    allocations = db_session.query(ShippingAllocation).filter_by(request_id=request_id).all()
    assert allocations
    assert {row.status for row in allocations} == {"RELEASED"}
    cancellation = (
        db_session.query(InventoryOperation)
        .filter(InventoryOperation.reverses_operation_id.isnot(None))
        .one()
    )
    original = db_session.get(InventoryOperation, cancellation.reverses_operation_id)
    assert original is not None
    assert original.action == "prepare"
    with pytest.raises(shipping_svc.ShippingError, match="준비 중"):
        shipping_actions_svc.prepare_complete(
            db_session,
            request_id,
            "SN-002",
            actor=actor,
        )


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
    actor = _active_shipping_actor(db_session)
    shipping_actions_svc.pickup_complete(db_session, request_id, actor)
    with Session(bind=db_session.get_bind()) as verify_db:
        before = _prepared_request_state(verify_db, request_id, item_ids)
    assert before["request"][0] == ShippingRequestStatusEnum.PICKED_UP
    assert {row[2] for row in before["allocations"]} == {"CONSUMED"}

    boundaries = _count_session_boundaries(db_session, monkeypatch)

    def fail_event(*_args, **_kwargs):
        raise RuntimeError("pickup cancel event failure")

    monkeypatch.setattr(shipping_svc, "_record_event", fail_event)

    with pytest.raises(RuntimeError, match="pickup cancel event failure"):
        shipping_actions_svc.pickup_cancel(db_session, request_id, actor)

    db_session.expire_all()
    with Session(bind=db_session.get_bind()) as verify_db:
        assert _prepared_request_state(verify_db, request_id, item_ids) == before
    assert boundaries == {"commit": 0, "rollback": 1}


def test_independent_component_change_wrapper_rolls_back_inventory_and_logs_on_late_failure(
    db_session, make_item, make_bom, make_location, monkeypatch
) -> None:
    requester, source, target = _spec_conversion_case(
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
            actor=requester,
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
    actor = _active_shipping_actor(db_session)

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
        actor,
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
            actor=actor,
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

    request = shipping_actions_svc.create_request(
        db_session,
        {
            "base_pf_item_id": final_pf.item_id,
            "requested_by_name": "shipping-user",
            "invoice_number": "ACTIONS-INV-ATOMIC",
        },
        actor,
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
