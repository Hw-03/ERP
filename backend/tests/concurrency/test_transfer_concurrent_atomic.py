"""동시성 테스트: transfer_to_production / transfer_to_warehouse 원자적 UPDATE 검증.

- transfer_to_production: 창고 10개, 20스레드 동시 이동 → 창고 음수 없음, 총량 불변
- transfer_to_warehouse: 부서 10개, 20스레드 동시 복귀 → 부서 음수 없음, 총량 불변
"""

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


def _setup_warehouse(make_session, warehouse_qty: Decimal):
    session = make_session()
    item = Item(item_name="이동테스트_창고", process_type_code="TA", unit="EA")
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


def _setup_dept(make_session, dept_qty: Decimal, dept: DepartmentEnum):
    session = make_session()
    item = Item(item_name="이동테스트_부서", process_type_code="TA", unit="EA")
    session.add(item)
    session.flush()
    inv = Inventory(
        item_id=item.item_id,
        quantity=dept_qty,
        warehouse_qty=Decimal("0"),
        pending_quantity=Decimal("0"),
    )
    session.add(inv)
    loc = InventoryLocation(
        item_id=item.item_id,
        department=dept,
        status=LocationStatusEnum.PRODUCTION,
        quantity=dept_qty,
    )
    session.add(loc)
    session.commit()
    item_id = item.item_id
    session.close()
    return item_id


@pytest.mark.usefixtures("concurrent_engine")
def test_transfer_to_production_concurrent(concurrent_engine, make_session):
    """창고 10개, 20스레드 동시 transfer_to_production(1) → 창고 음수 없음, 총량 불변."""
    from app.services import inventory as inventory_svc

    initial_qty = Decimal("10")
    dept = DepartmentEnum.TUBE
    item_id = _setup_warehouse(make_session, initial_qty)

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

    loc_qty = loc.quantity if loc else Decimal("0")
    assert inv.warehouse_qty >= Decimal("0"), f"창고 음수: {inv.warehouse_qty}"
    assert loc_qty >= Decimal("0"), f"부서 음수: {loc_qty}"
    assert inv.warehouse_qty + loc_qty == initial_qty, (
        f"총량 불변 위반: wh={inv.warehouse_qty} loc={loc_qty} sum={inv.warehouse_qty + loc_qty}"
    )
    assert len(successes) <= int(initial_qty), f"성공이 재고 초과: {len(successes)}"


@pytest.mark.usefixtures("concurrent_engine")
def test_transfer_to_warehouse_concurrent(concurrent_engine, make_session):
    """부서 10개, 20스레드 동시 transfer_to_warehouse(1) → 부서 음수 없음, 총량 불변."""
    from app.services import inventory as inventory_svc

    initial_qty = Decimal("10")
    dept = DepartmentEnum.TUBE
    item_id = _setup_dept(make_session, initial_qty, dept)

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

    loc_qty = loc.quantity if loc else Decimal("0")
    assert loc_qty >= Decimal("0"), f"부서 음수: {loc_qty}"
    assert inv.warehouse_qty >= Decimal("0"), f"창고 음수: {inv.warehouse_qty}"
    assert inv.warehouse_qty + loc_qty == initial_qty, (
        f"총량 불변 위반: wh={inv.warehouse_qty} loc={loc_qty}"
    )
    assert len(successes) <= int(initial_qty), f"성공이 재고 초과: {len(successes)}"
