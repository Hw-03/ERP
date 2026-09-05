"""IC-17 inventory-integrity/v1 공통 판정 계약."""

from __future__ import annotations

import importlib
import uuid
from datetime import datetime
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import text

from app.models import (
    BoxSizeEnum,
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    InventoryOperation,
    InventoryOperationEffect,
    InventoryOperationEffectKindEnum,
    InventoryOperationKindEnum,
    InventoryOperationRoleEnum,
    InventoryOperationStatusEnum,
    Item,
    LocationStatusEnum,
    RequestBucketEnum,
    ShippingAllocation,
    ShippingRequest,
    ShippingRequestStatusEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    SystemSetting,
    TransactionLog,
    TransactionTypeEnum,
    WarehouseAngle,
    WarehouseBox,
    WarehouseBoxItem,
    WarehouseSpecialZone,
    WarehouseSpecialZoneItem,
    WarehouseUnplacedItem,
)
from app.services.inventory_integrity import diagnose_inventory_integrity
from app.services.inventory_operation_activation import (
    InventoryOperationActivationError,
    activate_inventory_operation_contract,
)


EXPECTED_CHECK_IDS = [
    "INVENTORY_TOTAL_MISMATCH",
    "NEGATIVE_INVENTORY",
    "NEGATIVE_LOCATION",
    "PENDING_RESERVATION_MISMATCH",
    "STOCK_REQUEST_STATE_MISMATCH",
    "SHIPPING_ALLOCATION_MISMATCH",
    "WAREHOUSE_PHYSICAL_MISMATCH",
    "ORPHAN_REFERENCE",
    "OPERATION_V2_EFFECT_INVALID",
    "OPERATION_V1_EFFECT_MISSING",
    "DEFECT_STOCK_MISMATCH",
    "PARTIAL_CANCELLATION",
    "WORKFLOW_STATE_RESIDUE",
    "DUPLICATE_REVERSAL",
    "WEEKLY_UNCLASSIFIED_EFFECT",
]


def _check(result, check_id: str):
    return next(check for check in result.checks if check.check_id == check_id)


def _employee(db_session) -> Employee:
    employee = Employee(
        employee_code=f"IC17-{uuid.uuid4().hex[:8]}",
        name="IC-17 검사자",
        role="검사",
        department=DepartmentEnum.ASSEMBLY.value,
        level=EmployeeLevelEnum.STAFF,
        is_active=True,
    )
    db_session.add(employee)
    db_session.flush()
    return employee


def _operation(*, version: int) -> InventoryOperation:
    return InventoryOperation(
        kind=InventoryOperationKindEnum.BUSINESS,
        domain="ic17-test",
        action="verify",
        status=InventoryOperationStatusEnum.COMMITTED,
        display_label="IC-17 계약 검사",
        actor_name="IC-17 검사자",
        effective_at=datetime(2026, 9, 2, 9, 0),
        contract_version=version,
    )


def test_pure_evaluator_keeps_fixed_ids_severity_counts_and_stable_samples() -> None:
    module = importlib.import_module("app.services.inventory_integrity_engine")
    findings = tuple(
        module.IntegrityFinding(
            check_id="OPERATION_V1_EFFECT_MISSING",
            sample={"operation_id": f"legacy-{index}"},
        )
        for index in range(6, 0, -1)
    )

    result = module.evaluate_inventory_integrity(
        module.InventoryIntegritySnapshot(),
        supplemental_findings=findings,
    )

    assert result.contract == "inventory-integrity/v1"
    assert result.status == "warning"
    assert result.blocking_count == 0
    assert result.warning_count == 6
    assert [check.check_id for check in result.checks] == EXPECTED_CHECK_IDS
    warning = _check(result, "OPERATION_V1_EFFECT_MISSING")
    assert warning.severity == "warning"
    assert warning.count == 6
    assert warning.samples == [
        {"operation_id": "legacy-1"},
        {"operation_id": "legacy-2"},
        {"operation_id": "legacy-3"},
        {"operation_id": "legacy-4"},
        {"operation_id": "legacy-5"},
    ]


