"""동시성 테스트: mark_defective() — 창고/부서에서 불량 격리 시 음수 재고 없음."""

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
    item = Item(item_name="불량테스트품목", process_type_code="TR", unit="EA")
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


def _setup_production_location(make_session, loc_qty: Decimal, dept: DepartmentEnum):
    session = make_session()
    item = Item(item_name="불량테스트품목2", process_type_code="TR", unit="EA")
    session.add(item)
    session.flush()
    inv = Inventory(
        item_id=item.item_id,
        quantity=loc_qty,
        warehouse_qty=Decimal("0"),
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
def test_concurrent_mark_defective_from_warehouse(concurrent_engine, make_session):
    """창고 10개, 20스레드 동시 warehouse→DEFECTIVE → 창고 음수 없음, 총량 불변."""
    from app.services import inventory as inventory_svc

    warehouse_qty = Decimal("10")
    dept = DepartmentEnum.ASSEMBLY
    item_id = _setup_warehouse(make_session, warehouse_qty)

    successes = []
    failures = []

    def try_defective():
        session = make_session()
        try:
            inventory_svc.mark_defective(
                session, item_id, Decimal("1"),
                source="warehouse", target_dept=dept
            )
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
        futures = [ex.submit(try_defective) for _ in range(20)]
        for f in as_completed(futures):
            f.result()

    verify = make_session()
    inv = verify.query(Inventory).filter(Inventory.item_id == item_id).first()
    defective_loc = verify.query(InventoryLocation).filter(
        InventoryLocation.item_id == item_id,
        InventoryLocation.department == dept,
        InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
    ).first()
    verify.close()

    assert inv.warehouse_qty >= Decimal("0"), f"창고 음수: {inv.warehouse_qty}"
    defective_qty = defective_loc.quantity if defective_loc else Decimal("0")
    # 총량 불변
    assert inv.quantity == warehouse_qty, f"총량 변동: {inv.quantity}"
    assert len(successes) <= int(warehouse_qty)
    assert defective_qty == Decimal(str(len(successes)))


@pytest.mark.usefixtures("concurrent_engine")
def test_concurrent_mark_defective_from_production(concurrent_engine, make_session):
    """ASSEMBLY PRODUCTION 10개, 20스레드 동시 →DEFECTIVE → 부서 재고 음수 없음, 총량 불변."""
    from app.services import inventory as inventory_svc

    dept = DepartmentEnum.ASSEMBLY
    loc_qty = Decimal("10")
    item_id = _setup_production_location(make_session, loc_qty, dept)

    successes = []
    failures = []

    def try_defective():
        session = make_session()
        try:
            inventory_svc.mark_defective(
                session, item_id, Decimal("1"),
                source="production", target_dept=dept, source_dept=dept
            )
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
        futures = [ex.submit(try_defective) for _ in range(20)]
        for f in as_completed(futures):
            f.result()

    verify = make_session()
    inv = verify.query(Inventory).filter(Inventory.item_id == item_id).first()
    prod_loc = verify.query(InventoryLocation).filter(
        InventoryLocation.item_id == item_id,
        InventoryLocation.department == dept,
        InventoryLocation.status == LocationStatusEnum.PRODUCTION,
    ).first()
    defective_loc = verify.query(InventoryLocation).filter(
        InventoryLocation.item_id == item_id,
        InventoryLocation.department == dept,
        InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
    ).first()
    verify.close()

    prod_qty = prod_loc.quantity if prod_loc else Decimal("0")
    defective_qty = defective_loc.quantity if defective_loc else Decimal("0")

    assert prod_qty >= Decimal("0"), f"부서 PRODUCTION 음수: {prod_qty}"
    assert defective_qty >= Decimal("0")
    # 총량 불변
    assert inv.quantity == loc_qty, f"총량 변동: {inv.quantity}"
    assert len(successes) <= int(loc_qty)
    assert defective_qty == Decimal(str(len(successes)))
