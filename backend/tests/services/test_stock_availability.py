from __future__ import annotations

from decimal import Decimal
import uuid

import pytest

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    LocationStatusEnum,
    ShippingAllocation,
    ShippingRequest,
)
from app.services import inventory as inventory_svc
from app.services import defect_actions
from app.services import shipping as shipping_svc
from app.services import stock_availability
from app.services import stock_math
from app.routers.inventory._shared import list_locations


def _shipping_actor(db_session) -> Employee:
    existing = (
        db_session.query(Employee)
        .filter(Employee.employee_code == "AVAILABILITY-ACTOR")
        .one_or_none()
    )
    if existing is not None:
        return existing
    actor = Employee(
        employee_code="AVAILABILITY-ACTOR",
        name="Availability actor",
        role="worker",
        department=DepartmentEnum.SHIPPING.value,
        level=EmployeeLevelEnum.STAFF,
        display_order=0,
        is_active=True,
    )
    db_session.add(actor)
    db_session.flush()
    return actor


def _shipping_reservation(
    db_session,
    *,
    item,
    quantity: int,
    department: str | None,
    status: str = "RESERVED",
) -> ShippingAllocation:
    actor = _shipping_actor(db_session)
    request = ShippingRequest(
        base_pf_item_id=item.item_id,
        request_quantity=1,
        requested_by_name=actor.name,
    )
    db_session.add(request)
    db_session.flush()
    allocation = ShippingAllocation(
        request_id=request.request_id,
        item_id=item.item_id,
        quantity=quantity,
        department=department,
        status=status,
    )
    db_session.add(allocation)
    db_session.flush()
    return allocation


def test_stock_figures_subtract_only_active_shipping_reservations(
    db_session,
    make_item,
    make_location,
) -> None:
    item = make_item(name="가용량 수식 PF", process_type_code="PF")
    make_location(
        item.item_id,
        department=DepartmentEnum.SHIPPING,
        quantity=Decimal("10"),
    ).pending_quantity = Decimal("2")
    _shipping_reservation(
        db_session,
        item=item,
        quantity=3,
        department=DepartmentEnum.SHIPPING.value,
    )
    _shipping_reservation(
        db_session,
        item=item,
        quantity=7,
        department=DepartmentEnum.SHIPPING.value,
        status="RELEASED",
    )
    db_session.flush()

    figures = stock_math.compute_for(db_session, item.item_id)

    assert figures.shipping_reserved == Decimal("3")
    assert figures.available == Decimal("5")


def test_owner_exemption_keeps_other_shipping_reservations_reserved(
    db_session,
    make_item,
    make_location,
) -> None:
    item = make_item(name="자기 출하 예약 제외 PF", process_type_code="PF")
    make_location(
        item.item_id,
        department=DepartmentEnum.SHIPPING,
        quantity=Decimal("10"),
    ).pending_quantity = Decimal("1")
    owner = _shipping_reservation(
        db_session,
        item=item,
        quantity=3,
        department=DepartmentEnum.SHIPPING.value,
    )
    _shipping_reservation(
        db_session,
        item=item,
        quantity=2,
        department=DepartmentEnum.SHIPPING.value,
    )
    db_session.flush()

    figure = stock_availability.figure_for_cell(
        db_session,
        stock_availability.AvailabilityCell.location(
            item.item_id,
            DepartmentEnum.SHIPPING,
        ),
        owner_request_id=owner.request_id,
    )

    assert figure.active_shipping_reserved == Decimal("5")
    assert figure.owner_shipping_reserved == Decimal("3")
    assert figure.available == Decimal("7")


def test_location_response_subtracts_active_shipping_reservation(
    db_session,
    make_item,
    make_location,
) -> None:
    item = make_item(name="위치 응답 가용량 PF", process_type_code="PF")
    location = make_location(
        item.item_id,
        department=DepartmentEnum.SHIPPING,
        quantity=Decimal("10"),
    )
    location.pending_quantity = Decimal("2")
    _shipping_reservation(
        db_session,
        item=item,
        quantity=3,
        department=DepartmentEnum.SHIPPING.value,
    )
    db_session.flush()

    [response] = list_locations(db_session, item.item_id)

    assert response.available_quantity == Decimal("5")