def test_pure_evaluator_blocks_box_with_missing_angle() -> None:
    module = importlib.import_module("app.services.inventory_integrity_engine")

    result = module.evaluate_inventory_integrity(
        module.InventoryIntegritySnapshot(
            warehouse_boxes=(
                module.WarehouseBoxState(
                    box_id="box-1",
                    angle_id="angle-404",
                    angle_exists=False,
                ),
            ),
        )
    )

    check = _check(result, "ORPHAN_REFERENCE")
    assert result.status == "fail"
    assert check.samples == [
        {
            "reason": "missing_angle",
            "row_id": "box-1",
            "row_type": "warehouse_box",
        }
    ]


def test_diagnose_inventory_integrity_exposes_clean_v1_contract(make_item, db_session) -> None:
    make_item(name="IC-17 정상", warehouse_qty=Decimal("4"))

    result = diagnose_inventory_integrity(db_session)

    assert result.contract == "inventory-integrity/v1"
    assert result.status == "pass"
    assert result.blocking_count == 0
    assert result.warning_count == 0
    assert [check.check_id for check in result.checks] == EXPECTED_CHECK_IDS
    assert all(check.count == 0 for check in result.checks)


def test_location_pending_without_reserved_line_is_blocking(make_item, make_location, db_session) -> None:
    item = make_item(name="위치 예약 불일치")
    location = make_location(
        item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        status=LocationStatusEnum.PRODUCTION,
        quantity=Decimal("5"),
    )
    location.pending_quantity = Decimal("2")
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    inventory.quantity = Decimal("5")
    db_session.flush()

    result = diagnose_inventory_integrity(db_session)

    check = _check(result, "PENDING_RESERVATION_MISMATCH")
    assert result.status == "fail"
    assert check.severity == "blocking"
    assert check.count == 1
    assert check.samples[0]["scope"] == "location"


def test_stock_request_parent_and_line_status_mismatch_is_blocking(make_item, db_session) -> None:
    item = make_item(name="요청 상태 불일치", warehouse_qty=Decimal("3"))
    employee = _employee(db_session)
    request = StockRequest(
        requester_employee_id=employee.employee_id,
        requester_name=employee.name,
        requester_department=employee.department,
        request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
        status=StockRequestStatusEnum.RESERVED,
        requires_warehouse_approval=True,
    )
    db_session.add(request)
    db_session.flush()
    db_session.add(
        StockRequestLine(
            request_id=request.request_id,
            item_id=item.item_id,
            item_name_snapshot=item.item_name,
            quantity=Decimal("1"),
            from_bucket=RequestBucketEnum.WAREHOUSE,
            to_bucket=RequestBucketEnum.PRODUCTION,
            to_department=DepartmentEnum.ASSEMBLY.value,
            status=StockRequestStatusEnum.SUBMITTED,
        )
    )
    db_session.flush()

    result = diagnose_inventory_integrity(db_session)

    check = _check(result, "STOCK_REQUEST_STATE_MISMATCH")
    assert result.status == "fail"
    assert check.count == 1
    assert check.samples[0]["request_id"] == str(request.request_id)


def test_reserved_stock_request_older_than_seven_days_is_blocking(db_session) -> None:
    employee = _employee(db_session)
    request = StockRequest(
        request_code="IC17-STALE",
        requester_employee_id=employee.employee_id,
        requester_name=employee.name,
        requester_department=employee.department,
        request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
        status=StockRequestStatusEnum.RESERVED,
        requires_warehouse_approval=True,
        created_at=datetime(2000, 1, 1),
    )
    db_session.add(request)
    db_session.flush()

    result = diagnose_inventory_integrity(db_session)

    check = _check(result, "STOCK_REQUEST_STATE_MISMATCH")
    assert result.status == "fail"
    assert check.count == 1
    assert check.samples[0] == {
        "created_at": "2000-01-01T00:00:00",
        "reason": "stale_reserved",
        "request_code": "IC17-STALE",
        "request_id": str(request.request_id),
    }


def test_reserved_shipping_allocation_on_preparing_request_is_blocking(
    make_item,
    make_location,
    db_session,
) -> None:
    item = make_item(name="출하 배정 상태 불일치")
    location = make_location(
        item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        status=LocationStatusEnum.PRODUCTION,
        quantity=Decimal("3"),
    )
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    inventory.quantity = location.quantity
    request = ShippingRequest(
        base_pf_item_id=item.item_id,
        request_quantity=Decimal("1"),
        status=ShippingRequestStatusEnum.PREPARING,
    )
    db_session.add(request)
    db_session.flush()
    allocation = ShippingAllocation(
        request_id=request.request_id,
        item_id=item.item_id,
        quantity=Decimal("1"),
        department=DepartmentEnum.ASSEMBLY.value,
        status="RESERVED",
    )
    db_session.add(allocation)
    db_session.flush()

    result = diagnose_inventory_integrity(db_session)

    check = _check(result, "SHIPPING_ALLOCATION_MISMATCH")
    assert result.status == "fail"
    assert check.count == 1
    assert check.samples[0]["allocation_id"] == str(allocation.allocation_id)


