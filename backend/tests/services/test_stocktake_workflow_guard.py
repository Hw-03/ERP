"""A counted cell must fence complete workflows without consuming reservations."""

import json
import uuid
from datetime import datetime
from decimal import Decimal

import pytest
from sqlalchemy import inspect

from app.models import (
    DefectPoolCutover, DefectStockMovement, DefectStockPool, DepartmentEnum,
    Employee, Inventory, InventoryLocation, InventoryScope,
    InventoryOperation, InventoryOperationEffect, InventoryOperationEffectKindEnum,
    InventoryOperationKindEnum, InventoryOperationStatusEnum, LocationStatusEnum,
    RequestBucketEnum, ShippingAllocation, ShippingRequest, ShippingRequestStatusEnum,
    StockRequest, StockRequestStatusEnum, StockRequestTypeEnum, StocktakeControl,
    StocktakeGate, StocktakeProgress, StocktakeRound,
    SystemSetting, TransactionLog,
)
from app.services import (
    defect_actions, defect_pool, inventory_operations, io_actions, io_dispatch,
    shipping_actions, stock_requests, stocktake_guard,
)
from app.services.inventory_conflicts import InventoryConflict
from app.services.inventory_integrity import diagnose_inventory_integrity
from app.services.inventory_integrity_repair import repair_inventory_integrity_issue
from app.services.pin_auth import DEFAULT_PIN_HASH
from tests.services.test_io_actions import _internal_use_payload, _make_requester
from tests.services.test_shipping_actions import _make_prepared_request


def _actor(db, *, code: str, warehouse_role: str = "none") -> Employee:
    actor = Employee(
        employee_code=code, name=code, role=f"{DepartmentEnum.ASSEMBLY.value}/사원",
        department=DepartmentEnum.ASSEMBLY,
        warehouse_role=warehouse_role, department_role="none", display_order=0,
        is_active="true", pin_hash=DEFAULT_PIN_HASH,
    )
    db.add(actor)
    db.flush()
    return actor


def _pool_round(db, *, active: bool = True) -> uuid.UUID:
    round_id = uuid.uuid4()
    actor = _actor(db, code="ROUND-OWNER")
    db.add(StocktakeRound(round_id=round_id, title="Guard fixture", epoch=1,
                         status="ACTIVE" if active else "CLOSED_FULL", started_by=actor.employee_id))
    db.flush()
    db.add(StocktakeControl(id=1, inventory_mode="POOL", active_round_id=round_id if active else None, epoch=1))
    db.add_all([
        InventoryScope(scope_key="warehouse", physical_department="창고"),
        InventoryScope(scope_key="assembly", physical_department=DepartmentEnum.ASSEMBLY.value),
        InventoryScope(scope_key="shipping", physical_department=DepartmentEnum.SHIPPING.value),
        InventoryScope(scope_key="high_voltage", physical_department=DepartmentEnum.HIGH_VOLTAGE.value),
        InventoryScope(scope_key="vacuum", physical_department=DepartmentEnum.VACUUM.value),
    ])
    db.commit()
    return round_id


def _count_cell(db, item_id: uuid.UUID, round_id: uuid.UUID, scope_key: str = "warehouse") -> None:
    gate = db.get(StocktakeGate, (item_id, scope_key))
    if gate is None:
        gate = StocktakeGate(item_id=item_id, scope_key=scope_key)
        db.add(gate)
    gate.round_id = round_id
    gate.round_epoch = 1
    gate.active_count_id = uuid.uuid4()
    gate.fence = 1
    db.commit()


def _pool_cutover(db, actor: Employee) -> DefectPoolCutover:
    db.add(SystemSetting(
        setting_key="inventory_operation_cutover_at",
        setting_value="2026-01-01T00:00:00",
    ))
    db.flush()
    operation = inventory_operations.create_business_operation(
        db, domain="pool", action="cutover", display_label="Fixture",
        actor_name=actor.name, actor_employee_id=actor.employee_id,
    )
    assert operation is not None
    cutover = DefectPoolCutover(
        actor_employee_id=actor.employee_id, operation_id=operation.operation_id,
        source_fingerprint="b" * 64, cutover_version=1,
        performed_at=datetime(2026, 1, 2),
    )
    db.add(cutover)
    db.commit()
    return cutover


