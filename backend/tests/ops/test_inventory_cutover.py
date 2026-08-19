from __future__ import annotations

from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
import sys
import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.models import (  # noqa: E402
    Department,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    IoBatch,
    IoBundle,
    IoLine,
    Item,
    LocationStatusEnum,
    ProcessType,
    ShippingAllocation,
    ShippingRequest,
    ShippingRequestStatusEnum,
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
from scripts.ops.inventory_cutover import (  # noqa: E402
    CutoverInputError,
    CutoverOptions,
    CutoverRow,
    parse_cutover_file,
    run_cutover,
)
from scripts.ops import inventory_cutover as cutover  # noqa: E402
from app.services import shipping as shipping_service  # noqa: E402


@pytest.fixture
def cutover_session_factory(tmp_path):
    engine = create_engine(
        f"sqlite:///{(tmp_path / 'cutover.db').as_posix()}",
        connect_args={"timeout": 0.05},
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    with factory() as db:
        db.add_all(
            [
                ProcessType(code="TR", prefix="T", suffix="R", stage_order=10),
                ProcessType(code="AA", prefix="A", suffix="A", stage_order=20),
                ProcessType(code="PF", prefix="P", suffix="F", stage_order=30),
            ]
        )
        db.commit()
    try:
        yield factory
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


def _standalone_item(
    db: Session,
    *,
    name: str,
    process_type_code: str,
    warehouse_qty: Decimal,
    serial_no: int,
    pending: Decimal = Decimal("0"),
) -> Item:
    item = Item(
        item_name=name,
        process_type_code=process_type_code,
        unit="EA",
        model_symbol="3",
        serial_no=serial_no,
    )
    db.add(item)
    db.flush()
    db.add(
        Inventory(
            item_id=item.item_id,
            quantity=warehouse_qty,
            warehouse_qty=warehouse_qty,
            pending_quantity=pending,
        )
    )
    db.flush()
    return item


@pytest.mark.parametrize(
    (
        "status",
        "allocation_statuses",
        "active_log_phases",
        "pickup_log_count",
        "pickup_effect_log_count",
        "expected",
    ),
    [
        ("REQUESTED", set(), set(), 0, 0, "FUTURE_DELTA"),
        ("PREPARING", set(), {"COMPONENT_CHANGE"}, 0, 0, "FUTURE_DELTA"),
        ("PREPARING", {"RELEASED"}, {"PREPARE"}, 0, 0, "FUTURE_DELTA"),
        ("PREPARED", set(), set(), 0, 0, "FUTURE_DELTA"),
        ("PREPARED", {"RESERVED"}, {"PREPARE"}, 0, 0, "FUTURE_DELTA"),
        ("PREPARED", {"RESERVED", "RELEASED"}, set(), 0, 0, "FUTURE_DELTA"),
        ("PICKED_UP", {"CONSUMED"}, {"PICKUP"}, 1, 1, "FUTURE_DELTA"),
        ("PICKED_UP", {"CONSUMED", "RELEASED"}, {"PICKUP"}, 2, 2, "FUTURE_DELTA"),
        ("PICKED_UP", set(), {"PICKUP"}, 1, 1, "FUTURE_DELTA"),
        ("CANCELLED", set(), set(), 0, 0, "TERMINAL_SAFE"),
        ("CANCELLED", {"RELEASED"}, {"PREPARE"}, 0, 0, "TERMINAL_SAFE"),
        ("UNKNOWN", set(), set(), 0, 0, "INCONSISTENT"),
        ("REQUESTED", {"RESERVED"}, set(), 0, 0, "INCONSISTENT"),
        ("PREPARING", {"RESERVED"}, set(), 0, 0, "INCONSISTENT"),
        ("PREPARED", {"RELEASED"}, set(), 0, 0, "INCONSISTENT"),
        ("PREPARED", {"CONSUMED"}, set(), 0, 0, "INCONSISTENT"),
        ("PICKED_UP", {"CONSUMED"}, set(), 0, 0, "INCONSISTENT"),
        ("PICKED_UP", {"CONSUMED"}, {"PICKUP"}, 1, 0, "INCONSISTENT"),
        ("PICKED_UP", {"RESERVED", "CONSUMED"}, {"PICKUP"}, 1, 1, "INCONSISTENT"),
        ("CANCELLED", {"RESERVED"}, set(), 0, 0, "INCONSISTENT"),
        ("CANCELLED", {"MYSTERY"}, set(), 0, 0, "INCONSISTENT"),
    ],
)
def test_classify_shipping_cutover_state_matrix(
    status,
    allocation_statuses,
    active_log_phases,
    pickup_log_count,
    pickup_effect_log_count,
    expected,
):
    disposition = cutover.classify_shipping_cutover_state(
        status=status,
        allocation_statuses=allocation_statuses,
        active_log_phases=active_log_phases,
        active_pickup_log_count=pickup_log_count,
        active_pickup_effect_log_count=pickup_effect_log_count,
    )

    assert disposition.value == expected


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


def _shipping_request(db_session, item, status: ShippingRequestStatusEnum) -> ShippingRequest:
    request = ShippingRequest(
        base_pf_item_id=item.item_id,
        status=status,
        request_quantity=1,
        requested_by_name="Cutover test",
    )
    db_session.add(request)
    db_session.flush()
    return request


_ALLOCATION_MATRIX = [
    (),
    ("RESERVED",),
    ("CONSUMED",),
    ("RELEASED",),
    ("RESERVED", "RELEASED"),
    ("CONSUMED", "RELEASED"),
    ("RESERVED", "CONSUMED"),
    ("RESERVED", "CONSUMED", "RELEASED"),
    ("MYSTERY",),
]
_VALID_PERSISTED_STATES = {
    "REQUESTED": {(): "FUTURE_DELTA"},
    "PREPARING": {(): "FUTURE_DELTA", ("RELEASED",): "FUTURE_DELTA"},
    "PREPARED": {
        (): "FUTURE_DELTA",
        ("RESERVED",): "FUTURE_DELTA",
        ("RESERVED", "RELEASED"): "FUTURE_DELTA",
    },
    "PICKED_UP": {
        (): "FUTURE_DELTA",
        ("CONSUMED",): "FUTURE_DELTA",
        ("CONSUMED", "RELEASED"): "FUTURE_DELTA",
    },
    "CANCELLED": {(): "TERMINAL_SAFE", ("RELEASED",): "TERMINAL_SAFE"},
}
_PERSISTED_MATRIX = [
    (status, allocations, _VALID_PERSISTED_STATES[status].get(allocations, "INCONSISTENT"))
    for status in _VALID_PERSISTED_STATES
    for allocations in _ALLOCATION_MATRIX
]


@pytest.mark.parametrize(
    ("status", "allocation_statuses", "expected_disposition"),
    _PERSISTED_MATRIX,
    ids=lambda value: str(value).replace("ShippingRequestStatusEnum.", ""),
)
def test_persisted_shipping_state_allocation_matrix_is_fail_closed(
    cutover_session_factory,
    status,
    allocation_statuses,
    expected_disposition,
):
    with cutover_session_factory() as seed:
        item = _standalone_item(
            seed,
            name=f"Matrix {status} {allocation_statuses}",
            process_type_code="PF",
            warehouse_qty=Decimal("10"),
            serial_no=1,
        )
        request = _shipping_request(seed, item, ShippingRequestStatusEnum(status))
        for index, allocation_status in enumerate(allocation_statuses, start=1):
            seed.add(
                ShippingAllocation(
                    request_id=request.request_id,
                    item_id=item.item_id,
                    quantity=index,
                    status=allocation_status,
                )
            )
        if status == "PICKED_UP":
            seed.add(
                TransactionLog(
                    item_id=item.item_id,
                    transaction_type=TransactionTypeEnum.SHIP,
                    quantity_change=-1,
                    shipping_request_id=request.request_id,
                    shipping_phase="PICKUP",
                    cancelled=False,
                    inventory_effect=[{"scope": "warehouse", "delta": -1}],
                )
            )
        item_id = item.item_id
        item_code = item.mes_code
        request_id = request.request_id
        seed.commit()
    before = _raw_cutover_snapshot(cutover_session_factory)
    rows = [CutoverRow(mes_code=item_code, bucket="warehouse", quantity=99, source_row=2)]

    with cutover_session_factory() as db:
        if expected_disposition == "TERMINAL_SAFE":
            dry_summary = run_cutover(db, rows, CutoverOptions(apply=False))
            [entry] = dry_summary.shipping_report
        else:
            with pytest.raises(CutoverInputError, match=expected_disposition) as caught:
                run_cutover(db, rows, CutoverOptions(apply=False))
            [entry] = caught.value.shipping_report
    assert _raw_cutover_snapshot(cutover_session_factory) == before
    assert entry.request_id == str(request_id)
    assert entry.status == status
    assert entry.disposition.value == expected_disposition
    assert [(row.status, row.quantity) for row in entry.allocation_quantities] == [
        (allocation_status, index)
        for index, allocation_status in sorted(
            enumerate(allocation_statuses, start=1),
            key=lambda pair: pair[1],
        )
    ]

    if expected_disposition != "TERMINAL_SAFE":
        with cutover_session_factory() as db:
            with pytest.raises(CutoverInputError, match=expected_disposition):
                run_cutover(db, rows, CutoverOptions(apply=True))
        assert _raw_cutover_snapshot(cutover_session_factory) == before
        return

    with cutover_session_factory() as db:
        run_cutover(db, rows, CutoverOptions(apply=True))
    with cutover_session_factory() as verify:
        before_commands = verify.query(Inventory).filter(Inventory.item_id == item_id).one().warehouse_qty
        for operation in (
            shipping_service.send_to_prep,
            shipping_service.prepare_cancel,
            shipping_service.pickup_complete,
            shipping_service.pickup_cancel,
        ):
            with pytest.raises(shipping_service.ShippingError):
                operation(verify, request_id)
        verify.expire_all()
        after_commands = verify.query(Inventory).filter(Inventory.item_id == item_id).one().warehouse_qty
    assert before_commands == after_commands == Decimal("99")


def test_run_cutover_dry_run_rejects_future_shipping_without_mutation(db_session, make_item):
    item = make_item(
        name="Shipping Cutover",
        process_type_code="PF",
        warehouse_qty=Decimal("10"),
        model_symbol="3",
        serial_no=1,
    )
    request = _shipping_request(db_session, item, ShippingRequestStatusEnum.REQUESTED)
    db_session.commit()
    before = (
        db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one().warehouse_qty,
        db_session.query(ShippingRequest).count(),
    )

    with pytest.raises(CutoverInputError, match=rf"{request.request_id}.*FUTURE_DELTA"):
        run_cutover(
            db_session,
            [CutoverRow(mes_code=item.mes_code, bucket="warehouse", quantity=99, source_row=2)],
            CutoverOptions(apply=False),
        )

    after = (
        db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one().warehouse_qty,
        db_session.query(ShippingRequest).count(),
    )
    assert after == before


def test_run_cutover_apply_rejects_future_shipping_without_mutation(cutover_session_factory):
    with cutover_session_factory() as seed:
        item = _standalone_item(
            seed,
            name="Shipping Cutover Apply",
            process_type_code="PF",
            warehouse_qty=Decimal("10"),
            serial_no=1,
        )
        request = _shipping_request(seed, item, ShippingRequestStatusEnum.REQUESTED)
        item_id = item.item_id
        mes_code = item.mes_code
        request_id = request.request_id
        seed.commit()

    with cutover_session_factory() as db:
        with pytest.raises(CutoverInputError, match=rf"{request_id}.*FUTURE_DELTA") as caught:
            run_cutover(
                db,
                [CutoverRow(mes_code=mes_code, bucket="warehouse", quantity=99, source_row=2)],
                CutoverOptions(apply=True),
            )

    [entry] = caught.value.shipping_report
    assert entry.request_id == str(request_id)
    assert entry.status == "REQUESTED"
    assert entry.disposition.value == "FUTURE_DELTA"
    assert entry.allocation_quantities == ()

    with cutover_session_factory() as verify:
        assert verify.query(Inventory).filter(Inventory.item_id == item_id).one().warehouse_qty == Decimal("10")
        assert verify.query(ShippingRequest).count() == 1


@pytest.mark.parametrize(
    ("inventory_effect", "expected_effect_count", "expected_disposition"),
    [
        (None, 0, "INCONSISTENT"),
        ([], 0, "INCONSISTENT"),
        ([{"scope": "warehouse", "delta": 0}], 0, "INCONSISTENT"),
        ([{"scope": "warehouse", "delta": "invalid"}], 0, "INCONSISTENT"),
        ([{"scope": "warehouse", "delta": True}], 0, "INCONSISTENT"),
        ([{"scope": "warehouse", "delta": -1.0}], 0, "INCONSISTENT"),
        ([{"scope": "warehouse", "delta": 2_147_483_648}], 0, "INCONSISTENT"),
        ([{"scope": "warehouse", "delta": -1, "extra": "key"}], 0, "INCONSISTENT"),
        ([{"scope": "unknown", "delta": -1}], 0, "INCONSISTENT"),
        (
            [{"scope": "location", "department": "Assembly", "status": "UNKNOWN", "delta": -1}],
            0,
            "INCONSISTENT",
        ),
        ([{"scope": "warehouse_box", "delta": -1}], 0, "INCONSISTENT"),
        ({"scope": "warehouse", "delta": -1}, 0, "INCONSISTENT"),
        ([{"scope": "warehouse", "delta": -1}], 1, "FUTURE_DELTA"),
        (
            [{"scope": "location", "department": "Assembly", "status": "PRODUCTION", "delta": -1}],
            1,
            "FUTURE_DELTA",
        ),
        ([{"scope": "warehouse_box", "box_id": "box-1", "delta": -1}], 1, "FUTURE_DELTA"),
    ],
)
def test_picked_up_requires_effective_pickup_inventory_effect(
    cutover_session_factory,
    inventory_effect,
    expected_effect_count,
    expected_disposition,
):
    with cutover_session_factory() as seed:
        item = _standalone_item(
            seed,
            name="Picked Up Evidence",
            process_type_code="PF",
            warehouse_qty=Decimal("10"),
            serial_no=1,
        )
        request = _shipping_request(seed, item, ShippingRequestStatusEnum.PICKED_UP)
        seed.add(
            ShippingAllocation(
                request_id=request.request_id,
                item_id=item.item_id,
                quantity=1,
                status="CONSUMED",
            )
        )
        seed.add(
            TransactionLog(
                item_id=item.item_id,
                transaction_type=TransactionTypeEnum.SHIP,
                quantity_change=-1,
                shipping_request_id=request.request_id,
                shipping_phase="PICKUP",
                cancelled=False,
                inventory_effect=inventory_effect,
            )
        )
        item_id = item.item_id
        item_code = item.mes_code
        seed.commit()

    with cutover_session_factory() as db:
        [entry] = cutover.inspect_shipping_cutover(db)

    assert entry.active_pickup_log_count == 1
    assert entry.active_pickup_effect_log_count == expected_effect_count
    assert entry.disposition.value == expected_disposition
    for apply in (False, True):
        with cutover_session_factory() as db:
            with pytest.raises(CutoverInputError, match=expected_disposition):
                run_cutover(
                    db,
                    [CutoverRow(mes_code=item_code, bucket="warehouse", quantity=99, source_row=2)],
                    CutoverOptions(apply=apply),
                )
    with cutover_session_factory() as verify:
        assert verify.query(Inventory).filter(Inventory.item_id == item_id).one().warehouse_qty == Decimal("10")


def test_inspect_classifies_unknown_persisted_shipping_status_inconsistent(
    cutover_session_factory,
):
    with cutover_session_factory() as seed:
        item = _standalone_item(
            seed,
            name="Unknown Shipping State",
            process_type_code="PF",
            warehouse_qty=Decimal("10"),
            serial_no=1,
        )
        request = _shipping_request(seed, item, ShippingRequestStatusEnum.CANCELLED)
        request_id = request.request_id
        item_id = item.item_id
        item_code = item.mes_code
        seed.commit()
        seed.execute(
            text("UPDATE shipping_requests SET status = 'LEGACY_UNKNOWN' WHERE request_id = :request_id"),
            {"request_id": request_id.hex},
        )
        seed.commit()

    with cutover_session_factory() as db:
        [entry] = cutover.inspect_shipping_cutover(db)

    assert entry.status == "LEGACY_UNKNOWN"
    assert entry.disposition.value == "INCONSISTENT"
    for apply in (False, True):
        with cutover_session_factory() as db:
            with pytest.raises(CutoverInputError, match="LEGACY_UNKNOWN"):
                run_cutover(
                    db,
                    [CutoverRow(mes_code=item_code, bucket="warehouse", quantity=99, source_row=2)],
                    CutoverOptions(apply=apply),
                )
    with cutover_session_factory() as verify:
        assert verify.query(Inventory).filter(Inventory.item_id == item_id).one().warehouse_qty == Decimal("10")


def test_unknown_persisted_transaction_type_is_reported_without_orm_lookup_error(
    cutover_session_factory,
):
    with cutover_session_factory() as seed:
        item = _standalone_item(
            seed,
            name="Unknown Transaction Type",
            process_type_code="PF",
            warehouse_qty=Decimal("10"),
            serial_no=1,
        )
        request = _shipping_request(seed, item, ShippingRequestStatusEnum.PICKED_UP)
        log = TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.SHIP,
            quantity_change=-1,
            shipping_request_id=request.request_id,
            shipping_phase="PICKUP",
            cancelled=False,
            inventory_effect=[{"scope": "warehouse", "delta": -1}],
        )
        seed.add(log)
        item_id = item.item_id
        item_code = item.mes_code
        seed.commit()
        seed.execute(
            text("UPDATE transaction_logs SET transaction_type = 'UNKNOWN_TX' WHERE log_id = :log_id"),
            {"log_id": log.log_id.hex},
        )
        seed.commit()

    with cutover_session_factory() as db:
        [entry] = cutover.inspect_shipping_cutover(db)

    assert entry.active_pickup_effect_log_count == 1
    assert entry.malformed_active_log_count == 1
    assert entry.disposition.value == "INCONSISTENT"
    for apply in (False, True):
        with cutover_session_factory() as db:
            with pytest.raises(CutoverInputError, match="INCONSISTENT"):
                run_cutover(
                    db,
                    [CutoverRow(mes_code=item_code, bucket="warehouse", quantity=99, source_row=2)],
                    CutoverOptions(apply=apply),
                )
    with cutover_session_factory() as verify:
        assert verify.query(Inventory).filter(Inventory.item_id == item_id).one().warehouse_qty == Decimal("10")


def test_orphan_shipping_allocation_fails_closed(cutover_session_factory):
    orphan_request_id = uuid.uuid4()
    with cutover_session_factory() as seed:
        item = _standalone_item(
            seed,
            name="Orphan Shipping Evidence",
            process_type_code="PF",
            warehouse_qty=Decimal("10"),
            serial_no=1,
        )
        seed.add(
            ShippingAllocation(
                request_id=orphan_request_id,
                item_id=item.item_id,
                quantity=3,
                status="RESERVED",
            )
        )
        item_id = item.item_id
        item_code = item.mes_code
        seed.commit()

    with cutover_session_factory() as db:
        [entry] = cutover.inspect_shipping_cutover(db)

    assert entry.request_id == str(orphan_request_id)
    assert entry.status == "MISSING_REQUEST"
    assert [(row.status, row.quantity) for row in entry.allocation_quantities] == [("RESERVED", 3)]
    assert entry.active_log_phases == ()
    assert entry.disposition.value == "INCONSISTENT"
    for apply in (False, True):
        with cutover_session_factory() as db:
            with pytest.raises(CutoverInputError, match=rf"{orphan_request_id}.*INCONSISTENT"):
                run_cutover(
                    db,
                    [CutoverRow(mes_code=item_code, bucket="warehouse", quantity=99, source_row=2)],
                    CutoverOptions(apply=apply),
                )
    with cutover_session_factory() as verify:
        assert verify.query(Inventory).filter(Inventory.item_id == item_id).one().warehouse_qty == Decimal("10")


def test_orphan_active_shipping_log_fails_closed(cutover_session_factory):
    orphan_request_id = uuid.uuid4()
    with cutover_session_factory() as seed:
        item = _standalone_item(
            seed,
            name="Orphan Shipping Log",
            process_type_code="PF",
            warehouse_qty=Decimal("10"),
            serial_no=1,
        )
        seed.add(
            TransactionLog(
                item_id=item.item_id,
                transaction_type=TransactionTypeEnum.SHIP,
                quantity_change=-1,
                shipping_request_id=orphan_request_id,
                shipping_phase="PICKUP",
                cancelled=False,
                inventory_effect=[{"scope": "warehouse", "delta": -1}],
            )
        )
        item_id = item.item_id
        item_code = item.mes_code
        seed.commit()

    for apply in (False, True):
        with cutover_session_factory() as db:
            with pytest.raises(CutoverInputError, match=rf"{orphan_request_id}.*INCONSISTENT") as caught:
                run_cutover(
                    db,
                    [CutoverRow(mes_code=item_code, bucket="warehouse", quantity=99, source_row=2)],
                    CutoverOptions(apply=apply),
                )

    [entry] = caught.value.shipping_report
    assert entry.status == "MISSING_REQUEST"
    assert entry.active_log_phases == ("PICKUP",)
    assert entry.active_pickup_log_count == 1
    assert entry.active_pickup_effect_log_count == 1
    with cutover_session_factory() as verify:
        assert verify.query(Inventory).filter(Inventory.item_id == item_id).one().warehouse_qty == Decimal("10")


def test_malformed_persisted_inventory_effect_json_fails_closed_without_decode_error(
    cutover_session_factory,
):
    with cutover_session_factory() as seed:
        item = _standalone_item(
            seed,
            name="Malformed JSON Effect",
            process_type_code="PF",
            warehouse_qty=Decimal("10"),
            serial_no=1,
        )
        request = _shipping_request(seed, item, ShippingRequestStatusEnum.PICKED_UP)
        log = TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.SHIP,
            quantity_change=-1,
            shipping_request_id=request.request_id,
            shipping_phase="PICKUP",
            cancelled=False,
            inventory_effect=[{"scope": "warehouse", "delta": -1}],
        )
        seed.add(log)
        item_code = item.mes_code
        seed.commit()
        seed.execute(
            text("UPDATE transaction_logs SET inventory_effect = '{not-json' WHERE log_id = :log_id"),
            {"log_id": log.log_id.hex},
        )
        seed.commit()

    with cutover_session_factory() as db:
        with pytest.raises(CutoverInputError, match="INCONSISTENT") as caught:
            run_cutover(
                db,
                [CutoverRow(mes_code=item_code, bucket="warehouse", quantity=99, source_row=2)],
                CutoverOptions(apply=True),
            )

    [entry] = caught.value.shipping_report
    assert entry.active_pickup_log_count == 1
    assert entry.active_pickup_effect_log_count == 0
    assert entry.malformed_active_log_count == 1


