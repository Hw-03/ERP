"""창고 박스 자동 차감(R1~R6) 단위 테스트.

검증 초점:
- _deplete_boxes_by_order: R1 정렬(층↓ 줄↑ 자리↑ 스택↓), R2 순차, R3 빈 박스 건너뜀, R5 부족 차단
- 활성화 플래그와 무관한 물리 원장 차감 (consume_warehouse / transfer_to_production)
- inventory_effect 박스 scope 캡처 + 취소 역재생(R6)
"""
from __future__ import annotations

from decimal import Decimal

import pytest

from app.models import (
    BoxSizeEnum,
    DepartmentEnum,
    Inventory,
    WarehouseAngle,
    WarehouseBox,
    WarehouseBoxItem,
    WarehouseUnplacedItem,
)
from app.services import inv_effect, inv_transfer
from app.services import warehouse_map as wm

D = Decimal


# ──────────────────────────── helpers ────────────────────────────

def _angle(db, *, rows=3, layers=2, jaris=3) -> WarehouseAngle:
    a = WarehouseAngle(label="T", rows=rows, layers=layers, jaris_per_cell=jaris)
    db.add(a)
    db.flush()
    return a


def _place(db, angle, item_id, qty, *, row=1, layer=1, jari=0, stack=0,
           size=BoxSizeEnum.SMALL) -> WarehouseBox:
    """직접 ORM 으로 박스 1개 + 내용물 배치 (자리 용량 검증은 라우터 레벨이라 우회)."""
    box = WarehouseBox(
        angle_id=angle.id, row_no=row, layer_no=layer, jari_index=jari,
        size=size, stack_order=stack,
    )
    db.add(box)
    db.flush()
    db.add(WarehouseBoxItem(box_id=box.box_id, item_id=item_id, quantity=qty))
    unplaced = (
        db.query(WarehouseUnplacedItem)
        .filter(WarehouseUnplacedItem.item_id == item_id)
        .one()
    )
    unplaced.quantity = int(unplaced.quantity) - int(qty)
    db.flush()
    return box


def _qty(db, box) -> int:
    bi = db.query(WarehouseBoxItem).filter(WarehouseBoxItem.box_id == box.box_id).first()
    return int(bi.quantity)


# ──────────────────────────── boxes_total_for_item ────────────────────────────

def test_boxes_total_sums_all_boxes(db_session, make_item):
    item = make_item(warehouse_qty=D("50"))
    angle = _angle(db_session)
    _place(db_session, angle, item.item_id, 20, row=1)
    _place(db_session, angle, item.item_id, 30, row=2)
    assert wm.boxes_total_for_item(db_session, item.item_id) == 50


# ──────────────────────────── R1 정렬 ────────────────────────────

def test_r1_layer_desc_first(db_session, make_item):
    """높은 층(layer_no DESC) 박스부터 차감."""
    item = make_item(warehouse_qty=D("20"))
    angle = _angle(db_session)
    low = _place(db_session, angle, item.item_id, 10, layer=1)
    high = _place(db_session, angle, item.item_id, 10, layer=2)
    wm._deplete_boxes_by_order(db_session, item.item_id, D("5"))
    assert _qty(db_session, high) == 5   # 위층 먼저
    assert _qty(db_session, low) == 10


def test_r1_stack_desc_first(db_session, make_item):
    """같은 자리에선 위 박스(stack_order DESC) 먼저 차감."""
    item = make_item(warehouse_qty=D("20"))
    angle = _angle(db_session)
    bottom = _place(db_session, angle, item.item_id, 10, stack=0)
    top = _place(db_session, angle, item.item_id, 10, stack=1)
    wm._deplete_boxes_by_order(db_session, item.item_id, D("5"))
    assert _qty(db_session, top) == 5
    assert _qty(db_session, bottom) == 10


def test_r2_sequential_depletion(db_session, make_item):
    """20/100/100 에서 50 차감 → 0/70/100 (순서대로 비우고 넘어감)."""
    item = make_item(warehouse_qty=D("220"))
    angle = _angle(db_session)
    b1 = _place(db_session, angle, item.item_id, 20, row=1)
    b2 = _place(db_session, angle, item.item_id, 100, row=2)
    b3 = _place(db_session, angle, item.item_id, 100, row=3)
    wm._deplete_boxes_by_order(db_session, item.item_id, D("50"))
    assert (_qty(db_session, b1), _qty(db_session, b2), _qty(db_session, b3)) == (0, 70, 100)


