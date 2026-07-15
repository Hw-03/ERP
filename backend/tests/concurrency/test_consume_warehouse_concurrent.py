"""박스 추적 상태에서 창고 차감 동시성 계약을 검증한다."""

from __future__ import annotations

import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from decimal import Decimal
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.models import (
    BoxSizeEnum,
    Inventory,
    Item,
    WarehouseAngle,
    WarehouseBox,
    WarehouseBoxItem,
)
from app.services import warehouse_map as warehouse_map_svc


def _setup(make_session, warehouse_qty: Decimal):
    session = make_session()
    item = Item(
        item_name="창고차감테스트",
        process_type_code="TR",
        unit="EA",
        model_symbol="9",
        serial_no=1,
    )
    session.add(item)
    session.flush()
    inv = Inventory(
        item_id=item.item_id,
        quantity=warehouse_qty,
        warehouse_qty=warehouse_qty,
        pending_quantity=Decimal("0"),
    )
    session.add(inv)
    angle = WarehouseAngle(
        label="R1 동시성 테스트",
        rows=2,
        layers=2,
        jaris_per_cell=3,
        display_order=1,
        is_active=True,
    )
    session.add(angle)
    session.flush()

    box_specs = [
        # R1: 높은 층, 앞 줄, 앞 자리, 위 스택 순서다.
        ("높은층", 2, 2, 2, 0, 3),
        ("위스택", 1, 1, 0, 1, 4),
        ("아래스택", 1, 1, 0, 0, 5),
    ]
    ordered_boxes = []
    for _label, layer_no, row_no, jari_index, stack_order, quantity in box_specs:
        box = WarehouseBox(
            angle_id=angle.id,
            row_no=row_no,
            layer_no=layer_no,
            jari_index=jari_index,
            size=BoxSizeEnum.SMALL,
            stack_order=stack_order,
        )
        session.add(box)
        session.flush()
        session.add(
            WarehouseBoxItem(
                box_id=box.box_id,
                item_id=item.item_id,
                quantity=quantity,
            )
        )
        ordered_boxes.append((box.box_id, quantity))

    warehouse_map_svc.set_box_tracking_enabled(session, True)
    session.commit()
    item_id = item.item_id
    session.close()
    return item_id, ordered_boxes


@pytest.mark.usefixtures("concurrent_engine")
def test_concurrent_consume_warehouse_no_negative(concurrent_engine, make_session):
    """30개 요청 중 재고 초과 실패가 있어도 재고와 R1 박스는 원자적으로 같다."""
    from app.services import inventory as inventory_svc

    warehouse_qty = Decimal("12")
    item_id, ordered_boxes = _setup(make_session, warehouse_qty)

    def try_consume():
        session = make_session()
        try:
            inventory_svc.consume_warehouse(session, item_id, Decimal("1"))
            session.commit()
            return "success"
        except ValueError:
            session.rollback()
            return "rejected"
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=30) as ex:
        futures = [ex.submit(try_consume) for _ in range(30)]
        outcomes = [future.result() for future in as_completed(futures)]

    success_count = outcomes.count("success")
    rejected_count = outcomes.count("rejected")

    verify = make_session()
    inv = verify.query(Inventory).filter(Inventory.item_id == item_id).first()
    box_rows = (
        verify.query(WarehouseBoxItem)
        .filter(WarehouseBoxItem.item_id == item_id)
        .all()
    )
    final_by_box = {row.box_id: row.quantity for row in box_rows}
    verify.close()

    assert success_count + rejected_count == 30
    assert success_count == int(warehouse_qty)
    assert rejected_count == 30 - int(warehouse_qty)
    assert inv.warehouse_qty >= Decimal("0"), f"창고 재고 음수: {inv.warehouse_qty}"

    expected_remaining = int(warehouse_qty) - success_count
    box_total = sum(final_by_box.values())
    assert all(quantity >= 0 for quantity in final_by_box.values())
    assert int(inv.warehouse_qty) == expected_remaining
    assert box_total == expected_remaining
    assert int(inv.warehouse_qty) == box_total

    # 성공 요청만 R1 순서대로 반영되어야 한다. 실패 요청은 어느 박스도 부분 차감하지 않는다.
    remaining_to_deplete = success_count
    expected_by_box = {}
    for box_id, initial_quantity in ordered_boxes:
        taken = min(remaining_to_deplete, initial_quantity)
        expected_by_box[box_id] = initial_quantity - taken
        remaining_to_deplete -= taken
    assert final_by_box == expected_by_box


@pytest.mark.usefixtures("concurrent_engine")
def test_consume_warehouse_rolls_back_inventory_and_boxes_when_r1_depletion_fails(
    make_session, monkeypatch
):
    """R1 차감 도중 실패하면 재고와 모든 박스 수량을 함께 되돌린다."""
    from app.services import inventory as inventory_svc

    warehouse_qty = Decimal("12")
    consume_qty = Decimal("2")
    item_id, ordered_boxes = _setup(make_session, warehouse_qty)
    initial_by_box = {
        box_id: Decimal(initial_quantity)
        for box_id, initial_quantity in ordered_boxes
    }
    expected_in_transaction = dict(initial_by_box)
    first_box_id, first_box_quantity = ordered_boxes[0]
    expected_in_transaction[first_box_id] = Decimal(first_box_quantity) - consume_qty

    observed = {}
    original_deplete = warehouse_map_svc.deplete_boxes_by_order

    def fail_after_partial_depletion(db, deplete_item_id, qty):
        inventory = (
            db.query(Inventory)
            .filter(Inventory.item_id == deplete_item_id)
            .one()
        )
        observed["inventory_after_decrement"] = inventory.warehouse_qty

        original_deplete(db, deplete_item_id, qty)
        box_rows = (
            db.query(WarehouseBoxItem)
            .filter(WarehouseBoxItem.item_id == deplete_item_id)
            .all()
        )
        observed["boxes_after_depletion"] = {
            row.box_id: row.quantity for row in box_rows
        }
        raise RuntimeError("injected R1 depletion failure")

    monkeypatch.setattr(
        warehouse_map_svc,
        "deplete_boxes_by_order",
        fail_after_partial_depletion,
    )

    session = make_session()
    try:
        with pytest.raises(RuntimeError, match="injected R1 depletion failure"):
            inventory_svc.consume_warehouse(session, item_id, consume_qty)

        assert observed["inventory_after_decrement"] == warehouse_qty - consume_qty
        assert observed["boxes_after_depletion"] == expected_in_transaction
    finally:
        session.rollback()
        session.close()

    verify = make_session()
    try:
        restored_inventory_qty = (
            verify.query(Inventory.warehouse_qty)
            .filter(Inventory.item_id == item_id)
            .scalar()
        )
        restored_box_rows = (
            verify.query(WarehouseBoxItem)
            .filter(WarehouseBoxItem.item_id == item_id)
            .all()
        )
        restored_by_box = {
            row.box_id: row.quantity for row in restored_box_rows
        }
    finally:
        verify.close()

    assert restored_inventory_qty == warehouse_qty
    assert restored_by_box == initial_by_box
    assert sum(restored_by_box.values(), Decimal("0")) == warehouse_qty