def test_terminal_safe_shipping_cannot_change_inventory_after_apply(cutover_session_factory, capsys):
    with cutover_session_factory() as seed:
        item = _standalone_item(
            seed,
            name="Terminal Shipping",
            process_type_code="PF",
            warehouse_qty=Decimal("10"),
            serial_no=1,
        )
        request = _shipping_request(seed, item, ShippingRequestStatusEnum.CANCELLED)
        seed.add(
            ShippingAllocation(
                request_id=request.request_id,
                item_id=item.item_id,
                quantity=1,
                status="RELEASED",
            )
        )
        seed.add(
            ShippingAllocation(
                request_id=request.request_id,
                item_id=item.item_id,
                quantity=4,
                status="RELEASED",
            )
        )
        seed.add(
            TransactionLog(
                item_id=item.item_id,
                transaction_type=TransactionTypeEnum.SHIP,
                quantity_change=-1,
                shipping_request_id=request.request_id,
                shipping_phase="PREPARE",
                cancelled=False,
                inventory_effect=[{"scope": "warehouse", "delta": -1}],
            )
        )
        item_id = item.item_id
        item_code = item.mes_code
        request_id = request.request_id
        seed.commit()

    with cutover_session_factory() as db:
        dry_summary = run_cutover(
            db,
            [CutoverRow(mes_code=item_code, bucket="warehouse", quantity=99, source_row=2)],
            CutoverOptions(apply=False),
        )
    [entry] = dry_summary.shipping_report
    assert entry.request_id == str(request_id)
    assert entry.status == "CANCELLED"
    assert entry.disposition.value == "TERMINAL_SAFE"
    assert [(row.status, row.quantity) for row in entry.allocation_quantities] == [("RELEASED", 5)]
    assert entry.active_log_phases == ("PREPARE",)
    assert entry.active_pickup_log_count == 0
    assert entry.active_pickup_effect_log_count == 0
    cutover._print_summary(dry_summary)
    output = capsys.readouterr().out
    assert str(request_id) in output
    assert "CANCELLED" in output
    assert "TERMINAL_SAFE" in output
    assert "RELEASED=5" in output
    assert "PREPARE" in output

    with cutover_session_factory() as db:
        summary = run_cutover(
            db,
            [CutoverRow(mes_code=item_code, bucket="warehouse", quantity=99, source_row=2)],
            CutoverOptions(apply=True),
        )
    assert summary.applied is True

    with cutover_session_factory() as verify:
        assert verify.query(TransactionLog).count() == 0
        assert verify.query(ShippingRequest).filter_by(request_id=request_id).one().status is ShippingRequestStatusEnum.CANCELLED
        assert {
            row.status
            for row in verify.query(ShippingAllocation).filter_by(request_id=request_id).all()
        } == {"RELEASED"}
        before = verify.query(Inventory).filter(Inventory.item_id == item_id).one().warehouse_qty
        for operation in (
            shipping_service.send_to_prep,
            shipping_service.prepare_cancel,
            shipping_service.pickup_complete,
            shipping_service.pickup_cancel,
        ):
            with pytest.raises(shipping_service.ShippingError):
                operation(verify, request_id)
        verify.expire_all()
        after = verify.query(Inventory).filter(Inventory.item_id == item_id).one().warehouse_qty
    assert before == after == Decimal("99")


