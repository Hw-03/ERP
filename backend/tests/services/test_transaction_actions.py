from __future__ import annotations

from decimal import Decimal

import pytest

from app.models import (
    AdminAuditLog,
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    TransactionEditLog,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services import transaction_actions


def _metadata_case(db_session, make_item):
    item = make_item(name="메타 수정 원자성", warehouse_qty=Decimal("10"))
    editor = Employee(
        employee_code="META01",
        name="메타 수정자",
        role="조립/대리",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        display_order=99,
        is_active="true",
    )
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=Decimal("10"),
        reference_no="REF-BEFORE",
        produced_by="수정 전 작업자",
        notes="수정 전 메모",
    )
    db_session.add_all([editor, log])
    db_session.commit()
    return log, item, editor


def _count_session_boundaries(db_session, monkeypatch):
    calls = {"commit": 0, "rollback": 0}
    original_commit = db_session.commit
    original_rollback = db_session.rollback

    def counted_commit():
        calls["commit"] += 1
        return original_commit()

    def counted_rollback():
        calls["rollback"] += 1
        return original_rollback()

    monkeypatch.setattr(db_session, "commit", counted_commit)
    monkeypatch.setattr(db_session, "rollback", counted_rollback)
    return calls


def test_edit_transaction_metadata_rolls_back_log_history_and_audit_on_late_failure(
    db_session, make_item, monkeypatch
) -> None:
    log, _item, editor = _metadata_case(db_session, make_item)
    boundaries = _count_session_boundaries(db_session, monkeypatch)
    original_record = transaction_actions.audit.record

    def record_then_fail(*args, **kwargs):
        original_record(*args, **kwargs)
        db_session.flush()
        raise RuntimeError("metadata audit failure")

    monkeypatch.setattr(transaction_actions.audit, "record", record_then_fail)

    with pytest.raises(RuntimeError, match="metadata audit failure"):
        transaction_actions.edit_transaction_metadata(
            db_session,
            log_id=log.log_id,
            editor=editor,
            reason="원자성 검증",
            notes="수정 후 메모",
            reference_no="REF-AFTER",
            produced_by="수정 후 작업자",
            request=None,
        )

    db_session.expire_all()
    persisted = db_session.query(TransactionLog).filter_by(log_id=log.log_id).one()
    assert persisted.notes == "수정 전 메모"
    assert persisted.reference_no == "REF-BEFORE"
    assert persisted.produced_by == "수정 전 작업자"
    assert db_session.query(TransactionEditLog).count() == 0
    assert db_session.query(AdminAuditLog).filter_by(action="transaction.meta_edit").count() == 0
    assert boundaries == {"commit": 0, "rollback": 1}


def test_edit_transaction_metadata_commits_once_on_success(
    db_session, make_item, monkeypatch
) -> None:
    log, item, editor = _metadata_case(db_session, make_item)
    boundaries = _count_session_boundaries(db_session, monkeypatch)

    edited, edited_item = transaction_actions.edit_transaction_metadata(
        db_session,
        log_id=log.log_id,
        editor=editor,
        reason="정상 수정",
        notes="수정 후 메모",
        reference_no="REF-AFTER",
        produced_by="수정 후 작업자",
        request=None,
    )

    assert edited.log_id == log.log_id
    assert edited_item.item_id == item.item_id
    assert db_session.query(TransactionEditLog).filter_by(original_log_id=log.log_id).count() == 1
    assert db_session.query(AdminAuditLog).filter_by(action="transaction.meta_edit").count() == 1
    assert boundaries == {"commit": 1, "rollback": 0}
