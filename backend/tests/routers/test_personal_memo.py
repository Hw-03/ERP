"""Personal memo ownership always comes from the explicit operator session."""

from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor
import logging
from threading import Barrier

import pytest
from sqlalchemy import event, select
from sqlalchemy.exc import IntegrityError, OperationalError

from app.models import ActivityAuditLog, AdminAuditLog, DataRevision, Employee, Inventory, TransactionLog
from app.services import realtime
from app.services.operator_session import issue_session


def _staff(db_session, code: str) -> tuple[Employee, dict[str, str]]:
    employee = Employee(employee_code=code, name=code, role="staff", department="조립")
    db_session.add(employee)
    db_session.flush()
    token, _row = issue_session(db_session, employee=employee, tab_id=code)
    db_session.commit()
    return employee, {"X-Operator-Session": token}


def test_two_staff_can_read_and_replace_only_their_own_memo(db_session, client):
    first, first_headers = _staff(db_session, "memo-a")
    second, second_headers = _staff(db_session, "memo-b")
    assert client.get("/api/personal-memo", headers=first_headers).json() == {"content": "", "updated_at": None}
    saved = client.put("/api/personal-memo", headers=first_headers, json={"content": "첫 직원 개인 메모\n  공백 유지  "})
    assert saved.status_code == 200, saved.text
    assert saved.json()["content"] == "첫 직원 개인 메모\n  공백 유지  "
    assert set(saved.json()) == {"content", "updated_at"}
    assert datetime.fromisoformat(saved.json()["updated_at"]).utcoffset() == timedelta(0)
    assert client.get("/api/personal-memo", headers=second_headers).json() == {"content": "", "updated_at": None}
    assert client.put("/api/personal-memo", headers=second_headers, json={"content": "second"}).status_code == 200
    assert client.put("/api/personal-memo", headers=first_headers, json={"content": "replace"}).status_code == 200
    assert client.get("/api/personal-memo", headers=first_headers).json()["content"] == "replace"
    assert client.get("/api/personal-memo", headers=second_headers).json()["content"] == "second"
    from app.models import PersonalMemo
    assert db_session.query(PersonalMemo).count() == 2
    assert db_session.get(PersonalMemo, first.employee_id).content == "replace"
    assert db_session.get(PersonalMemo, second.employee_id).content == "second"
    assert client.get(f"/api/personal-memo/{second.employee_id}", headers=first_headers).status_code == 404
    assert client.get(f"/api/personal-memo?employee_id={second.employee_id}", headers=first_headers).json()["content"] == "replace"


@pytest.mark.parametrize("method", ["get", "put"])
@pytest.mark.parametrize("invalid", ["missing", "unknown", "expired", "revoked", "inactive", "pin_changed", "employee_missing"])
def test_invalid_sessions_cannot_read_or_write_memos(db_session, client, method, invalid):
    employee, headers = _staff(db_session, "memo-auth")
    from app.models import OperatorSession
    row = db_session.query(OperatorSession).one()
    if invalid == "missing":
        headers = {"X-Employee-Id": str(employee.employee_id)}
        client.cookies.set("mes_actor", str(employee.employee_id))
    elif invalid == "unknown":
        headers = {"X-Operator-Session": "unknown-token"}
    elif invalid == "expired":
        row.expires_at = datetime.utcnow() - timedelta(seconds=1)
    elif invalid == "revoked":
        row.revoked_at = datetime.utcnow()
    elif invalid == "inactive":
        employee.is_active = False
    elif invalid == "pin_changed":
        employee.pin_version += 1
    else:
        db_session.delete(employee)
    db_session.commit()
    kwargs = {"headers": headers}
    if method == "put":
        kwargs["json"] = {"content": "private"}
    response = getattr(client, method)("/api/personal-memo", **kwargs)
    assert response.status_code == 401, response.text
    from app.models import PersonalMemo
    assert db_session.query(PersonalMemo).count() == 0


@pytest.mark.parametrize("payload", [{"content": None}, {"content": 123}, {}, {"content": "x" * 5001}, {"content": "private", "employee_id": "other"}, {"content": "private", "actor_employee_id": "other"}, {"content": "private", "title": "unexpected"}])
def test_invalid_content_or_extra_owner_is_rejected(db_session, client, payload):
    _employee, headers = _staff(db_session, "memo-validation")
    assert client.put("/api/personal-memo", headers=headers, json={"content": "keep"}).status_code == 200
    response = client.put("/api/personal-memo", headers=headers, json=payload)
    assert response.status_code == 422, response.text
    assert client.get("/api/personal-memo", headers=headers).json()["content"] == "keep"