@pytest.mark.parametrize(
    ("status", "expected_code", "expected_disposition", "stream_name"),
    [
        (ShippingRequestStatusEnum.CANCELLED, 0, "TERMINAL_SAFE", "out"),
        (ShippingRequestStatusEnum.REQUESTED, 1, "FUTURE_DELTA", "err"),
    ],
)
def test_cli_preserves_safe_and_unsafe_shipping_preflight_evidence(
    cutover_session_factory,
    monkeypatch,
    capsys,
    status,
    expected_code,
    expected_disposition,
    stream_name,
):
    with cutover_session_factory() as seed:
        item = _standalone_item(
            seed,
            name=f"CLI {status.value}",
            process_type_code="PF",
            warehouse_qty=Decimal("10"),
            serial_no=1,
        )
        request = _shipping_request(seed, item, status)
        if status is ShippingRequestStatusEnum.CANCELLED:
            seed.add(
                ShippingAllocation(
                    request_id=request.request_id,
                    item_id=item.item_id,
                    quantity=2,
                    status="RELEASED",
                )
            )
        item_code = item.mes_code
        request_id = request.request_id
        seed.commit()
    args = SimpleNamespace(
        source=Path("ignored.csv"),
        db_url="sqlite:///ignored.db",
        apply=False,
        confirm="",
        no_backup=False,
        missing_items_zero=False,
        keep_history=False,
        keep_warehouse_map=False,
    )
    monkeypatch.setattr(cutover, "parse_args", lambda: args)
    monkeypatch.setattr(
        cutover,
        "parse_cutover_file",
        lambda _path: [CutoverRow(mes_code=item_code, bucket="warehouse", quantity=99, source_row=2)],
    )
    monkeypatch.setattr(cutover, "_make_session", lambda _url: cutover_session_factory)

    assert cutover.main() == expected_code
    captured = capsys.readouterr()
    output = getattr(captured, stream_name)
    assert str(request_id) in output
    assert status.value in output
    assert expected_disposition in output
    assert "pickup_logs=0" in output
    assert "effective_pickup_effects=0" in output
    if status is ShippingRequestStatusEnum.CANCELLED:
        assert "RELEASED=2" in output