def test_reserved_shipping_allocation_cannot_exceed_location_stock(
    make_item,
    make_location,
    db_session,
) -> None:
    item = make_item(name="출하 배정 위치재고 초과")
    location = make_location(
        item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        status=LocationStatusEnum.PRODUCTION,
        quantity=Decimal("3"),
    )
    db_session.query(Inventory).filter_by(item_id=item.item_id).one().quantity = 3
    request = ShippingRequest(
        base_pf_item_id=item.item_id,
        request_quantity=Decimal("4"),
        status=ShippingRequestStatusEnum.PREPARED,
    )
    db_session.add(request)
    db_session.flush()
    db_session.add(
        ShippingAllocation(
            request_id=request.request_id,
            item_id=item.item_id,
            quantity=Decimal("4"),
            department=DepartmentEnum.ASSEMBLY.value,
            status="RESERVED",
        )
    )
    db_session.flush()

    result = diagnose_inventory_integrity(db_session)

    check = _check(result, "SHIPPING_ALLOCATION_MISMATCH")
    assert result.status == "fail"
    assert check.count == 1
    assert check.samples[0]["reason"] == "reserved_exceeds_location_stock"
    assert check.samples[0]["available_quantity"] == 3
    assert location.quantity == 3


@pytest.mark.parametrize("quantity", [0, -1])
def test_non_positive_shipping_allocation_is_blocking(
    make_item,
    make_location,
    db_session,
    quantity: int,
) -> None:
    item = make_item(name=f"출하 배정 비양수 {quantity}")
    location = make_location(
        item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        status=LocationStatusEnum.PRODUCTION,
        quantity=Decimal("3"),
    )
    db_session.query(Inventory).filter_by(item_id=item.item_id).one().quantity = 3
    request = ShippingRequest(
        base_pf_item_id=item.item_id,
        request_quantity=1,
        status=ShippingRequestStatusEnum.PREPARED,
    )
    db_session.add(request)
    db_session.flush()
    allocation = ShippingAllocation(
        request_id=request.request_id,
        item_id=item.item_id,
        quantity=quantity,
        department=DepartmentEnum.ASSEMBLY.value,
        status="RESERVED",
    )
    db_session.add(allocation)
    db_session.flush()

    result = diagnose_inventory_integrity(db_session)

    check = _check(result, "SHIPPING_ALLOCATION_MISMATCH")
    assert result.status == "fail"
    assert any(
        sample.get("allocation_id") == str(allocation.allocation_id)
        and sample.get("reason") == "non_positive_quantity"
        for sample in check.samples
    )
    assert location.quantity == 3


def test_prepared_request_with_only_released_allocation_is_blocking(
    make_item,
    make_location,
    db_session,
) -> None:
    item = make_item(name="출하 활성 배정 누락")
    make_location(
        item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        status=LocationStatusEnum.PRODUCTION,
        quantity=Decimal("3"),
    )
    db_session.query(Inventory).filter_by(item_id=item.item_id).one().quantity = 3
    request = ShippingRequest(
        base_pf_item_id=item.item_id,
        request_quantity=1,
        status=ShippingRequestStatusEnum.PREPARED,
    )
    db_session.add(request)
    db_session.flush()
    db_session.add(
        ShippingAllocation(
            request_id=request.request_id,
            item_id=item.item_id,
            quantity=1,
            department=DepartmentEnum.ASSEMBLY.value,
            status="RELEASED",
        )
    )
    db_session.flush()

    result = diagnose_inventory_integrity(db_session)

    check = _check(result, "SHIPPING_ALLOCATION_MISMATCH")
    assert result.status == "fail"
    assert any(
        sample.get("request_id") == str(request.request_id)
        and sample.get("reason") == "missing_active_allocation"
        for sample in check.samples
    )


