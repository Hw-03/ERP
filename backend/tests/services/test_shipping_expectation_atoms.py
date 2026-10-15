"""Additional shipping state and reservation assertions on isolated fixtures."""
from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from app.models import DepartmentEnum, Inventory, InventoryLocation, ShippingAllocation, ShippingRequest, ShippingRequestStatusEnum, TransactionLog
from app.services import shipping as shipping_svc
from app.services import shipping_actions as actions
from tests.services.test_shipping_actions import _make_prepared_request, _prepared_actor, _prepared_request_state


def test_duplicate_pickup_does_not_change_any_request_inventory_or_ledger(db_session: Session, make_item, make_bom, make_location) -> None:
    """An acknowledged pickup cannot be repeated without cancelling it first."""
    request_id, pa_id, pf_id, companion_id = _make_prepared_request(db_session, make_item, make_bom, make_location)
    actor = _prepared_actor(db_session, request_id)
    actions.pickup_complete(db_session, request_id, actor=actor)
    before = _prepared_request_state(db_session, request_id, (pa_id, pf_id, companion_id))
    with pytest.raises(shipping_svc.ShippingError, match="준비 완료 요청"):
        actions.pickup_complete(db_session, request_id, actor=actor)
    assert _prepared_request_state(db_session, request_id, (pa_id, pf_id, companion_id)) == before
    assert db_session.get(ShippingRequest, request_id).status == ShippingRequestStatusEnum.PICKED_UP


def test_prepare_cancel_preserves_another_request_reservation(db_session: Session, make_item, make_bom, make_location) -> None:
    """Cancellation releases only the selected request's share of the same PF."""
    first_id, _, pf_id, companion_id = _make_prepared_request(db_session, make_item, make_bom, make_location)
    actor = _prepared_actor(db_session, first_id)
    # Both requests can reserve one PF and one companion from the same location.
    inventory = db_session.query(Inventory).filter_by(item_id=pf_id).one()
    location = db_session.query(InventoryLocation).filter_by(item_id=pf_id, department=DepartmentEnum.SHIPPING).one()
    inventory.quantity += 1
    location.quantity += 1
    db_session.commit()
    second = actions.create_request(db_session, {"base_pf_item_id": pf_id, "invoice_number": "SECOND-RESERVATION",
        "companion_lines": [{"item_id": companion_id, "quantity": 1, "unit": "EA"}]})
    actions.prepare_complete(db_session, second.request_id, "SECOND-SN", prepared_by_employee_id=actor.employee_id, prepared_by_name=actor.name)
    second_allocations = db_session.query(ShippingAllocation).filter_by(request_id=second.request_id).all()
    before = {(row.allocation_id, row.item_id, row.quantity, row.status) for row in second_allocations}
    physical_before = {(row.item_id, row.quantity, row.warehouse_qty) for row in db_session.query(Inventory)}
    assert len(before) == 2
    actions.prepare_cancel(db_session, first_id, "first only", actor=actor)
    assert db_session.get(ShippingRequest, first_id).status == ShippingRequestStatusEnum.PREPARING
    assert db_session.query(ShippingAllocation).filter_by(request_id=first_id, status="RESERVED").count() == 0
    assert {(row.allocation_id, row.item_id, row.quantity, row.status) for row in db_session.query(ShippingAllocation).filter_by(request_id=second.request_id)} == before
    assert db_session.get(ShippingRequest, second.request_id).status == ShippingRequestStatusEnum.PREPARED
    assert {(row.item_id, row.quantity) for row in db_session.query(ShippingAllocation).filter_by(status="RESERVED")} == {(pf_id, 1), (companion_id, 1)}
    assert {(row.item_id, row.quantity, row.warehouse_qty) for row in db_session.query(Inventory)} == physical_before


def test_pickup_reversal_preserves_every_location_and_inverts_each_effect(db_session: Session, make_item, make_bom, make_location) -> None:
    """Every original PF/companion stock cell has one exact inverse ledger cell."""
    from app.services.inv_calc import _sync_total

    request_id, _, _, _ = _make_prepared_request(db_session, make_item, make_bom, make_location)
    # The shared fixture writes locations directly; align cached totals before
    # comparing real before/after ledger snapshots.
    for inventory in db_session.query(Inventory):
        _sync_total(db_session, inventory)
    db_session.commit()
    actor = _prepared_actor(db_session, request_id)
    actions.pickup_complete(db_session, request_id, actor=actor)
    original_logs = db_session.query(TransactionLog).filter_by(shipping_request_id=request_id, shipping_phase="PICKUP").all()
    assert len(original_logs) == 2
    actions.pickup_cancel(db_session, request_id, actor=actor)
    reversal_logs = db_session.query(TransactionLog).filter(TransactionLog.reverses_log_id.in_([row.log_id for row in original_logs])).all()
    assert len(reversal_logs) == len(original_logs)
    for original in original_logs:
        reversal = next(row for row in reversal_logs if row.reverses_log_id == original.log_id)
        assert reversal.item_id == original.item_id
        assert reversal.department == original.department
        assert reversal.quantity_change == -original.quantity_change
        assert original.inventory_effect
        assert reversal.inventory_effect == [{**effect, "delta": -effect["delta"]} for effect in original.inventory_effect]
        for scope in ("quantity", "warehouse_qty", "department_qty"):
            assert getattr(reversal, f"{scope}_before") == getattr(original, f"{scope}_after")
            assert getattr(reversal, f"{scope}_after") == getattr(original, f"{scope}_before")