def test_postgresql_cutover_lock_covers_shipping_and_log_tables():
    statements = []

    class FakeDialect:
        name = "postgresql"

    class FakeBind:
        dialect = FakeDialect()

    class FakeSession:
        def in_transaction(self):
            return False

        def get_bind(self):
            return FakeBind()

        def execute(self, statement):
            statements.append(str(statement))

    cutover._acquire_cutover_write_lock(FakeSession())

    assert statements == [
        "LOCK TABLE shipping_requests, shipping_allocations, transaction_logs IN ACCESS EXCLUSIVE MODE"
    ]


def test_cutover_lock_rejects_unsupported_database_dialect():
    class FakeDialect:
        name = "mysql"

    class FakeBind:
        dialect = FakeDialect()

    class FakeSession:
        def in_transaction(self):
            return False

        def get_bind(self):
            return FakeBind()

    with pytest.raises(CutoverInputError, match="does not support.*mysql"):
        cutover._acquire_cutover_write_lock(FakeSession())


def test_postgres_concurrency_runner_requires_cutover_table_lock_evidence():
    runner = (ROOT / "backend" / "scripts" / "verify_postgres_concurrency.py").read_text(encoding="utf-8")

    assert (
        "tests/ops/test_inventory_cutover_postgres_locking.py::"
        "test_postgres_cutover_lock_blocks_shipping_writer_until_rollback"
    ) in runner