def test_prepared_request_allows_released_history_with_active_reservation(
    make_item,
    make_location,
    db_session,
) -> None:
    item = make_item(name="출하 배정 이력 허용")
    make_location(
        item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        status=LocationStatusEnum.PRODUCTION,
        quantity=Decimal("3"),
    )
    db_session.query(Inventory).filter_by(item_id=item.item_id).one().quantity = 3
    request = ShippingRequest(
        base_pf_item_id=item.item_id,
        request_quantity=1,
        status=ShippingRequestStatusEnum.PREPARED,
    )
    db_session.add(request)
    db_session.flush()
    db_session.add_all(
        [
            ShippingAllocation(
                request_id=request.request_id,
                item_id=item.item_id,
                quantity=1,
                department=DepartmentEnum.ASSEMBLY.value,
                status="RELEASED",
            ),
            ShippingAllocation(
                request_id=request.request_id,
                item_id=item.item_id,
                quantity=1,
                department=DepartmentEnum.ASSEMBLY.value,
                status="RESERVED",
            ),
        ]
    )
    db_session.flush()

    result = diagnose_inventory_integrity(db_session)

    assert _check(result, "SHIPPING_ALLOCATION_MISMATCH").count == 0


def test_warehouse_box_zone_unplaced_balance_is_blocking(make_item, db_session) -> None:
    item = make_item(name="B/Z/U 불일치", warehouse_qty=Decimal("5"))
    unplaced = db_session.query(WarehouseUnplacedItem).filter_by(item_id=item.item_id).one()
    unplaced.quantity = Decimal("2")
    db_session.flush()

    result = diagnose_inventory_integrity(db_session)

    check = _check(result, "WAREHOUSE_PHYSICAL_MISMATCH")
    assert result.status == "fail"
    assert check.count == 1
    assert check.samples[0] == {
        "box_quantity": 0,
        "item_id": str(item.item_id),
        "special_zone_quantity": 0,
        "unplaced_quantity": 2,
        "warehouse_quantity": 5,
    }


def test_inactive_special_zone_stock_breaks_box_zone_unplaced_ledger(
    make_item,
    db_session,
) -> None:
    item = make_item(name="B/Z/U 활성 구역", warehouse_qty=Decimal("5"))
    unplaced = db_session.query(WarehouseUnplacedItem).filter_by(item_id=item.item_id).one()
    unplaced.quantity = 2
    angle = WarehouseAngle(label="IC-17", rows=1, layers=1, jaris_per_cell=1)
    zone = WarehouseSpecialZone(
        label="IC-17 Z",
        zone_type="pallet",
        is_active=True,
    )
    db_session.add_all([angle, zone])
    db_session.flush()
    box = WarehouseBox(
        angle_id=angle.id,
        row_no=1,
        layer_no=1,
        jari_index=0,
        size=BoxSizeEnum.SMALL,
    )
    db_session.add(box)
    db_session.flush()
    db_session.add_all(
        [
            WarehouseBoxItem(box_id=box.box_id, item_id=item.item_id, quantity=2),
            WarehouseSpecialZoneItem(zone_id=zone.id, item_id=item.item_id, quantity=1),
        ]
    )
    db_session.flush()
    assert diagnose_inventory_integrity(db_session).status == "pass"

    zone.is_active = False
    db_session.flush()
    result = diagnose_inventory_integrity(db_session)

    check = _check(result, "WAREHOUSE_PHYSICAL_MISMATCH")
    assert result.status == "fail"
    assert any(sample.get("reason") == "inactive_zone_stock" for sample in check.samples)


def test_location_without_inventory_row_is_blocking_orphan(db_session) -> None:
    item = Item(
        item_name="고아 위치",
        unit="EA",
        model_symbol="9",
        process_type_code="TR",
        serial_no=98001,
    )
    db_session.add(item)
    db_session.flush()
    location = InventoryLocation(
        item_id=item.item_id,
        department=DepartmentEnum.ASSEMBLY.value,
        status=LocationStatusEnum.PRODUCTION,
        quantity=Decimal("1"),
        pending_quantity=Decimal("0"),
    )
    db_session.add(location)
    db_session.flush()

    result = diagnose_inventory_integrity(db_session)

    check = _check(result, "ORPHAN_REFERENCE")
    assert result.status == "fail"
    assert any(
        sample["row_id"] == str(location.location_id)
        and sample["reason"] == "missing_inventory"
        for sample in check.samples
    )