def test_department_consume_cannot_take_active_shipping_reservation(
    db_session,
    make_item,
    make_location,
) -> None:
    item = make_item(name="생산 선점 차단 PF", process_type_code="PF")
    make_location(
        item.item_id,
        department=DepartmentEnum.SHIPPING,
        quantity=Decimal("10"),
    ).pending_quantity = Decimal("1")
    _shipping_reservation(
        db_session,
        item=item,
        quantity=3,
        department=DepartmentEnum.SHIPPING.value,
    )
    db_session.flush()

    with pytest.raises(ValueError, match="생산 재고 부족"):
        inventory_svc._consume_from_department(
            db_session,
            item.item_id,
            Decimal("7"),
            DepartmentEnum.SHIPPING,
        )


def test_stock_request_location_reservation_cannot_take_shipping_reservation(
    db_session,
    make_item,
    make_location,
) -> None:
    item = make_item(name="요청 선점 차단 PF", process_type_code="PF")
    make_location(
        item.item_id,
        department=DepartmentEnum.SHIPPING,
        quantity=Decimal("10"),
    ).pending_quantity = Decimal("1")
    _shipping_reservation(
        db_session,
        item=item,
        quantity=3,
        department=DepartmentEnum.SHIPPING.value,
    )
    db_session.flush()

    with pytest.raises(ValueError, match="가용 재고 부족"):
        inventory_svc._reserve_location(
            db_session,
            item.item_id,
            Decimal("7"),
            department=DepartmentEnum.SHIPPING.value,
            status=LocationStatusEnum.PRODUCTION,
        )


def test_warehouse_consume_cannot_take_active_shipping_reservation(
    db_session,
    make_item,
) -> None:
    item = make_item(
        name="창고 선점 차단 원자재",
        process_type_code="TR",
        warehouse_qty=Decimal("5"),
        pending=Decimal("1"),
    )
    _shipping_reservation(
        db_session,
        item=item,
        quantity=2,
        department=None,
    )

    with pytest.raises(ValueError, match="가용 재고 부족"):
        inventory_svc._consume_warehouse(db_session, item.item_id, Decimal("3"))


def test_shipping_prepare_subtracts_stock_request_pending(
    db_session,
    make_item,
    make_location,
) -> None:
    item = make_item(name="준비 pending 차단 PF", process_type_code="PF")
    make_location(
        item.item_id,
        department=DepartmentEnum.SHIPPING,
        quantity=Decimal("5"),
    ).pending_quantity = Decimal("2")
    request = ShippingRequest(
        base_pf_item_id=item.item_id,
        final_pf_item_id=item.item_id,
        request_quantity=4,
        requested_by_name="shipping-user",
    )
    db_session.add(request)
    db_session.flush()

    with pytest.raises(shipping_svc.ShippingError, match="가용"):
        shipping_svc._reserve_pickup_items(
            db_session,
            request,
            item,
            4,
            "SHIP-PREP-PENDING",
        )


def test_department_transfer_cannot_move_active_shipping_reservation(
    db_session,
    make_item,
    make_location,
) -> None:
    item = make_item(name="이동 선점 차단 PF", process_type_code="PF")
    source = make_location(
        item.item_id,
        department=DepartmentEnum.SHIPPING,
        quantity=Decimal("10"),
    )
    target = make_location(
        item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        quantity=Decimal("0"),
    )
    source.pending_quantity = Decimal("1")
    _shipping_reservation(
        db_session,
        item=item,
        quantity=3,
        department=DepartmentEnum.SHIPPING.value,
    )
    db_session.flush()

    with pytest.raises(ValueError, match="생산 재고 부족"):
        inventory_svc._transfer_between_departments(
            db_session,
            item.item_id,
            Decimal("7"),
            DepartmentEnum.SHIPPING,
            DepartmentEnum.ASSEMBLY,
        )

    db_session.refresh(source)
    db_session.refresh(target)
    assert source.quantity == Decimal("10")
    assert target.quantity == Decimal("0")


