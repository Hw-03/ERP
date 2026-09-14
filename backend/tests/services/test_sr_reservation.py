from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy import event

from app.models import (
    DepartmentEnum,
    Inventory,
    InventoryLocation,
    LocationStatusEnum,
    RequestBucketEnum,
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


def test_location_reserve_and_release_are_atomic(make_item, make_location, db_session):
    item = make_item()
    location = make_location(item.item_id, department=ASSEMBLY, quantity=D("5"))

    inventory_svc.reserve_location(
        db_session,
        item.item_id,
        D("4"),
        department=ASSEMBLY,
        status=LocationStatusEnum.PRODUCTION,
    )
    with pytest.raises(ValueError):
        inventory_svc.reserve_location(
            db_session,
            item.item_id,
            D("2"),
            department=ASSEMBLY,
            status=LocationStatusEnum.PRODUCTION,
        )

    db_session.refresh(location)
    assert location.pending_quantity == D("4")
    inventory_svc.release_location(
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
        locked = inventory_svc.ensure_and_lock_inventories(
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

    locked = inventory_svc.ensure_and_lock_inventories(db_session, [item.item_id])

    assert set(locked) == {item.item_id}
    assert db_session.query(Inventory).filter(
        Inventory.item_id == item.item_id
    ).count() == 1


@pytest.mark.parametrize("operation", ["reserve_location", "release_location"])
def test_location_reservation_mutation_prelocks_parent_inventory(
    make_item, make_location, db_session, monkeypatch, operation
):
    item = make_item(name=f"{operation}-parent-lock")
    location = make_location(item.item_id, department=ASSEMBLY, quantity=D("5"))
    if operation == "release_location":
        location.pending_quantity = D("1")
        db_session.flush()
    calls = []
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
    sr_reservation.reserve_lines(db_session, lines)

    warehouse = db_session.query(Inventory).filter(Inventory.item_id == first.item_id).one()
    db_session.refresh(production)
    db_session.refresh(defective)
    assert warehouse.pending_quantity == D("3")
    assert production.pending_quantity == D("3")
    assert defective.pending_quantity == D("4")

    sr_reservation.release_lines(db_session, lines)
    db_session.refresh(warehouse)
    db_session.refresh(production)
    db_session.refresh(defective)
    assert warehouse.pending_quantity == D("0")
    assert production.pending_quantity == D("0")
    assert defective.pending_quantity == D("0")


@pytest.mark.parametrize(
    "operation",
    ["reserve_lines", "release_lines", "release_lines_best_effort"],
)
def test_source_mutations_prelock_sorted_unique_inventories(
    make_item, db_session, monkeypatch, operation
):
    from app.services import sr_reservation

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
            "reserve_location",
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
            "release_location",
            mutate_location,
        )
        monkeypatch.setattr(
            sr_reservation.inventory_svc,
            "release",
            mutate_warehouse,
        )

    getattr(sr_reservation, operation)(db_session, lines)

    assert events == [
        ("lock", sorted({first.item_id, second.item_id})),
        ("location", None),
        ("warehouse", None),
    ]


def test_reserve_lines_keeps_warehouse_inventory_creation_for_missing_row(
    make_item, db_session
):
    from app.services import sr_reservation

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
        )

    assert db_session.query(Inventory).filter(
        Inventory.item_id == item.item_id
    ).one().warehouse_qty == D("0")


def test_same_item_different_departments_reserve_independently(
    make_item, make_location, db_session
):
    from app.services import sr_reservation

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
        )

    db_session.rollback()
    assembly = db_session.get(InventoryLocation, assembly.location_id)
    tube = db_session.get(InventoryLocation, tube.location_id)
    assert assembly.pending_quantity == D("0")
    assert tube.pending_quantity == D("0")
