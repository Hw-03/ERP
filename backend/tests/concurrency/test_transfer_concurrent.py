"""동시성 테스트: transfer_to_production / transfer_to_warehouse — 총량 불변식 유지."""

from __future__ import annotations

import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from decimal import Decimal
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.models import DepartmentEnum, Inventory, InventoryLocation, Item, LocationStatusEnum


def _setup_warehouse_only(make_session, warehouse_qty: Decimal):
    session = make_session()
    item = Item(
        item_name="이동테스트품목", process_type_code="TR", unit="EA",
        model_symbol="9", serial_no=1,
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
    session.commit()
    item_id = item.item_id
    session.close()
    return item_id


def _setup_with_location(make_session, warehouse_qty: Decimal, loc_qty: Decimal, dept: DepartmentEnum):
    session = make_session()
    item = Item(
        item_name="이동테스트품목2", process_type_code="TR", unit="EA",
        model_symbol="9", serial_no=1,
    )
    session.add(item)
    session.flush()
    total = warehouse_qty + loc_qty
    inv = Inventory(
        item_id=item.item_id,
        quantity=total,
        warehouse_qty=warehouse_qty,
        pending_quantity=Decimal("0"),
    )
    session.add(inv)
    session.flush()
    loc = InventoryLocation(
        item_id=item.item_id,
        department=dept,
        status=LocationStatusEnum.PRODUCTION,
        quantity=loc_qty,
    )
    session.add(loc)
    session.commit()
    item_id = item.item_id
    session.close()
    return item_id


@pytest.mark.usefixtures("concurrent_engine")
def test_concurrent_transfer_to_production_no_negative(concurrent_engine, make_session):
    """창고 10개, 20스레드 동시 warehouse→ASSEMBLY PRODUCTION → 음수 없음, 총량 불변."""
    from app.services import inventory as inventory_svc

    warehouse_qty = Decimal("10")
    item_id = _setup_warehouse_only(make_session, warehouse_qty)
    dept = DepartmentEnum.ASSEMBLY

    successes = []
    failures = []

    def try_transfer():
        session = make_session()
        try:
            inventory_svc.transfer_to_production(session, item_id, Decimal("1"), dept)
            session.commit()
            successes.append("ok")
        except ValueError as e:
            failures.append(str(e))
            try:
                session.rollback()
            except Exception:
                pass
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=20) as ex:
        futures = [ex.submit(try_transfer) for _ in range(20)]
        for f in as_completed(futures):
            f.result()

    verify = make_session()
    inv = verify.query(Inventory).filter(Inventory.item_id == item_id).first()
    loc = verify.query(InventoryLocation).filter(
        InventoryLocation.item_id == item_id,
        InventoryLocation.department == dept,
        InventoryLocation.status == LocationStatusEnum.PRODUCTION,
    ).first()
    verify.close()

    assert inv.warehouse_qty >= Decimal("0"), f"창고 음수: {inv.warehouse_qty}"
    loc_qty = loc.quantity if loc else Decimal("0")
    assert loc_qty >= Decimal("0"), f"부서 재고 음수: {loc_qty}"
    # 총량 불변
    assert inv.quantity == warehouse_qty, f"총량 변동: {inv.quantity} != {warehouse_qty}"
    # 성공 수 = 이동된 수
    assert len(successes) <= int(warehouse_qty)
    assert inv.warehouse_qty == warehouse_qty - Decimal(str(len(successes)))


@pytest.mark.usefixtures("concurrent_engine")
def test_concurrent_transfer_to_warehouse_no_negative(concurrent_engine, make_session):
    """ASSEMBLY PRODUCTION 10개, 20스레드 동시 →창고 복귀 → 부서 재고 음수 없음, 총량 불변."""
    from app.services import inventory as inventory_svc

    dept = DepartmentEnum.ASSEMBLY
    loc_qty = Decimal("10")
    item_id = _setup_with_location(make_session, Decimal("0"), loc_qty, dept)

    successes = []
    failures = []

    def try_transfer():
        session = make_session()
        try:
            inventory_svc.transfer_to_warehouse(session, item_id, Decimal("1"), dept)
            session.commit()
            successes.append("ok")
        except ValueError as e:
            failures.append(str(e))
            try:
                session.rollback()
            except Exception:
                pass
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=20) as ex:
        futures = [ex.submit(try_transfer) for _ in range(20)]
        for f in as_completed(futures):
            f.result()

    verify = make_session()
    inv = verify.query(Inventory).filter(Inventory.item_id == item_id).first()
    loc = verify.query(InventoryLocation).filter(
        InventoryLocation.item_id == item_id,
        InventoryLocation.department == dept,
        InventoryLocation.status == LocationStatusEnum.PRODUCTION,
    ).first()
    verify.close()

    loc_final = loc.quantity if loc else Decimal("0")
    assert loc_final >= Decimal("0"), f"부서 재고 음수: {loc_final}"
    assert inv.warehouse_qty >= Decimal("0")
    # 총량 불변
    assert inv.quantity == loc_qty, f"총량 변동: {inv.quantity} != {loc_qty}"
    assert len(successes) <= int(loc_qty)
