"""실제 SQLite 쓰기 잠금에서 출하 명령 중복·교차 진입을 검증한다."""

from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

import pytest

from app.models import (
    DepartmentEnum, Employee, EmployeeLevelEnum, Inventory, InventoryLocation,
    Item, LocationStatusEnum, ShippingAllocation, ShippingRequest,
    ShippingRequestEvent, ShippingRequestStatusEnum, SystemSetting, TransactionLog,
)
from app.services import inventory_operation_cancellation as cancellation
from app.services import shipping, shipping_actions, shipping_workflow_operations as workflow


def seed_request(make_session):
    with make_session() as db:
        actor = Employee(employee_code="SHIPPING-RACE", name="Shipping race",
                         role="worker", department=DepartmentEnum.SHIPPING.value,
                         level=EmployeeLevelEnum.STAFF, display_order=0, is_active="true")
        pa = Item(item_name="Race PA", process_type_code="PA", unit="EA", model_symbol="9", serial_no=1)
        pf = Item(item_name="Race PF", process_type_code="PF", unit="EA", model_symbol="9", serial_no=2)
        db.add_all([actor, pa, pf, SystemSetting(setting_key="inventory_operation_cutover_at", setting_value="2026-01-01T00:00:00")])
        db.flush()
        db.add(Inventory(item_id=pf.item_id, quantity=1, warehouse_qty=0, pending_quantity=0))
        db.add(InventoryLocation(item_id=pf.item_id, department=DepartmentEnum.SHIPPING.value,
                                 status=LocationStatusEnum.PRODUCTION, quantity=1, pending_quantity=0))
        request = ShippingRequest(base_pf_item_id=pf.item_id, final_pa_item_id=pa.item_id,
                                  final_pf_item_id=pf.item_id, invoice_number="RACE", request_quantity=1,
                                  requested_by_name=actor.name)
        db.add(request)
        db.flush()
        ids = request.request_id, actor.employee_id, pf.item_id
        db.commit()
        return ids


@pytest.mark.parametrize("command", ["prepare", "pickup", "cancel_prepare", "cancel_pickup"])
def test_shipping_duplicate_commands_apply_once(make_session, command):
    request_id, actor_id, pf_id = seed_request(make_session)
    with make_session() as db:
        actor = db.get(Employee, actor_id)
        if command != "prepare":
            shipping_actions.prepare_complete(db, request_id, "RACE-SN", prepared_by_employee_id=actor_id, prepared_by_name=actor.name)
        if command == "cancel_pickup":
            shipping_actions.pickup_complete(db, request_id)
        if command.startswith("cancel_"):
            operation = workflow.latest_operation(db, request_id, command.removeprefix("cancel_"))
            operation_id = operation.operation_id
            plan_hash = cancellation.preview_cancellation(db, operation_id).plan_hash

    def execute(entrypoint):
        with make_session() as db:
            try:
                actor = db.get(Employee, actor_id)
                if command == "prepare":
                    shipping_actions.prepare_complete(db, request_id, "RACE-SN", prepared_by_employee_id=actor_id, prepared_by_name=actor.name)
                elif command == "pickup":
                    shipping_actions.pickup_complete(db, request_id)
                elif entrypoint == "common":
                    cancellation.cancel_operation(db, operation_id=operation_id, canceller=actor, reason="race", plan_hash=plan_hash)
                elif command == "cancel_prepare":
                    shipping_actions.prepare_cancel(db, request_id, "race", actor=actor)
                else:
                    shipping_actions.pickup_cancel(db, request_id, actor=actor)
                return "success"
            except (shipping.ShippingError, cancellation.CancellationError):
                db.rollback()
                return "conflict"

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(execute, ["shipping", "common"]))
    assert sorted(outcomes) == ["conflict", "success"]
    with make_session() as db:
        expected = {"prepare": "PREPARED", "pickup": "PICKED_UP", "cancel_prepare": "PREPARING", "cancel_pickup": "PREPARED"}[command]
        assert db.get(ShippingRequest, request_id).status == ShippingRequestStatusEnum(expected)
        assert db.query(InventoryLocation).filter_by(item_id=pf_id).one().quantity == (0 if command == "pickup" else 1)
        assert sum(log.quantity_change for log in db.query(TransactionLog).all()) == (Decimal(-1) if command == "pickup" else 0)
        assert db.query(ShippingAllocation).filter_by(request_id=request_id, status="RESERVED").count() == (1 if expected == "PREPARED" else 0)
        event = {"prepare": "PREPARED", "pickup": "PICKED_UP", "cancel_prepare": "PREPARE_CANCELLED", "cancel_pickup": "PICKUP_CANCELLED"}[command]
        assert db.query(ShippingRequestEvent).filter_by(request_id=request_id, event_type=event).count() == 1
