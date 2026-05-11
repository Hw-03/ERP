"""동시성 테스트: 패키지 출고 시뮬레이션 — consume_from_department() 다중 아이템 동시 차감.

패키지 출고는 구성품 C, D를 각 1개씩 동시에 차감한다.
10스레드가 동시에 시도 → 성공 ≤ 5 (각 재고 5개 기준), 음수 없음.
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


def _setup_item_with_location(make_session, name: str, loc_qty: Decimal, dept: DepartmentEnum):
    session = make_session()
    item = Item(item_name=name, process_type_code="TR", unit="EA")
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
def test_concurrent_package_ship_no_negative(concurrent_engine, make_session):
    """구성품 C, D 각 5개, 10스레드 동시 패키지 출고 → 양쪽 모두 음수 없음."""
    from app.services import inventory as inventory_svc

    dept = DepartmentEnum.SHIPPING
    loc_qty = Decimal("5")
    item_c_id = _setup_item_with_location(make_session, "패키지구성품C", loc_qty, dept)
    item_d_id = _setup_item_with_location(make_session, "패키지구성품D", loc_qty, dept)

    successes = []
    failures = []

    def try_ship_package():
        session = make_session()
        try:
            # 패키지 출고: C, D 각 1개 차감 (정렬된 순서)
            for item_id in sorted([item_c_id, item_d_id]):
                inventory_svc.consume_from_department(session, item_id, Decimal("1"), dept)
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

    with ThreadPoolExecutor(max_workers=10) as ex:
        futures = [ex.submit(try_ship_package) for _ in range(10)]
        for f in as_completed(futures):
            f.result()

    verify = make_session()
    loc_c = verify.query(InventoryLocation).filter(
        InventoryLocation.item_id == item_c_id,
        InventoryLocation.department == dept,
        InventoryLocation.status == LocationStatusEnum.PRODUCTION,
    ).first()
    loc_d = verify.query(InventoryLocation).filter(
        InventoryLocation.item_id == item_d_id,
        InventoryLocation.department == dept,
        InventoryLocation.status == LocationStatusEnum.PRODUCTION,
    ).first()
    verify.close()

    qty_c = loc_c.quantity if loc_c else Decimal("0")
    qty_d = loc_d.quantity if loc_d else Decimal("0")

    assert qty_c >= Decimal("0"), f"구성품 C 음수: {qty_c}"
    assert qty_d >= Decimal("0"), f"구성품 D 음수: {qty_d}"
    assert len(successes) <= int(loc_qty), f"성공이 재고 초과: {len(successes)}"
    # 성공 수만큼 정확히 차감
    assert qty_c == loc_qty - Decimal(str(len(successes)))
    assert qty_d == loc_qty - Decimal(str(len(successes)))
