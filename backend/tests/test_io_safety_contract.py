from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    IoBatch,
)
from app.services.io_preview import WORK_SUB_TYPES, validate_work_sub_type
from app.services.pin_auth import DEFAULT_PIN_HASH


def _make_employee(
    db_session,
    *,
    code: str,
    warehouse_role: str = "none",
) -> Employee:
    employee = Employee(
        employee_code=code,
        name=code,
        role=f"{DepartmentEnum.ASSEMBLY.value}/staff",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        warehouse_role=warehouse_role,
        department_role="none",
        display_order=0,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )
    db_session.add(employee)
    db_session.flush()
    return employee


def _receive_payload(requester: Employee, item, *, client_request_id: str | None = None) -> dict:
    payload = {
        "requester_employee_id": str(requester.employee_id),
        "work_type": "receive",
        "sub_type": "receive_supplier",
        "bundles": [
            {
                "bundle_id": str(uuid.uuid4()),
                "source_kind": "direct_item",
                "title": item.item_name,
                "source_item_id": str(item.item_id),
                "source_mes_code": item.mes_code,
                "quantity": 2,
                "lines": [
                    {
                        "line_id": str(uuid.uuid4()),
                        "item_id": str(item.item_id),
                        "item_name": item.item_name,
                        "mes_code": item.mes_code,
                        "unit": item.unit,
                        "direction": "in",
                        "from_bucket": "none",
                        "from_department": None,
                        "to_bucket": "warehouse",
                        "to_department": None,
                        "quantity": 2,
                        "origin": "direct",
                    }
                ],
            }
        ],
    }
    if client_request_id is not None:
        payload["client_request_id"] = client_request_id
    return payload


def _warehouse_quantity(db_session, item_id) -> Decimal:
    return db_session.query(Inventory).filter(Inventory.item_id == item_id).one().warehouse_qty


def test_work_sub_type_allowlist_preserves_public_and_legacy_pairs():
    expected = {
        "receive": {"receive_supplier"},
        "warehouse_io": {"warehouse_to_dept", "dept_to_warehouse"},
        "warehouse_adjust": {"warehouse_adjust_in", "warehouse_adjust_out"},
        "process": {"produce", "disassemble", "dept_transfer", "adjust_in", "adjust_out"},
        "defect": {
            "defect_quarantine",
            "defect_restore",
            "defect_process",
            "supplier_return",
        },
        "internal_use": {"internal_use_out"},
    }

    assert {work_type: set(sub_types) for work_type, sub_types in WORK_SUB_TYPES.items()} == expected
    for work_type, sub_types in expected.items():
        for sub_type in sub_types:
            validate_work_sub_type(work_type=work_type, sub_type=sub_type)


def test_receive_preview_draft_and_submit_require_warehouse_role_without_mutation(
    client, db_session, make_item
):
    item = make_item(name="원자재 권한 계약", warehouse_qty=Decimal("0"))
    requester = _make_employee(db_session, code="RECEIVE-NONE")
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "receive",
            "sub_type": "receive_supplier",
            "targets": [{"item_id": str(item.item_id), "quantity": 2}],
        },
    )
    drafted = client.put("/api/io/draft", json=_receive_payload(requester, item))
    submitted = client.post("/api/io/submit", json=_receive_payload(requester, item))

    assert [preview.status_code, drafted.status_code, submitted.status_code] == [403, 403, 403]
    assert db_session.query(IoBatch).count() == 0
    assert _warehouse_quantity(db_session, item.item_id) == Decimal("0")


@pytest.mark.parametrize("warehouse_role", ["primary", "deputy"])
def test_receive_preview_allows_both_warehouse_manager_roles(
    client, db_session, make_item, warehouse_role
):
    item = make_item(name=f"원자재 {warehouse_role}")
    requester = _make_employee(
        db_session,
        code=f"RECEIVE-{warehouse_role.upper()}",
        warehouse_role=warehouse_role,
    )
    db_session.commit()

    response = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "receive",
            "sub_type": "receive_supplier",
            "targets": [{"item_id": str(item.item_id), "quantity": 1}],
        },
    )

    assert response.status_code == 200, response.text


