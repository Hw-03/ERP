"""Correction authority belongs to the original workflow root and atomic group."""
import uuid

import pytest

from app import models
from app.services import inventory_operations
from app.services.inventory_conflicts import InventoryConflict
from tests.services.test_business_corrections import (
    approve, approval_preview, execute, shipping_source,
)
from tests.services.test_stocktake_application import apply, confirm, preview
from tests.services.test_stocktake_counts import setup_round


def _employee(db, code, *, warehouse_role="none", department_role="none", admin=False):
    actor = models.Employee(employee_code=code, name=code, role="admin" if admin else "staff",
                            warehouse_role=warehouse_role, department_role=department_role)
    db.add(actor)
    db.commit()
    return actor


def _request(db, actor, source_type, source_id, *, target="CANCELLED"):
    return execute(db, actor, "request", {"source_type": source_type, "source_id": str(source_id),
        "target_status": target, "reason": "Recorded completion was incorrect",
        "evidence": "Shift handoff and physical count agree"})


def _expect_forbidden(action):
    with pytest.raises(InventoryConflict) as error:
        action()
    assert (error.value.code, error.value.status_code) == ("FORBIDDEN", 403)


def _observed_stock_request(db, make_item, *, internal_use=False):
    """Build a whole request group before the real count/confirm/apply observation."""
    env = setup_round(db, make_item)
    requester = _employee(db, "SR-OWNER")
    batch = None
    if internal_use:
        batch = models.IoBatch(work_type="internal_use", sub_type="internal_use_out", status="completed",
                               requester_employee_id=requester.employee_id, requester_name=requester.name,
                               requester_department="창고")
        db.add(batch)
        db.flush()
    requests = []
    for _ in range(2):
        request = models.StockRequest(
            requester_employee_id=requester.employee_id, requester_name=requester.name,
            requester_department="창고", request_type=(models.StockRequestTypeEnum.INTERNAL_USE
                if internal_use else models.StockRequestTypeEnum.RAW_SHIP),
            status=models.StockRequestStatusEnum.COMPLETED,
            operation_batch_id=batch.batch_id if batch else None)
        db.add(request)
        db.flush()
        db.add(models.StockRequestLine(
            request_id=request.request_id, item_id=env[2].item_id,
            item_name_snapshot=env[2].item_name, quantity=1,
            from_bucket=models.RequestBucketEnum.WAREHOUSE,
            to_bucket=models.RequestBucketEnum.NONE,
            status=models.StockRequestStatusEnum.COMPLETED))
        requests.append(request)
    db.flush()
    assert all(len(request.lines) == 1 for request in requests)
    operation = inventory_operations.create_business_operation(
        db, domain="io" if internal_use else "stock_request",
        action="internal_use_out" if internal_use else "execute",
        display_label="Original request group", actor_name=requester.name,
        actor_employee_id=requester.employee_id)
    for request in requests:
        inventory_operations.record_effect(
            db, operation=operation, effect_kind=models.InventoryOperationEffectKindEnum.WORKFLOW,
            subject_type="StockRequest", subject_id=request.request_id, role="EXECUTION_STATUS",
            before_state={"status": "submitted"}, after_state={"status": "completed"})
        db.add(inventory_operations.attach_transaction(models.TransactionLog(
            item_id=env[2].item_id,
            transaction_type=(models.TransactionTypeEnum.INTERNAL_USE
                if internal_use else models.TransactionTypeEnum.SHIP),
            quantity_change=-1, quantity_before=11, quantity_after=10,
            operation_batch_id=batch.batch_id if batch else None,
            inventory_effect=[{"scope": "warehouse", "delta": -1}]),
            operation, models.InventoryOperationRoleEnum.PRIMARY))
    db.commit()
    apply(db, env, preview(db, env, confirm(db, env)))
    return env, requester, batch, requests, operation


def _observed_handover(db, make_item):
    env = setup_round(db, make_item)
    author = _employee(db, "HO-AUTHOR")
    receiver = _employee(db, "HO-RECEIVER")
    db.add(models.Department(name="고압"))
    db.add(models.InventoryScope(scope_key="department:hv", physical_department="고압"))
    db.commit()
    addition = env[0].execute(db, env[1], "target_append_preview", str(uuid.uuid4()), {
        "round_id": env[3]["round_id"]})
    env[0].execute(db, env[1], "target_append", str(uuid.uuid4()), {
        "round_id": env[3]["round_id"], "preview_id": addition["preview_id"],
        "preview_hash": addition["preview_hash"]})
    document = models.HandoverDoc(status=models.HandoverStatusEnum.RECEIVED,
        author_employee_id=author.employee_id, author_name=author.name,
        received_by_employee_id=receiver.employee_id, received_by_name=receiver.name,
        from_department="창고", to_department="고압", title="Original handover")
    db.add(document)
    db.flush()
    line = models.HandoverLine(handover_id=document.handover_id,
        item_id=env[2].item_id, item_name_snapshot=env[2].item_name, quantity=1)
    db.add(line)
    db.flush()
    operation = inventory_operations.create_business_operation(
        db, domain="handover", action="receive", display_label="Original handover",
        actor_name=receiver.name, actor_employee_id=receiver.employee_id)
    inventory_operations.record_effect(db, operation=operation,
        effect_kind=models.InventoryOperationEffectKindEnum.WORKFLOW,
        subject_type="HandoverDoc", subject_id=document.handover_id, role="RECEIVE_STATUS",
        before_state={"status": "submitted"}, after_state={"status": "received"})
    db.add(inventory_operations.attach_transaction(models.TransactionLog(
        item_id=env[2].item_id, transaction_type=models.TransactionTypeEnum.TRANSFER_DEPT,
        quantity_change=0, quantity_before=10, quantity_after=10, transfer_qty=1,
        department="고압", inventory_effect=[
            {"scope": "warehouse", "delta": -1},
            {"scope": "location", "department": "고압", "delta": 1}]),
        operation, models.InventoryOperationRoleEnum.TRANSFER))
    db.commit()
    apply(db, env, preview(db, env, confirm(db, env)))
    target = next(row for row in env[0].list_targets(db, uuid.UUID(env[3]["round_id"]))["items"]
                  if row["item_id"] == str(env[2].item_id) and row["scope_id"] == "department:hv")
    department_env = (env[0], env[1], env[2], env[3], target)
    apply(db, department_env, preview(db, department_env, confirm(db, department_env, normal=0)))
    return env, author, receiver, document