def _request(client, requester: Employee, items: list[tuple[uuid.UUID, int]]) -> str:
    response = client.post("/api/stock-requests", json={
        "requester_employee_id": str(requester.employee_id),
        "request_type": "warehouse_to_dept",
        "lines": [{
            "item_id": str(item_id), "quantity": str(quantity),
            "from_bucket": "warehouse", "to_bucket": "production",
            "to_department": DepartmentEnum.ASSEMBLY.value,
        } for item_id, quantity in items],
    })
    assert response.status_code == 201, response.text
    return response.json()["request_id"]


def test_counted_warehouse_blocks_request_approval_without_failing_request_or_releasing_hold(
    client, db_session, make_item,
) -> None:
    item = make_item(name="Counted approval", process_type_code="AR", warehouse_qty=Decimal(10))
    requester = _actor(db_session, code="ST-WF-REQUESTER")
    approver = _actor(db_session, code="ST-WF-APPROVER", warehouse_role="primary")
    request_id = _request(client, requester, [(item.item_id, 3)])
    round_id = _pool_round(db_session)
    _count_cell(db_session, item.item_id, round_id)

    response = client.post(f"/api/stock-requests/{request_id}/approve", json={
        "actor_employee_id": str(approver.employee_id), "pin": "0000",
    })

    assert response.status_code == 423, response.text
    assert response.json()["detail"]["code"] == "STOCKTAKE_CELL_LOCKED"
    db_session.expire_all()
    request = db_session.query(StockRequest).filter_by(request_id=request_id).one()
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    assert request.status == StockRequestStatusEnum.RESERVED
    assert request.approved_at is None
    assert all(line.status == StockRequestStatusEnum.RESERVED for line in request.lines)
    assert inventory.warehouse_qty == Decimal(10)
    assert inventory.pending_quantity == Decimal(3)
    assert db_session.query(TransactionLog).filter_by(item_id=item.item_id).count() == 0


def test_counted_warehouse_allows_request_cancellation_to_release_only_reservation(
    client, db_session, make_item,
) -> None:
    item = make_item(name="Counted cancellation", process_type_code="AR", warehouse_qty=Decimal(10))
    requester = _actor(db_session, code="ST-WF-CANCEL")
    request_id = _request(client, requester, [(item.item_id, 3)])
    round_id = _pool_round(db_session)
    _count_cell(db_session, item.item_id, round_id)

    response = client.post(f"/api/stock-requests/{request_id}/cancel", json={
        "actor_employee_id": str(requester.employee_id), "pin": "0000",
    })

    assert response.status_code == 200, response.text
    db_session.expire_all()
    request = db_session.query(StockRequest).filter_by(request_id=request_id).one()
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    gate = db_session.get(StocktakeGate, (item.item_id, "warehouse"))
    assert request.status == StockRequestStatusEnum.CANCELLED
    assert inventory.warehouse_qty == Decimal(10)
    assert inventory.pending_quantity == Decimal(0)
    assert gate.quantity_revision == 0
    assert gate.reservation_revision > 0


