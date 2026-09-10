"""폐기 가능한 실제 PostgreSQL에서 IC-17 판정과 CLI parity를 검증한다."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import uuid
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Iterator

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from app import models as _models  # noqa: F401
from app.database import Base
from app.models import (
    BoxSizeEnum,
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    InventoryOperation,
    InventoryOperationKindEnum,
    InventoryOperationRoleEnum,
    InventoryOperationStatusEnum,
    Item,
    LocationStatusEnum,
    ProcessType,
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
    WarehouseBox,
    WarehouseSpecialZone,
    WarehouseSpecialZoneItem,
    WarehouseUnplacedItem,
)
from app.services.inventory_integrity import diagnose_inventory_integrity


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts" / "ops" / "check_inventory_integrity.py"
POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "").strip()


@contextmanager
def _isolated_schema() -> Iterator[str]:
    base_url = make_url(POSTGRES_URL)
    database_name = base_url.database or ""
    assert database_name.startswith("test_") or database_name.endswith("_test")
    schema_name = f"ic17_{uuid.uuid4().hex}"
    engine = create_engine(base_url, poolclass=NullPool)
    schema_url = base_url.update_query_dict(
        {"options": f"-csearch_path={schema_name}"},
        append=False,
    )
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql(f'CREATE SCHEMA "{schema_name}"')
            connection.exec_driver_sql(f'SET LOCAL search_path TO "{schema_name}"')
            Base.metadata.create_all(connection)
        yield schema_url.render_as_string(hide_password=False)
    finally:
        with engine.begin() as connection:
            connection.exec_driver_sql(f'DROP SCHEMA IF EXISTS "{schema_name}" CASCADE')
        engine.dispose()


def _seed_clean(session: Session) -> Item:
    session.add(ProcessType(code="TR", prefix="T", suffix="R", stage_order=0))
    item = Item(
        item_name="IC-17 PostgreSQL",
        unit="EA",
        model_symbol="9",
        process_type_code="TR",
        serial_no=99101,
    )
    session.add(item)
    session.flush()
    session.add_all(
        [
            Inventory(
                item_id=item.item_id,
                quantity=5,
                warehouse_qty=5,
                pending_quantity=0,
            ),
            WarehouseUnplacedItem(item_id=item.item_id, quantity=5),
        ]
    )
    session.commit()
    return item


def _add_location(
    session: Session,
    item: Item,
    *,
    quantity: int,
    pending: int = 0,
) -> InventoryLocation:
    location = InventoryLocation(
        item_id=item.item_id,
        department=DepartmentEnum.ASSEMBLY.value,
        status=LocationStatusEnum.PRODUCTION,
        quantity=quantity,
        pending_quantity=pending,
    )
    session.add(location)
    inventory = session.query(Inventory).filter_by(item_id=item.item_id).one()
    inventory.quantity = 5 + quantity
    return location


def _break_invariant(session: Session, item: Item, case_name: str) -> None:
    if case_name == "inventory_total":
        session.query(Inventory).filter_by(item_id=item.item_id).one().quantity = 6
    elif case_name == "negative_inventory":
        session.execute(
            text("ALTER TABLE inventory DROP CONSTRAINT ck_inventory_quantity_nonneg")
        )
        session.query(Inventory).filter_by(item_id=item.item_id).one().quantity = -1
    elif case_name == "negative_location":
        session.execute(
            text(
                "ALTER TABLE inventory_locations "
                "DROP CONSTRAINT ck_invloc_quantity_nonneg"
            )
        )
        session.execute(
            text(
                "ALTER TABLE inventory_locations "
                "DROP CONSTRAINT ck_invloc_pending_le_quantity"
            )
        )
        _add_location(session, item, quantity=-1)
    elif case_name == "location_pending":
        _add_location(session, item, quantity=5, pending=2)
    elif case_name == "stock_request_state":
        employee = Employee(
            employee_code="IC17-PG",
            name="IC-17 PostgreSQL",
            role="검사",
            department=DepartmentEnum.ASSEMBLY.value,
            level=EmployeeLevelEnum.STAFF,
            is_active=True,
        )
        session.add(employee)
        session.flush()
        request = StockRequest(
            requester_employee_id=employee.employee_id,
            requester_name=employee.name,
            requester_department=employee.department,
            request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
            status=StockRequestStatusEnum.RESERVED,
            requires_warehouse_approval=True,
        )
        session.add(request)
        session.flush()
        session.add(
            StockRequestLine(
                request_id=request.request_id,
                item_id=item.item_id,
                item_name_snapshot=item.item_name,
                quantity=1,
                from_bucket=RequestBucketEnum.WAREHOUSE,
                to_bucket=RequestBucketEnum.PRODUCTION,
                to_department=DepartmentEnum.ASSEMBLY.value,
                status=StockRequestStatusEnum.SUBMITTED,
            )
        )
    elif case_name == "stale_reserved_request":
        employee = Employee(
            employee_code="IC17-PG-STALE",
            name="IC-17 PostgreSQL",
            role="검사",
            department=DepartmentEnum.ASSEMBLY.value,
            level=EmployeeLevelEnum.STAFF,
            is_active=True,
        )
        session.add(employee)
        session.flush()
        session.add(
            StockRequest(
                request_code="IC17-PG-STALE",
                requester_employee_id=employee.employee_id,
                requester_name=employee.name,
                requester_department=employee.department,
                request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
                status=StockRequestStatusEnum.RESERVED,
                requires_warehouse_approval=True,
                created_at=datetime(2000, 1, 1),
            )
        )
    elif case_name == "shipping_allocation":
        _add_location(session, item, quantity=3)
        request = ShippingRequest(
            base_pf_item_id=item.item_id,
            request_quantity=1,
            status=ShippingRequestStatusEnum.PREPARING,
        )
        session.add(request)
        session.flush()
        session.add(
            ShippingAllocation(
                request_id=request.request_id,
                item_id=item.item_id,
                quantity=1,
                department=DepartmentEnum.ASSEMBLY.value,
                status="RESERVED",
            )
        )
    elif case_name == "shipping_location_stock":
        _add_location(session, item, quantity=3)
        request = ShippingRequest(
            base_pf_item_id=item.item_id,
            request_quantity=4,
            status=ShippingRequestStatusEnum.PREPARED,
        )
        session.add(request)
        session.flush()
        session.add(
            ShippingAllocation(
                request_id=request.request_id,
                item_id=item.item_id,
                quantity=4,
                department=DepartmentEnum.ASSEMBLY.value,
                status="RESERVED",
            )
        )
    elif case_name == "shipping_allocation_nonpositive":
        _add_location(session, item, quantity=3)
        request = ShippingRequest(
            base_pf_item_id=item.item_id,
            request_quantity=1,
            status=ShippingRequestStatusEnum.PREPARED,
        )
        session.add(request)
        session.flush()
        session.add(
            ShippingAllocation(
                request_id=request.request_id,
                item_id=item.item_id,
                quantity=-1,
                department=DepartmentEnum.ASSEMBLY.value,
                status="RESERVED",
            )
        )
    elif case_name == "warehouse_physical":
        session.query(WarehouseUnplacedItem).filter_by(item_id=item.item_id).one().quantity = 2
    elif case_name == "inactive_zone":
        session.query(WarehouseUnplacedItem).filter_by(item_id=item.item_id).one().quantity = 4
        zone = WarehouseSpecialZone(
            label="IC-17 inactive",
            zone_type="pallet",
            is_active=False,
        )
        session.add(zone)
        session.flush()
        session.add(
            WarehouseSpecialZoneItem(
                zone_id=zone.id,
                item_id=item.item_id,
                quantity=1,
            )
        )
    elif case_name == "negative_placement":
        session.execute(
            text(
                "ALTER TABLE warehouse_unplaced_items DROP CONSTRAINT "
                "ck_warehouse_unplaced_items_quantity_nonnegative"
            )
        )
        session.query(WarehouseUnplacedItem).filter_by(item_id=item.item_id).one().quantity = -1
    elif case_name == "orphan_location":
        orphan_item = Item(
            item_name="IC-17 orphan",
            unit="EA",
            model_symbol="9",
            process_type_code="TR",
            serial_no=99102,
        )
        session.add(orphan_item)
        session.flush()
        session.add(
            InventoryLocation(
                item_id=orphan_item.item_id,
                department=DepartmentEnum.ASSEMBLY.value,
                status=LocationStatusEnum.PRODUCTION,
                quantity=1,
                pending_quantity=0,
            )
        )
    elif case_name == "box_angle_orphan":
        constraint_name = session.execute(
            text(
                "SELECT constraint_name FROM information_schema.table_constraints "
                "WHERE table_schema = current_schema() "
                "AND table_name = 'warehouse_boxes' "
                "AND constraint_type = 'FOREIGN KEY'"
            )
        ).scalar_one()
        session.execute(
            text(
                f'ALTER TABLE warehouse_boxes DROP CONSTRAINT "{constraint_name}"'
            )
        )
        session.add(
            WarehouseBox(
                angle_id=404,
                row_no=1,
                layer_no=1,
                jari_index=0,
                size=BoxSizeEnum.SMALL,
            )
        )
    elif case_name == "operation_missing_effect":
        session.add(
            InventoryOperation(
                kind=InventoryOperationKindEnum.BUSINESS,
                domain="ic17-postgres",
                action="missing-effect",
                status=InventoryOperationStatusEnum.COMMITTED,
                display_label="IC-17 효과 누락",
                actor_name="IC-17 PostgreSQL",
                contract_version=2,
            )
        )
    elif case_name == "operation_invalid_effect":
        operation = InventoryOperation(
            kind=InventoryOperationKindEnum.BUSINESS,
            domain="ic17-postgres",
            action="invalid-effect",
            status=InventoryOperationStatusEnum.COMMITTED,
            display_label="IC-17 효과 손상",
            actor_name="IC-17 PostgreSQL",
            contract_version=2,
        )
        session.add(operation)
        session.flush()
        session.add(
            TransactionLog(
                item_id=item.item_id,
                transaction_type=TransactionTypeEnum.ADJUST,
                quantity_change=1,
                operation_id=operation.operation_id,
                operation_role=InventoryOperationRoleEnum.PRIMARY,
                inventory_effect=[{"scope": "warehouse", "delta": 1}],
            )
        )
    elif case_name == "operation_effect_wrong_item":
        other_item = Item(
            item_name="IC-17 effect owner",
            unit="EA",
            model_symbol="9",
            process_type_code="TR",
            serial_no=99103,
        )
        session.add(other_item)
        session.flush()
        other_inventory = Inventory(
            item_id=other_item.item_id,
            quantity=1,
            warehouse_qty=1,
            pending_quantity=0,
        )
        other_unplaced = WarehouseUnplacedItem(
            item_id=other_item.item_id,
            quantity=1,
        )
        operation = InventoryOperation(
            kind=InventoryOperationKindEnum.BUSINESS,
            domain="ic17-postgres",
            action="wrong-effect-owner",
            status=InventoryOperationStatusEnum.COMMITTED,
            display_label="IC-17 효과 소유자 손상",
            actor_name="IC-17 PostgreSQL",
            contract_version=2,
        )
        session.add_all([other_inventory, other_unplaced, operation])
        session.flush()
        session.add(
            TransactionLog(
                item_id=item.item_id,
                transaction_type=TransactionTypeEnum.ADJUST,
                quantity_change=1,
                operation_id=operation.operation_id,
                operation_role=InventoryOperationRoleEnum.PRIMARY,
                inventory_effect=[
                    {
                        "scope": "warehouse",
                        "row_id": str(other_inventory.inventory_id),
                        "before_quantity": 0,
                        "after_quantity": 1,
                        "delta": 1,
                    },
                    {
                        "scope": "warehouse_unplaced",
                        "row_id": str(other_unplaced.id),
                        "before_quantity": 0,
                        "after_quantity": 1,
                        "delta": 1,
                    },
                ],
            )
        )
    elif case_name == "operation_effect_quantity_mismatch":
        inventory = session.query(Inventory).filter_by(item_id=item.item_id).one()
        unplaced = (
            session.query(WarehouseUnplacedItem)
            .filter_by(item_id=item.item_id)
            .one()
        )
        operation = InventoryOperation(
            kind=InventoryOperationKindEnum.BUSINESS,
            domain="ic17-postgres",
            action="effect-quantity-mismatch",
            status=InventoryOperationStatusEnum.COMMITTED,
            display_label="IC-17 효과 거래량 손상",
            actor_name="IC-17 PostgreSQL",
            contract_version=2,
        )
        session.add(operation)
        session.flush()
        session.add(
            TransactionLog(
                item_id=item.item_id,
                transaction_type=TransactionTypeEnum.ADJUST,
                quantity_change=2,
                operation_id=operation.operation_id,
                operation_role=InventoryOperationRoleEnum.PRIMARY,
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
    elif case_name == "operation_invalid_empty_scrap":
        operation = InventoryOperation(
            kind=InventoryOperationKindEnum.BUSINESS,
            domain="ic17-postgres",
            action="invalid-empty-scrap",
            status=InventoryOperationStatusEnum.COMMITTED,
            display_label="IC-17 빈 폐기 효과 손상",
            actor_name="IC-17 PostgreSQL",
            contract_version=2,
        )
        session.add(operation)
        session.flush()
        session.add(
            TransactionLog(
                item_id=item.item_id,
                transaction_type=TransactionTypeEnum.DEFECT_SCRAP,
                quantity_change=1,
                operation_id=operation.operation_id,
                operation_role=InventoryOperationRoleEnum.REWORK_CHILD_SCRAP,
                reference_no="defect-disassemble:ic17",
                notes="[rework:scrap_child]",
                inventory_effect=[],
            )
        )
    elif case_name == "post_cutover_v1_missing_effect":
        session.add(
            SystemSetting(
                setting_key="inventory_operation_cutover_at",
                setting_value="2026-09-02T00:00:00",
            )
        )
        session.add(
            InventoryOperation(
                kind=InventoryOperationKindEnum.BUSINESS,
                domain="ic17-postgres",
                action="post-cutover-v1",
                status=InventoryOperationStatusEnum.COMMITTED,
                display_label="IC-17 전환 후 v1",
                actor_name="IC-17 PostgreSQL",
                effective_at=datetime(2026, 9, 2, 9, 0),
                contract_version=1,
            )
        )
    elif case_name == "post_cutover_v1_invalid_pre_cutover_log":
        session.add(
            SystemSetting(
                setting_key="inventory_operation_cutover_at",
                setting_value="2026-09-02T00:00:00",
            )
        )
        operation = InventoryOperation(
            kind=InventoryOperationKindEnum.BUSINESS,
            domain="ic17-postgres",
            action="post-cutover-v1-invalid-log",
            status=InventoryOperationStatusEnum.COMMITTED,
            display_label="IC-17 전환 후 v1 로그 손상",
            actor_name="IC-17 PostgreSQL",
            effective_at=datetime(2026, 9, 2, 9, 0),
            contract_version=1,
        )
        session.add(operation)
        session.flush()
        session.add(
            TransactionLog(
                item_id=item.item_id,
                transaction_type=TransactionTypeEnum.ADJUST,
                quantity_change=1,
                operation_id=operation.operation_id,
                created_at=datetime(2026, 9, 1, 23, 59),
                inventory_effect=[{"scope": "warehouse", "delta": 1}],
            )
        )
    else:
        raise AssertionError(f"알 수 없는 PostgreSQL IC-17 사례: {case_name}")
    session.commit()


def _run_cli(schema_url: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), "--db-url", schema_url, "--json"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


@pytest.mark.skipif(
    not POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
@pytest.mark.parametrize(
    ("case_name", "expected_check_id"),
    [
        ("inventory_total", "INVENTORY_TOTAL_MISMATCH"),
        ("negative_inventory", "NEGATIVE_INVENTORY"),
        ("negative_location", "NEGATIVE_LOCATION"),
        ("location_pending", "PENDING_RESERVATION_MISMATCH"),
        ("stock_request_state", "STOCK_REQUEST_STATE_MISMATCH"),
        ("stale_reserved_request", "STOCK_REQUEST_STATE_MISMATCH"),
        ("shipping_allocation", "SHIPPING_ALLOCATION_MISMATCH"),
        ("shipping_location_stock", "SHIPPING_ALLOCATION_MISMATCH"),
        ("shipping_allocation_nonpositive", "SHIPPING_ALLOCATION_MISMATCH"),
        ("warehouse_physical", "WAREHOUSE_PHYSICAL_MISMATCH"),
        ("inactive_zone", "WAREHOUSE_PHYSICAL_MISMATCH"),
        ("negative_placement", "WAREHOUSE_PHYSICAL_MISMATCH"),
        ("orphan_location", "ORPHAN_REFERENCE"),
        ("box_angle_orphan", "ORPHAN_REFERENCE"),
        ("operation_missing_effect", "OPERATION_V2_EFFECT_INVALID"),
        ("operation_invalid_effect", "OPERATION_V2_EFFECT_INVALID"),
        ("operation_effect_wrong_item", "OPERATION_V2_EFFECT_INVALID"),
        ("operation_effect_quantity_mismatch", "OPERATION_V2_EFFECT_INVALID"),
        ("operation_invalid_empty_scrap", "OPERATION_V2_EFFECT_INVALID"),
        ("post_cutover_v1_missing_effect", "OPERATION_V2_EFFECT_INVALID"),
        (
            "post_cutover_v1_invalid_pre_cutover_log",
            "OPERATION_V2_EFFECT_INVALID",
        ),
    ],
)
def test_postgresql_engine_and_cli_detect_each_blocking_invariant(
    case_name: str,
    expected_check_id: str,
) -> None:
    with _isolated_schema() as schema_url:
        engine = create_engine(schema_url, poolclass=NullPool)
        try:
            with Session(engine) as session:
                item = _seed_clean(session)
                assert diagnose_inventory_integrity(session).status == "pass"
                _break_invariant(session, item, case_name)
                blocking = diagnose_inventory_integrity(session)
                assert blocking.status == "fail"
                assert next(
                    check
                    for check in blocking.checks
                    if check.check_id == expected_check_id
                ).count >= 1

            result = _run_cli(schema_url)
            assert result.returncode == 1, result.stdout + result.stderr
            payload = json.loads(result.stdout)
            assert payload["status"] == "fail"
            assert [
                (check["check_id"], check["count"])
                for check in payload["checks"]
            ] == [
                (check.check_id, check.count)
                for check in blocking.checks
            ]
        finally:
            engine.dispose()


@pytest.mark.skipif(
    not POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 설정된 폐기 가능한 PostgreSQL에서만 실행",
)
def test_postgresql_v1_missing_effect_is_warning_only() -> None:
    with _isolated_schema() as schema_url:
        engine = create_engine(schema_url, poolclass=NullPool)
        try:
            with Session(engine) as session:
                _seed_clean(session)
                operation = InventoryOperation(
                    kind=InventoryOperationKindEnum.BUSINESS,
                    domain="ic17-postgres",
                    action="legacy-missing-effect",
                    status=InventoryOperationStatusEnum.COMMITTED,
                    display_label="IC-17 레거시 효과 누락",
                    actor_name="IC-17 PostgreSQL",
                    contract_version=1,
                )
                session.add(operation)
                session.commit()
                warning = diagnose_inventory_integrity(session)
                assert warning.status == "warning"
                assert warning.blocking_count == 0
                assert warning.warning_count == 1

            result = _run_cli(schema_url)
            assert result.returncode == 0, result.stdout + result.stderr
            payload = json.loads(result.stdout)
            assert payload["status"] == "warning"
            assert payload["blocking_count"] == 0
            assert payload["warning_count"] == 1
        finally:
            engine.dispose()
