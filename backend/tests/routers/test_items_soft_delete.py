"""CP4 IC-11 품목 소프트 삭제와 active command 계약."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
import uuid

import pytest

from app.models import (
    AdminAuditLog,
    BOM,
    DepartmentEnum,
    DefectQuarantineRecord,
    Employee,
    EmployeeLevelEnum,
    HandoverDoc,
    HandoverLine,
    HandoverStatusEnum,
    Inventory,
    InventoryLocation,
    IoBatch,
    IoBundle,
    IoLine,
    Item,
    LocationStatusEnum,
    RequestBucketEnum,
    ShippingAllocation,
    ShippingFinalizationModeEnum,
    ShippingRequest,
    ShippingRequestBomLine,
    ShippingRequestChecklistLine,
    ShippingRequestCompanionLine,
    ShippingRequestStatusEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    TransactionLog,
    TransactionTypeEnum,
    WarehouseAngle,
    WarehouseBox,
    WarehouseBoxItem,
    WarehouseSpecialZone,
    WarehouseSpecialZoneItem,
    WarehouseUnplacedItem,
)
from app.repositories import item_repository
from app.routers import items as items_router
from app.services.pin_auth import DEFAULT_PIN_HASH


ADMIN_HEADERS = {"X-Admin-Pin": "0000"}


def _employee(db_session, suffix: str = "ITEM-DELETE") -> Employee:
    employee = Employee(
        employee_code=f"CP4-{suffix}-{uuid.uuid4().hex[:8]}",
        name=f"CP4 {suffix}",
        role="조립/staff",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        warehouse_role="none",
        department_role="none",
        display_order=0,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )
    db_session.add(employee)
    db_session.flush()
    return employee


def _io_reference(
    db_session,
    *,
    employee: Employee,
    target: Item,
    source: Item,
    status: str,
    line_only: bool = False,
) -> IoBatch:
    batch = IoBatch(
        work_type="receive",
        sub_type="receive_supplier",
        status=status,
        requester_employee_id=employee.employee_id,
        requester_name=employee.name,
        requester_department=employee.department,
    )
    db_session.add(batch)
    db_session.flush()
    bundle = IoBundle(
        batch_id=batch.batch_id,
        source_kind="direct_item",
        source_item_id=source.item_id if line_only else target.item_id,
        title_snapshot="CP4 active item reference",
        quantity=Decimal("1"),
        expanded_level=1,
    )
    db_session.add(bundle)
    db_session.flush()
    if line_only:
        db_session.add(
            IoLine(
                bundle_id=bundle.bundle_id,
                item_id=target.item_id,
                item_name_snapshot=target.item_name,
                mes_code_snapshot=target.mes_code,
                unit=target.unit,
                direction="in",
                from_bucket="none",
                to_bucket="warehouse",
                quantity=Decimal("1"),
                origin="direct",
            )
        )
        db_session.flush()
    return batch


def _stock_reference(
    db_session,
    *,
    employee: Employee,
    target: Item,
    status: StockRequestStatusEnum,
) -> StockRequest:
    request = StockRequest(
        requester_employee_id=employee.employee_id,
        requester_name=employee.name,
        requester_department=employee.department,
        request_type=StockRequestTypeEnum.RAW_RECEIVE,
        status=status,
        requires_warehouse_approval=False,
        requires_department_approval=False,
    )
    db_session.add(request)
    db_session.flush()
    db_session.add(
        StockRequestLine(
            request_id=request.request_id,
            item_id=target.item_id,
            item_name_snapshot=target.item_name,
            mes_code_snapshot=target.mes_code,
            quantity=Decimal("1"),
            from_bucket=RequestBucketEnum.NONE,
            to_bucket=RequestBucketEnum.WAREHOUSE,
            status=status,
        )
    )
    db_session.flush()
    return request


def _shipping_reference(
    db_session,
    *,
    target: Item,
    status: ShippingRequestStatusEnum,
) -> ShippingRequest:
    request = ShippingRequest(
        status=status,
        base_pf_item_id=target.item_id,
        finalization_mode=ShippingFinalizationModeEnum.KEEP_BASE,
        request_quantity=1,
    )
    db_session.add(request)
    db_session.flush()
    return request


def _assert_item_in_use(response, *, total: int) -> list[dict]:
    assert response.status_code == 409, response.text
    detail = response.json()["detail"]
    assert detail["code"] == "ITEM_IN_USE"
    assert detail["extra"]["total"] == total
    return detail["extra"]["refs"]


def test_item_repository_explicitly_splits_active_and_deleted_lookup(
    db_session,
    make_item,
) -> None:
    item = make_item(name="repository split")

    assert item_repository.get_active(db_session, item.item_id) is item
    assert item_repository.get_including_deleted(db_session, item.item_id) is item

    item.deleted_at = datetime(2026, 8, 28)
    db_session.flush()

    assert item_repository.get_active(db_session, item.item_id) is None
    assert item_repository.get_including_deleted(db_session, item.item_id) is item


def test_soft_delete_reports_every_active_reference_kind_and_status(
    client,
    db_session,
    make_item,
) -> None:
    target = make_item(name="active reference target", process_type_code="PF")
    source = make_item(name="active reference source", process_type_code="PA")
    other_parent = make_item(name="other parent", process_type_code="PF")
    employee = _employee(db_session)

    for status in ("draft", "submitted", "reserved", "partially_completed"):
        _io_reference(
            db_session,
            employee=employee,
            target=target,
            source=source,
            status=status,
        )
    _io_reference(
        db_session,
        employee=employee,
        target=target,
        source=source,
        status="draft",
        line_only=True,
    )

    for status in (
        StockRequestStatusEnum.DRAFT,
        StockRequestStatusEnum.SUBMITTED,
        StockRequestStatusEnum.RESERVED,
    ):
        _stock_reference(
            db_session,
            employee=employee,
            target=target,
            status=status,
        )

    for status in (HandoverStatusEnum.DRAFT, HandoverStatusEnum.SUBMITTED):
        handover = HandoverDoc(
            handover_code=f"CP4-HO-{status.value}-{uuid.uuid4().hex[:8]}",
            status=status,
            author_employee_id=employee.employee_id,
            author_name=employee.name,
            from_department=DepartmentEnum.TUBE.value,
            to_department=DepartmentEnum.ASSEMBLY.value,
            title=f"CP4 {status.value}",
        )
        db_session.add(handover)
        db_session.flush()
        db_session.add(
            HandoverLine(
                handover_id=handover.handover_id,
                item_id=target.item_id,
                item_name_snapshot=target.item_name,
                mes_code_snapshot=target.mes_code,
                quantity=1,
            )
        )

    db_session.add(
        DefectQuarantineRecord(
            item_id=target.item_id,
            department=DepartmentEnum.ASSEMBLY.value,
            original_quantity=2,
            remaining_quantity=2,
            quarantined_by_employee_id=employee.employee_id,
            quarantined_by_name=employee.name,
        )
    )

    shipping_requests = [
        _shipping_reference(db_session, target=target, status=status)
        for status in (
            ShippingRequestStatusEnum.PREPARING,
            ShippingRequestStatusEnum.PREPARED,
            ShippingRequestStatusEnum.PICKED_UP,
        )
    ]
    detailed_shipping = shipping_requests[0]
    detailed_shipping.final_pa_item_id = target.item_id
    detailed_shipping.final_pf_item_id = target.item_id
    detailed_shipping.reuse_pf_item_id = target.item_id
    db_session.add_all(
        (
            ShippingRequestBomLine(
                request_id=detailed_shipping.request_id,
                parent_stage="PA",
                child_item_id=target.item_id,
                quantity=1,
                unit="EA",
                included=True,
                origin="CUSTOM",
                sort_order=0,
            ),
            ShippingRequestCompanionLine(
                request_id=detailed_shipping.request_id,
                item_id=target.item_id,
                quantity=1,
                unit="EA",
                sort_order=0,
            ),
            ShippingAllocation(
                request_id=detailed_shipping.request_id,
                item_id=target.item_id,
                quantity=1,
                unit="EA",
                status="RESERVED",
            ),
            ShippingRequestChecklistLine(
                request_id=detailed_shipping.request_id,
                item_id=target.item_id,
                label_snapshot=target.item_name,
                quantity=1,
                checked=False,
                sort_order=0,
            ),
        )
    )
    parent_bom = BOM(
        parent_item_id=target.item_id,
        child_item_id=source.item_id,
        quantity=1,
        unit="EA",
    )
    child_bom = BOM(
        parent_item_id=other_parent.item_id,
        child_item_id=target.item_id,
        quantity=1,
        unit="EA",
    )
    db_session.add_all((parent_bom, child_bom))
    db_session.commit()

    response = client.patch(
        f"/api/items/{target.item_id}/soft-delete",
        headers=ADMIN_HEADERS,
    )

    refs = _assert_item_in_use(response, total=23)
    assert {ref["kind"] for ref in refs} == {
        "bom_child",
        "bom_parent",
        "defect_quarantine",
        "handover",
        "io_batch",
        "shipping_allocation",
        "shipping_base",
        "shipping_bom",
        "shipping_checklist",
        "shipping_companion",
        "shipping_final_pa",
        "shipping_final_pf",
        "shipping_reuse",
        "stock_request",
    }
    assert {ref["status"] for ref in refs if ref["kind"] == "io_batch"} == {
        "draft",
        "submitted",
        "reserved",
        "partially_completed",
    }
    assert {ref["status"] for ref in refs if ref["kind"] == "stock_request"} == {
        "draft",
        "submitted",
        "reserved",
    }
    assert {ref["status"] for ref in refs if ref["kind"] == "handover"} == {
        "draft",
        "submitted",
    }
    assert {ref["status"] for ref in refs if ref["kind"] == "shipping_base"} == {
        "PREPARING",
        "PREPARED",
        "PICKED_UP",
    }
    assert target.deleted_at is None
    assert db_session.query(BOM).filter(BOM.bom_id.in_((parent_bom.bom_id, child_bom.bom_id))).count() == 2
    assert db_session.query(AdminAuditLog).filter(AdminAuditLog.action == "item.delete").count() == 0


def test_soft_delete_returns_total_but_caps_refs_at_fifty_without_deleting_bom(
    client,
    db_session,
    make_item,
) -> None:
    target = make_item(name="reference cap target")
    bom_ids: list[uuid.UUID] = []
    for index in range(55):
        child = make_item(name=f"reference child {index}")
        row = BOM(
            parent_item_id=target.item_id,
            child_item_id=child.item_id,
            quantity=1,
            unit="EA",
        )
        db_session.add(row)
        db_session.flush()
        bom_ids.append(row.bom_id)
    db_session.commit()

    response = client.patch(
        f"/api/items/{target.item_id}/soft-delete",
        headers=ADMIN_HEADERS,
    )

    refs = _assert_item_in_use(response, total=55)
    assert len(refs) == 50
    assert {ref["kind"] for ref in refs} == {"bom_parent"}
    assert refs == sorted(refs, key=lambda ref: (ref["kind"], ref["id"], ref["status"]))
    assert target.deleted_at is None
    assert db_session.query(BOM).filter(BOM.bom_id.in_(bom_ids)).count() == 55


def test_soft_delete_rejects_item_with_positive_box_placement(
    client,
    db_session,
    make_item,
) -> None:
    target = make_item(name="placed delete target", warehouse_qty=Decimal("1"))
    angle = WarehouseAngle(
        label="placed-delete",
        rows=1,
        layers=1,
        jaris_per_cell=1,
        display_order=1,
    )
    db_session.add(angle)
    db_session.flush()
    box = WarehouseBox(
        angle_id=angle.id,
        row_no=1,
        layer_no=1,
        jari_index=0,
        size="SMALL",
        stack_order=1,
    )
    db_session.add(box)
    db_session.flush()
    db_session.add(
        WarehouseBoxItem(box_id=box.box_id, item_id=target.item_id, quantity=1)
    )
    db_session.query(WarehouseUnplacedItem).filter_by(
        item_id=target.item_id
    ).one().quantity = 0
    db_session.commit()

    response = client.patch(
        f"/api/items/{target.item_id}/soft-delete",
        headers=ADMIN_HEADERS,
    )

    refs = _assert_item_in_use(response, total=1)
    assert refs == [
        {"kind": "warehouse_box", "id": str(box.box_id), "status": "active"}
    ]


def test_soft_delete_rejects_corrupt_positive_inactive_zone_placement(
    client,
    db_session,
    make_item,
) -> None:
    target = make_item(name="inactive zone delete target", warehouse_qty=Decimal("1"))
    zone = WarehouseSpecialZone(
        label="inactive-delete",
        zone_type="pallet",
        display_order=1,
        is_active=False,
    )
    db_session.add(zone)
    db_session.flush()
    db_session.add(
        WarehouseSpecialZoneItem(
            zone_id=zone.id,
            item_id=target.item_id,
            quantity=1,
        )
    )
    db_session.query(WarehouseUnplacedItem).filter_by(
        item_id=target.item_id
    ).one().quantity = 0
    db_session.commit()

    response = client.patch(
        f"/api/items/{target.item_id}/soft-delete",
        headers=ADMIN_HEADERS,
    )

    refs = _assert_item_in_use(response, total=1)
    assert refs == [
        {"kind": "warehouse_zone", "id": str(zone.id), "status": "inactive"}
    ]


def test_delete_with_only_closed_references_preserves_history_and_rejects_new_commands(
    client,
    db_session,
    make_item,
) -> None:
    target = make_item(
        name="deleted command target",
        process_type_code="PF",
        warehouse_qty=Decimal("10"),
    )
    source = make_item(name="closed source", process_type_code="PA")
    active_parent = make_item(name="active BOM parent", process_type_code="PF")
    employee = _employee(db_session, "CLOSED")
    _io_reference(
        db_session,
        employee=employee,
        target=target,
        source=source,
        status="completed",
    )
    _stock_reference(
        db_session,
        employee=employee,
        target=target,
        status=StockRequestStatusEnum.COMPLETED,
    )
    _shipping_reference(
        db_session,
        target=target,
        status=ShippingRequestStatusEnum.CANCELLED,
    )
    received_handover = HandoverDoc(
        handover_code=f"CP4-HO-CLOSED-{uuid.uuid4().hex[:8]}",
        status=HandoverStatusEnum.RECEIVED,
        author_employee_id=employee.employee_id,
        author_name=employee.name,
        from_department=DepartmentEnum.TUBE.value,
        to_department=DepartmentEnum.ASSEMBLY.value,
        title="CP4 received",
    )
    db_session.add(received_handover)
    db_session.flush()
    db_session.add(
        HandoverLine(
            handover_id=received_handover.handover_id,
            item_id=target.item_id,
            item_name_snapshot=target.item_name,
            mes_code_snapshot=target.mes_code,
            quantity=1,
        )
    )
    db_session.add(
        DefectQuarantineRecord(
            item_id=target.item_id,
            department=DepartmentEnum.ASSEMBLY.value,
            original_quantity=1,
            remaining_quantity=0,
            quarantined_by_employee_id=employee.employee_id,
            quarantined_by_name=employee.name,
        )
    )
    log = TransactionLog(
        item_id=target.item_id,
        transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=Decimal("10"),
        quantity_before=Decimal("0"),
        quantity_after=Decimal("10"),
        warehouse_qty_before=Decimal("0"),
        warehouse_qty_after=Decimal("10"),
        inventory_effect=[{"scope": "warehouse", "delta": 10}],
    )
    db_session.add(log)
    db_session.flush()

    deleted = client.patch(
        f"/api/items/{target.item_id}/soft-delete",
        headers=ADMIN_HEADERS,
    )

    assert deleted.status_code == 200, deleted.text
    db_session.expire_all()
    persisted = db_session.get(Item, target.item_id)
    assert persisted is not None and persisted.deleted_at is not None
    assert db_session.query(TransactionLog).filter(TransactionLog.log_id == log.log_id).count() == 1

    item_detail = client.get(f"/api/items/{target.item_id}")
    assert item_detail.status_code == 200, item_detail.text
    assert item_detail.json()["deleted_at"] is not None
    history = client.get(
        "/api/inventory/transactions",
        params={"item_id": str(target.item_id)},
    )
    assert history.status_code == 200, history.text
    assert [row["log_id"] for row in history.json()] == [str(log.log_id)]

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(employee.employee_id),
            "work_type": "receive",
            "sub_type": "receive_supplier",
            "targets": [
                {
                    "source_kind": "direct_item",
                    "item_id": str(target.item_id),
                    "quantity": 1,
                }
            ],
        },
    )
    assert preview.status_code == 422, preview.text

    bundle_id = uuid.uuid4()
    line_id = uuid.uuid4()
    submit = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(employee.employee_id),
            "work_type": "receive",
            "sub_type": "receive_supplier",
            "client_request_id": f"deleted-io-{uuid.uuid4()}",
            "bundles": [
                {
                    "bundle_id": str(bundle_id),
                    "source_kind": "direct_item",
                    "source_item_id": str(target.item_id),
                    "title": target.item_name,
                    "quantity": 1,
                    "expanded_level": 1,
                    "lines": [
                        {
                            "line_id": str(line_id),
                            "item_id": str(target.item_id),
                            "item_name": target.item_name,
                            "unit": "EA",
                            "direction": "in",
                            "from_bucket": "none",
                            "to_bucket": "warehouse",
                            "quantity": 1,
                            "included": True,
                            "selected": True,
                            "origin": "direct",
                        }
                    ],
                }
            ],
        },
    )
    assert submit.status_code == 422, submit.text

    stock = client.post(
        "/api/stock-requests",
        json={
            "requester_employee_id": str(employee.employee_id),
            "request_type": "warehouse_to_dept",
            "client_request_id": f"deleted-stock-{uuid.uuid4()}",
            "lines": [
                {
                    "item_id": str(target.item_id),
                    "quantity": 1,
                    "from_bucket": "warehouse",
                    "to_bucket": "production",
                    "to_department": DepartmentEnum.ASSEMBLY.value,
                }
            ],
        },
    )
    assert stock.status_code == 422, stock.text

    production_preview = client.get(
        f"/api/production/bom-check/{target.item_id}",
        params={"quantity": 1},
    )
    assert production_preview.status_code == 404, production_preview.text

    shipping_preview = client.post(
        "/api/shipping/bom-match",
        json={"base_pf_item_id": str(target.item_id), "bom_lines": []},
    )
    assert shipping_preview.status_code == 422, shipping_preview.text

    bom_create = client.post(
        "/api/bom",
        headers=ADMIN_HEADERS,
        json={
            "parent_item_id": str(active_parent.item_id),
            "child_item_id": str(target.item_id),
            "quantity": 1,
            "unit": "EA",
        },
    )
    assert bom_create.status_code == 404, bom_create.text

    bom_tree = client.get(f"/api/bom/{target.item_id}/tree")
    assert bom_tree.status_code == 404, bom_tree.text

    db_session.expire_all()
    inventory = db_session.query(Inventory).filter(Inventory.item_id == target.item_id).one()
    assert inventory.warehouse_qty == Decimal("10")
    assert db_session.query(IoBatch).count() == 1
    assert db_session.query(StockRequest).count() == 1
    assert db_session.query(ShippingRequest).count() == 1
    assert db_session.query(TransactionLog).count() == 1
    assert db_session.query(BOM).count() == 0

    restored = client.patch(
        f"/api/items/{target.item_id}/restore",
        headers=ADMIN_HEADERS,
    )
    assert restored.status_code == 200, restored.text
    assert restored.json()["deleted_at"] is None
    assert db_session.query(TransactionLog).filter(TransactionLog.log_id == log.log_id).count() == 1


def test_restore_deleted_item_recreates_missing_zero_inventory_and_unplaced(
    client,
    db_session,
    make_item,
) -> None:
    target = make_item(name="restore missing ledger", warehouse_qty=Decimal("0"))
    target.deleted_at = datetime(2026, 8, 31)
    inventory = db_session.query(Inventory).filter_by(item_id=target.item_id).one()
    unplaced = db_session.query(WarehouseUnplacedItem).filter_by(
        item_id=target.item_id
    ).one()
    db_session.delete(unplaced)
    db_session.delete(inventory)
    db_session.commit()

    restored = client.patch(
        f"/api/items/{target.item_id}/restore",
        headers=ADMIN_HEADERS,
    )

    assert restored.status_code == 200, restored.text
    assert restored.json()["deleted_at"] is None
    recreated_inventory = db_session.query(Inventory).filter_by(
        item_id=target.item_id
    ).one()
    recreated_unplaced = db_session.query(WarehouseUnplacedItem).filter_by(
        item_id=target.item_id
    ).one()
    assert int(recreated_inventory.quantity) == 0
    assert int(recreated_inventory.warehouse_qty) == 0
    assert int(recreated_unplaced.quantity) == 0


def test_restore_deleted_item_recreates_total_from_existing_locations(
    client,
    db_session,
    make_item,
) -> None:
    target = make_item(name="restore locations", warehouse_qty=Decimal("0"))
    target.deleted_at = datetime(2026, 8, 31)
    db_session.add(
        InventoryLocation(
            item_id=target.item_id,
            department=DepartmentEnum.ASSEMBLY,
            status=LocationStatusEnum.PRODUCTION,
            quantity=7,
            pending_quantity=2,
        )
    )
    inventory = db_session.query(Inventory).filter_by(item_id=target.item_id).one()
    unplaced = db_session.query(WarehouseUnplacedItem).filter_by(
        item_id=target.item_id
    ).one()
    db_session.delete(unplaced)
    db_session.delete(inventory)
    db_session.commit()

    restored = client.patch(
        f"/api/items/{target.item_id}/restore",
        headers=ADMIN_HEADERS,
    )

    assert restored.status_code == 200, restored.text
    recreated_inventory = db_session.query(Inventory).filter_by(
        item_id=target.item_id
    ).one()
    recreated_unplaced = db_session.query(WarehouseUnplacedItem).filter_by(
        item_id=target.item_id
    ).one()
    assert int(recreated_inventory.quantity) == 7
    assert int(recreated_inventory.warehouse_qty) == 0
    assert int(recreated_inventory.pending_quantity) == 0
    assert int(recreated_unplaced.quantity) == 0


def test_revert_cancelled_stock_request_does_not_reactivate_deleted_item_batch(
    client,
    db_session,
    make_item,
) -> None:
    target = make_item(name="deleted revert target")
    source = make_item(name="deleted revert source")
    employee = _employee(db_session, "REVERT")
    batch = _io_reference(
        db_session,
        employee=employee,
        target=target,
        source=source,
        status="cancelled",
    )
    request = _stock_reference(
        db_session,
        employee=employee,
        target=target,
        status=StockRequestStatusEnum.CANCELLED,
    )
    request.operation_batch_id = batch.batch_id
    batch.stock_request_id = request.request_id
    db_session.commit()

    deleted = client.patch(
        f"/api/items/{target.item_id}/soft-delete",
        headers=ADMIN_HEADERS,
    )
    assert deleted.status_code == 200, deleted.text

    reverted = client.post(
        f"/api/stock-requests/{request.request_id}/revert-to-draft",
        json={
            "actor_employee_id": str(employee.employee_id),
            "pin": "0000",
        },
    )

    assert reverted.status_code == 422, reverted.text
    assert reverted.json()["detail"]["code"] == "UNPROCESSABLE"
    db_session.expire_all()
    assert db_session.get(IoBatch, batch.batch_id).status == "cancelled"
    assert db_session.get(StockRequest, request.request_id).status == StockRequestStatusEnum.CANCELLED


def test_soft_delete_rolls_back_item_when_audit_insert_fails(
    client,
    db_session,
    make_item,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    item = make_item(name="audit rollback target")
    db_session.commit()

    def fail_audit(*_args, **_kwargs) -> None:
        raise RuntimeError("forced item delete audit failure")

    monkeypatch.setattr(items_router.audit, "record", fail_audit)

    with pytest.raises(RuntimeError, match="forced item delete audit failure"):
        client.patch(
            f"/api/items/{item.item_id}/soft-delete",
            headers=ADMIN_HEADERS,
        )

    db_session.expire_all()
    persisted = db_session.get(Item, item.item_id)
    assert persisted is not None and persisted.deleted_at is None
    assert db_session.query(AdminAuditLog).filter(AdminAuditLog.action == "item.delete").count() == 0