def test_counted_second_request_line_rolls_back_entire_approval(
    client, db_session, make_item,
) -> None:
    first = make_item(name="First request line", process_type_code="AR", warehouse_qty=Decimal(10))
    second = make_item(name="Counted second line", process_type_code="AR", warehouse_qty=Decimal(10))
    requester = _actor(db_session, code="ST-WF-MULTI-REQ")
    approver = _actor(db_session, code="ST-WF-MULTI-APP", warehouse_role="primary")
    request_id = _request(client, requester, [(first.item_id, 3), (second.item_id, 4)])
    round_id = _pool_round(db_session)
    _count_cell(db_session, second.item_id, round_id)

    response = client.post(f"/api/stock-requests/{request_id}/approve", json={
        "actor_employee_id": str(approver.employee_id), "pin": "0000",
    })

    assert response.status_code == 423, response.text
    assert response.json()["detail"]["code"] == "STOCKTAKE_CELL_LOCKED"
    db_session.expire_all()
    request = db_session.query(StockRequest).filter_by(request_id=request_id).one()
    assert request.status == StockRequestStatusEnum.RESERVED
    assert all(line.status == StockRequestStatusEnum.RESERVED for line in request.lines)
    for item_id, held in [(first.item_id, 3), (second.item_id, 4)]:
        inventory = db_session.query(Inventory).filter_by(item_id=item_id).one()
        assert inventory.warehouse_qty == Decimal(10)
        assert inventory.pending_quantity == Decimal(held)
        assert db_session.query(TransactionLog).filter_by(item_id=item_id).count() == 0


def test_counted_cell_blocks_category_move_with_zero_physical_delta(
    db_session, make_item,
) -> None:
    item = make_item(name="Counted category", warehouse_qty=Decimal(0))
    actor = _actor(db_session, code="ST-WF-CATEGORY", warehouse_role="primary")
    round_id = _pool_round(db_session)
    cutover = _pool_cutover(db_session, actor)
    source = DefectStockPool(
        item_id=item.item_id, scope_key="warehouse", category="DEFECT",
        quantity=5, cutover_id=cutover.cutover_id,
    )
    db_session.add_all([
        source,
        InventoryLocation(
            item_id=item.item_id, department=DepartmentEnum.WAREHOUSE,
            status=LocationStatusEnum.DEFECTIVE, quantity=5,
        ),
    ])
    db_session.commit()
    _count_cell(db_session, item.item_id, round_id)

    with pytest.raises(InventoryConflict) as error:
        defect_pool.move_category(
            db_session, pool_id=source.pool_id, quantity=2, category="B_GRADE",
            expected_version=source.version, actor=actor, reason="counted cell",
        )

    assert error.value.code == "STOCKTAKE_CELL_LOCKED"
    db_session.expire_all()
    assert db_session.get(DefectStockPool, source.pool_id).quantity == 5
    assert db_session.query(DefectStockPool).filter_by(
        item_id=item.item_id, category="B_GRADE",
    ).count() == 0
    assert db_session.query(DefectStockMovement).count() == 0


def test_counted_shipping_cell_allows_allocation_release_but_blocks_reprepare(
    db_session, make_item, make_bom, make_location,
) -> None:
    request_id, _pa_id, _pf_id, companion_id = _make_prepared_request(
        db_session, make_item, make_bom, make_location,
    )
    round_id = _pool_round(db_session)
    _count_cell(db_session, companion_id, round_id, "shipping")

    cancelled = shipping_actions.prepare_cancel(db_session, request_id, "counted cell")

    assert cancelled.status == ShippingRequestStatusEnum.PREPARING
    allocations = db_session.query(ShippingAllocation).filter_by(request_id=request_id).all()
    assert allocations and {row.status for row in allocations} == {"RELEASED"}
    gate = db_session.get(StocktakeGate, (companion_id, "shipping"))
    assert gate.quantity_revision == 0
    assert gate.reservation_revision > 0

    with pytest.raises(InventoryConflict) as error:
        shipping_actions.prepare_complete(db_session, request_id, "SN-002")

    assert error.value.code == "STOCKTAKE_CELL_LOCKED"
    db_session.expire_all()
    assert db_session.get(ShippingRequest, request_id).status == ShippingRequestStatusEnum.PREPARING
    assert {row.status for row in db_session.query(ShippingAllocation).filter_by(request_id=request_id)} == {"RELEASED"}