def test_maximum_content_and_clear_keep_one_row(db_session, client):
    _employee, headers = _staff(db_session, "memo-clear")
    content = "가" * 5000
    response = client.put("/api/personal-memo", headers=headers, json={"content": content})
    assert response.status_code == 200, response.text
    assert response.json()["content"] == content
    cleared = client.put("/api/personal-memo", headers=headers, json={"content": ""})
    assert cleared.status_code == 200
    assert cleared.json()["content"] == ""
    assert cleared.json()["updated_at"] is not None
    from app.models import PersonalMemo
    assert db_session.query(PersonalMemo).count() == 1


def test_memo_does_not_change_inventory_revision_or_publish_private_content(db_session, client, make_item, caplog):
    _employee, headers = _staff(db_session, "memo-private")
    item = make_item(warehouse_qty=7)
    db_session.add(DataRevision(id=1, revision=73))
    db_session.commit()
    before_inventory = db_session.execute(select(Inventory.__table__)).all()
    before_transactions = db_session.query(TransactionLog).count()
    before_admin_audit = db_session.query(AdminAuditLog).count()
    private_content = "CONFIDENTIAL-MEMO-NOT-FOR-AUDIT"
    event.listen(db_session, "before_commit", realtime._advance_revision_before_commit)
    try:
        response = client.put("/api/personal-memo", headers=headers, json={"content": private_content})
    finally:
        event.remove(db_session, "before_commit", realtime._advance_revision_before_commit)
    assert response.status_code == 200, response.text
    assert db_session.get(DataRevision, 1).revision == 73
    assert db_session.execute(select(Inventory.__table__)).all() == before_inventory
    assert db_session.query(TransactionLog).count() == before_transactions
    assert db_session.query(AdminAuditLog).count() == before_admin_audit
    assert private_content not in caplog.text
    for row in db_session.query(ActivityAuditLog).all():
        assert private_content not in repr(row.__dict__)
    assert db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one().warehouse_qty == 7


def test_concurrent_first_saves_keep_one_row_and_last_successful_save_wins(tmp_path):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import sessionmaker
    from app.database import _create_database_engine, get_db
    from app.models import OperatorSession, PersonalMemo
    from app.routers.personal_memo import router

    engine = _create_database_engine(f"sqlite:///{(tmp_path / 'memo-race.db').as_posix()}")
    for model in (Employee, OperatorSession, PersonalMemo, DataRevision):
        model.__table__.create(engine)
    factory = sessionmaker(bind=engine, autoflush=False)
    with factory() as db:
        employee = Employee(employee_code="memo-race", name="Staff", role="staff", department="Assembly")
        db.add_all([employee, DataRevision(id=1, revision=19)])
        db.flush()
        token, _row = issue_session(db, employee=employee, tab_id="race-tab")
        db.commit()
    realtime.register_session_listeners(factory)
    app = FastAPI()
    app.include_router(router, prefix="/api/personal-memo")

    def override_db():
        with factory() as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    barrier = Barrier(2)
    headers = {"X-Operator-Session": token}
    try:
        with TestClient(app) as browser:
            def save(content: str):
                barrier.wait(timeout=10)
                return browser.put("/api/personal-memo", headers=headers, json={"content": content})

            with ThreadPoolExecutor(max_workers=2) as executor:
                futures = [executor.submit(save, content) for content in ("first", "second")]
                responses = [future.result(timeout=20) for future in futures]
            assert [response.status_code for response in responses] == [200, 200]
            with factory() as db:
                assert db.query(PersonalMemo).count() == 1
                assert db.query(PersonalMemo).one().content in {"first", "second"}
            final = browser.put("/api/personal-memo", headers=headers, json={"content": "last successful save"})
            assert final.status_code == 200
            assert browser.get("/api/personal-memo", headers=headers).json()["content"] == "last successful save"
        with factory() as db:
            assert db.query(PersonalMemo).count() == 1
            assert db.get(DataRevision, 1).revision == 19
    finally:
        realtime.unregister_session_listeners(factory)
        engine.dispose()


@pytest.mark.parametrize("error_type", [IntegrityError, OperationalError])
def test_failed_save_never_logs_private_sql_parameters(db_session, client, monkeypatch, caplog, error_type):
    _employee, headers = _staff(db_session, "memo-failed-save")
    private_content = "PRIVATE-FAILED-MEMO-CONTENT"
    execute = db_session.execute

    def fail_memo_write(statement, *args, **kwargs):
        if getattr(getattr(statement, "table", None), "name", None) == "personal_memos":
            raise error_type("INSERT INTO personal_memos", {"content": private_content}, Exception("injected database error"))
        return execute(statement, *args, **kwargs)

    monkeypatch.setattr(db_session, "execute", fail_memo_write)
    logger = logging.getLogger("mes")
    caplog.set_level(logging.DEBUG, logger="mes")
    logger.addHandler(caplog.handler)
    try:
        response = client.put("/api/personal-memo", headers=headers, json={"content": private_content})
    finally:
        logger.removeHandler(caplog.handler)
    assert private_content not in caplog.text
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "DB_UNAVAILABLE"