def test_run_cutover_clears_history_map_and_reloads_inventory(cutover_session_factory):
    dept = "Assembly"
    with cutover_session_factory() as seed:
        seed.add(Department(name=dept, display_order=1, is_active=True, io_enabled=True))
        employee = _employee(seed, department=dept)
        raw = _standalone_item(
            seed,
            name="Raw",
            process_type_code="TR",
            warehouse_qty=Decimal("10"),
            pending=Decimal("4"),
            serial_no=1,
        )
        assy = _standalone_item(
            seed,
            name="Assembly Part",
            process_type_code="AA",
            warehouse_qty=Decimal("1"),
            serial_no=2,
        )
        seed.add(
            InventoryLocation(
                item_id=assy.item_id,
                department=dept,
                status=LocationStatusEnum.PRODUCTION,
                quantity=2,
            )
        )
        seed.query(Inventory).filter(Inventory.item_id == assy.item_id).update({"quantity": 3})
        _seed_operational_state(seed, raw, employee)
        raw_id = raw.item_id
        assy_id = assy.item_id
        raw_code = raw.mes_code
        assy_code = assy.mes_code
        seed.commit()

    with cutover_session_factory() as db:
        summary = run_cutover(
            db,
            [
                CutoverRow(mes_code=raw_code, bucket="warehouse", quantity=100, source_row=2),
                CutoverRow(mes_code=assy_code, bucket="warehouse", quantity=5, source_row=3),
                CutoverRow(mes_code=assy_code, bucket="production", department=dept, quantity=7, source_row=4),
                CutoverRow(mes_code=assy_code, bucket="defective", department=dept, quantity=2, source_row=5),
            ],
            CutoverOptions(apply=True),
        )

    assert summary.applied is True
    assert summary.items_updated == 2
    assert summary.transaction_logs_deleted == 1
    assert summary.stock_requests_deleted == 1
    assert summary.io_batches_deleted == 1
    assert summary.warehouse_box_items_deleted == 1

    with cutover_session_factory() as verify:
        raw_inv = verify.query(Inventory).filter(Inventory.item_id == raw_id).one()
        assert raw_inv.warehouse_qty == Decimal("100")
        assert raw_inv.quantity == Decimal("100")
        assert raw_inv.pending_quantity == Decimal("0")

        assy_inv = verify.query(Inventory).filter(Inventory.item_id == assy_id).one()
        assert assy_inv.warehouse_qty == Decimal("5")
        assert assy_inv.quantity == Decimal("14")
        assert assy_inv.pending_quantity == Decimal("0")
        locations = {
            (row.department, row.status): row.quantity
            for row in verify.query(InventoryLocation).filter(InventoryLocation.item_id == assy_id)
        }
        assert locations[(dept, LocationStatusEnum.PRODUCTION)] == Decimal("7")
        assert locations[(dept, LocationStatusEnum.DEFECTIVE)] == Decimal("2")

        assert verify.query(TransactionLog).count() == 0
        assert verify.query(TransactionEditLog).count() == 0
        assert verify.query(StockRequest).count() == 0
        assert verify.query(StockRequestLine).count() == 0
        assert verify.query(IoBatch).count() == 0
        assert verify.query(IoBundle).count() == 0
        assert verify.query(IoLine).count() == 0
        assert verify.query(WarehouseBoxItem).count() == 0


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