def test_negative_inventory_and_location_are_blocking(
    make_item,
    make_location,
    db_session,
) -> None:
    item = make_item(name="음수 재고 검사")
    location = make_location(
        item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        status=LocationStatusEnum.PRODUCTION,
        quantity=Decimal("1"),
    )
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    db_session.execute(text("PRAGMA ignore_check_constraints = ON"))
    try:
        inventory.quantity = -1
        location.quantity = -1
        db_session.flush()

        result = diagnose_inventory_integrity(db_session)
    finally:
        db_session.execute(text("PRAGMA ignore_check_constraints = OFF"))

    assert result.status == "fail"
    assert _check(result, "NEGATIVE_INVENTORY").count == 1
    assert _check(result, "NEGATIVE_LOCATION").count == 1


def test_contract_v2_operation_without_any_effect_is_blocking(db_session) -> None:
    operation = _operation(version=2)
    db_session.add(operation)
    db_session.flush()

    result = diagnose_inventory_integrity(db_session)

    check = _check(result, "OPERATION_V2_EFFECT_INVALID")
    assert result.status == "fail"
    assert check.count == 1
    assert check.samples[0] == {
        "operation_id": str(operation.operation_id),
        "reason": "missing_effect",
    }


def test_contract_v2_operation_with_invalid_inventory_effect_is_blocking(
    make_item,
    db_session,
) -> None:
    item = make_item(name="v2 손상 효과")
    operation = _operation(version=2)
    db_session.add(operation)
    db_session.flush()
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.ADJUST,
        quantity_change=1,
        operation_id=operation.operation_id,
        inventory_effect=[],
    )
    db_session.add(log)
    db_session.flush()

    result = diagnose_inventory_integrity(db_session)

    check = _check(result, "OPERATION_V2_EFFECT_INVALID")
    assert result.status == "fail"
    assert check.count == 1
    assert check.samples[0] == {
        "log_id": str(log.log_id),
        "operation_id": str(operation.operation_id),
        "reason": "invalid_inventory_effect",
    }


def test_contract_v2_accepts_canonical_empty_rework_scrap_effect(
    make_item,
    db_session,
) -> None:
    item = make_item(name="v2 재작업 폐기 예외")
    operation = _operation(version=2)
    db_session.add(operation)
    db_session.flush()
    db_session.add(
        TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.DEFECT_SCRAP,
            quantity_change=-1,
            operation_id=operation.operation_id,
            operation_role=InventoryOperationRoleEnum.REWORK_CHILD_SCRAP,
            reference_no="defect-disassemble:ic17",
            notes="[rework:scrap_child]",
            inventory_effect=[],
        )
    )
    db_session.flush()

    result = diagnose_inventory_integrity(db_session)

    assert _check(result, "OPERATION_V2_EFFECT_INVALID").count == 0


@pytest.mark.parametrize("quantity_change", [0, 1])
def test_contract_v2_rejects_nonnegative_empty_rework_scrap_effect(
    make_item,
    db_session,
    quantity_change: int,
) -> None:
    item = make_item(name=f"v2 재작업 폐기 거래량 {quantity_change}")
    operation = _operation(version=2)
    db_session.add(operation)
    db_session.flush()
    db_session.add(
        TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.DEFECT_SCRAP,
            quantity_change=quantity_change,
            operation_id=operation.operation_id,
            operation_role=InventoryOperationRoleEnum.REWORK_CHILD_SCRAP,
            reference_no="defect-disassemble:ic17",
            notes="[rework:scrap_child]",
            inventory_effect=[],
        )
    )
    db_session.flush()

    result = diagnose_inventory_integrity(db_session)

    assert result.status == "fail"
    assert _check(result, "OPERATION_V2_EFFECT_INVALID").count == 1