def test_production_receipt_router_preserves_inventory_conflict(
    client, db_session, make_item, monkeypatch,
) -> None:
    item = make_item(name="Production conflict")
    db_session.commit()

    def blocked(*_args, **_kwargs) -> None:
        raise InventoryConflict("STOCKTAKE_CELL_LOCKED", "counted", status_code=423)

    monkeypatch.setattr(
        "app.routers.production.production_receipt_svc.execute_production_receipt", blocked,
    )
    response = client.post("/api/production/receipt", json={
        "item_id": str(item.item_id), "quantity": 1,
    })

    assert response.status_code == 423, response.text
    assert response.json()["detail"]["code"] == "STOCKTAKE_CELL_LOCKED"


def test_department_adjustment_router_preserves_inventory_conflict(
    client, db_session, make_item, monkeypatch,
) -> None:
    item = make_item(name="Adjustment conflict")
    actor = _actor(db_session, code="ST-WF-DEPT")
    db_session.commit()

    def blocked(*_args, **_kwargs) -> None:
        raise InventoryConflict("STOCKTAKE_CELL_LOCKED", "counted", status_code=423)

    monkeypatch.setattr("app.routers.dept_adjustment.svc.submit_adjustment", blocked)
    response = client.post("/api/dept-adjustment/submit", json={
        "sub_type": "correction", "operator_employee_code": actor.employee_code,
        "lines": [{"item_id": str(item.item_id), "direction": "in",
                   "quantity": 1, "department": DepartmentEnum.ASSEMBLY.value}],
    })

    assert response.status_code == 423, response.text
    assert response.json()["detail"]["code"] == "STOCKTAKE_CELL_LOCKED"


def test_internal_use_submit_does_not_mark_counting_conflict_as_failed_settlement(
    db_session, make_item, monkeypatch,
) -> None:
    item = make_item(name="Internal use conflict", warehouse_qty=Decimal(5))
    requester = _make_requester(
        db_session, department=DepartmentEnum.AS, warehouse_role="primary",
        department_role="primary", as_research_approver=True,
    )
    db_session.commit()

    def blocked(*_args, **_kwargs) -> None:
        raise InventoryConflict("STOCKTAKE_CELL_LOCKED", "counted", status_code=423)

    monkeypatch.setattr("app.services.internal_use_approval.settle_if_decided", blocked)
    with pytest.raises(InventoryConflict) as error:
        io_actions.submit(db_session, _internal_use_payload(requester, [item]))

    assert error.value.code == "STOCKTAKE_CELL_LOCKED"
    db_session.expire_all()
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().warehouse_qty == 5
    assert db_session.query(StockRequest).count() == 0


def test_bulk_pool_quarantine_declares_both_items_and_rolls_back_on_second_counted_cell(
    db_session, make_item,
) -> None:
    items = sorted([
        make_item(name="First bulk quarantine", warehouse_qty=Decimal(5)),
        make_item(name="Counted bulk quarantine", warehouse_qty=Decimal(5)),
    ], key=lambda item: str(item.item_id))
    actor = _actor(db_session, code="ST-WF-BULK", warehouse_role="primary")
    round_id = _pool_round(db_session)
    _pool_cutover(db_session, actor)
    _count_cell(db_session, items[1].item_id, round_id)
    lines = [defect_actions.BulkQuarantineLine(
        item_id=item.item_id, quantity=Decimal(2), source="warehouse",
        target_department=DepartmentEnum.WAREHOUSE, source_department=None,
        reason_category="test", reason_memo="bulk counted", client_request_id=None,
        management_category="DEFECT",
    ) for item in items]

    with pytest.raises(InventoryConflict) as error:
        defect_actions.quarantine_inventory_bulk(db_session, lines=lines, actor=actor)

    assert error.value.code == "STOCKTAKE_CELL_LOCKED"
    db_session.expire_all()
    for item in items:
        inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
        assert inventory.warehouse_qty == Decimal(5)
    assert db_session.query(DefectStockPool).count() == 0
    assert db_session.query(DefectStockMovement).count() == 0


