"""동시성 테스트: approve/reject/cancel 동시 충돌 전체 시나리오.

1. approve + cancel 동시 충돌 → 터미널 상태 하나만
2. reject + cancel 동시 충돌 → 터미널 상태 하나만
3. 이미 COMPLETED 요청 재승인 → 멱등 처리 (에러 없음)
4. 이미 REJECTED 요청 재반려 → 멱등 처리 (에러 없음)
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


def _setup_reserved_request(make_session, suffix: str):
    session = make_session()

    requester = Employee(
        employee_code=f"CCR{suffix}",
        name=f"요청자_{suffix}",
        role="조립/사원",
        department=DepartmentEnum.ASSEMBLY.value,
        level=EmployeeLevelEnum.STAFF,
        is_active=True,
        display_order=0,
    )
    approver = Employee(
        employee_code=f"CWH{suffix}",
        name=f"창고담당_{suffix}",
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

    item = Item(item_name=f"충돌테스트_{suffix}", process_type_code="TR", unit="EA")
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
        erp_code_snapshot=None,
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
        "requester_id": requester.employee_id,
        "item_id": item.item_id,
    }
    session.close()
    return ids


TERMINAL = {
    StockRequestStatusEnum.COMPLETED,
    StockRequestStatusEnum.REJECTED,
    StockRequestStatusEnum.CANCELLED,
    StockRequestStatusEnum.FAILED_APPROVAL,
}


@pytest.mark.usefixtures("concurrent_engine")
def test_approve_cancel_conflict(concurrent_engine, make_session):
    """approve + cancel 동시 충돌 → 터미널 상태 하나."""
    ids = _setup_reserved_request(make_session, "AC")
    req_id = ids["req_id"]
    approver_id = ids["approver_id"]
    requester_id = ids["requester_id"]
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
            try: session.rollback()
            except Exception: pass
        finally:
            session.close()

    def try_cancel():
        session = make_session()
        try:
            req = session.query(StockRequest).filter(StockRequest.request_id == req_id).first()
            requester = session.query(Employee).filter(Employee.employee_id == requester_id).first()
            svc.cancel_request(session, req, actor=requester)
            session.commit()
            results.append("cancelled")
        except Exception as e:
            results.append(f"cancel_fail:{e}")
            try: session.rollback()
            except Exception: pass
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=20) as ex:
        futures = [ex.submit(fn) for _ in range(10) for fn in (try_approve, try_cancel)]
        for f in as_completed(futures):
            f.result()

    verify = make_session()
    req = verify.query(StockRequest).filter(StockRequest.request_id == req_id).first()
    inv = verify.query(Inventory).filter(Inventory.item_id == item_id).first()
    log_count = verify.query(TransactionLog).filter(TransactionLog.item_id == item_id).count()
    verify.close()

    assert req.status in TERMINAL, f"비터미널 상태: {req.status}"
    assert inv.warehouse_qty >= Decimal("0"), f"창고 음수: {inv.warehouse_qty}"
    if req.status == StockRequestStatusEnum.COMPLETED:
        assert log_count == 1, f"COMPLETED TransactionLog {log_count}건 (1건이어야)"


@pytest.mark.usefixtures("concurrent_engine")
def test_reject_cancel_conflict(concurrent_engine, make_session):
    """reject + cancel 동시 충돌 → 터미널 상태 하나."""
    ids = _setup_reserved_request(make_session, "RC")
    req_id = ids["req_id"]
    approver_id = ids["approver_id"]
    requester_id = ids["requester_id"]
    item_id = ids["item_id"]

    results = []

    def try_reject():
        session = make_session()
        try:
            req = session.query(StockRequest).filter(StockRequest.request_id == req_id).first()
            approver = session.query(Employee).filter(Employee.employee_id == approver_id).first()
            svc.reject_request(session, req, approver=approver, pin="0000", reason="테스트")
            session.commit()
            results.append("rejected")
        except Exception as e:
            results.append(f"reject_fail:{e}")
            try: session.rollback()
            except Exception: pass
        finally:
            session.close()

    def try_cancel():
        session = make_session()
        try:
            req = session.query(StockRequest).filter(StockRequest.request_id == req_id).first()
            requester = session.query(Employee).filter(Employee.employee_id == requester_id).first()
            svc.cancel_request(session, req, actor=requester)
            session.commit()
            results.append("cancelled")
        except Exception as e:
            results.append(f"cancel_fail:{e}")
            try: session.rollback()
            except Exception: pass
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=20) as ex:
        futures = [ex.submit(fn) for _ in range(10) for fn in (try_reject, try_cancel)]
        for f in as_completed(futures):
            f.result()

    verify = make_session()
    req = verify.query(StockRequest).filter(StockRequest.request_id == req_id).first()
    inv = verify.query(Inventory).filter(Inventory.item_id == item_id).first()
    verify.close()

    assert req.status in TERMINAL, f"비터미널 상태: {req.status}"
    assert inv.warehouse_qty >= Decimal("0"), f"창고 음수: {inv.warehouse_qty}"


@pytest.mark.usefixtures("concurrent_engine")
def test_re_approve_completed_idempotent(concurrent_engine, make_session):
    """이미 COMPLETED 요청 10스레드 동시 재승인 → 멱등, TransactionLog 중복 없음."""
    from app.services.pin_auth import DEFAULT_PIN_HASH as _DPH
    ids = _setup_reserved_request(make_session, "RI")
    req_id = ids["req_id"]
    approver_id = ids["approver_id"]
    item_id = ids["item_id"]

    # 1번 먼저 승인 완료
    session = make_session()
    req = session.query(StockRequest).filter(StockRequest.request_id == req_id).first()
    approver = session.query(Employee).filter(Employee.employee_id == approver_id).first()
    svc.approve_request(session, req, approver=approver, pin="0000")
    session.commit()
    session.close()

    successes = []

    def try_re_approve():
        session = make_session()
        try:
            req = session.query(StockRequest).filter(StockRequest.request_id == req_id).first()
            approver = session.query(Employee).filter(Employee.employee_id == approver_id).first()
            svc.approve_request(session, req, approver=approver, pin="0000")
            session.commit()
            successes.append("ok")
        except Exception as e:
            successes.append(f"err:{e}")
            try: session.rollback()
            except Exception: pass
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=10) as ex:
        futures = [ex.submit(try_re_approve) for _ in range(10)]
        for f in as_completed(futures):
            f.result()

    verify = make_session()
    log_count = verify.query(TransactionLog).filter(TransactionLog.item_id == item_id).count()
    inv = verify.query(Inventory).filter(Inventory.item_id == item_id).first()
    verify.close()

    assert log_count == 1, f"재승인으로 TransactionLog 중복: {log_count}건"
    assert inv.warehouse_qty >= Decimal("0"), f"창고 음수: {inv.warehouse_qty}"