@pytest.mark.parametrize(
    "inventory_effect",
    [
        [{"scope": "warehouse", "row_id": "row-1", "delta": 1}],
        [
            {
                "scope": "warehouse",
                "row_id": "row-1",
                "before_quantity": 0,
                "after_quantity": 2,
                "delta": 1,
            }
        ],
        [
            {
                "scope": "warehouse",
                "before_quantity": 0,
                "after_quantity": 1,
                "delta": 1,
            }
        ],
        [
            {
                "scope": "warehouse",
                "row_id": "row-1",
                "before_quantity": 0,
                "after_quantity": 0.5,
                "delta": 0.5,
            }
        ],
        [
            {
                "scope": "warehouse",
                "row_id": "row-1",
                "before_quantity": 0,
                "after_quantity": 1,
                "delta": 1,
            }
        ],
    ],
)
def test_contract_v2_rejects_incomplete_or_inconsistent_inventory_effect(
    make_item,
    db_session,
    inventory_effect,
) -> None:
    item = make_item(name="v2 구조 손상 효과")
    operation = _operation(version=2)
    db_session.add(operation)
    db_session.flush()
    db_session.add(
        TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.ADJUST,
            quantity_change=1,
            operation_id=operation.operation_id,
            inventory_effect=inventory_effect,
        )
    )
    db_session.flush()

    result = diagnose_inventory_integrity(db_session)

    assert result.status == "fail"
    assert _check(result, "OPERATION_V2_EFFECT_INVALID").count == 1


def test_contract_v2_accepts_complete_consistent_inventory_effect(
    make_item,
    db_session,
) -> None:
    item = make_item(name="v2 정상 효과")
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    unplaced = db_session.query(WarehouseUnplacedItem).filter_by(item_id=item.item_id).one()
    operation = _operation(version=2)
    db_session.add(operation)
    db_session.flush()
    db_session.add(
        TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.ADJUST,
            quantity_change=1,
            operation_id=operation.operation_id,
            inventory_effect=[
                {
                    "scope": "warehouse",
                    "row_id": str(inventory.inventory_id),
                    "before_quantity": 0,
                    "after_quantity": 1,
                    "delta": 1,
                },
                {
                    "scope": "warehouse_unplaced",
                    "row_id": str(unplaced.id),
                    "before_quantity": 0,
                    "after_quantity": 1,
                    "delta": 1,
                }
            ],
        )
    )
    db_session.flush()

    result = diagnose_inventory_integrity(db_session)

    assert _check(result, "OPERATION_V2_EFFECT_INVALID").count == 0


def test_contract_v2_rejects_duplicate_effect_cells_that_cancel_out(
    make_item,
    db_session,
) -> None:
    item = make_item(name="v2 중복 효과 셀")
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    unplaced = db_session.query(WarehouseUnplacedItem).filter_by(item_id=item.item_id).one()
    operation = _operation(version=2)
    db_session.add(operation)
    db_session.flush()
    db_session.add(
        TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.ADJUST,
            quantity_change=1,
            operation_id=operation.operation_id,
            inventory_effect=[
                {
                    "scope": "warehouse",
                    "row_id": str(inventory.inventory_id),
                    "before_quantity": 0,
                    "after_quantity": 1,
                    "delta": 1,
                },
                {
                    "scope": "warehouse",
                    "row_id": str(inventory.inventory_id),
                    "before_quantity": 1,
                    "after_quantity": 0,
                    "delta": -1,
                },
                {
                    "scope": "warehouse_unplaced",
                    "row_id": str(unplaced.id),
                    "before_quantity": 0,
                    "after_quantity": 1,
                    "delta": 1,
                },
                {
                    "scope": "warehouse_unplaced",
                    "row_id": str(unplaced.id),
                    "before_quantity": 1,
                    "after_quantity": 0,
                    "delta": -1,
                },
            ],
        )
    )
    db_session.flush()

    result = diagnose_inventory_integrity(db_session)

    assert result.status == "fail"
    assert _check(result, "OPERATION_V2_EFFECT_INVALID").count == 1


def test_contract_v2_rejects_effect_total_that_disagrees_with_transaction(
    make_item,
    db_session,
) -> None:
    item = make_item(name="v2 거래량 불일치")
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    unplaced = db_session.query(WarehouseUnplacedItem).filter_by(item_id=item.item_id).one()
    operation = _operation(version=2)
    db_session.add(operation)
    db_session.flush()
    db_session.add(
        TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.ADJUST,
            quantity_change=2,
            operation_id=operation.operation_id,
            inventory_effect=[
                {
                    "scope": "warehouse",
                    "row_id": str(inventory.inventory_id),
                    "before_quantity": 0,
                    "after_quantity": 1,
                    "delta": 1,
                },
                {
                    "scope": "warehouse_unplaced",
                    "row_id": str(unplaced.id),
                    "before_quantity": 0,
                    "after_quantity": 1,
                    "delta": 1,
                },
            ],
        )
    )
    db_session.flush()

    result = diagnose_inventory_integrity(db_session)

    assert result.status == "fail"
    assert _check(result, "OPERATION_V2_EFFECT_INVALID").count == 1


