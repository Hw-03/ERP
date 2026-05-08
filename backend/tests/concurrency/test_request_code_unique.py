"""동시성 테스트: request_code 중복 없음.

100스레드가 동시에 StockRequest 를 생성해도 request_code 가 unique해야 한다.
(SR-YYYYMMDD-HHMMSS-XXXX 형식 + 필요 시 IntegrityError retry)
"""

from __future__ import annotations

import sys
import uuid
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
    StockRequestStatusEnum,
    StockRequestTypeEnum,
)
from app.services import stock_requests as svc


def _setup(make_session):
    """테스트용 직원 + 품목 + 재고 생성."""
    session = make_session()

    emp = Employee(
        employee_code="CTEST01",
        name="테스트직원",
        role="조립/사원",
        department=DepartmentEnum.ASSEMBLY.value,
        level=EmployeeLevelEnum.STAFF,
        is_active=True,
        display_order=0,
    )
    session.add(emp)
    session.flush()

    item = Item(item_name="코드테스트품목", process_type_code="TR", unit="EA")
    session.add(item)
    session.flush()

    inv = Inventory(
        item_id=item.item_id,
        quantity=Decimal("1000"),
        warehouse_qty=Decimal("1000"),
        pending_quantity=Decimal("0"),
    )
    session.add(inv)
    session.commit()
    emp_id = emp.employee_id
    item_id = item.item_id
    session.close()
    return emp_id, item_id


@pytest.mark.usefixtures("concurrent_engine")
def test_concurrent_request_code_no_duplicate(concurrent_engine, make_session):
    """100스레드 동시 요청 생성 → request_code 중복 0."""
    emp_id, item_id = _setup(make_session)

    successes = []
    failures = []
    codes = []

    def create_one():
        session = make_session()
        try:
            emp = session.query(Employee).filter(Employee.employee_id == emp_id).first()
            line = svc.LineInput(
                item_id=item_id,
                quantity=Decimal("1"),
                from_bucket=RequestBucketEnum.WAREHOUSE,
                from_department=None,
                to_bucket=RequestBucketEnum.NONE,
                to_department=None,
            )
            # DRAFT 생성 (request_code = None, 재고 변경 없음)
            req = svc._build_request_and_lines(
                session,
                requester=emp,
                request_type=StockRequestTypeEnum.RAW_SHIP,
                lines_input=[line],
                reference_no=None,
                notes=None,
                status=StockRequestStatusEnum.DRAFT,
                request_code=svc._generate_request_code(__import__("datetime").datetime.utcnow()),
                submitted_at=None,
            )
            session.commit()
            codes.append(req.request_code)
            successes.append("ok")
        except Exception as e:
            failures.append(str(e))
            try:
                session.rollback()
            except Exception:
                pass
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=20) as ex:
        futures = [ex.submit(create_one) for _ in range(100)]
        for f in as_completed(futures):
            f.result()

    # request_code 중복 없음 검증
    assert len(codes) == len(set(codes)), (
        f"request_code 중복 발생: {len(codes) - len(set(codes))}건"
    )
    # 성공 건수가 0이 아님 (대부분 성공해야 함)
    assert len(successes) > 80, f"너무 많은 실패: {len(failures)}"
