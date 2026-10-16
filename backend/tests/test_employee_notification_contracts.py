"""Approved personal-setting, current-actor and obsolete-notification contracts."""

from decimal import Decimal

import pytest

from app.models import (
    DepartmentEnum, Employee, Inventory, Notification, NotificationTypeEnum, StockRequest,
    StockRequestStatusEnum, SystemSetting, TransactionLog,
)
from app.services import notifications
from tests.test_io_expectation_closure import _cells, _seed_cells, _submit
from tests.test_io_v2 import _make_employee


@pytest.mark.parametrize("endpoint,payload", [
    ("appearance", {"theme": "dark", "sidebar_mode": "expanded"}),
    ("theme", {"theme": "dark"}),
    ("sidebar-mode", {"sidebar_mode": "expanded"}),
    ("login-popup", {"login_notification_popup_enabled": False}),
])
@pytest.mark.parametrize("actor_state", ["other", "missing", "unknown", "inactive", "own"])
def test_personal_setting_write_checks_current_tab_actor_and_preserves_other_employee(
    client, db_session, endpoint: str, payload: dict, actor_state: str,
) -> None:
    owner = _make_employee(db_session, code="SETTING-OWNER")
    other = _make_employee(db_session, code="SETTING-OTHER")
    for employee in (owner, other):
        employee.theme, employee.sidebar_mode = "light", "hover"
        employee.login_notification_popup_enabled = True
    if actor_state == "inactive":
        owner.is_active = False
    db_session.commit()
    before = {employee.employee_id: (employee.theme, employee.sidebar_mode,
                                    employee.login_notification_popup_enabled, employee.updated_at)
              for employee in (owner, other)}
    code = {"other": other.employee_code, "unknown": "NO-SUCH-ACTOR"}.get(actor_state, owner.employee_code)
    headers = {} if actor_state == "missing" else {"X-MES-Employee-Code": code}
    response = client.put(f"/api/employees/{owner.employee_id}/{endpoint}", json=payload, headers=headers)
    assert response.status_code == (200 if actor_state == "own" else 400 if actor_state == "missing" else 403), response.text
    db_session.expire_all()
    assert (other.theme, other.sidebar_mode, other.login_notification_popup_enabled, other.updated_at) == before[other.employee_id]
    if actor_state != "own":
        assert (owner.theme, owner.sidebar_mode, owner.login_notification_popup_enabled, owner.updated_at) == before[owner.employee_id]
    else:
        for field, value in payload.items():
            assert getattr(owner, field) == value


@pytest.mark.parametrize("actor_state", ["active", "inactive", "deleted", "pin_only"])
def test_admin_pin_remains_separate_but_claimed_inactive_actor_cannot_write(
    client, db_session, actor_state: str,
) -> None:
    actor = _make_employee(db_session, code="ADMIN-ACTOR")
    target = _make_employee(db_session, code="ADMIN-TARGET", name="unchanged")
    if actor_state == "inactive":
        actor.is_active = False
    elif actor_state == "deleted":
        db_session.delete(actor)
    db_session.commit()
    headers = {"X-Admin-Pin": "0000"}
    if actor_state != "pin_only":
        headers["X-MES-Employee-Code"] = "ADMIN-ACTOR"
    response = client.put(f"/api/employees/{target.employee_id}", headers=headers, json={"name": "changed"})
    assert response.status_code == (403 if actor_state in {"inactive", "deleted"} else 200), response.text
    db_session.refresh(target)
    assert target.name == ("unchanged" if actor_state in {"inactive", "deleted"} else "changed")
    assert (target.warehouse_role, target.department_role) == ("none", "none")


def test_admin_pin_change_rejects_old_header_without_employee_mutation(client, db_session) -> None:
    target = _make_employee(db_session, code="PIN-CHANGE", name="before")
    db_session.commit()
    changed = client.put("/api/settings/admin-pin", json={"current_pin": "0000", "new_pin": "1234"})
    assert changed.status_code == 200, changed.text
    rejected = client.put(f"/api/employees/{target.employee_id}", headers={"X-Admin-Pin": "0000"}, json={"name": "forbidden"})
    assert rejected.status_code == 403, rejected.text
    db_session.refresh(target)
    assert target.name == "before"
    allowed = client.put(f"/api/employees/{target.employee_id}", headers={"X-Admin-Pin": "1234"}, json={"name": "after"})
    assert allowed.status_code == 200, allowed.text
    db_session.refresh(target)
    assert target.name == "after"


