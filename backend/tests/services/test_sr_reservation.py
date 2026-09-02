from __future__ import annotations

from decimal import Decimal
import inspect
from types import SimpleNamespace
from typing import get_type_hints
import uuid

import pytest
from sqlalchemy import event

from app.models import (
    DepartmentEnum,
    Employee,
    Inventory,
    InventoryLocation,
    LocationStatusEnum,
    RequestBucketEnum,
    WarehouseUnplacedItem,
)
from app.services import inventory as inventory_svc
from app.services.sr_validation import LineInput


D = Decimal
ASSEMBLY = DepartmentEnum.ASSEMBLY
TUBE = DepartmentEnum.TUBE


def _line(
    item_id,
    qty,
    source: RequestBucketEnum,
    department: DepartmentEnum | None = None,
) -> LineInput:
    return LineInput(
        item_id=item_id,
        quantity=D(str(qty)),
        from_bucket=source,
        from_department=department,
        to_bucket=RequestBucketEnum.NONE,
        to_department=None,
    )


def _employee(db_session, *, code: str = "RESERVE-ACTOR") -> Employee:
    employee = Employee(
        employee_code=code,
        name="예약 작업자",
        role="테스트",
        department=ASSEMBLY,
        display_order=1,
        is_active="true",
    )
    db_session.add(employee)
    db_session.flush()
    return employee


def test_reserve_lines_requires_keyword_only_employee_actor() -> None:
    from app.services import sr_reservation

    parameter = inspect.signature(sr_reservation.reserve_lines).parameters["employee"]

    assert parameter.kind is inspect.Parameter.KEYWORD_ONLY
    assert parameter.default is inspect.Parameter.empty
    assert get_type_hints(sr_reservation.reserve_lines)["employee"] is Employee