def test_contract_v2_rejects_effect_row_owned_by_another_item(
    make_item,
    db_session,
) -> None:
    logged_item = make_item(name="v2 효과 기록 품목")
    placed_item = make_item(name="v2 실제 배치 품목", warehouse_qty=Decimal("1"))
    placed_unplaced = (
        db_session.query(WarehouseUnplacedItem)
        .filter_by(item_id=placed_item.item_id)
        .one()
    )
    placed_unplaced.quantity = 0
    angle = WarehouseAngle(label="IC-17 효과", rows=1, layers=1, jaris_per_cell=1)
    db_session.add(angle)
    db_session.flush()
    box = WarehouseBox(
        angle_id=angle.id,
        row_no=1,
        layer_no=1,
        jari_index=0,
        size=BoxSizeEnum.SMALL,
    )
    db_session.add(box)
    db_session.flush()
    box_item = WarehouseBoxItem(
        box_id=box.box_id,
        item_id=placed_item.item_id,
        quantity=1,
    )
    operation = _operation(version=2)
    db_session.add_all([box_item, operation])
    db_session.flush()
    logged_inventory = (
        db_session.query(Inventory)
        .filter_by(item_id=logged_item.item_id)
        .one()
    )
    db_session.add(
        TransactionLog(
            item_id=logged_item.item_id,
            transaction_type=TransactionTypeEnum.ADJUST,
            quantity_change=1,
            operation_id=operation.operation_id,
            inventory_effect=[
                {
                    "scope": "warehouse",
                    "row_id": str(logged_inventory.inventory_id),
                    "before_quantity": 0,
                    "after_quantity": 1,
                    "delta": 1,
                },
                {
                    "scope": "warehouse_box",
                    "row_id": str(box_item.id),
                    "box_id": str(box.box_id),
                    "before_quantity": 0,
                    "after_quantity": 1,
                    "delta": 1,
                },
            ],
        )
    )
    db_session.flush()

    result = diagnose_inventory_integrity(db_session)

    assert result.status == "fail"
    assert _check(result, "OPERATION_V2_EFFECT_INVALID").count == 1


def test_contract_v2_rejects_empty_operation_effect_state(db_session) -> None:
    operation = _operation(version=2)
    db_session.add(operation)
    db_session.flush()
    db_session.add(
        InventoryOperationEffect(
            operation_id=operation.operation_id,
            effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
            subject_type="StockRequest",
            subject_id=str(uuid.uuid4()),
            role="STATUS",
            before_state={},
            after_state={},
        )
    )
    db_session.flush()

    result = diagnose_inventory_integrity(db_session)

    assert result.status == "fail"
    assert _check(result, "OPERATION_V2_EFFECT_INVALID").count == 1


def test_post_cutover_transaction_without_operation_is_blocking(make_item, db_session) -> None:
    item = make_item(name="전환 후 operation 누락")
    db_session.add(
        SystemSetting(
            setting_key="inventory_operation_cutover_at",
            setting_value="2026-09-02T00:00:00",
        )
    )
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.ADJUST,
        quantity_change=1,
        created_at=datetime(2026, 9, 2, 9, 0),
        inventory_effect=[
            {
                "scope": "warehouse",
                "row_id": "inventory-row",
                "delta": 1,
            }
        ],
    )
    db_session.add(log)
    db_session.flush()

    result = diagnose_inventory_integrity(db_session)

    check = _check(result, "OPERATION_V2_EFFECT_INVALID")
    assert result.status == "fail"
    assert check.count == 1
    assert check.samples[0] == {
        "log_id": str(log.log_id),
        "reason": "missing_operation",
    }


def test_contract_v1_operation_without_any_effect_is_warning_only(db_session) -> None:
    operation = _operation(version=1)
    db_session.add(operation)
    db_session.flush()

    result = diagnose_inventory_integrity(db_session)

    check = _check(result, "OPERATION_V1_EFFECT_MISSING")
    assert result.status == "warning"
    assert result.blocking_count == 0
    assert result.warning_count == 1
    assert check.count == 1
    assert check.samples[0] == {
        "operation_id": str(operation.operation_id),
        "reason": "missing_effect",
    }