@pytest.mark.parametrize("apply", [False, True])
def test_run_cutover_rejects_keep_history_before_database_access(db_session, make_item, apply):
    item = make_item(
        name="Keep History",
        process_type_code="TR",
        warehouse_qty=Decimal("10"),
        model_symbol="3",
        serial_no=1,
    )
    db_session.commit()
    before = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one().warehouse_qty

    with pytest.raises(CutoverInputError, match="clear_history"):
        run_cutover(
            db_session,
            [CutoverRow(mes_code=item.mes_code, bucket="warehouse", quantity=99, source_row=2)],
            CutoverOptions(apply=apply, clear_history=False),
        )

    after = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one().warehouse_qty
    assert after == before


@pytest.mark.parametrize("apply", [False, True])
def test_main_rejects_keep_history_before_backup_or_session(monkeypatch, tmp_path, apply, capsys):
    source = tmp_path / "cutover.csv"
    source.write_text("unused", encoding="utf-8")
    args = SimpleNamespace(
        source=source,
        db_url=f"sqlite:///{(tmp_path / 'cutover.db').as_posix()}",
        apply=apply,
        confirm="START-OVER" if apply else "",
        no_backup=False,
        missing_items_zero=False,
        keep_history=True,
        keep_warehouse_map=False,
    )
    monkeypatch.setattr(cutover, "parse_args", lambda: args)
    monkeypatch.setattr(
        cutover,
        "parse_cutover_file",
        lambda _path: [CutoverRow(mes_code="3-TR-0001", bucket="warehouse", quantity=1, source_row=2)],
    )
    backup_calls = []
    session_calls = []
    monkeypatch.setattr(cutover, "_backup_sqlite", lambda path: backup_calls.append(path))
    monkeypatch.setattr(cutover, "_make_session", lambda url: session_calls.append(url))

    assert cutover.main() == 1
    assert backup_calls == []
    assert session_calls == []
    assert "--keep-history" in capsys.readouterr().err


