"""공급업체 마스터 API 계약 테스트."""

from __future__ import annotations

import uuid

from sqlalchemy.exc import IntegrityError

from app.models import AdminAuditLog, Employee


def _warehouse_employee(db_session, *, warehouse_role: str = "primary") -> Employee:
    """공급업체 관리 API 호출용 활성 창고 담당자를 만든다."""
    employee = Employee(
        employee_code=f"SUP-{uuid.uuid4().hex[:8]}",
        name="공급업체 담당자",
        role="창고 담당",
        department="창고",
        warehouse_role=warehouse_role,
        is_active=True,
    )
    db_session.add(employee)
    db_session.flush()
    return employee


def test_warehouse_primary_creates_supplier_and_normalized_duplicate_conflicts(
    client, db_session
):
    """창고 정 담당자는 공급업체를 만들며 NFKC·대소문자 중복은 거부된다."""
    employee = _warehouse_employee(db_session)

    created = client.post(
        "/api/suppliers",
        json={"requester_employee_id": str(employee.employee_id), "name": "  Acme 주식회사  "},
    )

    assert created.status_code == 201
    assert created.json()["name"] == "Acme 주식회사"
    duplicate = client.post(
        "/api/suppliers",
        json={"requester_employee_id": str(employee.employee_id), "name": "ＡＣＭＥ 주식회사"},
    )
    assert duplicate.status_code == 409


def test_only_warehouse_managers_can_manage_and_hidden_supplier_can_be_restored(
    client, db_session
):
    """일반 직원은 거부되고 창고 정·부 담당자는 숨김·복원을 감사 기록과 함께 처리한다."""
    primary = _warehouse_employee(db_session)
    deputy = _warehouse_employee(db_session, warehouse_role="deputy")
    staff = _warehouse_employee(db_session, warehouse_role="none")
    active_only = client.get(f"/api/suppliers?requester_employee_id={staff.employee_id}")
    assert active_only.status_code == 200
    forbidden = client.get(
        f"/api/suppliers?requester_employee_id={staff.employee_id}&include_inactive=true"
    )
    assert forbidden.status_code == 403
    empty = client.post(
        "/api/suppliers",
        json={"requester_employee_id": str(primary.employee_id), "name": "   "},
    )
    assert empty.status_code == 422
    created = client.post(
        "/api/suppliers",
        json={"requester_employee_id": str(primary.employee_id), "name": "한빛상사"},
    )
    supplier_id = created.json()["supplier_id"]
    hidden = client.patch(
        f"/api/suppliers/{supplier_id}",
        json={"requester_employee_id": str(primary.employee_id), "is_active": False},
    )
    assert hidden.status_code == 200
    assert hidden.json()["is_active"] is False
    assert client.get(f"/api/suppliers?requester_employee_id={primary.employee_id}").json() == []
    inactive = client.get(
        f"/api/suppliers?requester_employee_id={primary.employee_id}&include_inactive=true"
    )
    assert inactive.json()[0]["supplier_id"] == supplier_id
    restored = client.patch(
        f"/api/suppliers/{supplier_id}",
        json={"requester_employee_id": str(deputy.employee_id), "is_active": True},
    )
    assert restored.status_code == 200
    audits = db_session.query(AdminAuditLog).filter(AdminAuditLog.target_id == supplier_id).all()
    assert {audit.actor_employee_code for audit in audits} == {primary.employee_code, deputy.employee_code}


def test_supplier_name_edit_missing_supplier_and_commit_race_are_handled(client, db_session, monkeypatch):
    """이름 수정·없는 업체 404·DB unique 경쟁은 각각 정해진 API 결과를 낸다."""
    employee = _warehouse_employee(db_session)
    missing = client.patch(
        f"/api/suppliers/{uuid.uuid4()}",
        json={"requester_employee_id": str(employee.employee_id), "name": "없는 업체"},
    )
    assert missing.status_code == 404
    created = client.post(
        "/api/suppliers",
        json={"requester_employee_id": str(employee.employee_id), "name": "수정 전 업체"},
    )
    renamed = client.patch(
        f"/api/suppliers/{created.json()['supplier_id']}",
        json={"requester_employee_id": str(employee.employee_id), "name": "수정 후 업체"},
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "수정 후 업체"

    def competing_commit():
        raise IntegrityError("insert suppliers", {}, Exception("unique"))

    monkeypatch.setattr(db_session, "commit", competing_commit)
    competing = client.post(
        "/api/suppliers",
        json={"requester_employee_id": str(employee.employee_id), "name": "경쟁 업체"},
    )
    assert competing.status_code == 409


def test_supplier_create_converts_flush_unique_race_to_conflict(client, db_session, monkeypatch):
    """중복 INSERT가 flush에서 발견되어도 API는 500 대신 409를 반환한다."""
    employee = _warehouse_employee(db_session)

    def competing_flush():
        raise IntegrityError("insert suppliers", {}, Exception("unique"))

    monkeypatch.setattr(db_session, "flush", competing_flush)
    response = client.post(
        "/api/suppliers",
        json={"requester_employee_id": str(employee.employee_id), "name": "flush 경쟁 업체"},
    )

    assert response.status_code == 409
    assert response.json()["detail"]["message"] == "같은 이름의 공급업체가 이미 존재합니다."
