"""사유 선택 검증과 제출 스냅샷 전달 계약."""
import uuid
from decimal import Decimal

import pytest

from app.models import Employee, RequestBucketEnum, StockRequestTypeEnum, TransactionLog, DefectQuarantineRecord
from app.services import stock_requests as requests


def test_reason_category_is_required_and_other_requires_trimmed_memo(db_session):
    from app.services.defect_reason_categories import resolve_reason_category
    from app.models.defect_reason_category import defect_reason_category_id
    for values in [{"reason_memo": "메모만"}, {"reason_category": "등록 안 된 사유"}, {"reason_category_id": uuid.uuid4()}, {"reason_category": "기타", "reason_memo": "   "}]:
        with pytest.raises(ValueError):
            resolve_reason_category(db_session, **values)
    category_id, name, memo = resolve_reason_category(db_session, reason_category_id=defect_reason_category_id("기타"), reason_memo="  실제 원인  ")
    assert name == "기타"
    assert memo == "실제 원인"
    assert category_id == defect_reason_category_id("기타")


def test_stock_defect_submission_preserves_category_id_on_record_and_log(db_session, make_item):
    from app.models.defect_reason_category import defect_reason_category_id
    employee = Employee(employee_code="REASON-SUB", name="작성자", role="사원", department="창고", is_active=True)
    db_session.add(employee)
    db_session.flush()
    item = make_item(warehouse_qty=Decimal("5"))
    category_id = defect_reason_category_id("외관 불량")
    result = requests.create_request(db_session, requester=employee, request_type=StockRequestTypeEnum.MARK_DEFECTIVE_WH, lines_input=[requests.LineInput(item_id=item.item_id, quantity=1, from_bucket=RequestBucketEnum.WAREHOUSE, from_department=None, to_bucket=RequestBucketEnum.DEFECTIVE, to_department="창고")], reference_no=None, notes=None, reason_category_id=category_id)
    assert result.reason_category_id == category_id
    assert result.reason_category == "외관 불량"
    db_session.flush()
    assert db_session.query(DefectQuarantineRecord).one().reason_category_id == category_id
    assert db_session.query(TransactionLog).one().reason_category_id == category_id


def test_stock_draft_submission_identity_survives_edit_and_submission(db_session, make_item):
    from app.models.defect_reason_category import defect_reason_category_id
    employee = Employee(employee_code="REASON-DRAFT", name="작성자", role="사원", department="창고", warehouse_role="primary", is_active=True)
    db_session.add(employee)
    db_session.flush()
    item = make_item(warehouse_qty=Decimal("5"))
    submission_id = uuid.uuid4()
    values = dict(requester=employee, request_type=StockRequestTypeEnum.MARK_DEFECTIVE_WH, lines_input=[requests.LineInput(item_id=item.item_id, quantity=1, from_bucket=RequestBucketEnum.WAREHOUSE, from_department=None, to_bucket=RequestBucketEnum.DEFECTIVE, to_department="창고")], reference_no=None, notes=None, reason_category_id=defect_reason_category_id("외관 불량"))
    draft = requests.upsert_draft_request(db_session, **values, submission_id=submission_id)
    assert draft.submission_id == submission_id
    edited = requests.upsert_draft_request(db_session, **values)
    assert edited.submission_id == submission_id
    result = requests.submit_draft_request(db_session, request_id=draft.request_id, requester_employee_id=employee.employee_id)
    db_session.flush()
    assert result.submission_id == submission_id
    assert db_session.query(TransactionLog).one().submission_id == submission_id


def test_default_seeding_preserves_renamed_and_hidden_categories(db_session):
    from app.models import DefectReasonCategory
    from app.models.defect_reason_category import defect_reason_category_id
    from app.services.defect_reason_categories import seed_default_reason_categories
    category = db_session.get(DefectReasonCategory, defect_reason_category_id("외관 불량"))
    category.name = "관리자가 수정함"
    category.normalized_name = "관리자가 수정함"
    category.is_active = False
    db_session.flush()
    assert seed_default_reason_categories(db_session) == 0
    assert category.name == "관리자가 수정함"
    assert category.is_active is False
