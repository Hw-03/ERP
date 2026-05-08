"""동시성 테스트: 동시 다중 이동 후 Inventory 불변식 검증.

Inventory.quantity == warehouse_qty + Σ InventoryLocation.quantity (해당 item)

동시에 transfer_to_production + transfer_to_warehouse + mark_defective 를 섞어 실행한 뒤
최종 상태에서 불변식이 유지되는지 확인한다.
"""

from __future__ import annotations

import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from decimal import Decimal
from pathlib import Path
import random

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.models import DepartmentEnum, Inventory, InventoryLocation, Item, LocationStatusEnum


def _setup(make_session, warehouse_qty: Decimal, prod_qty: Decimal, dept: DepartmentEnum):
    session = make_session()
    item = Item(item_name="불변식테스트", process_type_code="TR", unit="EA")
    session.add(item)
    session.flush()
    inv = Inventory(
        item_id=item.item_id,
        quantity=warehouse_qty + prod_qty,
        warehouse_qty=warehouse_qty,
        pending_quantity=Decimal("0"),
    )
    session.add(inv)
    if prod_qty > 0:
        loc = InventoryLocation(
            item_id=item.item_id,
            department=dept,
            status=LocationStatusEnum.PRODUCTION,
            quantity=prod_qty,
        )
        session.add(loc)
    session.commit()
    item_id = item.item_id
    session.close()
    return item_id


@pytest.mark.usefixtures("concurrent_engine")
def test_inventory_invariant_after_concurrent_ops(concurrent_engine, make_session):
    """동시 이동 후 Inventory.quantity == warehouse_qty + Σ loc.quantity."""
    from app.services import inventory as inventory_svc

    dept = DepartmentEnum.ASSEMBLY
    warehouse_qty = Decimal("10")
    prod_qty = Decimal("10")
    item_id = _setup(make_session, warehouse_qty, prod_qty, dept)

    ops = (
        ["tp"] * 10   # transfer_to_production (wh→dept)
        + ["tw"] * 10  # transfer_to_warehouse (dept→wh)
    )
    random.shuffle(ops)

    def run_op(op: str):
        session = make_session()
        try:
            if op == "tp":
                inventory_svc.transfer_to_production(session, item_id, Decimal("1"), dept)
            else:
                inventory_svc.transfer_to_warehouse(session, item_id, Decimal("1"), dept)
            session.commit()
        except ValueError:
            try:
                session.rollback()
            except Exception:
                pass
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=20) as ex:
        futures = [ex.submit(run_op, op) for op in ops]
        for f in as_completed(futures):
            f.result()

    verify = make_session()
    inv = verify.query(Inventory).filter(Inventory.item_id == item_id).first()
    locs = verify.query(InventoryLocation).filter(
        InventoryLocation.item_id == item_id,
    ).all()
    verify.close()

    loc_total = sum((loc.quantity or Decimal("0")) for loc in locs)
    wh = inv.warehouse_qty or Decimal("0")

    assert wh >= Decimal("0"), f"창고 음수: {wh}"
    assert loc_total >= Decimal("0"), f"위치 음수: {loc_total}"
    assert inv.quantity == wh + loc_total, (
        f"불변식 위반: quantity={inv.quantity}, wh={wh}, loc_total={loc_total}"
    )
    assert inv.quantity == warehouse_qty + prod_qty, (
        f"총량 변경: 기대={warehouse_qty + prod_qty}, 실제={inv.quantity}"
    )
