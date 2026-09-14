"""동시성 테스트: approve + reject 같은 요청에 동시 실행 → 둘 중 하나만 성공.

RESERVED 요청을 10 쌍(승인 1 + 반려 1)이 동시에 처리할 때:
- 최종 상태가 COMPLETED 또는 REJECTED 중 하나여야 한다.
- TransactionLog 는 최대 1건 (COMPLETED 경우만 생성).
- Inventory 재고는 음수 없음.
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
    TransactionLog,
)
from app.services import stock_requests as svc
from app.services.pin_auth import DEFAULT_PIN_HASH


def _setup(make_session):
    session = make_session()

    requester = Employee(
        employee_code="AREQ01",
        name="요청자_AR",
        role="조립/사원",
        department=DepartmentEnum.ASSEMBLY.value,
        level=EmployeeLevelEnum.STAFF,
        is_active=True,
        display_order=0,
    )
    approver = Employee(
        employee_code="AWHA01",
        name="창고담당자_AR",
        role="조립/사원",
        department=DepartmentEnum.ASSEMBLY.value,
        level=EmployeeLevelEnum.STAFF,
        is_active=True,
        warehouse_role="primary",
        pin_hash=DEFAULT_PIN_HASH,
        display_order=1,
    )
    session.add_all([requester, approver])
    session.flush()

    item = Item(
        item_name="승인반려충돌테스트", process_type_code="TR", unit="EA",
        model_symbol="9", serial_no=1,
    )
    session.add(item)
    session.flush()

    inv = Inventory(
        item_id=item.item_id,
        quantity=Decimal("10"),
        warehouse_qty=Decimal("10"),
        pending_quantity=Decimal("1"),
    )
    session.add(inv)
    session.flush()

    req = StockRequest(
        request_code=svc._generate_request_code(__import__("datetime").datetime.utcnow()),
        requester_employee_id=requester.employee_id,
        requester_name=requester.name,
        requester_department=requester.department,
        request_type=StockRequestTypeEnum.RAW_SHIP,
        status=StockRequestStatusEnum.RESERVED,
        requires_warehouse_approval=True,
    )
    session.add(req)
    session.flush()

    line = StockRequestLine(
        request_id=req.request_id,
        item_id=item.item_id,
        item_name_snapshot=item.item_name,
        mes_code_snapshot=None,
        quantity=Decimal("1"),
        from_bucket=RequestBucketEnum.WAREHOUSE,
        from_department=None,
        to_bucket=RequestBucketEnum.NONE,
        to_department=None,
        status=StockRequestStatusEnum.RESERVED,
    )
    session.add(line)
    session.commit()

    ids = {
        "req_id": req.request_id,
        "approver_id": approver.employee_id,
        "item_id": item.item_id,
    }
    session.close()
    return ids


@pytest.mark.usefixtures("concurrent_engine")
def test_approve_reject_conflict(concurrent_engine, make_session):
    """approve + reject 동시 실행 → 최종 상태 COMPLETED|REJECTED 중 하나, 재고 음수 없음."""
    ids = _setup(make_session)
    req_id = ids["req_id"]
    approver_id = ids["approver_id"]
    item_id = ids["item_id"]

    results = []

    def try_approve():
        session = make_session()
        try:
            req = session.query(StockRequest).filter(StockRequest.request_id == req_id).first()
            approver = session.query(Employee).filter(Employee.employee_id == approver_id).first()
            svc.approve_request(session, req, approver=approver, pin="0000")
            session.commit()
            results.append("approved")
        except Exception as e:
            results.append(f"approve_fail:{e}")
            try:
                session.rollback()
            except Exception:
                pass
        finally:
            session.close()

    def try_reject():
        session = make_session()
        try:
            req = session.query(StockRequest).filter(StockRequest.request_id == req_id).first()
            approver = session.query(Employee).filter(Employee.employee_id == approver_id).first()
            svc.reject_request(session, req, approver=approver, pin="0000", reason="테스트 반려")
            session.commit()
            results.append("rejected")
        except Exception as e:
            results.append(f"reject_fail:{e}")
            try:
                session.rollback()
            except Exception:
                pass
        finally:
            session.close()

    # 10쌍 동시 실행
    with ThreadPoolExecutor(max_workers=20) as ex:
        futures = [ex.submit(fn) for _ in range(10) for fn in (try_approve, try_reject)]
        for f in as_completed(futures):
            f.result()

    verify = make_session()
    req = verify.query(StockRequest).filter(StockRequest.request_id == req_id).first()
    inv = verify.query(Inventory).filter(Inventory.item_id == item_id).first()
    log_count = verify.query(TransactionLog).filter(TransactionLog.item_id == item_id).count()
    verify.close()

    terminal = {StockRequestStatusEnum.COMPLETED, StockRequestStatusEnum.REJECTED}
    assert req.status in terminal, f"최종 상태 비정상: {req.status}"
    assert inv.warehouse_qty >= Decimal("0"), f"창고 재고 음수: {inv.warehouse_qty}"

    if req.status == StockRequestStatusEnum.COMPLETED:
        assert log_count == 1, f"COMPLETED 인데 TransactionLog {log_count}건"
    else:
        assert log_count == 0, f"REJECTED 인데 TransactionLog {log_count}건"