@pytest.mark.parametrize("endpoint,payload", [
    ("admin-pin", {"current_pin": "0000", "new_pin": "1234"}),
    ("integrity/repair", {"pin": "0000", "dry_run": False}),
    ("integrity/inventory", {"pin": "0000", "limit": 5}),
])
def test_direct_settings_admin_write_rejects_inactive_actor_before_any_mutation(
    client, db_session, make_item, endpoint: str, payload: dict,
) -> None:
    actor = _make_employee(db_session, code="SETTINGS-INACTIVE")
    actor.is_active = False
    item = make_item(warehouse_qty=Decimal("5"))
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    inventory.quantity = 7
    setting = SystemSetting(setting_key="admin_pin", setting_value="0000")
    db_session.add(setting)
    db_session.commit()
    method = client.put if endpoint == "admin-pin" else client.post
    response = method(f"/api/settings/{endpoint}", headers={"X-MES-Employee-Code": actor.employee_code}, json=payload)
    assert response.status_code == 403, response.text
    db_session.refresh(setting)
    db_session.refresh(inventory)
    assert setting.setting_value == "0000"
    assert inventory.quantity == 7


def _queue(client, employee: Employee) -> dict:
    """Use the real recipient-scoped notification list and badge payload."""
    response = client.get(f"/api/notifications?recipient_employee_id={employee.employee_id}",
                          headers={"X-Actor-Employee-Id": str(employee.employee_id)})
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize("queue", ["warehouse", "department"])
def test_role_revoke_removes_only_obsolete_notes_and_keeps_request_for_other_approver(
    client, db_session, make_item, queue: str,
) -> None:
    requester = _make_employee(db_session, code="ROLE-RQ")
    role = "warehouse_role" if queue == "warehouse" else "department_role"
    revoked = _make_employee(db_session, code="ROLE-OLD", **{role: "deputy"})
    valid = _make_employee(db_session, code="ROLE-VALID", **{role: "primary"})
    item = make_item(warehouse_qty=Decimal("10"))
    db_session.commit()
    _submit(client, requester, [item], work_type="warehouse_io" if queue == "warehouse" else "process",
            sub_type="warehouse_to_dept" if queue == "warehouse" else "adjust_in")
    request = db_session.query(StockRequest).one()
    original_status = request.status
    before = _cells(db_session)
    untouched = Notification(recipient_employee_id=revoked.employee_id,
                             type=NotificationTypeEnum.HANDOVER_ARRIVED.value, title="keep", target_section="handover")
    db_session.add(untouched)
    db_session.commit()
    assert _queue(client, revoked)["unread_count"] == 2
    changed = client.put(f"/api/employees/{revoked.employee_id}", headers={"X-Admin-Pin": "0000"}, json={role: "none"})
    assert changed.status_code == 200, changed.text
    db_session.expire_all()
    remaining = _queue(client, revoked)
    assert remaining["unread_count"] == 1
    assert [row["title"] for row in remaining["items"]] == ["keep"]
    assert _queue(client, valid)["unread_count"] == 1
    assert _cells(db_session) == before
    assert request.status == original_status
    approved = client.post(f"/api/stock-requests/{request.request_id}/{'approve' if queue == 'warehouse' else 'department-approve'}",
                           json={"actor_employee_id": str(valid.employee_id), "pin": "0000"})
    assert approved.status_code == 200, approved.text
    assert request.status == StockRequestStatusEnum.COMPLETED
    assert db_session.query(TransactionLog).count() == 1