def test_pool_internal_use_submit_prepares_all_approval_groups_before_reserving(
    db_session, make_item, make_location,
) -> None:
    warehouse_item = make_item(
        name="POOL internal use warehouse", process_type_code="AF", warehouse_qty=Decimal(5),
    )
    department_item = make_item(
        name="POOL internal use department", process_type_code="HF", warehouse_qty=Decimal(0),
    )
    make_location(
        department_item.item_id, department=DepartmentEnum.HIGH_VOLTAGE,
        quantity=Decimal(5),
    )
    requester = _make_requester(
        db_session, department=DepartmentEnum.AS, warehouse_role="none",
    )
    _pool_round(db_session, active=False)
    payload = _internal_use_payload(requester, [warehouse_item, department_item])
    department_line = payload.bundles[1].lines[0]
    department_line.from_bucket = "production"
    department_line.from_department = DepartmentEnum.HIGH_VOLTAGE.value

    submitted = io_actions.submit(db_session, payload)

    requests = db_session.query(StockRequest).filter_by(
        operation_batch_id=submitted["batch"]["batch_id"],
    ).all()
    assert len(requests) == 2
    assert {request.status for request in requests} == {StockRequestStatusEnum.RESERVED}
    assert {request.requires_warehouse_approval for request in requests} == {True, False}
    assert db_session.query(Inventory).filter_by(item_id=warehouse_item.item_id).one().pending_quantity == 1
    assert db_session.query(InventoryLocation).filter_by(
        item_id=department_item.item_id, department=DepartmentEnum.HIGH_VOLTAGE,
    ).one().pending_quantity == 1


def test_pool_rework_approval_prepares_parent_and_child_before_releasing_reservation(
    client, db_session, make_item, make_bom,
) -> None:
    parent = make_item(name="POOL rework parent", process_type_code="PF", warehouse_qty=Decimal(0))
    child = make_item(name="POOL rework child", process_type_code="VR", warehouse_qty=Decimal(0))
    make_bom(parent.item_id, child.item_id, Decimal(1))
    requester = _actor(db_session, code="ST-WF-REWORK-REQ")
    approver = _actor(db_session, code="ST-WF-REWORK-APP", warehouse_role="primary")
    round_id = _pool_round(db_session)
    cutover = _pool_cutover(db_session, approver)
    pool = DefectStockPool(
        item_id=parent.item_id, scope_key="warehouse", category="DEFECT",
        quantity=3, cutover_id=cutover.cutover_id,
    )
    db_session.add_all([
        pool,
        InventoryLocation(
            item_id=parent.item_id, department=DepartmentEnum.WAREHOUSE,
            status=LocationStatusEnum.DEFECTIVE, quantity=3,
        ),
    ])
    db_session.commit()

    request = stock_requests.create_request(
        db_session, requester=requester,
        request_type=StockRequestTypeEnum.DEFECT_DISASSEMBLE,
        reference_no=None, reason_category="기타", reason_memo="rework",
        notes=json.dumps({"child_decisions": [{
            "item_id": str(child.item_id), "qty": "3", "normal_qty": "3",
            "defective_qty": "0", "scrap_qty": "0",
        }]}),
        lines_input=[stock_requests.LineInput(
            pool_id=pool.pool_id, item_id=parent.item_id, quantity=Decimal(quantity),
            from_bucket=RequestBucketEnum.DEFECTIVE,
            from_department=DepartmentEnum.WAREHOUSE,
            to_bucket=RequestBucketEnum.NONE, to_department=None,
        ) for quantity in (1, 2)],
        defer_execution=True,
    )
    assert request.status == StockRequestStatusEnum.RESERVED
    # Older deferred requests can await approval even though new defect work executes immediately.
    request.requires_warehouse_approval = True
    db_session.commit()
    request_id = str(request.request_id)
    assert db_session.get(DefectStockPool, pool.pool_id).pending_quantity == 3
    _count_cell(db_session, child.item_id, round_id, "vacuum")

    blocked = client.post(f"/api/stock-requests/{request_id}/approve", json={
        "actor_employee_id": str(approver.employee_id), "pin": "0000",
    })

    assert blocked.status_code == 423, blocked.text
    assert blocked.json()["detail"]["code"] == "STOCKTAKE_CELL_LOCKED"
    db_session.expire_all()
    assert db_session.query(StockRequest).filter_by(request_id=request_id).one().status == StockRequestStatusEnum.RESERVED
    assert db_session.get(DefectStockPool, pool.pool_id).pending_quantity == 3
    assert db_session.get(DefectStockPool, pool.pool_id).quantity == 3
    assert db_session.query(InventoryLocation).filter_by(item_id=child.item_id).count() == 0

    gate = db_session.get(StocktakeGate, (child.item_id, "vacuum"))
    gate.active_count_id = None
    db_session.commit()
    approved = client.post(f"/api/stock-requests/{request_id}/approve", json={
        "actor_employee_id": str(approver.employee_id), "pin": "0000",
    })
    assert approved.status_code == 200, approved.text
    db_session.expire_all()
    assert db_session.query(StockRequest).filter_by(request_id=request_id).one().status == StockRequestStatusEnum.COMPLETED
    assert db_session.get(DefectStockPool, pool.pool_id).quantity == 0
    assert db_session.query(InventoryLocation).filter_by(
        item_id=child.item_id, status=LocationStatusEnum.PRODUCTION,
    ).one().quantity == 3