def test_sqlite_cutover_lock_excludes_concurrent_shipping_writer(tmp_path):
    db_path = tmp_path / "cutover-lock.db"
    engine = create_engine(
        f"sqlite:///{db_path.as_posix()}",
        connect_args={"timeout": 0.05},
    )
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE shipping_requests (request_id TEXT PRIMARY KEY, notes TEXT)"))
        connection.execute(text("INSERT INTO shipping_requests VALUES ('req-1', NULL)"))

    with Session(engine) as cutover_session, Session(engine) as writer_session:
        cutover._acquire_cutover_write_lock(cutover_session)

        with pytest.raises(OperationalError, match="locked"):
            writer_session.execute(
                text("UPDATE shipping_requests SET notes = 'racer' WHERE request_id = 'req-1'")
            )
            writer_session.commit()
        writer_session.rollback()
        cutover_session.rollback()

        writer_session.execute(
            text("UPDATE shipping_requests SET notes = 'after-cutover' WHERE request_id = 'req-1'")
        )
        writer_session.commit()

    with engine.connect() as connection:
        assert connection.scalar(text("SELECT notes FROM shipping_requests WHERE request_id = 'req-1'")) == "after-cutover"
    engine.dispose()


def test_failed_sqlite_cutover_lock_rolls_back_waiting_session(tmp_path):
    engine = create_engine(
        f"sqlite:///{(tmp_path / 'failed-lock.db').as_posix()}",
        connect_args={"timeout": 0.05},
    )
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE shipping_requests (request_id TEXT PRIMARY KEY)"))
    with Session(engine) as holder, Session(engine) as waiter:
        cutover._acquire_cutover_write_lock(holder)

        with pytest.raises(OperationalError, match="locked"):
            cutover._acquire_cutover_write_lock(waiter)

        assert waiter.in_transaction() is False
        holder.rollback()
    engine.dispose()