@pytest.mark.parametrize("work_type,sub_type,department", [
    ("warehouse_io", "warehouse_to_dept", None),
    ("process", "adjust_in", None),
    ("internal_use", "internal_use_out", "AS"),
])
def test_cancel_removes_request_notes_from_all_recipients_and_preserves_unrelated(
    client, db_session, make_item, work_type: str, sub_type: str, department: str | None,
) -> None:
    requester = _make_employee(db_session, code="CANCEL-RQ", department=DepartmentEnum.AS if department else DepartmentEnum.ASSEMBLY)
    recipients = [_make_employee(db_session, code=f"CANCEL-AP-{index}", warehouse_role="primary",
                                 department_role="primary", as_research_approver=True) for index in range(2)]
    item = make_item(warehouse_qty=Decimal("10"))
    db_session.commit()
    before = _cells(db_session)
    _submit(client, requester, [item], work_type=work_type, sub_type=sub_type,
            **({"to_department": department} if department else {}))
    request = db_session.query(StockRequest).one()
    notes = db_session.query(Notification).filter_by(related_request_id=request.request_id).all()
    assert {note.recipient_employee_id for note in notes} == {employee.employee_id for employee in recipients}
    notes[0].is_read = True
    for recipient in recipients:
        db_session.add(Notification(recipient_employee_id=recipient.employee_id,
                                    type=NotificationTypeEnum.HANDOVER_ARRIVED.value, title="keep"))
    db_session.commit()
    cancelled = client.post(f"/api/stock-requests/{request.request_id}/cancel",
                            json={"actor_employee_id": str(requester.employee_id), "pin": "0000"})
    assert cancelled.status_code == 200, cancelled.text
    db_session.expire_all()
    assert request.status == StockRequestStatusEnum.CANCELLED
    assert _cells(db_session) == before
    assert db_session.query(Notification).filter_by(related_request_id=request.request_id,
                                                  type=NotificationTypeEnum.APPROVAL_REQUEST.value).count() == 0
    for recipient in recipients:
        remaining = _queue(client, recipient)
        assert remaining["unread_count"] == 1
        assert [row["title"] for row in remaining["items"]] == ["keep"]
    retry = client.post(f"/api/stock-requests/{request.request_id}/cancel",
                        json={"actor_employee_id": str(requester.employee_id), "pin": "0000"})
    assert retry.status_code == 200, retry.text
    assert _cells(db_session) == before
    assert db_session.query(Notification).count() == len(recipients)


@pytest.mark.parametrize("change,kept", [
    ({"warehouse_role": "none"}, {"dept-queue"}),
    ({"warehouse_role": "deputy"}, {"queue", "dept-queue"}),
    ({"is_active": False}, set()),
])
def test_role_cleanup_preserves_each_still_permitted_approval_link(client, db_session, make_item, change: dict, kept: set[str]) -> None:
    requester = _make_employee(db_session, code="KEEP-RQ")
    employee = _make_employee(db_session, code="KEEP-AP", warehouse_role="primary", department_role="primary")
    _make_employee(db_session, code="KEEP-VALID", warehouse_role="primary", department_role="primary")
    item = make_item(warehouse_qty=Decimal("10"))
    db_session.commit()
    for work_type, sub_type in [("warehouse_io", "warehouse_to_dept"), ("process", "adjust_in")]:
        _submit(client, requester, [item], work_type=work_type, sub_type=sub_type)
    before = _cells(db_session)
    changed = client.put(f"/api/employees/{employee.employee_id}", headers={"X-Admin-Pin": "0000"}, json=change)
    assert changed.status_code == 200, changed.text
    assert {note["target_section"] for note in _queue(client, employee)["items"]} == kept
    assert _cells(db_session) == before
    assert db_session.query(StockRequest).count() == 2
    assert db_session.query(TransactionLog).count() == 0