def test_shipping_requester_may_be_any_active_staff_but_decisions_require_admin(db_session, make_item):
    env, shipping, _, operation, _ = shipping_source(db_session, make_item)
    staff = _employee(db_session, "SHIP-STAFF")
    correction = _request(db_session, staff, "InventoryOperation", operation.operation_id, target="PREPARING")
    assert correction["status"] == "REQUESTED"
    _expect_forbidden(lambda: approval_preview(db_session, staff, correction))
    _expect_forbidden(lambda: execute(db_session, staff, "reject", {
        "correction_id": correction["correction_id"], "expected_version": correction["version"],
        "reason": "No authority"}))
    plan = approval_preview(db_session, env[1], correction)
    _expect_forbidden(lambda: approve(db_session, staff, correction, plan))
    assert shipping.status == models.ShippingRequestStatusEnum.PICKED_UP


def test_only_original_requester_can_withdraw_even_when_other_actor_is_admin(db_session, make_item):
    env, _, _, operation, _ = shipping_source(db_session, make_item)
    staff = _employee(db_session, "WITHDRAW-OWNER")
    correction = _request(db_session, staff, "InventoryOperation", operation.operation_id, target="PREPARING")
    payload = {"correction_id": correction["correction_id"], "expected_version": correction["version"],
               "reason": "Evidence needs revision"}
    _expect_forbidden(lambda: execute(db_session, env[1], "withdraw", payload))
    result = execute(db_session, staff, "withdraw", payload)
    assert result["status"] == "WITHDRAWN"


@pytest.mark.parametrize("identity", ["requester", "warehouse", "department"])
def test_stock_request_root_allows_requester_or_authorized_role(db_session, make_item, identity):
    env, requester, _, requests, _ = _observed_stock_request(db_session, make_item)
    actors = {
        "requester": requester,
        "warehouse": _employee(db_session, "SR-WH", warehouse_role="primary"),
        "department": _employee(db_session, "SR-DEPT", department_role="primary"),
    }
    correction = _request(db_session, actors[identity], "StockRequest", requests[0].request_id)
    assert correction["status"] == "REQUESTED"
    assert db_session.query(models.StocktakeReceipt).filter_by(
        actor_id=actors[identity].employee_id, command_kind="correction_request").count() == 1
    assert db_session.query(models.Inventory).filter_by(item_id=env[2].item_id).one().warehouse_qty == 10


@pytest.mark.parametrize("identity", ["receiver", "department"])
def test_handover_original_receiver_or_department_role_can_request(db_session, make_item, identity):
    _, _, receiver, document = _observed_handover(db_session, make_item)
    role_actor = _employee(db_session, "HO-DEPT", department_role="primary")
    actor = receiver if identity == "receiver" else role_actor
    correction = _request(db_session, actor, "HandoverDoc", document.handover_id)
    assert correction["status"] == "REQUESTED"


def test_handover_unrelated_staff_cannot_request(db_session, make_item):
    _, author, _, document = _observed_handover(db_session, make_item)
    outsider = _employee(db_session, "HO-OTHER")
    _expect_forbidden(lambda: _request(db_session, author, "HandoverDoc", document.handover_id))
    _expect_forbidden(lambda: _request(db_session, outsider, "HandoverDoc", document.handover_id))


def test_stock_request_outsider_and_internal_use_role_cannot_bypass_batch_owner(db_session, make_item):
    _, requester, batch, requests, operation = _observed_stock_request(db_session, make_item, internal_use=True)
    manager = _employee(db_session, "USE-MANAGER", warehouse_role="primary", department_role="primary")
    outsider = _employee(db_session, "USE-OTHER")
    _expect_forbidden(lambda: _request(db_session, outsider, "StockRequest", requests[0].request_id))
    _expect_forbidden(lambda: _request(db_session, manager, "StockRequest", requests[0].request_id))
    _expect_forbidden(lambda: _request(db_session, manager, "InventoryOperation", operation.operation_id))
    correction = _request(db_session, requester, "StockRequest", requests[0].request_id)
    assert correction["status"] == "REQUESTED"
    assert batch.requester_employee_id == requester.employee_id


def test_internal_use_correction_finishes_whole_execution_batch(db_session, make_item):
    env, requester, batch, requests, _ = _observed_stock_request(db_session, make_item, internal_use=True)
    correction = _request(db_session, requester, "StockRequest", requests[0].request_id)
    plan = approval_preview(db_session, env[1], correction)
    applied = approve(db_session, env[1], correction, plan)
    assert applied["status"] == "APPLIED"
    assert {row.status for row in requests} == {models.StockRequestStatusEnum.CANCELLED}
    assert {line.status for row in requests for line in row.lines} == {models.StockRequestStatusEnum.CANCELLED}
    assert batch.status != "partially_completed"
    assert db_session.query(models.Inventory).filter_by(item_id=env[2].item_id).one().warehouse_qty == 10
