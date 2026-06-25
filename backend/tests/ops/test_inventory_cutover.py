from __future__ import annotations

from decimal import Decimal
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.models import (
    Department,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    IoBatch,
    IoBundle,
    IoLine,
    LocationStatusEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    RequestBucketEnum,
    TransactionEditLog,
    TransactionLog,
    TransactionTypeEnum,
    WarehouseAngle,
    WarehouseBox,
    WarehouseBoxItem,
    BoxSizeEnum,
)
from scripts.ops.inventory_cutover import (
    CutoverInputError,
    CutoverOptions,
    CutoverRow,
    parse_cutover_file,
    run_cutover,
)


def _employee(db_session, *, department: str) -> Employee:
    employee = Employee(
        employee_code="CUT001",
        name="Cutover Operator",
        role="ops",
        department=department,
        level=EmployeeLevelEnum.STAFF,
        warehouse_role="primary",
        department_role="primary",
        display_order=0,
        is_active=True,
    )
    db_session.add(employee)
    db_session.flush()
    return employee


def _seed_operational_state(db_session, item, employee: Employee) -> None:
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=5,
        quantity_before=0,
        quantity_after=5,
        warehouse_qty_before=0,
        warehouse_qty_after=5,
        produced_by=employee.name,
        producer_employee_id=employee.employee_id,
        inventory_effect=[{"scope": "warehouse", "delta": 5}],
    )
    db_session.add(log)
    db_session.flush()
    db_session.add(
        TransactionEditLog(
            original_log_id=log.log_id,
            edited_by_employee_id=employee.employee_id,
            edited_by_name=employee.name,
            reason="cutover test",
            before_payload="{}",
            after_payload="{}",
        )
    )

    request = StockRequest(
        requester_employee_id=employee.employee_id,
        requester_name=employee.name,
        requester_department=employee.department,
        request_type=StockRequestTypeEnum.RAW_SHIP,
        status=StockRequestStatusEnum.RESERVED,
    )
    db_session.add(request)
    db_session.flush()
    db_session.add(
        StockRequestLine(
            request_id=request.request_id,
            item_id=item.item_id,
            item_name_snapshot=item.item_name,
            mes_code_snapshot=item.mes_code,
            quantity=3,
            from_bucket=RequestBucketEnum.WAREHOUSE,
            to_bucket=RequestBucketEnum.NONE,
            status=StockRequestStatusEnum.RESERVED,
        )
    )

    batch = IoBatch(
        work_type="out",
        sub_type="raw_ship",
        status="draft",
        requester_employee_id=employee.employee_id,
        requester_name=employee.name,
        requester_department=employee.department,
    )
    db_session.add(batch)
    db_session.flush()
    bundle = IoBundle(
        batch_id=batch.batch_id,
        source_kind="item",
        source_item_id=item.item_id,
        title_snapshot=item.item_name,
        quantity=1,
        expanded_level=1,
    )
    db_session.add(bundle)
    db_session.flush()
    db_session.add(
        IoLine(
            bundle_id=bundle.bundle_id,
            item_id=item.item_id,
            item_name_snapshot=item.item_name,
            mes_code_snapshot=item.mes_code,
            direction="out",
            from_bucket="warehouse",
            to_bucket="none",
            quantity=1,
            included=True,
            origin="manual",
        )
    )

    angle = WarehouseAngle(label="A", rows=1, layers=1, jaris_per_cell=3)
    db_session.add(angle)
    db_session.flush()
    box = WarehouseBox(
        angle_id=angle.id,
        row_no=1,
        layer_no=1,
        jari_index=0,
        size=BoxSizeEnum.SMALL,
        stack_order=0,
    )
    db_session.add(box)
    db_session.flush()
    db_session.add(WarehouseBoxItem(box_id=box.box_id, item_id=item.item_id, quantity=5))
    db_session.flush()


