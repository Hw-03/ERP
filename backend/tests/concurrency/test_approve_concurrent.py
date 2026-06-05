"""동시성 테스트: 같은 StockRequest 를 여러 스레드가 동시 승인해도 1건만 처리.

SQLite WAL + busy_timeout 으로 직렬화되며, approve_request 내 멱등 처리로
이미 COMPLETED 된 요청에 대한 재승인은 200(멱등) 반환.
검증: TransactionLog 가 라인당 1건만 기록되어야 한다.
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
    """테스트용 직원(요청자 + 승인자) + 품목 + 재고 + RESERVED 요청 생성."""
    session = make_session()

    requester = Employee(
        employee_code="CREQ01",
        name="요청자",
        role="조립/사원",
        department=DepartmentEnum.ASSEMBLY.value,
        level=EmployeeLevelEnum.STAFF,
        is_active=True,
        display_order=0,
    )
    approver = Employee(
        employee_code="CWHA01",
        name="창고담당자",
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

    item = Item(item_name="승인테스트품목", process_type_code="TR", unit="EA")
    session.add(item)
    session.flush()

    inv = Inventory(
        item_id=item.item_id,
        quantity=Decimal("10"),
        warehouse_qty=Decimal("10"),
        pending_quantity=Decimal("1"),  # 1개 예약됨
    )
    session.add(inv)
    session.flush()

    # RESERVED 요청 직접 생성 (reserve() 로직은 별도 테스트)
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

    req_id = req.request_id
    approver_id = approver.employee_id
    item_id = item.item_id
    session.close()
    return req_id, approver_id, item_id


@pytest.mark.usefixtures("concurrent_engine")
def test_concurrent_approve_only_once(concurrent_engine, make_session):
    """10스레드가 같은 request 동시 승인 → 1번만 재고 이동, TransactionLog 중복 없음."""
    req_id, approver_id, item_id = _setup(make_session)

    results = []
    errors = []

    def try_approve():
        session = make_session()
        try:
            req = session.query(StockRequest).filter(StockRequest.request_id == req_id).first()
            approver = session.query(Employee).filter(Employee.employee_id == approver_id).first()
            svc.approve_request(session, req, approver=approver, pin="0000")
            session.commit()
            results.append("approved")
        except (ValueError, Exception) as e:
            results.append(f"failed: {e}")
            try:
                session.rollback()
            except Exception:
                pass
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=10) as ex:
        futures = [ex.submit(try_approve) for _ in range(10)]
        for f in as_completed(futures):
            f.result()

    # 최종 상태 검증
    verify = make_session()
    req = verify.query(StockRequest).filter(StockRequest.request_id == req_id).first()
    inv = verify.query(Inventory).filter(Inventory.item_id == item_id).first()
    log_count = verify.query(TransactionLog).filter(TransactionLog.item_id == item_id).count()
    verify.close()

    assert req.status == StockRequestStatusEnum.COMPLETED, f"최종 상태가 COMPLETED 아님: {req.status}"
    assert inv.warehouse_qty >= Decimal("0"), f"창고 재고 음수: {inv.warehouse_qty}"
    # RAW_SHIP: warehouse_qty 가 1 감소해야 하고, TransactionLog 는 정확히 1건
    # (release + consume_warehouse 각각이 아닌 _execute_line 1회 호출 기준)
    assert log_count == 1, f"TransactionLog 중복: {log_count}건 (1건이어야 함)"
    # 결과에서 'approved' 가 하나 이상 (멱등 200 포함)
    approved_count = sum(1 for r in results if r == "approved")
    assert approved_count >= 1, "승인 성공이 0건"
