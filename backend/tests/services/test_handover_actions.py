"""인수인계 작성·draft·제출·삭제 application boundary 회귀 테스트."""

from __future__ import annotations

import uuid

import pytest

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    HandoverDoc,
    HandoverLine,
    HandoverStatusEnum,
    Notification,
)
from app.schemas import HandoverCreate, HandoverDraftUpsert
from app.services import handover as handover_svc
from app.services import handover_actions as actions
from app.services import notifications as notifications_svc
from app.services.pin_auth import DEFAULT_PIN_HASH


def _make_employee(
    db_session,
    *,
    department: DepartmentEnum = DepartmentEnum.TUBE,
) -> Employee:
    employee = Employee(
        employee_code=f"HO-ACT-{uuid.uuid4().hex[:8]}",
        name=f"{department.value} 작업자",
        role=f"{department.value}/사원",
        department=department,
        level=EmployeeLevelEnum.STAFF,
        warehouse_role="none",
        department_role="none",
        display_order=0,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )
    db_session.add(employee)
    db_session.flush()
    return employee


def _create_payload(author: Employee, item, *, title: str = "인수인계 작성") -> HandoverCreate:
    return HandoverCreate(
        author_employee_id=author.employee_id,
        to_department=DepartmentEnum.HIGH_VOLTAGE.value,
        title=title,
        lines=[{"item_id": item.item_id, "quantity": 2}],
    )


def _draft_payload(
    author: Employee,
    item,
    *,
    handover_id=None,
    title: str = "인수인계 draft",
    quantity: int = 2,
) -> HandoverDraftUpsert:
    return HandoverDraftUpsert(
        handover_id=handover_id,
        author_employee_id=author.employee_id,
        to_department=DepartmentEnum.HIGH_VOLTAGE.value,
        title=title,
        lines=[{"item_id": item.item_id, "quantity": quantity}],
    )


def _seed_draft(db_session, author: Employee, item):
    doc = handover_svc.save_handover_draft(
        db_session,
        author=author,
        payload=_draft_payload(author, item, title="기존 draft", quantity=1),
    )
    doc_id = doc.handover_id
    line_id = doc.lines[0].line_id
    db_session.commit()
    return doc_id, line_id


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


def test_create_rolls_back_doc_and_lines_when_post_create_step_fails(
    db_session, make_item, monkeypatch
):
    author = _make_employee(db_session)
    item = make_item(name="handover create rollback")
    db_session.commit()
    boundaries = _count_session_boundaries(db_session, monkeypatch)
    boom = RuntimeError("작성 후속 단계 실패")

    def fail_after_create(db, _doc):
        db.flush()
        raise boom

    monkeypatch.setattr(notifications_svc, "notify_handover_arrived", fail_after_create)

    with pytest.raises(RuntimeError) as raised:
        actions.create_handover(
            db_session,
            author=author,
            payload=_create_payload(author, item),
        )

    assert raised.value is boom
    assert boundaries == {"commit": 0, "rollback": 1}
    assert db_session.query(HandoverDoc).count() == 0
    assert db_session.query(HandoverLine).count() == 0


def test_create_commits_doc_lines_and_notification_once(
    db_session, make_item, monkeypatch
):
    author = _make_employee(db_session)
    _make_employee(db_session, department=DepartmentEnum.HIGH_VOLTAGE)
    item = make_item(name="handover create commit")
    db_session.commit()
    boundaries = _count_session_boundaries(db_session, monkeypatch)

    doc = actions.create_handover(
        db_session,
        author=author,
        payload=_create_payload(author, item),
    )

    assert boundaries == {"commit": 1, "rollback": 0}
    assert doc.status == HandoverStatusEnum.SUBMITTED
    assert db_session.query(HandoverDoc).count() == 1
    assert db_session.query(HandoverLine).count() == 1
    assert db_session.query(Notification).count() == 1


def test_save_draft_restores_original_doc_and_lines_when_post_replace_step_fails(
    db_session, make_item, monkeypatch
):
    author = _make_employee(db_session)
    original_item = make_item(name="handover draft original")
    replacement_item = make_item(name="handover draft replacement")
    doc_id, original_line_id = _seed_draft(db_session, author, original_item)
    boundaries = _count_session_boundaries(db_session, monkeypatch)
    original_save = handover_svc.save_handover_draft
    boom = RuntimeError("draft 라인 교체 후 실패")

    def save_then_fail(*args, **kwargs):
        original_save(*args, **kwargs)
        db_session.flush()
        raise boom

    monkeypatch.setattr(handover_svc, "save_handover_draft", save_then_fail)

    with pytest.raises(RuntimeError) as raised:
        actions.save_handover_draft(
            db_session,
            author=author,
            payload=_draft_payload(
                author,
                replacement_item,
                handover_id=doc_id,
                title="교체된 draft",
                quantity=3,
            ),
        )

    assert raised.value is boom
    assert boundaries == {"commit": 0, "rollback": 1}
    db_session.expire_all()
    restored = db_session.query(HandoverDoc).filter_by(handover_id=doc_id).one()
    assert restored.title == "기존 draft"
    assert len(restored.lines) == 1
    assert restored.lines[0].line_id == original_line_id
    assert restored.lines[0].item_id == original_item.item_id
    assert restored.lines[0].quantity == 1