def test_run_cutover_clears_history_map_and_reloads_inventory(db_session, make_item):
    dept = "Assembly"
    db_session.add(Department(name=dept, display_order=1, is_active=True, io_enabled=True))
    employee = _employee(db_session, department=dept)
    raw = make_item(
        name="Raw",
        process_type_code="TR",
        warehouse_qty=Decimal("10"),
        pending=Decimal("4"),
        model_symbol="3",
        serial_no=1,
    )
    assy = make_item(
        name="Assembly Part",
        process_type_code="AA",
        warehouse_qty=Decimal("1"),
        model_symbol="3",
        serial_no=2,
    )
    db_session.add(
        InventoryLocation(
            item_id=assy.item_id,
            department=dept,
            status=LocationStatusEnum.PRODUCTION,
            quantity=2,
        )
    )
    db_session.query(Inventory).filter(Inventory.item_id == assy.item_id).update({"quantity": 3})
    _seed_operational_state(db_session, raw, employee)
    db_session.commit()

    summary = run_cutover(
        db_session,
        [
            CutoverRow(mes_code=raw.mes_code, bucket="warehouse", quantity=100, source_row=2),
            CutoverRow(mes_code=assy.mes_code, bucket="warehouse", quantity=5, source_row=3),
            CutoverRow(mes_code=assy.mes_code, bucket="production", department=dept, quantity=7, source_row=4),
            CutoverRow(mes_code=assy.mes_code, bucket="defective", department=dept, quantity=2, source_row=5),
        ],
        CutoverOptions(apply=True),
    )

    assert summary.applied is True
    assert summary.items_updated == 2
    assert summary.transaction_logs_deleted == 1
    assert summary.stock_requests_deleted == 1
    assert summary.io_batches_deleted == 1
    assert summary.warehouse_box_items_deleted == 1

    raw_inv = db_session.query(Inventory).filter(Inventory.item_id == raw.item_id).one()
    assert raw_inv.warehouse_qty == Decimal("100")
    assert raw_inv.quantity == Decimal("100")
    assert raw_inv.pending_quantity == Decimal("0")

    assy_inv = db_session.query(Inventory).filter(Inventory.item_id == assy.item_id).one()
    assert assy_inv.warehouse_qty == Decimal("5")
    assert assy_inv.quantity == Decimal("14")
    assert assy_inv.pending_quantity == Decimal("0")
    locations = {
        (row.department, row.status): row.quantity
        for row in db_session.query(InventoryLocation).filter(InventoryLocation.item_id == assy.item_id)
    }
    assert locations[(dept, LocationStatusEnum.PRODUCTION)] == Decimal("7")
    assert locations[(dept, LocationStatusEnum.DEFECTIVE)] == Decimal("2")

    assert db_session.query(TransactionLog).count() == 0
    assert db_session.query(TransactionEditLog).count() == 0
    assert db_session.query(StockRequest).count() == 0
    assert db_session.query(StockRequestLine).count() == 0
    assert db_session.query(IoBatch).count() == 0
    assert db_session.query(IoBundle).count() == 0
    assert db_session.query(IoLine).count() == 0
    assert db_session.query(WarehouseBoxItem).count() == 0


def test_run_cutover_dry_run_does_not_mutate(db_session, make_item):
    item = make_item(
        name="Dry Run",
        process_type_code="TR",
        warehouse_qty=Decimal("10"),
        pending=Decimal("2"),
        model_symbol="3",
        serial_no=1,
    )
    db_session.commit()

    summary = run_cutover(
        db_session,
        [CutoverRow(mes_code=item.mes_code, bucket="warehouse", quantity=99, source_row=2)],
        CutoverOptions(apply=False),
    )

    assert summary.applied is False
    assert summary.items_updated == 1
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    assert inv.warehouse_qty == Decimal("10")
    assert inv.pending_quantity == Decimal("2")


def test_run_cutover_rejects_unknown_mes_code(db_session):
    with pytest.raises(CutoverInputError, match="unknown mes_code"):
        run_cutover(
            db_session,
            [CutoverRow(mes_code="NO-SUCH-CODE", bucket="warehouse", quantity=1, source_row=2)],
            CutoverOptions(apply=True),
        )


def test_run_cutover_rejects_duplicate_bucket_for_same_item(db_session, make_item):
    item = make_item(
        name="Duplicate",
        process_type_code="TR",
        warehouse_qty=Decimal("0"),
        model_symbol="3",
        serial_no=1,
    )

    with pytest.raises(CutoverInputError, match="duplicate"):
        run_cutover(
            db_session,
            [
                CutoverRow(mes_code=item.mes_code, bucket="warehouse", quantity=1, source_row=2),
                CutoverRow(mes_code=item.mes_code, bucket="warehouse", quantity=2, source_row=3),
            ],
            CutoverOptions(apply=True),
        )


def test_parse_cutover_file_reads_canonical_csv(tmp_path):
    path = tmp_path / "cutover.csv"
    path.write_text(
        "mes_code,bucket,department,quantity,location\n"
        "3-TR-0001,warehouse,,1,WH-A\n"
        "3-AA-0001,production,Assembly,\"1,200\",Line-1\n",
        encoding="utf-8",
    )

    rows = parse_cutover_file(path)

    assert rows == [
        CutoverRow(mes_code="3-TR-0001", bucket="warehouse", department=None, quantity=1, location="WH-A", source_row=2),
        CutoverRow(
            mes_code="3-AA-0001",
            bucket="production",
            department="Assembly",
            quantity=1200,
            location="Line-1",
            source_row=3,
        ),
    ]