def test_counted_shipping_allocation_repair_records_pure_release_revision(
    db_session, make_item,
) -> None:
    item = make_item(name="Repair counted shipping allocation", process_type_code="PF")
    actor = _actor(db_session, code="ST-WF-REPAIR", warehouse_role="primary")
    round_id = _pool_round(db_session)
    _pool_cutover(db_session, actor)
    request = ShippingRequest(base_pf_item_id=item.item_id, request_quantity=1)
    original = InventoryOperation(
        operation_id=uuid.uuid4(),
        kind=InventoryOperationKindEnum.BUSINESS, domain="shipping", action="prepare",
        status=InventoryOperationStatusEnum.COMMITTED, display_label="준비",
        actor_name="작업자", department=DepartmentEnum.SHIPPING.value,
        effective_at=datetime(2026, 8, 25, 9), contract_version=1,
        created_at=datetime(2026, 8, 25, 9),
    )
    cancellation = InventoryOperation(
        operation_id=uuid.uuid4(),
        kind=InventoryOperationKindEnum.CANCELLATION, domain="shipping",
        action="prepare_cancel", status=InventoryOperationStatusEnum.COMMITTED,
        display_label="준비 취소", actor_name="작업자",
        department=DepartmentEnum.SHIPPING.value,
        effective_at=datetime(2026, 8, 25, 9, 1), contract_version=1,
        created_at=datetime(2026, 8, 25, 9, 1),
        reverses_operation_id=original.operation_id,
    )
    db_session.add_all([request, original, cancellation])
    db_session.flush()
    allocation = ShippingAllocation(
        request_id=request.request_id, item_id=item.item_id, quantity=1,
        department=DepartmentEnum.SHIPPING.value, status="RESERVED",
    )
    db_session.add(allocation)
    db_session.flush()
    original_effect = InventoryOperationEffect(
        operation_id=original.operation_id,
        effect_kind=InventoryOperationEffectKindEnum.ALLOCATION,
        subject_type="ShippingAllocation", subject_id=str(allocation.allocation_id),
        role="RESERVE", before_state={"status": "RELEASED"},
        after_state={"status": "RESERVED"},
    )
    db_session.add(original_effect)
    db_session.flush()
    db_session.add(InventoryOperationEffect(
        operation_id=cancellation.operation_id,
        effect_kind=InventoryOperationEffectKindEnum.ALLOCATION,
        subject_type="ShippingAllocation", subject_id=str(allocation.allocation_id),
        role="RELEASE", before_state={"status": "RESERVED"},
        after_state={"status": "RELEASED"},
        reverses_effect_id=original_effect.effect_id,
    ))
    db_session.commit()
    _count_cell(db_session, item.item_id, round_id, "shipping")
    issue = next(issue for issue in diagnose_inventory_integrity(db_session).issues
                 if issue.category == "SHIPPING_ALLOCATION_MISMATCH")

    report = repair_inventory_integrity_issue(
        db_session, problem_id=issue.problem_id, approved_by="관리자", apply=True,
    )
    db_session.commit()

    assert report.applied is True
    db_session.refresh(allocation)
    gate = db_session.get(StocktakeGate, (item.item_id, "shipping"))
    assert allocation.status == "RELEASED"
    assert gate.quantity_revision == 0
    assert gate.reservation_revision == 1
    assert db_session.get(StocktakeProgress, (round_id, "shipping")).progress_revision == 1