def test_defect_move_cannot_take_active_shipping_reservation(
    db_session,
    make_item,
    make_location,
) -> None:
    item = make_item(name="불량 선점 차단 PF", process_type_code="PF")
    source = make_location(
        item.item_id,
        department=DepartmentEnum.SHIPPING,
        quantity=Decimal("10"),
    )
    target = make_location(
        item.item_id,
        department=DepartmentEnum.SHIPPING,
        status=LocationStatusEnum.DEFECTIVE,
        quantity=Decimal("0"),
    )
    source.pending_quantity = Decimal("1")
    _shipping_reservation(
        db_session,
        item=item,
        quantity=3,
        department=DepartmentEnum.SHIPPING.value,
    )
    db_session.flush()

    with pytest.raises(ValueError, match="생산 재고 부족"):
        inventory_svc._mark_defective(
            db_session,
            item.item_id,
            Decimal("7"),
            inventory_svc.DefectSource(
                kind="production",
                source_dept=DepartmentEnum.SHIPPING,
                target_dept=DepartmentEnum.SHIPPING,
            ),
        )

    db_session.refresh(source)
    db_session.refresh(target)
    assert source.quantity == Decimal("10")
    assert target.quantity == Decimal("0")


def test_shipping_prepare_locks_items_before_inventory(
    db_session,
    make_item,
    make_location,
    monkeypatch,
) -> None:
    item = make_item(name="출하 잠금 순서 PF", process_type_code="PF")
    make_location(
        item.item_id,
        department=DepartmentEnum.SHIPPING,
        quantity=Decimal("1"),
    )
    request = ShippingRequest(
        base_pf_item_id=item.item_id,
        final_pf_item_id=item.item_id,
        request_quantity=1,
        requested_by_name="shipping-user",
    )
    db_session.add(request)
    db_session.flush()
    order: list[str] = []
    real_item_lock = shipping_svc.item_repository.lock_active_many
    real_inventory_lock = inventory_svc._ensure_and_lock_inventories

    def track_item_lock(db, item_ids):
        order.append("item")
        return real_item_lock(db, item_ids)

    def track_inventory_lock(db, item_ids):
        order.append("inventory")
        return real_inventory_lock(db, item_ids)

    monkeypatch.setattr(
        shipping_svc.item_repository,
        "lock_active_many",
        track_item_lock,
    )
    monkeypatch.setattr(
        inventory_svc,
        "_ensure_and_lock_inventories",
        track_inventory_lock,
    )

    shipping_svc._reserve_pickup_items(
        db_session,
        request,
        item,
        1,
        "SHIP-PREP-LOCK",
    )

    assert order[:2] == ["item", "inventory"]


def test_defect_quarantine_locks_item_before_inventory(
    db_session,
    make_item,
    make_location,
    monkeypatch,
) -> None:
    item = make_item(name="불량 잠금 순서 PF", process_type_code="PF")
    make_location(
        item.item_id,
        department=DepartmentEnum.SHIPPING,
        quantity=Decimal("1"),
    )
    actor = _shipping_actor(db_session)
    order: list[str] = []
    real_item_lock = defect_actions.item_repository.lock_active_many
    real_inventory_get = inventory_svc._get_or_create_inventory

    def track_item_lock(db, item_ids):
        order.append("item")
        return real_item_lock(db, item_ids)

    def track_inventory_get(db, item_id):
        order.append("inventory")
        return real_inventory_get(db, item_id)

    monkeypatch.setattr(
        defect_actions.item_repository,
        "lock_active_many",
        track_item_lock,
    )
    monkeypatch.setattr(
        inventory_svc,
        "_get_or_create_inventory",
        track_inventory_get,
    )

    defect_actions.quarantine_inventory(
        db_session,
        item_id=item.item_id,
        qty=Decimal("1"),
        source="production",
        target_dept=DepartmentEnum.SHIPPING,
        source_dept=DepartmentEnum.SHIPPING,
        actor=actor,
        reason_category=None,
        reason_memo=None,
        client_request_id=str(uuid.uuid4()),
    )

    assert order[:2] == ["item", "inventory"]
