"""StockRequest mutation의 requester/approver가 세션 actor에 고정되는 계약."""

from __future__ import annotations

import inspect
import uuid
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    StockRequest,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
)
from app.routers import stock_requests as stock_request_router
from app.services import sr_draft
from app.services.pin_auth import hash_pin


@pytest.fixture()
def client(auth_client):
    """이 파일은 test-only compat override 없이 실제 쿠키 인증 경계를 검증한다."""
    return auth_client


def _employee(
    db_session,
    *,
    code: str,
    warehouse_role: str = "none",
    department_role: str = "none",
    level: EmployeeLevelEnum = EmployeeLevelEnum.STAFF,
) -> Employee:
    employee = Employee(
        employee_code=code,
        name=f"재고요청 작업자 {code}",
        role="작업자",
        department=DepartmentEnum.ASSEMBLY,
        level=level,
        warehouse_role=warehouse_role,
        department_role=department_role,
        is_active=True,
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    db_session.add(employee)
    db_session.commit()
    return employee


def _login(client, employee: Employee) -> None:
    response = client.post(
        "/api/operator-session",
        json={"employee_id": str(employee.employee_id), "pin": "2468"},
    )
    assert response.status_code == 200, response.text


def _logout(client) -> None:
    response = client.delete("/api/operator-session")
    assert response.status_code == 204, response.text


def test_action_loader_uses_bound_database_dialect_for_row_lock() -> None:
    """Explicit PostgreSQL sessions must lock even when the app default is SQLite."""

    target = object()

    class TrackingQuery:
        locked = False

        def filter(self, *_args):
            return self

        def with_for_update(self):
            self.locked = True
            return self

        def first(self):
            return target

    query = TrackingQuery()

    class PostgreSqlSession:
        bind = SimpleNamespace(dialect=SimpleNamespace(name="postgresql"))

        def query(self, *_args):
            return query

    loaded = stock_request_router._load_request_for_action(
        PostgreSqlSession(),
        uuid.uuid4(),
    )

    assert loaded is target
    assert query.locked is True


def _pending_request(
    db_session,
    requester: Employee,
    *,
    warehouse: bool,
    department: bool,
) -> StockRequest:
    request = StockRequest(
        requester_employee_id=requester.employee_id,
        requester_name=requester.name,
        requester_department=DepartmentEnum.ASSEMBLY.value,
        approval_department=DepartmentEnum.ASSEMBLY.value,
        request_type=(
            StockRequestTypeEnum.WAREHOUSE_TO_DEPT
            if warehouse
            else StockRequestTypeEnum.DEPT_INTERNAL
        ),
        status=StockRequestStatusEnum.SUBMITTED,
        requires_warehouse_approval=warehouse,
        requires_department_approval=department,
    )
    db_session.add(request)
    db_session.flush()
    return request


def _draft_payload(employee: Employee) -> dict:
    return {
        "requester_employee_id": str(employee.employee_id),
        "request_type": "dept_internal",
        "lines": [],
    }


def test_stock_request_draft_rejects_spoofed_requester_before_any_write(
    db_session,
    client,
) -> None:
    actor = _employee(db_session, code="SR-ACTOR-01")
    victim = _employee(db_session, code="SR-VICTIM-01")
    _login(client, actor)

    response = client.put("/api/stock-requests/draft", json=_draft_payload(victim))

    assert response.status_code == 403, response.text
    assert response.json()["detail"]["code"] == "ACTOR_MISMATCH"
    db_session.expire_all()
    assert db_session.query(StockRequest).count() == 0


def test_every_stock_request_action_claim_rejects_spoof_before_request_lookup(
    db_session,
    client,
) -> None:
    actor = _employee(db_session, code="SR-ACTOR-ALL")
    victim = _employee(db_session, code="SR-VICTIM-ALL")
    _login(client, actor)
    request_id = uuid.uuid4()
    victim_id = str(victim.employee_id)

    for suffix in (
        "approve",
        "reject",
        "department-approve",
        "department-reject",
        "cancel",
        "revert-to-draft",
    ):
        response = client.post(
            f"/api/stock-requests/{request_id}/{suffix}",
            json={
                "actor_employee_id": victim_id,
                "pin": "2468",
                "reason": "스푸핑 거부 테스트",
            },
        )
        assert response.status_code == 403, (suffix, response.text)
        assert response.json()["detail"]["code"] == "ACTOR_MISMATCH"

    submitted = client.post(
        f"/api/stock-requests/{request_id}/submit",
        json={"requester_employee_id": victim_id},
    )
    deleted = client.delete(
        f"/api/stock-requests/draft/{request_id}",
        params={"requester_employee_id": victim_id},
    )
    for response in (submitted, deleted):
        assert response.status_code == 403, response.text
        assert response.json()["detail"]["code"] == "ACTOR_MISMATCH"

    db_session.expire_all()
    assert db_session.query(StockRequest).count() == 0


def test_stock_request_draft_persists_verified_session_actor(db_session, client) -> None:
    actor = _employee(db_session, code="SR-ACTOR-02")
    _login(client, actor)

    response = client.put("/api/stock-requests/draft", json=_draft_payload(actor))

    assert response.status_code == 200, response.text
    db_session.expire_all()
    request = db_session.query(StockRequest).one()
    assert request.requester_employee_id == actor.employee_id
    assert request.requester_name == actor.name


def test_stock_request_draft_services_require_explicit_server_actor() -> None:
    for function in (sr_draft.delete_draft_request, sr_draft.submit_draft_request):
        parameter = inspect.signature(function).parameters["requester"]
        assert parameter.default is inspect.Parameter.empty
        assert parameter.kind is inspect.Parameter.KEYWORD_ONLY


def test_stock_request_reads_follow_session_actor_and_approval_role(
    db_session,
    client,
) -> None:
    requester = _employee(db_session, code="SR-READ-REQUESTER")
    victim = _employee(db_session, code="SR-READ-VICTIM")
    warehouse_actor = _employee(
        db_session,
        code="SR-READ-WH",
        warehouse_role="primary",
    )
    department_actor = _employee(
        db_session,
        code="SR-READ-DEPT",
        department_role="primary",
    )
    dual_actor = _employee(
        db_session,
        code="SR-READ-DUAL",
        warehouse_role="deputy",
        department_role="deputy",
    )
    admin_without_role = _employee(
        db_session,
        code="SR-READ-ADMIN",
        level=EmployeeLevelEnum.ADMIN,
    )
    own_request = _pending_request(
        db_session,
        requester,
        warehouse=False,
        department=False,
    )
    victim_request = _pending_request(
        db_session,
        victim,
        warehouse=False,
        department=False,
    )
    warehouse_request = _pending_request(
        db_session,
        victim,
        warehouse=True,
        department=False,
    )
    department_request = _pending_request(
        db_session,
        victim,
        warehouse=False,
        department=True,
    )
    dual_request = _pending_request(
        db_session,
        victim,
        warehouse=True,
        department=True,
    )
    db_session.commit()

    _login(client, requester)
    own_list = client.get("/api/stock-requests")
    assert own_list.status_code == 200, own_list.text
    assert {row["request_id"] for row in own_list.json()} == {str(own_request.request_id)}
    forged_list = client.get(
        "/api/stock-requests",
        params={"requester_employee_id": str(victim.employee_id)},
    )
    assert forged_list.status_code == 403, forged_list.text
    assert client.get(f"/api/stock-requests/{own_request.request_id}").status_code == 200
    assert client.get(f"/api/stock-requests/{victim_request.request_id}").status_code == 403
    assert client.get("/api/stock-requests/warehouse-queue").status_code == 403
    assert client.get("/api/stock-requests/department-queue").status_code == 403
    _logout(client)

    _login(client, warehouse_actor)
    warehouse_queue = client.get("/api/stock-requests/warehouse-queue")
    assert warehouse_queue.status_code == 200, warehouse_queue.text
    assert str(warehouse_request.request_id) in {
        row["request_id"] for row in warehouse_queue.json()
    }
    assert client.get("/api/stock-requests/warehouse-queue/count").status_code == 200
    assert client.get("/api/stock-requests/department-queue").status_code == 403
    assert client.get(f"/api/stock-requests/{warehouse_request.request_id}").status_code == 200
    assert client.get(f"/api/stock-requests/{department_request.request_id}").status_code == 403
    _logout(client)

    _login(client, department_actor)
    department_queue = client.get("/api/stock-requests/department-queue")
    assert department_queue.status_code == 200, department_queue.text
    assert str(department_request.request_id) in {
        row["request_id"] for row in department_queue.json()
    }
    assert client.get("/api/stock-requests/department-queue/count").status_code == 200
    assert client.get("/api/stock-requests/warehouse-queue").status_code == 403
    assert client.get(f"/api/stock-requests/{department_request.request_id}").status_code == 200
    assert client.get(f"/api/stock-requests/{warehouse_request.request_id}").status_code == 403
    assert client.get(f"/api/stock-requests/{dual_request.request_id}").status_code == 403
    _logout(client)

    _login(client, dual_actor)
    assert client.get("/api/stock-requests/warehouse-queue").status_code == 200
    assert client.get("/api/stock-requests/department-queue").status_code == 200
    _logout(client)

    _login(client, admin_without_role)
    assert client.get("/api/stock-requests/warehouse-queue").status_code == 403
    assert client.get("/api/stock-requests/department-queue").status_code == 403


def test_queue_target_is_returned_even_when_it_is_older_than_the_page_limit(
    db_session,
    client,
) -> None:
    requester = _employee(db_session, code="SR-TARGET-REQUESTER")
    warehouse_actor = _employee(
        db_session,
        code="SR-TARGET-WH",
        warehouse_role="primary",
    )
    department_actor = _employee(
        db_session,
        code="SR-TARGET-DEPT",
        department_role="primary",
    )
    warehouse_target = _pending_request(
        db_session,
        requester,
        warehouse=True,
        department=False,
    )
    warehouse_newer = _pending_request(
        db_session,
        requester,
        warehouse=True,
        department=False,
    )
    department_target = _pending_request(
        db_session,
        requester,
        warehouse=False,
        department=True,
    )
    department_newer = _pending_request(
        db_session,
        requester,
        warehouse=False,
        department=True,
    )
    older = datetime.utcnow() - timedelta(days=1)
    newer = datetime.utcnow()
    warehouse_target.created_at = older
    department_target.created_at = older
    warehouse_newer.created_at = newer
    department_newer.created_at = newer
    db_session.commit()

    _login(client, requester)
    mine = client.get(
        "/api/stock-requests",
        params={
            "requester_employee_id": str(requester.employee_id),
            "limit": 1,
            "target_request_id": str(warehouse_target.request_id),
        },
    )
    assert mine.status_code == 200, mine.text
    assert [row["request_id"] for row in mine.json()] == [
        str(warehouse_target.request_id)
    ]
    _logout(client)

    _login(client, warehouse_actor)
    warehouse = client.get(
        "/api/stock-requests/warehouse-queue",
        params={"limit": 1, "target_request_id": str(warehouse_target.request_id)},
    )
    assert warehouse.status_code == 200, warehouse.text
    assert [row["request_id"] for row in warehouse.json()] == [
        str(warehouse_target.request_id)
    ]
    _logout(client)

    _login(client, department_actor)
    department = client.get(
        "/api/stock-requests/department-queue",
        params={
            "actor_employee_id": str(department_actor.employee_id),
            "limit": 1,
            "target_request_id": str(department_target.request_id),
        },
    )
    assert department.status_code == 200, department.text
    assert [row["request_id"] for row in department.json()] == [
        str(department_target.request_id)
    ]


def test_stock_request_draft_reads_reject_another_employee_claim(
    db_session,
    client,
) -> None:
    actor = _employee(db_session, code="SR-DRAFT-READ-ACTOR")
    victim = _employee(db_session, code="SR-DRAFT-READ-VICTIM")
    _login(client, actor)

    draft = client.put("/api/stock-requests/draft", json=_draft_payload(actor))
    assert draft.status_code == 200, draft.text

    for path in ("draft", "drafts"):
        response = client.get(
            f"/api/stock-requests/{path}",
            params={
                "requester_employee_id": str(victim.employee_id),
                **({"request_type": "dept_internal"} if path == "draft" else {}),
            },
        )
        assert response.status_code == 403, response.text