def test_dry_run_does_not_acquire_write_lock(db_session, make_item, monkeypatch):
    item = make_item(
        name="No Dry Run Lock",
        process_type_code="TR",
        warehouse_qty=Decimal("10"),
        model_symbol="3",
        serial_no=1,
    )
    db_session.commit()
    monkeypatch.setattr(
        cutover,
        "_acquire_cutover_write_lock",
        lambda _db: pytest.fail("dry-run acquired a write lock"),
    )

    summary = run_cutover(
        db_session,
        [CutoverRow(mes_code=item.mes_code, bucket="warehouse", quantity=99, source_row=2)],
        CutoverOptions(apply=False),
    )

    assert summary.applied is False


def test_apply_rejects_session_with_open_transaction(db_session, make_item):
    item = make_item(
        name="Open Transaction",
        process_type_code="TR",
        warehouse_qty=Decimal("10"),
        model_symbol="3",
        serial_no=1,
    )
    db_session.commit()
    db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()

    with pytest.raises(CutoverInputError, match="fresh Session"):
        run_cutover(
            db_session,
            [CutoverRow(mes_code=item.mes_code, bucket="warehouse", quantity=99, source_row=2)],
            CutoverOptions(apply=True),
        )


def _raw_cutover_snapshot(factory) -> tuple:
    with factory() as db:
        inventory = tuple(
            db.execute(
                text(
                    "SELECT item_id, quantity, warehouse_qty, pending_quantity "
                    "FROM inventory ORDER BY item_id"
                )
            ).all()
        )
        counts = tuple(
            db.execute(
                text(
                    "SELECT "
                    "(SELECT count(*) FROM inventory_locations), "
                    "(SELECT count(*) FROM transaction_logs), "
                    "(SELECT count(*) FROM transaction_edit_logs), "
                    "(SELECT count(*) FROM stock_requests), "
                    "(SELECT count(*) FROM stock_request_lines), "
                    "(SELECT count(*) FROM io_batches), "
                    "(SELECT count(*) FROM io_bundles), "
                    "(SELECT count(*) FROM io_lines), "
                    "(SELECT count(*) FROM warehouse_box_items)"
                )
            ).one()
        )
        shipping_requests = tuple(
            db.execute(
                text("SELECT request_id, status FROM shipping_requests ORDER BY request_id")
            ).all()
        )
        shipping_allocations = tuple(
            db.execute(
                text(
                    "SELECT allocation_id, request_id, item_id, quantity, status "
                    "FROM shipping_allocations ORDER BY allocation_id"
                )
            ).all()
        )
    return inventory, counts, shipping_requests, shipping_allocations


def test_apply_rolls_back_every_table_when_target_write_fails(
    cutover_session_factory,
    monkeypatch,
):
    with cutover_session_factory() as seed:
        item = _standalone_item(
            seed,
            name="Rollback Target",
            process_type_code="TR",
            warehouse_qty=Decimal("10"),
            serial_no=1,
        )
        employee = _employee(seed, department="Assembly")
        _seed_operational_state(seed, item, employee)
        item_code = item.mes_code
        seed.commit()
    before = _raw_cutover_snapshot(cutover_session_factory)

    def fail_after_clear(_db, _targets):
        raise RuntimeError("forced target failure")

    monkeypatch.setattr(cutover, "_apply_targets", fail_after_clear)
    with cutover_session_factory() as db:
        with pytest.raises(RuntimeError, match="forced target failure"):
            run_cutover(
                db,
                [CutoverRow(mes_code=item_code, bucket="warehouse", quantity=99, source_row=2)],
                CutoverOptions(apply=True),
            )
        assert db.in_transaction() is False

    after = _raw_cutover_snapshot(cutover_session_factory)
    assert after == before


def test_run_cutover_rejects_unknown_mes_code(db_session):
    with pytest.raises(CutoverInputError, match="unknown mes_code"):
        run_cutover(
            db_session,
            [CutoverRow(mes_code="NO-SUCH-CODE", bucket="warehouse", quantity=1, source_row=2)],
            CutoverOptions(apply=False),
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
            CutoverOptions(apply=False),
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