def test_save_draft_commits_once(db_session, make_item, monkeypatch):
    author = _make_employee(db_session)
    item = make_item(name="handover draft commit")
    db_session.commit()
    boundaries = _count_session_boundaries(db_session, monkeypatch)

    doc = actions.save_handover_draft(
        db_session,
        author=author,
        payload=_draft_payload(author, item),
    )

    assert boundaries == {"commit": 1, "rollback": 0}
    assert doc.status == HandoverStatusEnum.DRAFT
    assert db_session.query(HandoverLine).count() == 1


def test_submit_restores_draft_status_when_notification_step_fails(
    db_session, make_item, monkeypatch
):
    author = _make_employee(db_session)
    item = make_item(name="handover submit rollback")
    doc_id, _line_id = _seed_draft(db_session, author, item)
    doc = db_session.query(HandoverDoc).filter_by(handover_id=doc_id).one()
    boundaries = _count_session_boundaries(db_session, monkeypatch)
    boom = RuntimeError("제출 후속 단계 실패")

    def fail_after_submit(db, _doc):
        db.flush()
        raise boom

    monkeypatch.setattr(notifications_svc, "notify_handover_arrived", fail_after_submit)

    with pytest.raises(RuntimeError) as raised:
        actions.submit_handover(db_session, doc, author=author)

    assert raised.value is boom
    assert boundaries == {"commit": 0, "rollback": 1}
    db_session.expire_all()
    restored = db_session.query(HandoverDoc).filter_by(handover_id=doc_id).one()
    assert restored.status == HandoverStatusEnum.DRAFT
    assert db_session.query(Notification).count() == 0


def test_submit_commits_status_and_notification_once(
    db_session, make_item, monkeypatch
):
    author = _make_employee(db_session)
    _make_employee(db_session, department=DepartmentEnum.HIGH_VOLTAGE)
    item = make_item(name="handover submit commit")
    doc_id, _line_id = _seed_draft(db_session, author, item)
    doc = db_session.query(HandoverDoc).filter_by(handover_id=doc_id).one()
    boundaries = _count_session_boundaries(db_session, monkeypatch)

    result = actions.submit_handover(db_session, doc, author=author)

    assert boundaries == {"commit": 1, "rollback": 0}
    assert result.status == HandoverStatusEnum.SUBMITTED
    assert db_session.query(Notification).count() == 1


def test_delete_draft_restores_doc_and_lines_when_flush_fails(
    db_session, make_item, monkeypatch
):
    author = _make_employee(db_session)
    item = make_item(name="handover delete rollback")
    doc_id, line_id = _seed_draft(db_session, author, item)
    boundaries = _count_session_boundaries(db_session, monkeypatch)
    original_flush = db_session.flush
    boom = RuntimeError("삭제 flush 후 실패")

    def flush_then_fail(*args, **kwargs):
        original_flush(*args, **kwargs)
        raise boom

    monkeypatch.setattr(db_session, "flush", flush_then_fail)

    with pytest.raises(RuntimeError) as raised:
        actions.delete_handover_draft(
            db_session,
            handover_id=doc_id,
            author_employee_id=author.employee_id,
        )

    assert raised.value is boom
    assert boundaries == {"commit": 0, "rollback": 1}
    db_session.expire_all()
    assert db_session.query(HandoverDoc).filter_by(handover_id=doc_id).one()
    assert db_session.query(HandoverLine).filter_by(line_id=line_id).one()


def test_delete_draft_commits_once(db_session, make_item, monkeypatch):
    author = _make_employee(db_session)
    item = make_item(name="handover delete commit")
    doc_id, _line_id = _seed_draft(db_session, author, item)
    boundaries = _count_session_boundaries(db_session, monkeypatch)

    deleted = actions.delete_handover_draft(
        db_session,
        handover_id=doc_id,
        author_employee_id=author.employee_id,
    )

    assert deleted is True
    assert boundaries == {"commit": 1, "rollback": 0}
    assert db_session.query(HandoverDoc).count() == 0
    assert db_session.query(HandoverLine).count() == 0
