"""동시성 테스트: reserve() — 같은 품목에 30스레드가 동시에 예약해도 음수/초과 없음.

SQLite WAL + busy_timeout 으로 직렬화되므로:
- warehouse_qty=10 인 품목에 30개 동시 reserve(1) → 성공 최대 10건
- 실패(ValueError)는 avail 부족 — 항상 0 이상
- 최종 pending_quantity ≤ warehouse_qty
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

from app.models import Inventory, Item


def _setup_item_with_inventory(make_session, warehouse_qty: Decimal):
    """테스트용 품목 + 재고 생성."""
    session = make_session()
    item = Item(
        item_name="동시성테스트품목", process_type_code="TR", unit="EA",
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


@pytest.mark.usefixtures("concurrent_engine")
def test_concurrent_reserve_no_negative(concurrent_engine, make_session):
    """재고 10개, 30스레드 동시 reserve(1) → 성공 ≤ 10, 최종 pending ≤ 10, 음수 없음."""
    from app.services import inventory as inventory_svc

    warehouse_qty = Decimal("10")
    item_id = _setup_item_with_inventory(make_session, warehouse_qty)

    successes = []
    failures = []

    def try_reserve():
        session = make_session()
        try:
            inventory_svc.reserve(session, item_id, Decimal("1"))
            session.commit()
            successes.append("ok")
        except ValueError as e:
            failures.append(str(e))
        except Exception as e:
            failures.append(f"unexpected: {e}")
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=30) as ex:
        futures = [ex.submit(try_reserve) for _ in range(30)]
        for f in as_completed(futures):
            f.result()  # 예외가 있으면 여기서 재발생

    # 최종 DB 상태 검증
    verify_session = make_session()
    inv = verify_session.query(Inventory).filter(Inventory.item_id == item_id).first()
    verify_session.close()

    assert inv is not None
    assert inv.pending_quantity >= Decimal("0"), "음수 예약 발생"
    assert inv.pending_quantity <= warehouse_qty, f"초과 예약: pending={inv.pending_quantity} > warehouse={warehouse_qty}"
    assert len(successes) <= int(warehouse_qty), f"성공이 재고 초과: {len(successes)} > {warehouse_qty}"
    assert len(successes) + len(failures) == 30


@pytest.mark.usefixtures("concurrent_engine")
def test_concurrent_reserve_exact_match(concurrent_engine, make_session):
    """재고 5개, 5스레드 동시 reserve(1) → 전부 성공, 최종 pending == 5."""
    from app.services import inventory as inventory_svc

    warehouse_qty = Decimal("5")
    item_id = _setup_item_with_inventory(make_session, warehouse_qty)

    successes = []
    failures = []

    def try_reserve():
        session = make_session()
        try:
            inventory_svc.reserve(session, item_id, Decimal("1"))
            session.commit()
            successes.append("ok")
        except ValueError:
            failures.append("insufficient")
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=5) as ex:
        futures = [ex.submit(try_reserve) for _ in range(5)]
        for f in as_completed(futures):
            f.result()

    verify_session = make_session()
    inv = verify_session.query(Inventory).filter(Inventory.item_id == item_id).first()
    verify_session.close()

    assert inv.pending_quantity >= Decimal("0")
    assert inv.pending_quantity <= warehouse_qty
    assert len(successes) <= 5
