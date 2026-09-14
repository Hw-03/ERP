"""활성 출하 예약이 다른 재고 소비 경로에서 보존되는지 검증한다."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.models import (
    DepartmentEnum,
    Inventory,
    LocationStatusEnum,
    ShippingAllocation,
    ShippingRequest,
)
from app.services import (
    inv_transfer,
    inventory as inventory_svc,
    shipping as shipping_svc,
    stock_math,
)


def _reserve_shipping(
    db_session,
    item,
    quantity: int,
    *,
    department: DepartmentEnum | None,
) -> ShippingRequest:
    """테스트 품목의 한 물리 셀에 활성 출하 예약을 만든다."""

    request = ShippingRequest(
        base_pf_item_id=item.item_id,
        final_pf_item_id=item.item_id,
        request_quantity=quantity,
        requested_by_name="예약 보호 테스트",
    )
    db_session.add(request)
    db_session.flush()
    db_session.add(
        ShippingAllocation(
            request_id=request.request_id,
            item_id=item.item_id,
            quantity=quantity,
            department=department.value if department is not None else None,
            status="RESERVED",
        )
    )
    db_session.flush()
    return request


def test_department_transfer_cannot_consume_active_shipping_reservation(
    db_session,
    make_item,
    make_location,
):
    """부서→창고 이동 실패 시 물리 재고와 예약은 모두 그대로 남는다."""

    item = make_item(name="예약 PF", process_type_code="PF")
    location = make_location(
        item.item_id,
        department=DepartmentEnum.SHIPPING,
        status=LocationStatusEnum.PRODUCTION,
        quantity=Decimal("100"),
    )
    request = _reserve_shipping(
        db_session,
        item,
        100,
        department=DepartmentEnum.SHIPPING,
    )
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    before = (
        inventory.quantity,
        inventory.warehouse_qty,
        location.quantity,
        db_session.query(ShippingAllocation)
        .filter_by(request_id=request.request_id)
        .one()
        .status,
    )

    with pytest.raises(ValueError, match="출하예약"):
        inv_transfer.transfer_to_warehouse(
            db_session,
            item.item_id,
            Decimal("1"),
            DepartmentEnum.SHIPPING,
        )

    db_session.expire_all()
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    location = (
        db_session.query(type(location))
        .filter_by(
            item_id=item.item_id,
            department=DepartmentEnum.SHIPPING,
            status=LocationStatusEnum.PRODUCTION,
        )
        .one()
    )
    allocation = (
        db_session.query(ShippingAllocation)
        .filter_by(request_id=request.request_id)
        .one()
    )
    assert (
        inventory.quantity,
        inventory.warehouse_qty,
        location.quantity,
        allocation.status,
    ) == before


def test_stock_request_cannot_reserve_active_shipping_reservation(
    db_session,
    make_item,
    make_location,
):
    """재고 요청 Pending도 동일 셀의 활성 출하 예약과 겹칠 수 없다."""

    item = make_item(name="예약 요청 PF", process_type_code="PF")
    location = make_location(
        item.item_id,
        department=DepartmentEnum.SHIPPING,
        status=LocationStatusEnum.PRODUCTION,
        quantity=Decimal("100"),
    )
    _reserve_shipping(
        db_session,
        item,
        100,
        department=DepartmentEnum.SHIPPING,
    )

    with pytest.raises(ValueError, match="출하예약"):
        inventory_svc.reserve_location(
            db_session,
            item.item_id,
            Decimal("1"),
            department=DepartmentEnum.SHIPPING.value,
            status=LocationStatusEnum.PRODUCTION,
        )

    db_session.expire_all()
    assert location.pending_quantity == Decimal("0")


def test_pickup_can_consume_own_reservation_but_not_another_requests(
    db_session,
    make_item,
    make_location,
):
    """픽업은 자기 예약만 가용량에 되돌리고 다른 요청 예약은 보존한다."""

    item = make_item(name="공유 예약 PF", process_type_code="PF")
    location = make_location(
        item.item_id,
        department=DepartmentEnum.SHIPPING,
        status=LocationStatusEnum.PRODUCTION,
        quantity=Decimal("100"),
    )
    owner = _reserve_shipping(
        db_session,
        item,
        60,
        department=DepartmentEnum.SHIPPING,
    )
    other = _reserve_shipping(
        db_session,
        item,
        30,
        department=DepartmentEnum.SHIPPING,
    )

    shipping_svc._ship_from_item_location(
        db_session,
        owner,
        item,
        60,
        "자기 예약 픽업",
    )

    db_session.expire_all()
    assert location.quantity == Decimal("40")
    assert (
        db_session.query(ShippingAllocation)
        .filter_by(request_id=other.request_id, status="RESERVED")
        .count()
        == 1
    )


def test_stock_figures_subtract_shipping_reservations_from_available(
    db_session,
    make_item,
    make_location,
):
    """통합 가용량은 창고·생산 위치의 활성 출하 예약을 모두 차감한다."""

    item = make_item(
        name="가용량 예약 품목",
        process_type_code="PF",
        warehouse_qty=Decimal("10"),
    )
    make_location(
        item.item_id,
        department=DepartmentEnum.SHIPPING,
        quantity=Decimal("20"),
    )
    _reserve_shipping(db_session, item, 4, department=None)
    _reserve_shipping(
        db_session,
        item,
        7,
        department=DepartmentEnum.SHIPPING,
    )

    figures = stock_math.compute_for(db_session, item.item_id)

    assert figures.shipping_reserved == Decimal("11")
    assert figures.warehouse_shipping_reserved == Decimal("4")
    assert figures.available == Decimal("19")
    assert figures.warehouse_available == Decimal("6")