def test_receive_existing_draft_submit_rechecks_warehouse_role_without_mutation(
    client, db_session, make_item
):
    item = make_item(name="원자재 권한 회수 초안", warehouse_qty=Decimal("0"))
    requester = _make_employee(
        db_session,
        code="RECEIVE-DRAFT-REVOKED",
        warehouse_role="primary",
    )
    db_session.commit()
    drafted = client.put("/api/io/draft", json=_receive_payload(requester, item))
    assert drafted.status_code == 200, drafted.text

    requester.warehouse_role = "none"
    db_session.commit()
    response = client.post(
        f"/api/io/draft/{drafted.json()['batch_id']}/submit",
        params={"requester_employee_id": str(requester.employee_id)},
    )

    assert response.status_code == 403, response.text
    batch = db_session.get(IoBatch, uuid.UUID(drafted.json()["batch_id"]))
    assert batch is not None and batch.status == "draft"
    assert _warehouse_quantity(db_session, item.item_id) == Decimal("0")


def test_receive_idempotent_replay_rechecks_warehouse_role_without_duplicate_effect(
    client, db_session, make_item
):
    item = make_item(name="원자재 멱등 권한 회수", warehouse_qty=Decimal("0"))
    requester = _make_employee(
        db_session,
        code="RECEIVE-IDEM-REVOKED",
        warehouse_role="primary",
    )
    db_session.commit()
    payload = _receive_payload(requester, item, client_request_id=str(uuid.uuid4()))
    first = client.post("/api/io/submit", json=payload)
    assert first.status_code == 201, first.text
    assert _warehouse_quantity(db_session, item.item_id) == Decimal("2")

    requester.warehouse_role = "none"
    db_session.commit()
    replay = client.post("/api/io/submit", json=payload)

    assert replay.status_code == 403, replay.text
    assert db_session.query(IoBatch).count() == 1
    assert _warehouse_quantity(db_session, item.item_id) == Decimal("2")


@pytest.mark.parametrize("endpoint", ["preview", "draft", "submit"])
def test_io_endpoints_reject_invalid_work_sub_type_pair_without_mutation(
    client, db_session, make_item, endpoint
):
    item = make_item(name=f"조합 검증 {endpoint}", warehouse_qty=Decimal("0"))
    requester = _make_employee(
        db_session,
        code=f"PAIR-{endpoint.upper()}",
        warehouse_role="primary",
    )
    db_session.commit()
    if endpoint == "preview":
        response = client.post(
            "/api/io/preview",
            json={
                "requester_employee_id": str(requester.employee_id),
                "work_type": "receive",
                "sub_type": "produce",
                "targets": [{"item_id": str(item.item_id), "quantity": 1}],
            },
        )
    else:
        payload = _receive_payload(requester, item)
        payload["sub_type"] = "produce"
        response = (
            client.put("/api/io/draft", json=payload)
            if endpoint == "draft"
            else client.post("/api/io/submit", json=payload)
        )

    assert response.status_code == 422, response.text
    assert db_session.query(IoBatch).count() == 0
    assert _warehouse_quantity(db_session, item.item_id) == Decimal("0")


def test_existing_draft_submit_rejects_invalid_stored_work_sub_type_pair_without_mutation(
    client, db_session, make_item
):
    item = make_item(name="저장 조합 검증", warehouse_qty=Decimal("0"))
    requester = _make_employee(
        db_session,
        code="PAIR-DRAFT",
        warehouse_role="primary",
    )
    db_session.commit()
    drafted = client.put("/api/io/draft", json=_receive_payload(requester, item))
    assert drafted.status_code == 200, drafted.text
    batch = db_session.get(IoBatch, uuid.UUID(drafted.json()["batch_id"]))
    assert batch is not None
    batch.work_type = "process"
    db_session.commit()

    response = client.post(
        f"/api/io/draft/{batch.batch_id}/submit",
        params={"requester_employee_id": str(requester.employee_id)},
    )

    assert response.status_code == 422, response.text
    db_session.refresh(batch)
    assert batch.status == "draft"
    assert _warehouse_quantity(db_session, item.item_id) == Decimal("0")