@pytest.mark.parametrize("failure", ["cancel", "role_change"])
def test_notification_cleanup_failure_rolls_back_notes_role_status_and_reservations(
    client, db_session, make_item, monkeypatch, failure: str,
) -> None:
    requester = _make_employee(db_session, code="FAIL-RQ")
    employee = _make_employee(db_session, code="FAIL-AP", warehouse_role="primary")
    item = make_item(warehouse_qty=Decimal("10"))
    db_session.commit()
    _submit(client, requester, [item], work_type="warehouse_io", sub_type="warehouse_to_dept")
    request = db_session.query(StockRequest).one()
    before = _cells(db_session)
    note_ids = {note.notification_id for note in db_session.query(Notification).all()}
    status_before = request.status
    function = "remove_cancelled_request_approval_notifications" if failure == "cancel" else "remove_obsolete_employee_approval_notifications"
    real_cleanup = getattr(notifications, function)

    def fail_after_cleanup(*args, **kwargs):
        real_cleanup(*args, **kwargs)
        db_session.flush()
        assert db_session.query(Notification).count() == 0
        raise RuntimeError("notification cleanup failure")

    monkeypatch.setattr(notifications, function, fail_after_cleanup)
    with pytest.raises(RuntimeError, match="notification cleanup failure"):
        if failure == "cancel":
            client.post(f"/api/stock-requests/{request.request_id}/cancel",
                        json={"actor_employee_id": str(requester.employee_id), "pin": "0000"})
        else:
            client.put(f"/api/employees/{employee.employee_id}", headers={"X-Admin-Pin": "0000"}, json={"warehouse_role": "none"})
    db_session.expire_all()
    assert _cells(db_session) == before
    assert request.status == status_before
    assert employee.warehouse_role == "primary"
    assert {note.notification_id for note in db_session.query(Notification).all()} == note_ids
    assert db_session.query(TransactionLog).count() == 0


@pytest.mark.parametrize("late_failure", [False, True])
def test_internal_use_cancel_cleans_all_linked_stages_or_rolls_everything_back(
    client, db_session, make_item, make_location, monkeypatch, late_failure: bool,
) -> None:
    requester = _make_employee(db_session, code="LINKED-RQ", department=DepartmentEnum.AS)
    _make_employee(db_session, code="LINKED-DEPT", department_role="primary")
    _make_employee(db_session, code="LINKED-AS", as_research_approver=True)
    items = [make_item(process_type_code=code, warehouse_qty=Decimal("10")) for code in ("TR", "AR")]
    for item, department in zip(items, [DepartmentEnum.TUBE, DepartmentEnum.ASSEMBLY]):
        _seed_cells(db_session, item, make_location, department=department)
    db_session.commit()
    initial = _cells(db_session)
    payload = {"requester_employee_id": str(requester.employee_id), "work_type": "internal_use",
               "sub_type": "internal_use_out", "to_department": "AS"}
    preview = client.post("/api/io/preview", json={
        **payload, "targets": [{"source_kind": "direct_item", "source_location": "department",
                                  "item_id": str(item.item_id), "quantity": 1} for item in items],
    })
    assert preview.status_code == 200, preview.text
    submitted = client.post("/api/io/submit", json={**payload, "bundles": preview.json()["bundles"]})
    assert submitted.status_code == 201, submitted.text
    requests = db_session.query(StockRequest).all()
    assert len(requests) == 2
    assert {note.target_section for note in db_session.query(Notification).all()} == {"dept-queue", "as-research-queue"}
    reserved = _cells(db_session)
    original_statuses = {request.request_id: request.status for request in requests}
    note_ids = {note.notification_id for note in db_session.query(Notification).all()}
    real_cleanup = notifications.remove_cancelled_request_approval_notifications
    calls = []

    def fail_second_cleanup(db, request_id):
        calls.append(request_id)
        real_cleanup(db, request_id)
        if len(calls) == 2:
            assert _cells(db) != reserved
            assert db.query(Notification).count() == 0
            raise RuntimeError("linked notification failure")

    if late_failure:
        monkeypatch.setattr(notifications, "remove_cancelled_request_approval_notifications", fail_second_cleanup)
        with pytest.raises(RuntimeError, match="linked notification failure"):
            client.post(f"/api/stock-requests/{requests[0].request_id}/cancel",
                        json={"actor_employee_id": str(requester.employee_id), "pin": "0000"})
        db_session.expire_all()
        assert len(calls) == 2
        assert _cells(db_session) == reserved
        assert {request.request_id: request.status for request in requests} == original_statuses
        assert {note.notification_id for note in db_session.query(Notification).all()} == note_ids
    else:
        response = client.post(f"/api/stock-requests/{requests[0].request_id}/cancel",
                               json={"actor_employee_id": str(requester.employee_id), "pin": "0000"})
        assert response.status_code == 200, response.text
        db_session.expire_all()
        assert _cells(db_session) == initial
        assert {request.status for request in requests} == {StockRequestStatusEnum.CANCELLED}
        assert db_session.query(Notification).count() == 0
    assert db_session.query(TransactionLog).count() == 0