def test_post_cutover_v1_operation_without_effect_is_blocking(db_session) -> None:
    db_session.add(
        SystemSetting(
            setting_key="inventory_operation_cutover_at",
            setting_value="2026-09-02T00:00:00",
        )
    )
    operation = _operation(version=1)
    db_session.add(operation)
    db_session.flush()

    result = diagnose_inventory_integrity(db_session)

    assert result.status == "fail"
    assert _check(result, "OPERATION_V1_EFFECT_MISSING").count == 0
    assert _check(result, "OPERATION_V2_EFFECT_INVALID").count == 1


def test_post_cutover_v1_operation_with_pre_cutover_invalid_log_is_blocking(
    make_item,
    db_session,
) -> None:
    item = make_item(name="전환 후 v1 작업의 전환 전 로그")
    db_session.add(
        SystemSetting(
            setting_key="inventory_operation_cutover_at",
            setting_value="2026-09-02T00:00:00",
        )
    )
    operation = _operation(version=1)
    db_session.add(operation)
    db_session.flush()
    db_session.add(
        TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.ADJUST,
            quantity_change=1,
            operation_id=operation.operation_id,
            created_at=datetime(2026, 9, 1, 23, 59),
            inventory_effect=[{"scope": "warehouse", "delta": 1}],
        )
    )
    db_session.flush()

    result = diagnose_inventory_integrity(db_session)

    assert result.status == "fail"
    assert _check(result, "OPERATION_V1_EFFECT_MISSING").count == 0
    assert _check(result, "OPERATION_V2_EFFECT_INVALID").count == 1


def test_admin_api_and_detailed_health_publish_same_v1_verdict_with_sanitized_samples(
    client,
    make_item,
    db_session,
    monkeypatch,
) -> None:
    from app import main

    monkeypatch.setattr(
        main,
        "check_schema",
        lambda *, connection: SimpleNamespace(
            ready=True,
            revision="20260831_0033",
            differences=(),
        ),
        raising=False,
    )
    item = make_item(name="세 소비자 공통 판정", warehouse_qty=Decimal("4"))
    unplaced = db_session.query(WarehouseUnplacedItem).filter_by(item_id=item.item_id).one()
    unplaced.quantity = Decimal("1")
    db_session.flush()

    admin = client.get("/api/admin/inventory-integrity", headers={"X-Admin-Pin": "0000"})
    detailed = client.get("/health/detailed")

    assert admin.status_code == 200, admin.text
    assert detailed.status_code == 200, detailed.text
    contract_keys = {"contract", "status", "blocking_count", "warning_count", "checks"}
    admin_contract = {key: admin.json()[key] for key in contract_keys}
    detailed_contract = detailed.json()["inventory_integrity"]
    assert {
        key: detailed_contract[key]
        for key in {"contract", "status", "blocking_count", "warning_count"}
    } == {
        key: admin_contract[key]
        for key in {"contract", "status", "blocking_count", "warning_count"}
    }
    assert [
        (check["check_id"], check["severity"], check["count"])
        for check in detailed_contract["checks"]
    ] == [
        (check["check_id"], check["severity"], check["count"])
        for check in admin_contract["checks"]
    ]
    assert all(check["samples"] == [] for check in detailed_contract["checks"])
    assert admin_contract["status"] == "fail"
    assert detailed.json()["status"] == "degraded"
    assert next(
        check for check in admin_contract["checks"]
        if check["check_id"] == "WAREHOUSE_PHYSICAL_MISMATCH"
    )["count"] == 1


def test_activation_error_names_new_blocking_check(make_item, db_session) -> None:
    item = make_item(name="활성화 차단 식별자", warehouse_qty=Decimal("4"))
    unplaced = db_session.query(WarehouseUnplacedItem).filter_by(item_id=item.item_id).one()
    unplaced.quantity = Decimal("1")
    db_session.flush()

    with pytest.raises(
        InventoryOperationActivationError,
        match="WAREHOUSE_PHYSICAL_MISMATCH",
    ):
        activate_inventory_operation_contract(
            db_session,
            approved_by="IC-17 검사자",
        )
