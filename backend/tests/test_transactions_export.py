"""거래 이력 export(csv/xlsx) 의 요청자/승인자명 동기화 (D1, history-overhaul-fixup).

목록 조회와 동일하게 export 도 IoBatch outerjoin → requester_name + approver_name 컬럼을
채우고, search 가 requester_name 까지 닿는지 검증한다.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from io import BytesIO

from openpyxl import load_workbook

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    IoBatch,
    Item,
    StockRequest,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    TransactionLog,
    TransactionTypeEnum,
)


def _emp(db, code: str, name: str) -> Employee:
    e = Employee(
        employee_code=code, name=name, role="조립/staff",
        department=DepartmentEnum.ASSEMBLY, level=EmployeeLevelEnum.STAFF,
        display_order=0,
    )
    db.add(e)
    db.flush()
    return e


def _seed_batch_transaction(db) -> Item:
    """요청자≠승인자인 결재 배치 + 그 결과 TransactionLog 1건."""
    requester = _emp(db, "EXP_REQ", "요청자A")
    approver = _emp(db, "EXP_APP", "승인자B")
    item = Item(item_name="ExportItem", process_type_code="TR")
    db.add(item)
    db.flush()

    sr = StockRequest(
        requester_employee_id=requester.employee_id,
        requester_name=requester.name,
        requester_department="조립",
        request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
        status=StockRequestStatusEnum.COMPLETED,
        approved_by_name=approver.name,
        approved_by_employee_id=approver.employee_id,
    )
    db.add(sr)
    db.flush()

    batch = IoBatch(
        work_type="warehouse_io",
        sub_type="warehouse_to_dept",
        status="completed",
        requester_employee_id=requester.employee_id,
        requester_name=requester.name,
        requester_department="조립",
        stock_request_id=sr.request_id,
    )
    db.add(batch)
    db.flush()

    db.add(
        TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.TRANSFER_TO_PROD,
            quantity_change=Decimal("5"),
            operation_batch_id=batch.batch_id,
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    return item


def _range():
    # 시드 거래는 created_at=datetime.utcnow() (UTC). 필터 범위도 UTC 날짜로 맞춰야
    # KST 자정~오전9시 구간에서 로컬 날짜(today)와 어긋나 빈 결과가 나오지 않는다.
    today = datetime.utcnow().date().isoformat()
    return f"start_date={today}&end_date={today}"


def test_export_csv_includes_requester_and_approver(client, db_session):
    _seed_batch_transaction(db_session)
    resp = client.get(f"/api/inventory/transactions/export.csv?{_range()}")
    assert resp.status_code == 200, resp.text
    body = resp.text
    header = body.splitlines()[0]
    assert "requester_name" in header and "approver_name" in header
    # 요청자명 + 승인자명(요청자≠승인자)이 행에 채워진다.
    assert "요청자A" in body
    assert "승인자B" in body


def test_export_csv_search_matches_requester_name(client, db_session):
    _seed_batch_transaction(db_session)
    resp = client.get(f"/api/inventory/transactions/export.csv?search=요청자A&{_range()}")
    assert resp.status_code == 200, resp.text
    assert "ExportItem" in resp.text  # requester_name 검색으로 매칭됨


def test_export_csv_includes_requester_and_approver_from_stock_request_reference(client, db_session):
    requester = _emp(db_session, "EXP_DREQ", "DirectRequester")
    approver = _emp(db_session, "EXP_DAPP", "DirectApprover")
    item = Item(item_name="DirectExportItem", process_type_code="TR")
    db_session.add(item)
    db_session.flush()

    sr = StockRequest(
        request_code="SR-DIRECT-EXPORT",
        requester_employee_id=requester.employee_id,
        requester_name=requester.name,
        requester_department=DepartmentEnum.ASSEMBLY.value,
        request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
        status=StockRequestStatusEnum.COMPLETED,
        approved_by_name=approver.name,
        approved_by_employee_id=approver.employee_id,
        approved_at=datetime.utcnow(),
        submitted_at=datetime.utcnow(),
    )
    db_session.add(sr)
    db_session.flush()

    db_session.add(
        TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.TRANSFER_TO_PROD,
            quantity_change=Decimal("0"),
            reference_no=sr.request_code,
            created_at=datetime.utcnow(),
        )
    )
    db_session.commit()

    resp = client.get(f"/api/inventory/transactions/export.csv?{_range()}")
    assert resp.status_code == 200, resp.text
    assert "DirectRequester" in resp.text
    assert "DirectApprover" in resp.text


def test_export_xlsx_ok(client, db_session):
    _seed_batch_transaction(db_session)
    resp = client.get(f"/api/inventory/transactions/export.xlsx?{_range()}")
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith(
        "application/vnd.openxmlformats"
    )


def test_export_xlsx_uses_dynamic_internal_use_label(client, db_session):
    item = Item(item_name="연구 반출품", process_type_code="TR")
    db_session.add(item)
    db_session.flush()
    db_session.add(
        TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.INTERNAL_USE,
            quantity_change=Decimal("-1"),
            quantity_before=Decimal("2"),
            quantity_after=Decimal("1"),
            department=DepartmentEnum.RESEARCH.value,
            created_at=datetime.utcnow(),
        )
    )
    db_session.commit()

    resp = client.get(f"/api/inventory/transactions/export.xlsx?{_range()}")
    assert resp.status_code == 200, resp.text
    workbook = load_workbook(BytesIO(resp.content), read_only=True)
    rows = list(workbook.active.iter_rows(values_only=True))
    assert any(row[1] == "연구소 반출" for row in rows[1:])