def test_defect_reservation_locks_item_before_defect_record(
    db_session,
    monkeypatch,
) -> None:
    """격리 예약도 전역 Item→Inventory→U→record 잠금 순서를 따른다."""
    from app.services import defect_records as defect_records_svc
    from app.services import sr_reservation

    employee = _employee(db_session, code="RESERVE-DEFECT-LOCK")
    item_id = uuid.uuid4()
    record_id = uuid.uuid4()
    events: list[str] = []
    line = SimpleNamespace(
        item_id=item_id,
        quantity=D("1"),
        from_bucket=RequestBucketEnum.DEFECTIVE,
        from_department=ASSEMBLY.value,
        defect_quarantine_record_id=record_id,
    )

    monkeypatch.setattr(
        sr_reservation,
        "_prelock_inventories",
        lambda _db, _groups: events.append("item"),
    )
    monkeypatch.setattr(
        defect_records_svc,
        "_get_record_for_action",
        lambda *_args, **_kwargs: events.append("record")
        or SimpleNamespace(record_id=record_id, remaining_quantity=D("1")),
    )
    monkeypatch.setattr(defect_records_svc, "_ensure_available", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(inventory_svc, "_reserve_location", lambda *_args, **_kwargs: None)

    sr_reservation.reserve_lines(db_session, [line], employee=employee)

    assert events == ["item", "record"]


def test_reserve_lines_rejects_non_employee_before_location_mutation(
    make_item,
    make_location,
    db_session,
) -> None:
    from app.services import sr_reservation

    item = make_item(name="actor-required-location")
    location = make_location(item.item_id, department=ASSEMBLY, quantity=D("5"))
    lines = [_line(item.item_id, 1, RequestBucketEnum.PRODUCTION, ASSEMBLY)]

    for invalid_actor in (None, object()):
        with pytest.raises(TypeError, match="employee must be an Employee"):
            sr_reservation.reserve_lines(
                db_session,
                lines,
                employee=invalid_actor,
            )
        db_session.refresh(location)
        assert location.pending_quantity == D("0")


def test_warehouse_reserve_rejects_primitive_actor_before_mutation(
    make_item,
    db_session,
) -> None:
    item = make_item(name="primitive-reserver", warehouse_qty=D("5"))
    inventory = db_session.query(Inventory).filter(
        Inventory.item_id == item.item_id
    ).one()

    with pytest.raises(TypeError, match="employee must be an Employee"):
        inventory_svc.reserve(
            db_session,
            item.item_id,
            D("1"),
            employee=object(),
        )

    db_session.refresh(inventory)
    assert inventory.pending_quantity == D("0")
    assert inventory.last_reserver_employee_id is None
    assert inventory.last_reserver_name is None


def test_warehouse_reserve_rejects_employee_name_spoof_argument(
    make_item,
    db_session,
) -> None:
    item = make_item(name="spoof-reserver", warehouse_qty=D("5"))
    employee = _employee(db_session, code="RESERVE-SPOOF-ACTOR")
    inventory = db_session.query(Inventory).filter(
        Inventory.item_id == item.item_id
    ).one()

    with pytest.raises(TypeError):
        inventory_svc.reserve(
            db_session,
            item.item_id,
            D("1"),
            employee=employee,
            employee_name="위조 작업자",
        )

    db_session.refresh(inventory)
    assert inventory.pending_quantity == D("0")
    assert inventory.last_reserver_employee_id is None
    assert inventory.last_reserver_name is None


def test_warehouse_reserve_snapshots_verified_employee(
    make_item,
    db_session,
) -> None:
    item = make_item(name="verified-reserver", warehouse_qty=D("5"))
    employee = _employee(db_session)

    inventory = inventory_svc.reserve(
        db_session,
        item.item_id,
        D("1"),
        employee=employee,
    )

    assert inventory.pending_quantity == D("1")
    assert inventory.last_reserver_employee_id == employee.employee_id
    assert inventory.last_reserver_name == employee.name


def test_location_reserve_and_release_are_atomic(make_item, make_location, db_session):
    item = make_item()
    location = make_location(item.item_id, department=ASSEMBLY, quantity=D("5"))

    inventory_svc._reserve_location(
        db_session,
        item.item_id,
        D("4"),
        department=ASSEMBLY,
        status=LocationStatusEnum.PRODUCTION,
    )
    with pytest.raises(ValueError):
        inventory_svc._reserve_location(
            db_session,
            item.item_id,
            D("2"),
            department=ASSEMBLY,
            status=LocationStatusEnum.PRODUCTION,
        )

    db_session.refresh(location)
    assert location.pending_quantity == D("4")
    inventory_svc._release_location(
        db_session,
        item.item_id,
        D("4"),
        department=ASSEMBLY,
        status=LocationStatusEnum.PRODUCTION,
    )
    db_session.refresh(location)
    assert location.pending_quantity == D("0")


@pytest.mark.parametrize("missing_count, expected_selects", [(0, 1), (1, 2)])
def test_ensure_and_lock_inventories_uses_bounded_bulk_queries(
    make_item, db_session, missing_count, expected_selects
):
    items = [make_item(name=f"bulk-lock-{missing_count}-{index}") for index in range(6)]
    if missing_count:
        missing = db_session.query(Inventory).filter(
            Inventory.item_id == items[-1].item_id
        ).one()
        db_session.delete(missing)
        db_session.flush()

    statements = []
    bind = db_session.get_bind()

    def record_inventory_sql(_conn, _cursor, statement, _params, _context, _many):
        normalized = " ".join(statement.lower().split())
        if " inventory " in f" {normalized} " and "inventory_locations" not in normalized:
            statements.append(normalized)

    event.listen(bind, "before_cursor_execute", record_inventory_sql)
    try:
        locked = inventory_svc._ensure_and_lock_inventories(
            db_session,
            [item.item_id for item in reversed(items)] + [items[0].item_id],
        )
    finally:
        event.remove(bind, "before_cursor_execute", record_inventory_sql)

    selects = [statement for statement in statements if statement.startswith("select")]
    assert len(selects) == expected_selects
    assert set(locked) == {item.item_id for item in items}
    assert db_session.query(Inventory).filter(
        Inventory.item_id.in_([item.item_id for item in items])
    ).count() == len(items)


def test_ensure_and_lock_inventories_tolerates_concurrent_insert_winner(
    make_item, db_session, monkeypatch
):
    item = make_item(name="concurrent-inventory-winner")
    existing = db_session.query(Inventory).filter(
        Inventory.item_id == item.item_id
    ).one()
    db_session.delete(existing)
    db_session.flush()

    real_lock = inventory_svc.lock_inventories
    calls = 0

    def lock_with_concurrent_winner(db, item_ids):
        nonlocal calls
        calls += 1
        if calls == 1:
            db.add(
                Inventory(
                    item_id=item.item_id,
                    quantity=D("0"),
                    warehouse_qty=D("0"),
                    pending_quantity=D("0"),
                )
            )
            db.flush()
            return {}
        return real_lock(db, item_ids)

    monkeypatch.setattr(inventory_svc, "lock_inventories", lock_with_concurrent_winner)

    locked = inventory_svc._ensure_and_lock_inventories(db_session, [item.item_id])

    assert set(locked) == {item.item_id}
    assert db_session.query(Inventory).filter(
        Inventory.item_id == item.item_id
    ).count() == 1


def test_ensure_and_lock_inventories_creates_zero_unplaced_with_missing_inventory(
    make_item,
    db_session,
):
    item = make_item(name="missing-inventory-and-unplaced")
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    unplaced = db_session.query(WarehouseUnplacedItem).filter_by(
        item_id=item.item_id
    ).one()
    db_session.delete(unplaced)
    db_session.delete(inventory)
    db_session.flush()

    locked = inventory_svc._ensure_and_lock_inventories(
        db_session,
        [item.item_id],
    )

    assert int(locked[item.item_id].warehouse_qty) == 0
    recreated = db_session.query(WarehouseUnplacedItem).filter_by(
        item_id=item.item_id
    ).one()
    assert int(recreated.quantity) == 0


@pytest.mark.parametrize("operation", ["_reserve_location", "_release_location"])
def test_location_reservation_mutation_prelocks_parent_inventory(
    make_item, make_location, db_session, monkeypatch, operation
):
    item = make_item(name=f"{operation}-parent-lock")
    location = make_location(item.item_id, department=ASSEMBLY, quantity=D("5"))
    if operation == "_release_location":
        location.pending_quantity = D("1")
        db_session.flush()
    calls = []
    if operation == "_reserve_location":
        real_ensure = inventory_svc._ensure_and_lock_inventories

        def track_parent_locks(db, item_ids):
            calls.extend(item_ids)
            return real_ensure(db, item_ids)

        monkeypatch.setattr(
            inventory_svc,
            "_ensure_and_lock_inventories",
            track_parent_locks,
        )
    else:
        real_lock_inventory = inventory_svc._lock_inventory

        def track_lock_inventory(db, item_id):
            calls.append(item_id)
            return real_lock_inventory(db, item_id)

        monkeypatch.setattr(inventory_svc, "_lock_inventory", track_lock_inventory)

    getattr(inventory_svc, operation)(
        db_session,
        item.item_id,
        D("1"),
        department=ASSEMBLY,
        status=LocationStatusEnum.PRODUCTION,
    )

    assert calls == [item.item_id]


def test_source_aware_reservation_aggregates_and_sorts_all_outgoing_sources(
    make_item, make_location, db_session
):
    from app.services import sr_reservation

    employee = _employee(db_session, code="RESERVE-SOURCE-ACTOR")
    first = make_item(name="first", warehouse_qty=D("10"))
    second = make_item(name="second")
    production = make_location(second.item_id, department=ASSEMBLY, quantity=D("8"))
    defective = make_location(
        second.item_id,
        department=TUBE,
        status=LocationStatusEnum.DEFECTIVE,
        quantity=D("6"),
    )
    lines = [
        _line(second.item_id, 2, RequestBucketEnum.PRODUCTION, ASSEMBLY),
        _line(first.item_id, 3, RequestBucketEnum.WAREHOUSE),
        _line(second.item_id, 1, RequestBucketEnum.PRODUCTION, ASSEMBLY),
        _line(second.item_id, 4, RequestBucketEnum.DEFECTIVE, TUBE),
        _line(first.item_id, 9, RequestBucketEnum.NONE),
    ]

    groups = sr_reservation.aggregate_reservations(lines)
    assert groups == sorted(groups, key=lambda group: group.sort_key)
    sr_reservation.reserve_lines(db_session, lines, employee=employee)

    warehouse = db_session.query(Inventory).filter(Inventory.item_id == first.item_id).one()
    db_session.refresh(production)
    db_session.refresh(defective)
    assert warehouse.pending_quantity == D("3")
    assert production.pending_quantity == D("3")
    assert defective.pending_quantity == D("4")

    sr_reservation._release_lines(db_session, lines)
    db_session.refresh(warehouse)
    db_session.refresh(production)
    db_session.refresh(defective)
    assert warehouse.pending_quantity == D("0")
    assert production.pending_quantity == D("0")
    assert defective.pending_quantity == D("0")


@pytest.mark.parametrize(
    "operation",
    ["reserve_lines", "_release_lines", "_release_lines_best_effort"],
)
def test_source_mutations_prelock_sorted_unique_inventories(
    make_item, db_session, monkeypatch, operation
):
    from app.services import sr_reservation

    employee = _employee(db_session, code=f"RESERVE-PRELOCK-{operation}")
    first = make_item(name=f"{operation}-first", warehouse_qty=D("10"))
    second = make_item(name=f"{operation}-second")
    lines = [
        _line(second.item_id, 1, RequestBucketEnum.PRODUCTION, ASSEMBLY),
        _line(first.item_id, 1, RequestBucketEnum.WAREHOUSE),
        _line(second.item_id, 1, RequestBucketEnum.PRODUCTION, ASSEMBLY),
    ]
    events = []

    def lock_inventories(_db, item_ids):
        events.append(("lock", item_ids))
        return {item_id: object() for item_id in item_ids}

    def mutate_location(*_args, **_kwargs):
        events.append(("location", None))

    def mutate_warehouse(*_args, **_kwargs):
        events.append(("warehouse", None))

    monkeypatch.setattr(
        sr_reservation.inventory_svc,
        "lock_inventories",
        lock_inventories,
    )
    if operation == "reserve_lines":
        monkeypatch.setattr(
            sr_reservation.inventory_svc,
            "_reserve_location",
            mutate_location,
        )
        monkeypatch.setattr(
            sr_reservation.inventory_svc,
            "reserve",
            mutate_warehouse,
        )
    else:
        monkeypatch.setattr(
            sr_reservation.inventory_svc,
            "_release_location",
            mutate_location,
        )
        monkeypatch.setattr(
            sr_reservation.inventory_svc,
            "_release",
            mutate_warehouse,
        )

    kwargs = {"employee": employee} if operation == "reserve_lines" else {}
    getattr(sr_reservation, operation)(db_session, lines, **kwargs)

    assert events == [
        ("lock", sorted({first.item_id, second.item_id})),
        ("location", None),
        ("warehouse", None),
    ]


def test_reserve_lines_keeps_warehouse_inventory_creation_for_missing_row(
    make_item, db_session
):
    from app.services import sr_reservation

    employee = _employee(db_session, code="RESERVE-MISSING-ACTOR")
    item = make_item(name="missing-inventory-reservation")
    inventory = db_session.query(Inventory).filter(
        Inventory.item_id == item.item_id
    ).one()
    db_session.delete(inventory)
    db_session.flush()

    with pytest.raises(ValueError, match="창고 가용 재고 부족"):
        sr_reservation.reserve_lines(
            db_session,
            [_line(item.item_id, 1, RequestBucketEnum.WAREHOUSE)],
            employee=employee,
        )

    assert db_session.query(Inventory).filter(
        Inventory.item_id == item.item_id
    ).one().warehouse_qty == D("0")


def test_same_item_different_departments_reserve_independently(
    make_item, make_location, db_session
):
    from app.services import sr_reservation

    employee = _employee(db_session, code="RESERVE-DEPT-ACTOR")
    item = make_item()
    assembly = make_location(item.item_id, department=ASSEMBLY, quantity=D("2"))
    tube = make_location(item.item_id, department=TUBE, quantity=D("5"))
    db_session.commit()

    with pytest.raises(ValueError):
        sr_reservation.reserve_lines(
            db_session,
            [
                _line(item.item_id, 3, RequestBucketEnum.PRODUCTION, ASSEMBLY),
                _line(item.item_id, 3, RequestBucketEnum.PRODUCTION, TUBE),
            ],
            employee=employee,
        )

    db_session.rollback()
    assembly = db_session.get(InventoryLocation, assembly.location_id)
    tube = db_session.get(InventoryLocation, tube.location_id)
    assert assembly.pending_quantity == D("0")
    assert tube.pending_quantity == D("0")
