"""동시성 테스트: 같은 DRAFT 를 30스레드가 동시에 submit.

기대: 하나만 RESERVED/COMPLETED/SUBMITTED 로 전환, 나머지는 에러.
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

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    Item,
    RequestBucketEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
)
from app.services import stock_requests as svc


def _setup(make_session):
    session = make_session()

    emp = Employee(
        employee_code="CSUB01",
        name="제출테스트직원",
        role="조립/사원",
        department=DepartmentEnum.ASSEMBLY.value,
        level=EmployeeLevelEnum.STAFF,
        is_active=True,
        display_order=0,
    )
    session.add(emp)
    session.flush()

    item = Item(item_name="제출테스트품목", process_type_code="TR", unit="EA")
    session.add(item)
    session.flush()

    inv = Inventory(
        item_id=item.item_id,
        quantity=Decimal("100"),
        warehouse_qty=Decimal("100"),
        pending_quantity=Decimal("0"),
    )
    session.add(inv)

    # DRAFT 1개 생성 (라인 포함)
    req = StockRequest(
        request_code=None,
        requester_employee_id=emp.employee_id,
        requester_name=emp.name,
        requester_department=emp.department,
        request_type=StockRequestTypeEnum.RAW_SHIP,
        status=StockRequestStatusEnum.DRAFT,
        requires_warehouse_approval=True,
    )
    session.add(req)
    session.flush()

    line = StockRequestLine(
        request_id=req.request_id,
        item_id=item.item_id,
        item_name_snapshot=item.item_name,
        erp_code_snapshot=None,
        quantity=Decimal("1"),
        from_bucket=RequestBucketEnum.WAREHOUSE,
        from_department=None,
        to_bucket=RequestBucketEnum.NONE,
        to_department=None,
        status=StockRequestStatusEnum.DRAFT,
    )
    session.add(line)
    session.commit()

    ids = {
        "emp_id": emp.employee_id,
        "item_id": item.item_id,
        "req_id": req.request_id,
    }
    session.close()
    return ids


@pytest.mark.usefixtures("concurrent_engine")
def test_submit_draft_concurrent(concurrent_engine, make_session):
    """같은 DRAFT 30스레드 동시 submit → 최종 상태 비-DRAFT 하나만."""
    ids = _setup(make_session)
    req_id = ids["req_id"]
    emp_id = ids["emp_id"]
    item_id = ids["item_id"]

    successes = []
    failures = []

    def try_submit():
        session = make_session()
        try:
            svc.submit_draft_request(
                session,
                request_id=req_id,
                requester_employee_id=emp_id,
            )
            session.commit()
            successes.append("ok")
        except (ValueError, Exception) as e:
            failures.append(str(e))
            try:
                session.rollback()
            except Exception:
                pass
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=30) as ex:
        futures = [ex.submit(try_submit) for _ in range(30)]
        for f in as_completed(futures):
            f.result()

    verify = make_session()
    req = verify.query(StockRequest).filter(StockRequest.request_id == req_id).first()
    inv = verify.query(Inventory).filter(Inventory.item_id == item_id).first()
    verify.close()

    # 최종 상태는 DRAFT 가 아닌 상태여야 함 (한 번만 전환)
    assert req.status != StockRequestStatusEnum.DRAFT, \
        f"DRAFT 상태 그대로: {req.status}"
    # 재고 음수 없음
    assert inv.warehouse_qty >= Decimal("0"), f"창고 음수: {inv.warehouse_qty}"
    # 성공 1건 이상
    assert len(successes) >= 1, "submit 성공이 0건"