def test_pool_io_declares_all_items_before_live_route_normalization(
    db_session, make_item, make_location, monkeypatch,
) -> None:
    warehouse_item = make_item(
        name="POOL route warehouse", process_type_code="AF", warehouse_qty=Decimal(5),
    )
    department_item = make_item(
        name="POOL route department", process_type_code="HF", warehouse_qty=Decimal(0),
    )
    make_location(
        department_item.item_id, department=DepartmentEnum.HIGH_VOLTAGE,
        quantity=Decimal(5),
    )
    requester = _make_requester(
        db_session, department=DepartmentEnum.AS, warehouse_role="none",
    )
    _pool_round(db_session, active=False)
    payload = _internal_use_payload(requester, [warehouse_item, department_item])
    department_line = payload.bundles[1].lines[0]
    department_line.from_bucket = "production"
    department_line.from_department = DepartmentEnum.HIGH_VOLTAGE.value
    original_token_refresh = io_dispatch.normalize_automatic_routes_with_bom_token_refresh
    original_final_normalize = io_dispatch._normalize_automatic_batch_routes
    observed: list[tuple[str, set[uuid.UUID], set[uuid.UUID]]] = []

    def snapshot(db, bundles, stage: str) -> None:
        # The effective planner normalizes transient clones without mutating live rows.
        if not any(inspect(bundle).persistent for bundle in bundles):
            return
        state = db.info.get(stocktake_guard.STATE_KEY) or {}
        included = {line.item_id for bundle in bundles
                    for line in bundle.lines if line.included}
        observed.append((stage, included, set(state.get("items") or ())))

    def inspect_token_refresh(db, *, bundles, **kwargs):
        snapshot(db, bundles, "token_refresh")
        return original_token_refresh(db, bundles=bundles, **kwargs)

    def inspect_final_normalize(db, batch, *, custom_bundle_ids=None) -> None:
        snapshot(db, batch.bundles, "final_normalize")
        original_final_normalize(db, batch, custom_bundle_ids=custom_bundle_ids)

    monkeypatch.setattr(
        io_dispatch, "normalize_automatic_routes_with_bom_token_refresh",
        inspect_token_refresh,
    )
    monkeypatch.setattr(io_dispatch, "_normalize_automatic_batch_routes", inspect_final_normalize)
    submitted = io_actions.submit(db_session, payload)

    assert [stage for stage, _included, _prepared in observed] == [
        "token_refresh", "final_normalize",
    ]
    for _stage, included, prepared in observed:
        assert included == {warehouse_item.item_id, department_item.item_id}
        assert included.issubset(prepared)
    requests = db_session.query(StockRequest).filter_by(
        operation_batch_id=submitted["batch"]["batch_id"],
    ).all()
    assert len(requests) == 2
    assert {request.status for request in requests} == {StockRequestStatusEnum.RESERVED}
    warehouse_inventory = db_session.query(Inventory).filter_by(item_id=warehouse_item.item_id).one()
    department_location = db_session.query(InventoryLocation).filter_by(
        item_id=department_item.item_id, department=DepartmentEnum.HIGH_VOLTAGE,
    ).one()
    assert warehouse_inventory.warehouse_qty == 5
    assert warehouse_inventory.pending_quantity == 1
    assert department_location.quantity == 5
    assert department_location.pending_quantity == 1
    assert db_session.query(TransactionLog).filter(
        TransactionLog.item_id.in_([warehouse_item.item_id, department_item.item_id]),
    ).count() == 0
