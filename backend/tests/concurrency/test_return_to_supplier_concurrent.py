"""동시성 테스트: return_to_supplier() — DEFECTIVE 재고 10개, 20스레드 동시 반품 시 음수 없음."""

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


def _setup(make_session, defective_qty: Decimal, dept: DepartmentEnum):
    session = make_session()
    item = Item(item_name="반품테스트", process_type_code="TR", unit="EA")
    session.add(item)
    session.flush()
    inv = Inventory(
        item_id=item.item_id,
        quantity=defective_qty,
        warehouse_qty=Decimal("0"),
        pending_quantity=Decimal("0"),
    )
    session.add(inv)
    loc = InventoryLocation(
        item_id=item.item_id,
        department=dept,
        status=LocationStatusEnum.DEFECTIVE,
        quantity=defective_qty,
    )
    session.add(loc)
    session.commit()
    item_id = item.item_id
    session.close()
    return item_id


@pytest.mark.usefixtures("concurrent_engine")
def test_return_to_supplier_concurrent(concurrent_engine, make_session):
    """DEFECTIVE 10개, 20스레드 동시 return_to_supplier(1) → 음수 없음, 성공 ≤ 10, 총량 감소 정확."""
    from app.services import inventory as inventory_svc

    initial_qty = Decimal("10")
    dept = DepartmentEnum.ASSEMBLY
    item_id = _setup(make_session, initial_qty, dept)

    successes = []
    failures = []

    def try_return():
        session = make_session()
        try:
            inventory_svc.return_to_supplier(session, item_id, Decimal("1"), dept)
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
        futures = [ex.submit(try_return) for _ in range(20)]
        for f in as_completed(futures):
            f.result()

    verify = make_session()
    loc = verify.query(InventoryLocation).filter(
        InventoryLocation.item_id == item_id,
        InventoryLocation.department == dept,
        InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
    ).first()
    inv = verify.query(Inventory).filter(Inventory.item_id == item_id).first()
    verify.close()

    loc_qty = loc.quantity if loc else Decimal("0")
    assert loc_qty >= Decimal("0"), f"DEFECTIVE 음수: {loc_qty}"
    assert len(successes) <= int(initial_qty), f"성공이 재고 초과: {len(successes)}"
    # 반품은 총량 감소: 초기값 - 성공 수 == 현재 loc qty
    expected = initial_qty - Decimal(str(len(successes)))
    assert loc_qty == expected, (
        f"DEFECTIVE 재고 불일치: 기대={expected}, 실제={loc_qty}, 성공={len(successes)}"
    )
    # Inventory 총량도 감소 확인
    assert inv.quantity == expected, (
        f"Inventory.quantity 불일치: 기대={expected}, 실제={inv.quantity}"
    )
