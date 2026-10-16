"""8.19-20: administrator BOM edits never rewrite submitted shipping snapshots."""
from __future__ import annotations

from copy import deepcopy

from sqlalchemy.orm import Session

from app.models import AdminAuditLog, Inventory, ShippingAllocation, ShippingRequest, ShippingRequestBomLine, ShippingRequestEvent, ShippingRequestStatusEnum, TransactionLog
from app.services import shipping_actions as actions
from app.services.inv_calc import _sync_total
from tests.services.test_shipping_actions import _make_prepared_request, _prepared_actor

ADMIN = {"X-Admin-Pin": "0000"}


def _rows(db: Session, model: type, **filters: object) -> list[dict]:
    """Capture every persisted field so later edits cannot silently rewrite history."""
    db.expire_all()
    return sorted([
        {column.name: deepcopy(getattr(row, column.name)) for column in model.__table__.columns}
        for row in db.query(model).filter_by(**filters)
    ], key=repr)


def test_bom_admin_edit_keeps_old_shipping_snapshot_and_new_request_uses_latest(
    client, db_session, make_item, make_bom, make_location,
) -> None:
    old_id, pa_id, pf_id, _ = _make_prepared_request(db_session, make_item, make_bom, make_location)
    actor = _prepared_actor(db_session, old_id)
    actions.prepare_cancel(db_session, old_id, actor=actor)
    # The shared setup writes companion locations directly; align its cached total.
    for inventory in db_session.query(Inventory):
        _sync_total(db_session, inventory)
    db_session.commit()
    inventory_before = {(row.item_id, row.quantity, row.warehouse_qty, row.pending_quantity) for row in db_session.query(Inventory)}
    old_lines = _rows(db_session, ShippingRequestBomLine, request_id=old_id)
    endpoint = f"/api/bom/{pa_id}"
    original = client.get(endpoint).json()
    changed = [{"child_item_id": row["child_item_id"], "quantity": row["quantity"] + 2,
                "unit": row["unit"], "notes": "snapshot boundary"} for row in original]
    saved = client.put(endpoint, headers=ADMIN, json={"expected_rows": original, "rows": changed})
    assert saved.status_code == 200, saved.text
    audit_after_edit = _rows(db_session, AdminAuditLog)
    assert len(audit_after_edit) == 1
    assert audit_after_edit[0]["action"] == "bom.replace"
    assert _rows(db_session, ShippingRequestBomLine, request_id=old_id) == old_lines

    new = actions.create_request(db_session, {"base_pf_item_id": pf_id, "invoice_number": "AFTER-BOM-EDIT"})
    new_lines = _rows(db_session, ShippingRequestBomLine, request_id=new.request_id)
    assert {(row["child_item_id"], row["quantity"], row["unit"]) for row in new_lines if row["parent_stage"] == "PA"} == {
        (row["child_item_id"], row["quantity"] + 2, row["unit"]) for row in old_lines if row["parent_stage"] == "PA"
    }
    assert db_session.get(ShippingRequest, old_id).final_pf_item_id == pf_id
    actions.prepare_complete(db_session, old_id, "OLD-SNAPSHOT-SN", prepared_by_employee_id=actor.employee_id, prepared_by_name=actor.name)
    actions.pickup_complete(db_session, old_id, actor=actor)
    actions.pickup_cancel(db_session, old_id, actor=actor)
    actions.prepare_cancel(db_session, old_id, actor=actor)
    assert _rows(db_session, ShippingRequestBomLine, request_id=old_id) == old_lines
    old_events = _rows(db_session, ShippingRequestEvent, request_id=old_id)
    old_logs = _rows(db_session, TransactionLog, shipping_request_id=old_id)
    assert {row["event_type"] for row in old_events} >= {"PREPARED", "PICKED_UP", "PICKUP_CANCELLED", "PREPARE_CANCELLED"}
    assert len(old_logs) == 4
    actions.prepare_complete(db_session, new.request_id, "NEW-SNAPSHOT-SN", prepared_by_employee_id=actor.employee_id, prepared_by_name=actor.name)
    assert _rows(db_session, ShippingRequestBomLine, request_id=new.request_id) == new_lines
    actions.pickup_complete(db_session, new.request_id, actor=actor)
    assert _rows(db_session, ShippingRequestBomLine, request_id=new.request_id) == new_lines
    actions.pickup_cancel(db_session, new.request_id, actor=actor)
    actions.prepare_cancel(db_session, new.request_id, actor=actor)
    new_events = _rows(db_session, ShippingRequestEvent, request_id=new.request_id)
    new_logs = _rows(db_session, TransactionLog, shipping_request_id=new.request_id)
    assert len(new_logs) == 2

    restored = client.put(endpoint, headers=ADMIN, json={"expected_rows": saved.json(), "rows": original})
    assert restored.status_code == 200, restored.text
    audit_after_restore = _rows(db_session, AdminAuditLog)
    assert len(audit_after_restore) == 2
    assert all(row in audit_after_restore for row in audit_after_edit)
    assert _rows(db_session, ShippingRequestBomLine, request_id=old_id) == old_lines
    assert _rows(db_session, ShippingRequestBomLine, request_id=new.request_id) == new_lines
    assert _rows(db_session, ShippingRequestEvent, request_id=old_id) == old_events
    assert _rows(db_session, TransactionLog, shipping_request_id=old_id) == old_logs
    assert _rows(db_session, ShippingRequestEvent, request_id=new.request_id) == new_events
    assert _rows(db_session, TransactionLog, shipping_request_id=new.request_id) == new_logs
    for request_id, expected_logs in ((old_id, old_logs), (new.request_id, new_logs)):
        actions.delete_request(db_session, request_id, actor)
        assert db_session.get(ShippingRequest, request_id).status == ShippingRequestStatusEnum.CANCELLED
        assert _rows(db_session, TransactionLog, shipping_request_id=request_id) == expected_logs
        assert db_session.query(ShippingAllocation).filter_by(request_id=request_id, status="RESERVED").count() == 0
        forward = [row for row in expected_logs if row["reverses_log_id"] is None]
        reverse = [row for row in expected_logs if row["reverses_log_id"] is not None]
        assert len(forward) == len(reverse)
        for original_log in forward:
            inverses = [row for row in reverse if row["reverses_log_id"] == original_log["log_id"]]
            assert len(inverses) == 1
            assert inverses[0]["quantity_change"] == -original_log["quantity_change"]
    assert {(row.item_id, row.quantity, row.warehouse_qty, row.pending_quantity) for row in db_session.query(Inventory)} == inventory_before
