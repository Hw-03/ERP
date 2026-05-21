"""동시성 테스트: submit_adjustment() — 교차 아이템 조정 시 deadlock 없음, 음수 없음.

핵심: 10스레드는 [A→out, B→out] 순서, 10스레드는 [B→out, A→out] 순서로 조정.
정렬된 선락(lock_inventories) 적용 후에는 교착 없이 완료되어야 한다.
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
from app.models import DeptAdjSubTypeEnum


def _setup_two_items(make_session, loc_qty: Decimal, dept: DepartmentEnum):
    session = make_session()
    item_a = Item(item_name="조정테스트A", process_type_code="TR", unit="EA")
    item_b = Item(item_name="조정테스트B", process_type_code="TR", unit="EA")
    session.add_all([item_a, item_b])
    session.flush()

    for item in [item_a, item_b]:
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
    ids = item_a.item_id, item_b.item_id
    session.close()
    return ids


@pytest.mark.usefixtures("concurrent_engine")
def test_concurrent_dept_adjustment_no_deadlock(concurrent_engine, make_session):
    """교차 순서 부서 조정 — deadlock 없이 완료, qty >= 0."""
    from app.services.dept_adjustment import AdjLine, submit_adjustment

    dept = DepartmentEnum.ASSEMBLY
    loc_qty = Decimal("20")
    item_a_id, item_b_id = _setup_two_items(make_session, loc_qty, dept)

    successes = []
    failures = []

    def adjust_ab():
        """A→out, B→out 순서"""
        session = make_session()
        try:
            lines = [
                AdjLine(item_id=item_a_id, direction="out", quantity=Decimal("1"), department=dept),
                AdjLine(item_id=item_b_id, direction="out", quantity=Decimal("1"), department=dept),
            ]
            submit_adjustment(session, DeptAdjSubTypeEnum.CORRECTION, lines)
            session.commit()
            successes.append("ab")
        except ValueError as e:
            failures.append(str(e))
            try:
                session.rollback()
            except Exception:
                pass
        finally:
            session.close()

    def adjust_ba():
        """B→out, A→out 순서 (역방향 — deadlock 유발 패턴)"""
        session = make_session()
        try:
            lines = [
                AdjLine(item_id=item_b_id, direction="out", quantity=Decimal("1"), department=dept),
                AdjLine(item_id=item_a_id, direction="out", quantity=Decimal("1"), department=dept),
            ]
            submit_adjustment(session, DeptAdjSubTypeEnum.CORRECTION, lines)
            session.commit()
            successes.append("ba")
        except ValueError as e:
            failures.append(str(e))
            try:
                session.rollback()
            except Exception:
                pass
        finally:
            session.close()

    tasks = [adjust_ab] * 10 + [adjust_ba] * 10
    with ThreadPoolExecutor(max_workers=20) as ex:
        futures = [ex.submit(t) for t in tasks]
        for f in as_completed(futures):
            f.result()  # deadlock이면 OperationalError 발생

    verify = make_session()
    loc_a = verify.query(InventoryLocation).filter(
        InventoryLocation.item_id == item_a_id,
        InventoryLocation.department == dept,
        InventoryLocation.status == LocationStatusEnum.PRODUCTION,
    ).first()
    loc_b = verify.query(InventoryLocation).filter(
        InventoryLocation.item_id == item_b_id,
        InventoryLocation.department == dept,
        InventoryLocation.status == LocationStatusEnum.PRODUCTION,
    ).first()
    verify.close()

    qty_a = loc_a.quantity if loc_a else Decimal("0")
    qty_b = loc_b.quantity if loc_b else Decimal("0")

    assert qty_a >= Decimal("0"), f"A 음수: {qty_a}"
    assert qty_b >= Decimal("0"), f"B 음수: {qty_b}"
    # 모든 스레드가 완료되어야 함 (deadlock으로 hung 없음)
    assert len(successes) + len(failures) == 20, "일부 스레드 미완료 (deadlock?)"