def test_r3_skips_empty_box(db_session, make_item):
    """수량 0 박스는 건너뛴다."""
    item = make_item(warehouse_qty=D("10"))
    angle = _angle(db_session)
    empty = _place(db_session, angle, item.item_id, 0, row=1)
    full = _place(db_session, angle, item.item_id, 10, row=2)
    wm._deplete_boxes_by_order(db_session, item.item_id, D("5"))
    assert _qty(db_session, empty) == 0
    assert _qty(db_session, full) == 5


def test_r5_insufficient_raises(db_session, make_item):
    """박스 합 < 차감량 → ValueError (R5 항상 차단)."""
    item = make_item(warehouse_qty=D("30"))
    angle = _angle(db_session)
    _place(db_session, angle, item.item_id, 30)
    with pytest.raises(ValueError, match="박스 배치 수량 부족"):
        wm._deplete_boxes_by_order(db_session, item.item_id, D("50"))


# ──────────────────────────── 플래그 게이팅 ────────────────────────────

def test_flag_off_still_consumes_physical_box(db_session, make_item):
    """플래그 OFF여도 물리 원장은 항상 차감된다."""
    item = make_item(warehouse_qty=D("10"))
    angle = _angle(db_session)
    box = _place(db_session, angle, item.item_id, 10)
    inv_transfer._consume_warehouse(db_session, item.item_id, D("4"))
    assert _qty(db_session, box) == 6


def test_flag_on_consume_warehouse_depletes_box(db_session, make_item):
    """플래그 ON: consume_warehouse 시 박스도 차감."""
    wm._set_box_tracking_enabled(db_session, True)
    item = make_item(warehouse_qty=D("10"))
    angle = _angle(db_session)
    box = _place(db_session, angle, item.item_id, 10)
    inv_transfer._consume_warehouse(db_session, item.item_id, D("4"))
    assert _qty(db_session, box) == 6


def test_box_shortage_falls_through_to_unplaced(db_session, make_item):
    """박스가 부족하면 같은 원장의 U에서 이어서 차감한다."""
    wm._set_box_tracking_enabled(db_session, True)
    item = make_item(warehouse_qty=D("10"))
    angle = _angle(db_session)
    box = _place(db_session, angle, item.item_id, 3)
    inv_transfer._consume_warehouse(db_session, item.item_id, D("5"))
    unplaced = (
        db_session.query(WarehouseUnplacedItem)
        .filter(WarehouseUnplacedItem.item_id == item.item_id)
        .one()
    )
    assert _qty(db_session, box) == 0
    assert int(unplaced.quantity) == 5


def test_flag_on_transfer_to_production_depletes_box(db_session, make_item):
    """플래그 ON: 창고→부서 이동도 박스 차감 (주 경로)."""
    wm._set_box_tracking_enabled(db_session, True)
    item = make_item(warehouse_qty=D("10"))
    angle = _angle(db_session)
    box = _place(db_session, angle, item.item_id, 10)
    inv_transfer._transfer_to_production(db_session, item.item_id, D("4"), DepartmentEnum.ASSEMBLY)
    assert _qty(db_session, box) == 6


# ──────────────────────────── effect 캡처 + 역재생(R6) ────────────────────────────

def test_box_effect_capture_and_reverse(db_session, make_item):
    """consume → inventory_effect 에 박스 delta 기록 → 역재생 시 박스·창고 원복."""
    wm._set_box_tracking_enabled(db_session, True)
    item = make_item(warehouse_qty=D("10"))
    angle = _angle(db_session)
    _place(db_session, angle, item.item_id, 10)

    before = inv_effect._snapshot_cells(db_session, item.item_id)
    inv_transfer._consume_warehouse(db_session, item.item_id, D("4"))
    effect = inv_effect._capture_effect(db_session, item.item_id, before)

    by_scope = {}
    for e in effect:
        by_scope.setdefault(e["scope"], []).append(e)
    assert by_scope["warehouse"][0]["delta"] == -4
    assert sum(e["delta"] for e in by_scope["warehouse_box"]) == -4

    inv_effect._apply_effect_reverse(db_session, item.item_id, effect)
    db_session.flush()
    assert wm.boxes_total_for_item(db_session, item.item_id) == 10
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    assert int(inv.warehouse_qty) == 10
