"""동시성 테스트: consume_warehouse() — 창고 재고 10개, 30스레드 동시 차감해도 음수 없음."""

from __future__ import annotations

import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from decimal import Decimal
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.models import Inventory, Item


def _setup(make_session, warehouse_qty: Decimal):
    session = make_session()
    item = Item(item_name="창고차감테스트", process_type_code="TR", unit="EA")
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


@pytest.mark.usefixtures("concurrent_engine")
def test_concurrent_consume_warehouse_no_negative(concurrent_engine, make_session):
    """창고 10개, 30스레드 동시 consume_warehouse(1) → 음수 없음, 성공 ≤ 10."""
    from app.services import inventory as inventory_svc

    warehouse_qty = Decimal("10")
    item_id = _setup(make_session, warehouse_qty)

    successes = []
    failures = []

    def try_consume():
        session = make_session()
        try:
            inventory_svc.consume_warehouse(session, item_id, Decimal("1"))
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

    with ThreadPoolExecutor(max_workers=30) as ex:
        futures = [ex.submit(try_consume) for _ in range(30)]
        for f in as_completed(futures):
            f.result()

    verify = make_session()
    inv = verify.query(Inventory).filter(Inventory.item_id == item_id).first()
    verify.close()

    assert inv.warehouse_qty >= Decimal("0"), f"창고 재고 음수: {inv.warehouse_qty}"
    assert len(successes) <= int(warehouse_qty), f"성공이 재고 초과: {len(successes)}"
    # 성공 수만큼 정확히 차감되어야 함
    expected_wh = warehouse_qty - Decimal(str(len(successes)))
    assert inv.warehouse_qty == expected_wh, (
        f"창고 재고 불일치: 기대={expected_wh}, 실제={inv.warehouse_qty}"
    )
